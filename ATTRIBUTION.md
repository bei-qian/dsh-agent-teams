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

---

## `modern-web-guidance` playbook — vendored attribution

`playbooks/modern-web-guidance/` is a **verbatim vendored** copy of the upstream
Modern Web Guidance guides — **not** a distilled/idea-borrowed module. Each
`guides/<category>/<slug>.md` is the upstream guide body **expanded to clean,
dependency-free Markdown** (YAML frontmatter, build macros and the `demo.html` /
`expectations.md` / `targets` assets are stripped; cross-references are localized to
the pattern `(local: guides/<category>/<slug>.md)`). The result is shipped in the package as a
zero-dependency, Markdown-only reference library.

- **Source**: `github:GoogleChrome/modern-web-guidance-src` (the upstream `guides/` content)
- **Upstream pin**: `888035b5` (commit `888035b5f606f5366e6c9226e6782ce49af83a6f`) — same snapshot refreshed by story-019; keep the two in sync.
- **License** (two distinct upstream licenses apply — reproduce both notices):
  - **Guide / documentation content under upstream `guides/`** — the material actually vendored here — is licensed **CC-BY 4.0** (Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/). This is the applicable license for the vendored guide bodies.
  - **Software code** of the upstream repository is licensed **Apache-2.0**; the full Apache-2.0 text is the upstream repo-root `LICENSE` (https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/LICENSE). Any runnable code samples embedded in guides are covered by Apache-2.0 per upstream.
  - Upstream states both in its `README.md` "License" section (permission granted to redistribute with attribution).
- **Copyright / attribution**: © Google LLC and the modern-web-guidance-src contributors (portions derived from MDN Web Docs / Mozilla Contributors, W3C, WHATWG and IETF specifications). We retain this attribution and note our local modifications (macro expansion + localized cross-references) as the licenses require.
- **Vendoring model & ADR-A5**: this is a **verbatim vendor** of pure-Markdown guide bodies. ADR-A5's "零逐字 / no-verbatim" rule only governs the self-written idea-borrowing modules under `capabilities/`; it does **not** apply here. Attribution + license notice (not rewriting the text) is the correct treatment for a vendored playbook.
