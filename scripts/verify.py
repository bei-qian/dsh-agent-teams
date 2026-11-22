#!/usr/bin/env python3
"""Validate the dsh-agent-teams bundle (stdlib only).

Checks:
  - cordis.patch.yml is in sync with cordis.patch.tmpl.yml + prompts/*.md
  - 8 agent presets with the expected ids exist
  - the leader's 7 delegate tools point at existing member presets
  - the bundled skills/ is kept on disk, not wired (the enable path is playbooks/)
  - the bundled skills/ actually contains the BMad skills
  - the 6 P0 capability modules exist under capabilities/, each SKILL.md has a
    complete frontmatter (name==dir/kebab, description, whenToUse, metadata.domain,
    metadata.priority), and every module's evals cover the 5 categories
  - every capabilities/*/scripts/run_evals.mjs runs deterministically (exit 0) and
    the capability-router's validate_selection passes each fixture's expect.exit
    (so CI running verify.py covers all 6 modules' deterministic evals)
  - display metadata (locale en/zh, icon, version, bundle patch) is present

Exit 0 = OK, 1 = problems. Runs in CI via .github/workflows/verify.yml.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_PRESETS = {
    "bmad-squad-lead", "bmad-analyst", "bmad-pm", "bmad-po",
    "bmad-ux", "bmad-architect", "bmad-dev", "bmad-tea",
}
REQUIRED_SKILLS = ["bmad", "bmad-agent-analyst", "bmad-agent-pm", "bmad-agent-dev",
                   "bmad-agent-architect", "bmad-facilitate", "bmad-build", "bmad-tea"]

# The 6 P0 capability modules that must all be present under capabilities/ (ADR-A1).
REQUIRED_CAPABILITIES = [
    "capability-router",
    "cap-task-coordination",
    "cap-debugging-systematic",
    "cap-code-review",
    "cap-security-baseline",
    "cap-testing-strategy",
]
# Modules that must ship a deterministic run_evals.mjs (router uses validate_selection).
REQUIRED_RUN_EVAL_MODULES = {
    "cap-debugging-systematic", "cap-code-review", "cap-task-coordination",
    "cap-security-baseline", "cap-testing-strategy",
}
# The 5 fixture categories every eval-bearing module must cover (ARCH §7.2).
REQUIRED_EVAL_CATEGORIES = ["normal", "boundary", "ambiguous", "negative-trigger", "regression"]
# Fixture filename/kind token -> canonical category. Most modules tag fixtures with an
# explicit `category` field; cap-task-coordination instead encodes the category via its
# filename token + `kind` (see its evals/README.md). Map both to one canonical set so the
# coverage gate enforces all five categories uniformly without editing module fixtures.
CATEGORY_ALIASES = {
    "normal": "normal",
    "boundary": "boundary",
    "ambiguous": "ambiguous",
    "negative": "negative-trigger",
    "negative-trigger": "negative-trigger",
    "regression": "regression",
    "review": "regression",  # cap-task-coordination kind "review" is its regression case
}

errors: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        errors.append(msg)


def frontmatter_text(skill_md: Path):
    """Return the leading YAML frontmatter body (between the --- fences), or None."""
    try:
        text = skill_md.read_text(encoding="utf-8")
    except Exception:  # noqa: BLE001
        return None
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None
    return text[3:end]


def frontmatter_field(fm: str, key: str):
    """Return a scalar top-level `key: value` from the frontmatter, or None."""
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", fm, re.M)
    return m.group(1).strip().strip("\"'") if m else None


def metadata_fields(fm: str) -> dict:
    """Return the nested `metadata:` mapping (only scalar values) from the frontmatter."""
    out: dict[str, str] = {}
    in_meta = False
    for line in fm.splitlines():
        if re.match(r"^metadata:\s*$", line):
            in_meta = True
            continue
        if not in_meta:
            continue
        if line.strip() == "":
            continue
        if len(line) - len(line.lstrip()) == 0:
            break  # dedented out of the metadata block
        m = re.match(r"^\s+([A-Za-z_][\w-]*):\s*(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip("\"'")
    return out


def frontmatter_name(skill_md: Path):
    """Return the `name:` value from a SKILL.md's leading YAML frontmatter, or None."""
    fm = frontmatter_text(skill_md)
    return frontmatter_field(fm, "name") if fm is not None else None


