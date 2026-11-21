#!/usr/bin/env python3
"""Generate cordis.patch.yml from cordis.patch.tmpl.yml + prompts/*.md.

Why a build step: persona text is stored as editable Markdown in prompts/*.md,
but a preset's `persona.prefix` must be a YAML block scalar in cordis.patch.yml.
This script inlines each prompt at the exact indentation of its @@PROMPT:<name>@@
marker, so the emitted YAML is always well-formed and prompts stay editable.

Usage:
  python3 scripts/build_patch.py
  python3 scripts/build_patch.py --out /tmp/check.yml   # used by scripts/verify.py
"""
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / "prompts"
TMPL = ROOT / "cordis.patch.tmpl.yml"
DEFAULT_OUT = ROOT / "cordis.patch.yml"

MARKER = re.compile(r"^(\s*)@@PROMPT:([A-Za-z0-9_-]+)@@\s*$")


def load_prompts() -> dict:
    prompts = {}
    for path in sorted(PROMPTS.glob("*.md")):
        prompts[path.stem] = path.read_text(encoding="utf-8").strip("\n")
    return prompts


def build(out: Path) -> int:
    prompts = load_prompts()
    lines = []
    for line in TMPL.read_text(encoding="utf-8").split("\n"):
        m = MARKER.match(line)
        if not m:
            lines.append(line)
            continue
        indent, name = m.group(1), m.group(2)
        if name not in prompts:
            raise SystemExit(f"build_patch: no prompt file prompts/{name}.md")
        for prompt_line in prompts[name].split("\n"):
            lines.append("" if prompt_line.strip() == "" else indent + prompt_line)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"build_patch: wrote {out} ({len(lines)} lines, {len(prompts)} prompts)")
    return len(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()
    build(Path(args.out))


if __name__ == "__main__":
    main()
