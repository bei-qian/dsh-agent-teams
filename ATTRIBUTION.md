# Bundled BMad skills — attribution

The `skills/` directory is **kept in the repository only and is not shipped in the
package（不随包分发）** (`package.json#files` does not include it). It is a **distillation
reference copy**: the squad's effective BMad instructions live in `playbooks/` (plus
`capabilities/`), which were distilled from these upstream skills. Keeping the
originals in the repo — but out of the package — lets us diff the distillation and
trace conclusions back to source, without carrying ~653 dead-weight files in every
install. A consumer who needs the originals can `git clone` the upstream repo below;
the plugin package does not carry them.

The squad actually works because of `playbooks/` + `capabilities/`, which are wired
as the runtime skill roots — not because of `skills/`, which has never been mounted.

- **Source**: `github:bmad-code-org/BMAD-METHOD` (skills: core-tools, method, tea)
- **Upstream pin**: TODO(需 pin sha) — record the exact upstream commit sha here once available (do not guess).
- **License**: MIT — Copyright (c) 2025 BMad Code, LLC (full text in the repo-root `LICENSE-BMAD-METHOD.txt`, which is shipped in the package)
- **Snapshot**: copied from a local install of the BMad skills; upstream is the
  authority. Update by re-copying the upstream skills and bumping the plugin version.

## Runtime note

BMad skills are **method drivers**, not standalone code. Their bodies call
`uv run {project-root}/_bmad/scripts/*.py` (resolve_config, resolve_customization,
list_templates, …) and hand off to sibling skills (e.g. `bmad-facilitate`,
`bmad-agent-pm`). So, to run the full BMad workflows in a target project you still
need:

- Python + `uv` available, and
- a `_bmad/` project setup there.

The squad's **personas** (routing, roles, tone) work from the packaged `playbooks/`
without that setup, but the deep BMad workflows degrade to telling the agent to run
`bmad setup`. Since `skills/` is no longer shipped, bootstrap the full BMad toolkit
from the upstream repo (`github:bmad-code-org/BMAD-METHOD`), not from this package.