def main() -> None:
    # 1. generated patch in sync with sources
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "cordis.patch.yml"
        r = subprocess.run([sys.executable, str(ROOT / "scripts" / "build_patch.py"), "--out", str(out)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            errors.append("build_patch.py failed: " + (r.stderr or r.stdout).strip())
        else:
            committed = (ROOT / "cordis.patch.yml").read_text(encoding="utf-8")
            check(committed == out.read_text(encoding="utf-8"),
                  "cordis.patch.yml is out of date — run: python3 scripts/build_patch.py")

    patch = (ROOT / "cordis.patch.yml").read_text(encoding="utf-8")

    # 2. presets
    preset_rows = re.findall(r"- id: preset-(bmad-[a-z-]+)", patch)
    check(len(preset_rows) == 8, f"expected 8 preset rows, found {len(preset_rows)}")
    ids = set(re.findall(r"^ {8}id: (bmad-[a-z-]+)$", patch, re.M))
    check(EXPECTED_PRESETS.issubset(ids), f"missing preset ids: {sorted(EXPECTED_PRESETS - ids)}")

    # 3. delegation wiring
    delegates = re.findall(r"agentPreset: (bmad-[a-z-]+)", patch)
    check(len(delegates) == 7, f"expected 7 delegate tools, found {len(delegates)}")
    for ap in delegates:
        check(ap in ids, f"delegate agentPreset '{ap}' has no matching preset id")

    # 3b. per-member model selection: every delegate_* tool exposes optional
    #     provider/model/reasoning_effort (modelSelection), and exactly one instance
    #     per scope registers list_subagent_models (modelDiscovery).
    n_model_selection = len(re.findall(r"^\s+modelSelection: true$", patch, re.M))
    check(n_model_selection == 7,
          f"expected 7 delegate tools with modelSelection: true, found {n_model_selection}")
    n_model_discovery = len(re.findall(r"^\s+modelDiscovery: true$", patch, re.M))
    check(n_model_discovery == 1,
          f"expected exactly 1 modelDiscovery: true (one per scope), found {n_model_discovery}")

    # 4. playbook wiring + bundled skills content (full BMad kept on disk, not wired)
    check(patch.count("customSkillDirs") == 8,
          f"expected 8 customSkillDirs rows, found {patch.count('customSkillDirs')}")
    n_playbook_dirs = patch.count("'playbooks')")
    check(n_playbook_dirs == 8, f"expected 8 skill dirs pointing at playbooks, found {n_playbook_dirs}")
    playbooks = ROOT / "playbooks"
    pb = [p for p in playbooks.iterdir() if p.is_dir() and (p / "SKILL.md").exists()] if playbooks.is_dir() else []
    check(len(pb) >= 8, f"expected >=8 playbook skills, found {len(pb)}")
    for need in ["bmad-squad-protocol", "bmad-research", "bmad-prd", "bmad-tickets",
                 "bmad-ux", "bmad-architecture", "bmad-build", "bmad-test-strategy"]:
        check((playbooks / need / "SKILL.md").exists(), f"missing playbook: {need}")
    # 4b. bmad-project-context playbook (AGENTS.md capability) present + stays zero-dependency
    pc = playbooks / "bmad-project-context"
    check((pc / "SKILL.md").exists(),
          "missing playbooks/bmad-project-context/SKILL.md")
    check((pc / "references" / "best-practices.md").exists(),
          "missing playbooks/bmad-project-context/references/best-practices.md")
    check((pc / "references" / "template.md").exists(),
          "missing playbooks/bmad-project-context/references/template.md")
    if (pc / "SKILL.md").exists():
        pc_text = (pc / "SKILL.md").read_text(encoding="utf-8")
        check("uv run" not in pc_text and "_bmad" not in pc_text,
              "playbooks/bmad-project-context/SKILL.md must stay zero-dependency "
              "(no 'uv run' or '_bmad')")
    # 4c. modern-web-guidance playbook (frontend best-practice reference) present,
    #     guides/ non-empty, and stays a zero-dependency markdown-only skill.
    mwg = playbooks / "modern-web-guidance"
    check((mwg / "SKILL.md").exists(),
          "missing playbooks/modern-web-guidance/SKILL.md")
    mwg_guides = mwg / "guides"
    mwg_guide_files = [p for p in mwg_guides.rglob("*.md")] if mwg_guides.is_dir() else []
    check(len(mwg_guide_files) > 0,
          "playbooks/modern-web-guidance/guides is empty (expected markdown guides)")
    if (mwg / "SKILL.md").exists():
        mwg_text = (mwg / "SKILL.md").read_text(encoding="utf-8")
        check("uv run" not in mwg_text and "_bmad" not in mwg_text,
              "playbooks/modern-web-guidance/SKILL.md must stay zero-dependency "
              "(no 'uv run' or '_bmad')")
    # 4d. independent capabilities/ second skill root (ADR-A1 option B, Gate 2 decision):
    #     every preset also wires <pkg>/capabilities; each capabilities/*/SKILL.md has a
    #     frontmatter name == its dir name and kebab. The playbooks assertions above stay
    #     unchanged (capabilities is additive, not a replacement).
    n_capability_dirs = patch.count("'capabilities')")
    check(n_capability_dirs == 8,
          f"expected 8 skill dirs pointing at capabilities, found {n_capability_dirs}")
    capabilities = ROOT / "capabilities"
    check(capabilities.is_dir(), "missing capabilities/ root directory")
    cap_skills = [p for p in capabilities.iterdir()
                  if p.is_dir() and (p / "SKILL.md").exists()] if capabilities.is_dir() else []
    cap_names = {p.name for p in cap_skills}
    #     6 P0 capability directories must all exist (named set, >=6 present).
    for need in REQUIRED_CAPABILITIES:
        check(need in cap_names, f"missing P0 capability module: capabilities/{need}/SKILL.md")
    check(len(cap_skills) >= 6, f"expected >=6 capability skills (6 P0), found {len(cap_skills)}")
    #     each capability SKILL.md frontmatter must be complete: name == dir + kebab,
    #     description non-empty, whenToUse present, metadata.domain & metadata.priority present.
    for cdir in cap_skills:
        fm = frontmatter_text(cdir / "SKILL.md")
        nm = frontmatter_field(fm, "name") if fm is not None else None
        check(nm is not None, f"capabilities/{cdir.name}/SKILL.md missing frontmatter name")
        check(nm == cdir.name,
              f"capabilities/{cdir.name}/SKILL.md frontmatter name {nm!r} != dir name {cdir.name!r}")
        check(bool(nm) and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", nm or "") is not None,
              f"capabilities/{cdir.name}/SKILL.md name {nm!r} is not kebab-case")
        desc = frontmatter_field(fm, "description") if fm is not None else None
        check(bool(desc and desc.strip()),
              f"capabilities/{cdir.name}/SKILL.md frontmatter missing/empty description "
              "(skill would be untriggerable in the catalog)")
        when = frontmatter_field(fm, "whenToUse") if fm is not None else None
        check(bool(when and when.strip()),
              f"capabilities/{cdir.name}/SKILL.md frontmatter missing/empty whenToUse")
        meta = metadata_fields(fm) if fm is not None else {}
        check(bool((meta.get("domain") or "").strip()),
              f"capabilities/{cdir.name}/SKILL.md frontmatter missing metadata.domain")
        check(bool((meta.get("priority") or "").strip()),
              f"capabilities/{cdir.name}/SKILL.md frontmatter missing metadata.priority")

    # 4e. deterministic module evals: run every capabilities/*/scripts/run_evals.mjs so a
    #     green verify.py in CI covers ALL capability modules (not just the router). Zero
    #     external deps: python subprocess -> node. Non-zero exit fails verify with reason.
    check(shutil.which("node") is not None,
          "node is required to run capability module evals (deterministic layer)")
    ran_eval_modules: list[str] = []
    if capabilities.is_dir() and shutil.which("node"):
        eval_modules = sorted(p.name for p in capabilities.iterdir()
                              if p.is_dir() and (p / "scripts" / "run_evals.mjs").exists())
        missing_runner = sorted(REQUIRED_RUN_EVAL_MODULES - set(eval_modules))
        check(not missing_runner,
              f"missing scripts/run_evals.mjs in capability modules: {missing_runner}")
        for mod in eval_modules:
            script = capabilities / mod / "scripts" / "run_evals.mjs"
            rv = subprocess.run(["node", str(script)], cwd=str(capabilities / mod),
                                capture_output=True, text=True)
            if rv.returncode == 0:
                ran_eval_modules.append(mod)
                print(f"  [eval-ok] {mod}/run_evals.mjs (exit 0)")
            else:
                check(False, f"{mod}/scripts/run_evals.mjs failed exit {rv.returncode}: "
                             + (rv.stdout or rv.stderr).strip()[-400:])

    # 4f. capability-router reference module present (SKILL/references/scripts/SOURCE + evals)
    router = capabilities / "capability-router"
    for rel in ("SKILL.md", "references/capability-index.yaml", "references/routing-rules.md",
                "scripts/validate_selection.mjs", "SOURCE.md"):
        check((router / rel).exists(), f"missing capabilities/capability-router/{rel}")
    #     zero-dependency validator: run it on every eval fixture; exit must match expect.exit
    vsel = router / "scripts" / "validate_selection.mjs"
    router_evals_dir = router / "evals"
    router_fixture_count = 0
    if vsel.exists() and shutil.which("node"):
        fixtures = sorted(router_evals_dir.glob("*.json")) if router_evals_dir.is_dir() else []
        router_fixture_count = len(fixtures)
        check(len(fixtures) >= 5,
              f"expected >=5 capability-router eval fixtures, found {len(fixtures)}")
        for fx in fixtures:
            try:
                exp = json.loads(fx.read_text(encoding="utf-8")).get("expect", {}).get("exit")
            except Exception:  # noqa: BLE001
                exp = None
            rv = subprocess.run(["node", str(vsel), str(fx)], capture_output=True, text=True)
            if isinstance(exp, int):
                check((rv.returncode == 0) == (exp == 0),
                      f"validate_selection on {fx.name} exit {rv.returncode} != expect.exit {exp}: "
                      + (rv.stdout or rv.stderr).strip()[-300:])
            else:
                check(rv.returncode in (0, 1),
                      f"validate_selection on {fx.name} crashed exit {rv.returncode}: "
                      + (rv.stderr or rv.stdout).strip()[-300:])
        print(f"  [router] validate_selection × {router_fixture_count} fixtures "
              "(expect.exit asserted)")

    # 4g. fixture category coverage: every module with an evals/ dir must cover all 5
    #     categories (normal/boundary/ambiguous/negative-trigger/regression). Category is read
    #     from each fixture's `category` field; when absent (cap-task-coordination encodes it
    #     via filename/kind, see its evals/README.md), resolve it via CATEGORY_ALIASES.
    if capabilities.is_dir():
        for cdir in sorted(p for p in capabilities.iterdir() if p.is_dir()):
            evd = cdir / "evals"
            if not evd.is_dir():
                continue
            fixtures = sorted(evd.glob("*.json"))
            if not fixtures:
                continue
            seen_cats: set[str] = set()
            for fx in fixtures:
                try:
                    doc = json.loads(fx.read_text(encoding="utf-8"))
                except Exception:  # noqa: BLE001
                    continue
                cat = doc.get("category")
                if cat not in REQUIRED_EVAL_CATEGORIES:
                    hay = (fx.stem + " " + str(doc.get("kind", ""))).lower()
                    toks = set(re.split(r"[^a-z]+", hay))
                    cat = next((CATEGORY_ALIASES[t] for t in toks if t in CATEGORY_ALIASES), None)
                if cat in REQUIRED_EVAL_CATEGORIES:
                    seen_cats.add(cat)
            missing_cats = [c for c in REQUIRED_EVAL_CATEGORIES if c not in seen_cats]
            check(len(fixtures) >= 5,
                  f"capabilities/{cdir.name}/evals has {len(fixtures)} fixtures (<5)")
            check(not missing_cats,
                  f"capabilities/{cdir.name}/evals missing category coverage: {missing_cats} "
                  f"(saw {sorted(seen_cats)})")
    skills = ROOT / "skills"
    skill_dirs = [p for p in skills.iterdir() if p.is_dir() and (p / "SKILL.md").exists()] if skills.is_dir() else []
    check(len(skill_dirs) >= 38, f"expected >=38 bundled skills, found {len(skill_dirs)}")
    for need in REQUIRED_SKILLS:
        check((skills / need / "SKILL.md").exists(), f"missing bundled skill: {need}")

    # 5. display metadata
    for loc in ("en", "zh"):
        p = ROOT / "locale" / f"{loc}.json"
        check(p.exists(), f"missing locale/{loc}.json")
        if p.exists():
            try:
                meta = json.loads(p.read_text(encoding="utf-8")).get("meta", {})
                check(bool(meta.get("title")) and bool(meta.get("description")),
                      f"locale/{loc}.json missing meta.title/description")
            except Exception as e:  # noqa: BLE001
                errors.append(f"locale/{loc}.json invalid JSON: {e}")
    check((ROOT / "icon.svg").exists(), "missing icon.svg")
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check(pkg.get("version") == "0.1.1", f"unexpected version {pkg.get('version')} (expected 0.1.1)")
    check(bool(pkg.get("dsh", {}).get("bundle", {}).get("patch")), "package.json missing dsh.bundle.patch")

    # 7. per-row plugin list identity: each preset mounts its own thin module + locale so
    #    DSH's Plugins list shows the role name/description instead of the shared
    #    "@deepseek-ai/dsh-agent-preset" text ("Agent 预设定义 / 声明一个 Agent 预设…").
    # Expected per-row display titles (must match the preset copy in cordis.patch.yml,
    # so a copy-paste that makes every row generic fails instead of silently shipping).
    expected_rows = {
        "bmad-squad-lead": ("squad-lead", "BMad 小队 · 调度", "BMad squad · Lead"),
        "bmad-analyst": ("analyst", "〔内部成员〕BMad · Mary 业务分析师", "[Internal] BMad · Mary (Analyst)"),
        "bmad-pm": ("pm", "〔内部成员〕BMad · John 产品经理", "[Internal] BMad · John (PM)"),
        "bmad-po": ("po", "〔内部成员〕BMad · Sofia 产品负责人", "[Internal] BMad · Sofia (PO)"),
        "bmad-ux": ("ux", "〔内部成员〕BMad · Sally UX 设计师", "[Internal] BMad · Sally (UX)"),
        "bmad-architect": ("architect", "〔内部成员〕BMad · Winston 架构师", "[Internal] BMad · Winston (Architect)"),
        "bmad-dev": ("dev", "〔内部成员〕BMad · Amelia 开发者", "[Internal] BMad · Amelia (Dev)"),
        "bmad-tea": ("tea", "〔内部成员〕BMad · Murat 测试架构师", "[Internal] BMad · Murat (Test)"),
    }
    seen_titles: dict[str, set[str]] = {"en": set(), "zh": set()}
    for preset, (role, zh_title, en_title) in expected_rows.items():
        expected_title = {"zh": zh_title, "en": en_title}
        module = f"dsh-agent-teams/rows/{role}"
        check(f"- id: preset-{preset}\n      name: '{module}'" in patch,
              f"preset-{preset} should mount {module}")
        idx = ROOT / "rows" / role / "index.js"
        check(idx.exists(), f"missing rows/{role}/index.js")
        if idx.exists():
            check("export { default }" in idx.read_text(encoding="utf-8"),
                  f"rows/{role}/index.js should re-export the preset module")
        check(f"./rows/{role}" in (pkg.get("exports") or {}),
              f"package.json exports missing ./rows/{role}")
        check(f"./rows/{role}/locale/*.json" in (pkg.get("exports") or {}),
              f"package.json exports missing ./rows/{role}/locale/*.json")
        check(f"./rows/{role}/icon" in (pkg.get("exports") or {}),
              f"package.json exports missing ./rows/{role}/icon")
        for loc in ("en", "zh"):
            lp = ROOT / "rows" / role / "locale" / f"{loc}.json"
            check(lp.exists(), f"missing rows/{role}/locale/{loc}.json")
            if not lp.exists():
                continue
            try:
                meta = json.loads(lp.read_text(encoding="utf-8")).get("meta", {})
            except Exception as e:  # noqa: BLE001
                errors.append(f"rows/{role}/locale/{loc}.json invalid JSON: {e}")
                continue
            title = meta.get("title")
            check(title == expected_title[loc],
                  f"rows/{role}/locale/{loc}.json title {title!r} != expected {expected_title[loc]!r}")
            check(bool((meta.get("description") or "").strip()),
                  f"rows/{role}/locale/{loc}.json missing meta.description")
            if title:
                seen_titles[loc].add(title)
    for loc in ("en", "zh"):
        check(len(seen_titles[loc]) == len(expected_rows),
              f"per-row {loc} titles are not all distinct ({len(seen_titles[loc])}/{len(expected_rows)})")
    check("@deepseek-ai/dsh-agent-preset" in (pkg.get("peerDependencies") or {}),
          "package.json should declare @deepseek-ai/dsh-agent-preset as a peer dependency")
    check((pkg.get("peerDependenciesMeta") or {}).get("@deepseek-ai/dsh-agent-preset", {}).get("optional") is not True,
          "@deepseek-ai/dsh-agent-preset must not be an optional peer (rows hard-import it)")

    # 8. client half (picker filter): the only mechanism that hides member presets is
    #    client.js, discovered via the bare-package host row + dsh.client + exports.
    #    Assert every link so deleting one cannot make the filter silently vanish.
    check("- id: agent-teams\n      name: 'dsh-agent-teams'" in patch,
          "cordis patch missing the bare 'agent-teams' host row that loads client.js")
    check(pkg.get("dsh", {}).get("client", {}).get("platform") == "web",
          "package.json missing dsh.client with platform 'web'")
    exports = pkg.get("exports") or {}
    check("." in exports, "package.json exports missing '.'")
    check("./client" in exports, "package.json exports missing './client'")
    files = pkg.get("files") or []
    for need in ("client.js", "index.js"):
        check(need in files, f"package.json files missing {need}")
        check((ROOT / need).exists() and (ROOT / need).stat().st_size > 0,
              f"{need} missing or empty")
    #    The Host half also auto-enables Agent Teams for the squad-lead preset;
    #    assert its syntax and its zero-dependency behavior test too.
    check("apply" in (ROOT / "index.js").read_text(encoding="utf-8"),
          "index.js should export the auto-enable hook (apply)")
    if shutil.which("node"):
        r = subprocess.run(["node", "--check", str(ROOT / "client.js")],
                           capture_output=True, text=True)
        check(r.returncode == 0,
              "client.js failed node --check: " + (r.stderr or r.stdout).strip())
        t = subprocess.run(["node", str(ROOT / "scripts" / "test_client.mjs")],
                           capture_output=True, text=True)
        check(t.returncode == 0,
              "client.js behavior test failed: " + (t.stderr or t.stdout).strip())
        hr = subprocess.run(["node", "--check", str(ROOT / "index.js")],
                            capture_output=True, text=True)
        check(hr.returncode == 0,
              "index.js failed node --check: " + (hr.stderr or hr.stdout).strip())
        ht = subprocess.run(["node", str(ROOT / "scripts" / "test_host.mjs")],
                            capture_output=True, text=True)
        check(ht.returncode == 0,
              "index.js behavior test failed: " + (ht.stderr or ht.stdout).strip())

    # 9. zero-dependency squad kit (R1): validator + protocol playbook, and validator runs clean on the example
    validator = ROOT / "scripts" / "squad_validate.mjs"
    check(validator.exists(), "missing scripts/squad_validate.mjs")
    check((ROOT / "playbooks" / "bmad-squad-protocol" / "SKILL.md").exists(),
          "missing playbooks/bmad-squad-protocol/SKILL.md")
    if validator.exists() and shutil.which("node"):
        rr = subprocess.run(["node", str(validator), str(ROOT / "examples" / "bmad-output")],
                            capture_output=True, text=True)
        check(rr.returncode == 0,
              "squad_validate failed on examples/bmad-output: " + (rr.stderr or rr.stdout).strip())

    if errors:
        print("VERIFY FAILED:")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print(f"VERIFY OK: {len(preset_rows)} presets, {len(delegates)} delegates, {len(skill_dirs)} bundled skills")
    print(f"  deterministic capability evals: run_evals × {len(ran_eval_modules)} modules "
          f"{sorted(ran_eval_modules)}; router validate_selection × {router_fixture_count} fixtures")


if __name__ == "__main__":
    main()
