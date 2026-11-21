#!/usr/bin/env python3
"""Validate the dsh-agent-teams bundle (stdlib only).

Checks:
  - cordis.patch.yml is in sync with cordis.patch.tmpl.yml + prompts/*.md
  - 8 agent presets with the expected ids exist
  - the leader's 7 delegate tools point at existing member presets
  - the 7 member presets wire the bundled skills/ dir
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

    # 4. bundled skills wiring + content
    check(patch.count("customSkillDirs") == 7,
          f"expected 7 customSkillDirs rows, found {patch.count('customSkillDirs')}")
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

    # 6. zero-dependency squad kit (R1): validator + protocol playbook, and validator runs clean on the example
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
