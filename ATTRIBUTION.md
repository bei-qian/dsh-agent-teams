# Bundled BMad skills — attribution

The `skills/` directory of this plugin bundles the BMad Method skill set so the
BMad squad works without a separate BMad skills installation.

- **Source**: `github:bmad-code-org/BMAD-METHOD` (skills: core-tools, method, tea)
- **License**: MIT — Copyright (c) 2025 BMad Code, LLC (full text in `LICENSE-BMAD-METHOD.txt`)
- **Snapshot**: copied from a local install of the BMad skills; upstream is the
  authority. Update by re-copying the upstream skills and bumping the plugin version.

## Runtime note

BMad skills are **method drivers**, not standalone code. Their bodies call
`uv run {project-root}/_bmad/scripts/*.py` (resolve_config, resolve_customization,
list_templates, …) and hand off to sibling skills (e.g. `bmad-facilitate`,
`bmad-agent-pm`). So, to run the full BMad workflows in a target project you still
need:

- Python + `uv` available, and
- a `_bmad/` project setup there. The bundled `bmad` skill can create it via
  `bmad setup` (it ships the scripts under `skills/bmad/scripts/`).

Without that setup the squad's **personas** still work (routing, roles, tone), but
the deep BMad workflows degrade to telling the agent to run `bmad setup`.
