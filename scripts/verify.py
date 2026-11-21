#!/usr/bin/env python3
"""Validate the dsh-agent-teams bundle (stdlib only).

Checks:
  - cordis.patch.yml is in sync with cordis.patch.tmpl.yml + prompts/*.md
  - 8 agent presets with the expected ids exist
  - the leader's 7 delegate tools point at existing member presets
  - the bundled skills/ is kept on disk, not wired (the enable path is playbooks/)
  - the bundled skills/ actually contains the BMad skills
  - display metadata (locale en/zh, icon, version, bundle patch) is present

Exit 0 = OK, 1 = problems. Runs in CI via .github/workflows/verify.yml.
"""
import json
import re
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

errors: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        errors.append(msg)


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
    check(pkg.get("version") == "0.1.0", f"unexpected version {pkg.get('version')} (expected 0.1.0)")
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
    import shutil as _shutil
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
    if _shutil.which("node"):
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
    import shutil
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


if __name__ == "__main__":
    main()
