# Upstream BMad skills — attribution

The vendored reference copy of the BMad skills is **no longer kept in this repository**
— it was removed in issue #16 (2026-11-24), and it was **never shipped in the package**
(`package.json#files` has never included it). The squad's effective BMad instructions
live in `playbooks/` (plus `capabilities/`), which were distilled from these upstream
skills; those two roots are the **only** runtime skill roots. A consumer who needs the
originals can `git clone` the two upstream repositories below; the plugin package does not
carry them.

The squad actually works because of `playbooks/` + `capabilities/`, which are wired
as the runtime skill roots — not because of the former vendored copy, which has never
been mounted (removed from the repo in issue #16).

- **Sources** (two upstream repositories; the 38 former vendored dirs map 1:1 — see
  `docs/vendored-skills-baseline.md`):
  - `github:bmad-code-org/BMAD-METHOD` — 28 dirs, under its `core-tools` and `method` skill categories (`core-tools` 12 + `method` 16)
  - `github:bmad-code-org/bmad-method-test-architecture-enterprise` — the other 10 dirs (`bmad-tea`, `bmad-tea-*`, `bmod-tea`), flat layout under its skill root
- **Upstream pins** (对照基线，2026-11-24 本机 clone 的 HEAD；**≠ 经 bisect 证实的快照来源**): `BMAD-METHOD` @ `e435a22574fe55722841086e5566420178b98df3`; `bmad-method-test-architecture-enterprise` @ `85fda574351f34c4f3ec2f9611b642c64b8601a0`. 这是在本机与仓库内快照抽检一致的上游状态，作为日后 diff 的**对照基线**，不是经 bisect 证实的快照来源 sha（issue 草稿曾记 `a2819f62…`，是本机 clone 的历史祖先）。
- **License**: MIT — Copyright (c) 2025 BMad Code, LLC (full text in the repo-root `LICENSE-BMAD-METHOD.txt`, which is shipped in the package)
- **Snapshot**: the repository no longer stores a copy; to rebuild the distillation
  baseline, clone the two upstream repositories and diff against the mapping in
  `docs/vendored-skills-baseline.md`.

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
`bmad setup`. Since the repo no longer carries a skills copy, bootstrap the full BMad toolkit
from the upstream repositories (`github:bmad-code-org/BMAD-METHOD` and
`github:bmad-code-org/bmad-method-test-architecture-enterprise`), not from this package.

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
