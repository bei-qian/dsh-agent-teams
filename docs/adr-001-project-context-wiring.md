# ADR-001 · 把 bmad-project-context（AGENTS.md 能力）零依赖接入 Olympus Squad

- **状态**：Proposed（提案，待 Lead + 用户 review）
- **日期**：2026-11-21
- **决策者**：Winston（架构师）；待 Lead 与用户批准
- **一句话决策**：采用 **方案 C —— 零依赖 shim + 条件触发**：把上游 `bmad-project-context` 改写成一份**零依赖 playbook**（去掉 `_bmad`/Python/uv 调用，正文与两份 references 基本原样复用），挂到 architect（Winston）执行、由 Lead 作为用户交互中介；条件触发（无/空/无受管 block → `setup`/`adopt`；已有受管 `<!-- bmad:context -->` block → 按需 `refresh`/`audit`，不静默跳过、不强制每次跑）。**不改任何 preset / `presets/` / `cordis.patch.tmpl.yml`**——因为 `skills/` 本就未接线，只有 `playbooks/` 被 `customSkillDirs` 挂载，新增 playbook 即自动对全部预设可见。

> 本文件是**纯设计产物**，供人 review；不含任何落地实施。文末「改造清单」逐项给出可落地改法与验收标准。

---

## 0. 核实结论（先讲事实，均来自代码，非臆断）

| # | 事实 | 证据（文件:行） | 对设计的影响 |
|---|---|---|---|
| F1 | **`skills/` 未对队员可见，只有 `playbooks/` 被接线**。每个 preset 的 `skill-filesystem.customSkillDirs` 都指向插件内 `playbooks` 目录（`includeDefaultRoots:false`）。`verify.mjs` 注释明说完整 BMad 技能「kept on disk, not wired」。 | `cordis.patch.tmpl.yml:138-145,199-206,260-267,316-323,372-379,433-440,516-523,597-604`（8 处均 `join(..., 'playbooks')`）；`scripts/verify.mjs:74-89`（注释「full BMad kept on disk, not wired」） | **`skills/bmad-project-context` 目前对队员不可见**。要接入必须放到 `playbooks/` 下；不需要动 preset。 |
| F2 | **新增 `playbooks/<x>/SKILL.md` 即自动对全部 8 个预设可见**（含 Lead、含 architect）。 | 同上——`customSkillDirs` 指向整个 `playbooks/` 目录，逐子目录加载为技能 | 挂载能力**无需改 preset / rows / tmpl**。 |
| F3 | **激活步骤有两处 `uv` 依赖**，但 SKILL 自带降级口径。 | `skills/bmad-project-context/SKILL.md:22`（`uv run .../resolve_customization.py`）；`:27`（`uv run .../resolve_config.py`，`_bmad` 不存在则「Standalone: skip」）；降级口径 `:24`（「Any other failure: read customize.toml directly and use defaults」） | 零依赖改造**只需把「降级分支」固化为唯一行为**，不必真跑 python。 |
| F4 | `customize.toml` 的工作流键**全为空默认**：`activation_steps_prepend/append=[]`、`persistent_facts=[]`、`on_complete=""`、`external_sources=[]`。 | `skills/bmad-project-context/customize.toml:12-24` | SKILL 里 `{workflow.*}` 占位**可直接按空处理**，安全忽略 resolver。 |
| F5 | **正文与两份 references 无外部脚本依赖，可原样复用**。 | `SKILL.md`（Setup/Adoption/Refresh/Record/Audit/Children 全是文件读写逻辑）；`references/best-practices.md`（84 行）；`references/template.md`（55 行，含 `<!-- bmad:context -->` 标记与 6 小节） | 改造面很小：正文少量替换 + 两份 references 照搬。 |
| F6 | **Winston（architect）的工具集**：有 `tool-fs`（未显式关写/改，`lead` 才是唯一显式 `write:false, edit:false` 的）、`tool-fs-search`、`tool-web`、`tool-todo`、`skill-filesystem(playbooks)`、`tool-skill`、`compaction`。**没有 shell、没有 `tool-ask-user`、没有 subagent/委派工具**。 | `cordis.patch.tmpl.yml:398-457`（architect preset）；对比 `:120-137`（lead 有 shell）、`:54-55`（lead 有 ask-user） | 三重含义：① 能读写 `AGENTS.md`；② **不能跑 git/命令**（SHA、refresh 的 `git log`、命令验证都受限）；③ **不能直接问用户**——访谈与「写前用户批准」必须由 Lead（有 shell + ask_user）中介。 |
| F7 | **构建/校验链路**：`cordis.patch.yml` 由 `node scripts/build_patch.mjs` 从 `cordis.patch.tmpl.yml` + `persona/*.md` 内联生成；`node scripts/verify.mjs` 会重新生成到临时目录比对，并断言 8 preset/7 delegate/playbook/skills/元数据；`node scripts/squad_validate.mjs` 只校验 `bmad-output/`。 | `scripts/build_patch.mjs:1-58`；`scripts/verify.mjs:37-48,75-89,202-212`；`scripts/squad_validate.mjs:24-99` | **改 playbook 不需 build；改 `persona/*.md` 必须 build_patch.mjs 再 verify.mjs**。 |
| F8 | **协议固定契约是「一切产出写进 `bmad-output/`、不自创路径」，而 `AGENTS.md` 在项目根、天然在 `bmad-output/` 之外**。 | `playbooks/bmad-squad-protocol/SKILL.md`（输出目录契约 + 规则 3「不自创路径」）；`references/template.md`（AGENTS.md 在 repo root） | 协议需要为 `AGENTS.md` 明确开一个「唯一例外」，否则与纪律冲突。 |
| F9 | **文档不一致（待顺手修正）**：`verify.mjs` 顶部 docstring 说「the 7 member presets wire the bundled `skills/` dir」，与正文「not wired」矛盾。 | `scripts/verify.mjs:8-9` vs `:74-89` | 易误导后续实现者以为 `skills/` 已接线；建议在改造中修正 docstring。 |
| F10 | 原有一条「外部示例夹具目录供校验器冒烟跑」的现状，`verify.mjs` 曾对该目录跑一遍校验器。**已移除**：该外部示例目录与 `verify.mjs` 中对应的冒烟调用均已删除，`verify.mjs` 现仅跑 `squad_validate.mjs --self-test`。 | —（原 `scripts/verify.mjs` 示例段等，均已删除） | 校验改由 `--self-test` 用临时目录自造红/绿夹具覆盖，不再依赖外部示例，也不污染真实项目。 |

> **与你假设可能不符的点（重点）**：你倾向「挂到架构（Winston）最贴（命令验证/约定/边界）」。核实后——Winston **没有 shell、没有 ask-user**。所以「命令验证」只能是**读脚本/配置核对**（不能实跑），provenance 的 **SHA / `git log` 刷新 / 真实命令验证需要 Lead（有 shell）代跑**；而「访谈用户 / 写前批准」这种对话必须由 **Lead 用 ask_user 中介**。结论方向（挂 architect）仍成立：architect 负责分析、决策与**写** `AGENTS.md`，但**人机交互与命令执行外包给 Lead**。

---

## 1. ADR

### 1.1 背景 / 问题

用户希望把「AGENTS.md（仓库级 agent 指令）」这项能力接进小队：**项目没有 AGENTS.md 时小队帮忙建，有的话按需处理**。插件里已有完整 BMad METHOD 技能 `skills/bmad-project-context/`，能力最贴合。但它与小队既定前提「零依赖（无 `_bmad/`、无 Python/uv，只 node + shell）」冲突：

1. **激活即依赖 uv**：`SKILL.md:22/:27` 要求 `uv run {project-root}/_bmad/scripts/*.py`；小队目标项目一般没有 `_bmad/` 与 uv。
2. **技能当前不可见**：`skills/` 未被任何 preset 的 `skill-filesystem` 接线（F1），队员根本加载不到它。
3. **执行者不匹配**：原技能假设「会话式 AI 直接与用户对话、每次写前批准」，而 Winston 无 ask-user、无 shell（F6）。

所以要解决的不是「调用一个现成技能」，而是：**产出一份零依赖、可被队员加载、且适配小队「Lead 中介 + architect 执行」形态的 AGENTS.md 能力，并定义条件触发**。

### 1.2 候选方案对比（≥3 选 1）

| 维度 | **A · 不接入，保持现状** | **B · 原版 skill 硬挂** | **C · 零依赖 shim + 条件触发（推荐）** |
|---|---|---|---|
| 做法 | 不提供 AGENTS.md 能力 | 把 `skills/` 也接到 `customSkillDirs`（或逐 preset 指向 `skills/`），让队员直接加载原 `bmad-project-context` | 新增 `playbooks/bmad-project-context/`（正文 + 2 references 复用、去掉 uv/`_bmad`），挂 architect 执行、Lead 中介，条件触发 |
| 用户价值 | ❌ 没有；每个新 repo 反复踩同样坑 | ⚠️ 理论有，但依赖 `uv`/`_bmad`，多数目标项目跑不起来 → 实际激活即失败/降级 | ✅ 任意项目零安装可用；建/吸收/刷新/审计全覆盖 |
| 零依赖合规 | ✅（但没能力） | ❌ 破坏零依赖前提；要么逼迫目标项目装 Python/uv，要么每次走降级分支（不可靠） | ✅ 纯 Markdown + 内置工具 |
| 改动面 | 0 | 大：改 8 个 preset 的 skill 接线、可能扩 `customSkillDirs` 到 `skills/`、新增 preset/依赖、担心 name 冲突 | 小：**仅新增 playbook + 改 protocol + 两处 prompt**；**不动 preset/presets/tmpl** |
| 失败模式 | 能力缺失 | 激活报错、`npx skills add` 引导误装、依赖环境差异大 | 失败面收敛到「对话中介」「SHA 取不到」等可控点，均有兜底 |
| 维护成本 | — | 高（跟随上游 METHOD 环境假设） | 中（playbook 与上游会漂移，与 R1 同类代价） |
| 结论 | 否 | 否 | **采用** |

**为什么不是 B 的「轻量版」**：即使把 `skills/` 也接进 `skill-filesystem`，原 `SKILL.md` 第 1/2 步仍会 `uv run {project-root}/_bmad/scripts/...`；它能走降级分支，但「激活即先尝试跑 uv」的路径在零依赖机器上必然报错，且 `{workflow.*}`、`{output_folder}` 语义仍绑定 METHOD 目录结构。本质上**必须改写**，所以等价于 C，只是还要多动 preset——得不偿失。

### 1.3 决策

**采用方案 C**，并明确以下设计点（均已对照第 0 节事实）：

1. **形态**：在 `playbooks/bmad-project-context/` 提供零依赖 playbook（`SKILL.md` + `references/best-practices.md` + `references/template.md` + 复用默认值的 `customize.toml`）。正文复用原 `SKILL.md` 的意图模型（`setup|adopt|refresh|record|audit`）、ledger、受管标记、provenance、`Never commit`、写前批准等；**修改点仅限**：
   - 激活第 1 步：删掉 `uv run resolve_customization.py` 与 `npx skills add` 引导，**只保留**「直接读 `{skill-root}/customize.toml`，默认全空」。
   - 激活第 2 步：删掉 `uv run resolve_config.py`，**恒为 Standalone: skip**；`{output_folder}` → `bmad-output/`。
   - `{workflow.*}` 占位按空处理（F4）。
   - 第 3 步「Fan out with parallel subagents」→ 改为「用自身 `read/glob/grep/web` 顺序扫描」（Winston 无 subagent 工具）。
   - Refresh 的 `git log --diff-filter=DR` → 请求 Lead 代跑 / 读 `.git` / 标 `TODO`，不硬依赖。
   - Greenfield 的 `initiative-<slug>.md` → `bmad-output/initiative.md`；Migration 的 `{output_folder}/project-context.md` → `bmad-output/project-context.md`。
   - **访谈与「写前用户批准」改为经 Lead 中介**（Winston 无 ask-user）：Winston 把问题清单/草稿 + ledger 交回 Lead，Lead 用 ask_user 收集/呈报用户，批准后 Lead 再指示 Winston 写入。
   - 原样复用：Overview、Resolution rules（`{skill-root}`/`{project-root}` 语义不变）、Setup/Adoption/Refresh 的步骤逻辑、Record、Audit、Children、`references/best-practices.md`、`references/template.md`。
2. **条件触发**（写进 playbook「何时用」+ protocol「第 0 步」+ 两处 prompt）：
   - 目标项目**无 `AGENTS.md` / 空 / 有内容但无受管 block** → `setup` / `adopt`（建 / 吸收）。
   - **已有受管 `<!-- bmad:context -->` block** → **不静默跳过**，按需 `refresh` / `audit`（不强制每次跑）。
   - 用户点名叫用时随时可跑（`record` 亦同）。
3. **挂载对象**：architect（Winston）。方式是「playbook 自动可见（F2）+ protocol 第 0 步 + architect/lead prompt 各加一段路由」，**不改 preset**。Sofia 仍负责文档落盘与 `index.md`，不受影响（AGENTS.md 不属票据，不写 `index.md`）。
4. **落点与写入纪律**：`AGENTS.md` 在**项目根**（不在 `bmad-output/`），是协议固定契约的**唯一明确例外**；派活时 `writeScopes` 标注 `AGENTS.md`；**写入前必须用户确认**；greenfield 内容主要靠 Lead 访谈用户（治理/安全/禁改目录/术语/已知坑）+ 扫现有配置（`package.json`/CI/`Makefile`）；命令拿不准写 `TODO` 不臆造。
5. **可选校验**：**不把 AGENTS.md 检查塞进阶段门**（理由见 2.11）。如要做，做成独立脚本、默认不进门。

**为什么这是「更强方案」而非仅照用户倾向**：核实发现 Winston 无 shell/ask-user（F6）——若机械照搬「Winston 直接跑原技能」，访谈和批准无从落地。故本设计把**执行（architect，能写文件）**与**交互/命令（Lead，能问人、能跑 git）**拆开，既保留「挂架构」的直觉，又适配真实工具边界；同时因为 playbook 自动可见（F2），把改动面压到最小（零 preset 改动）。

### 1.4 后果

**正面**
- 任意项目零安装即可产出/维护 `AGENTS.md` 受管 block，符合零依赖前提。
- 改动面极小：不动 preset/presets/tmpl，新增能力靠现有 `customSkillDirs` 自动生效（F2）。
- 复用上游最成熟的两份文档（best-practices + template），产出口径与原版一致：受管标记 + 6 小节（Orientation / Policy / Where things are / Running and verifying / Conventions / Known pitfalls）+ provenance（日期 + SHA）。
- 条件触发避免「每次必跑」的仪式感；已受管 block 走 refresh/audit 而非静默跳过，防止指令腐烂。
- 保留「用户批准每次写入」「不 commit」「ledger 逐项交代」等安全纪律。

**负面**
- playbook 是从上游 METHOD 技能改写的**副本**，会与上游漂移（与 R1 同类代价，可接受）。
- 人机交互变长：Winston 不能直连用户，访谈/批准要经 Lead 多一轮；效率低于单会话技能。
- SHA 与真实命令验证受限于 Winston 无 shell：需 Lead 代跑，或降级为 `TODO`。

**风险**（详见第 4 节）
- R1：把「写 AGENTS.md」误当常规产出而污染真实 repo → 用「强制用户批准 + writeScopes + 不 commit」兜。
- R2：未来若把 `skills/` 也接线，`bmad-project-context` 会与 playbook 同名冲突。
- R3：改了 prompt 忘记 `build_patch.mjs` 导致 `cordis.patch.yml` 漂移 → `verify.mjs` 兜底。
- R4：provenance SHA 长期缺失 → refresh/audit 退化为弱 diff。

---

## 2. 改造清单（可落地级别）

> 类型：新增 / 修改 / 不改。每条含**改什么（要点）**与**验收标准**。凡「修改 `persona/*.md`」都是改**真相源**，须再跑生成/校验命令（见 2.12）。

### 2.1 `playbooks/bmad-project-context/SKILL.md` — **新增**
- **改什么**：
  - frontmatter：`name: bmad-project-context`；`description` 说明「小队内由 architect 执行；为项目根 `AGENTS.md` 建立/吸收/刷新/审计受管 block；条件触发」。
  - 结构对齐现有 playbook：`## 何时用` / `## 先读`（读 `bmad-output/initiative.md`、目标 repo 现有 `AGENTS.md`/`CLAUDE.md`、`references/best-practices.md`、`references/template.md`）/ `## 步骤`（零依赖化的原 1–6 步）/ `## 模板`（指向 `references/template.md`，可内联 6 小节顺序）/ `## 收尾`（不 commit；经 Lead 报告）。
  - 落实 1.3 的全部「修改点」：删 uv/npx/`_bmad`；`{workflow.*}` 视为空；subagent 扇出改自身工具顺序扫描；`git log` 交 Lead/标 TODO；`{output_folder}`→`bmad-output/`；访谈/批准经 Lead。
  - 保留：5 种 intent、ledger（`retain|rewrite|relocate|automate|delete` + 四类删除依据）、受管标记、provenance、`Never commit`、写前展示整块、Children 规则。
- **验收标准**：
  - `grep -n "uv run\|_bmad\|npx skills add"` 在该文件**命中 0**。
  - 在任一成员会话里 `tool-skill` 能看到 `bmad-project-context` 且可加载。
  - 文内明确：条件触发（无/空/无受管→setup/adopt；有受管→按需 refresh/audit）、`AGENTS.md` 在项目根、写前用户批准（经 Lead）、命令拿不准写 TODO。

### 2.2 `playbooks/bmad-project-context/references/best-practices.md` — **新增（照搬）**
- **改什么**：与 `skills/bmad-project-context/references/best-practices.md` 内容一致（84 行准入/排除/退役/规模/检索/维护/判断既有文件）。
- **验收标准**：与源文件 `diff` 为空（或仅行尾无关差异）。

### 2.3 `playbooks/bmad-project-context/references/template.md` — **新增（照搬）**
- **改什么**：与源一致；含 `<!-- bmad:context -->` 与 `<!-- /bmad:context -->` 标记、6 小节顺序、provenance 行示例。
- **验收标准**：`diff` 为空；标记与小节顺序正确。

### 2.4 `playbooks/bmad-project-context/customize.toml` — **新增（复用默认值）**
- **改什么**：复制源 `customize.toml`（工作流键全空默认），供 SKILL「直接读它取默认值、缺失则用内置默认」；注明**不走 resolver**。
- **验收标准**：键齐全且为空；SKILL 明文引用它。

### 2.5 `playbooks/bmad-squad-protocol/SKILL.md` — **修改**
- **改什么**：新增一小节「**第 0 步 · AGENTS.md（项目级 agent 指令）**」：
  - 目标与**条件触发**（无/空/无受管→`setup`/`adopt`；有受管 `<!-- bmad:context -->`→按需 `refresh`/`audit`，不静默跳过、非每次必跑）。
  - **仅 architect（Winston）执行**：加载 `bmad-project-context` playbook。
  - **`AGENTS.md` 在项目根**，是「一切产出写 `bmad-output/`」**契约的唯一例外**（对应 F8）。
  - 派人前由 **Lead 用 `ask_user`** 访谈（治理/安全/禁改/术语/已知坑），命令拿不准写 `TODO`。
  - 写入前**用户确认**；任务 `writeScopes` 标 `AGENTS.md`；**不 commit**。
- **验收标准**：新增小节清晰、不与 index/票据规则冲突；`grep "AGENTS.md"` 能看到「唯一例外 + 条件触发 + 写入确认」三要素；协议仍能通过 `squad_validate`（协议文件本身不参与校验器逻辑，仅人工自检）。

### 2.6 `persona/architect.md` — **修改（真相源）**
- **改什么**：在「工作方式」加一段：
  - 当项目根 `AGENTS.md` 缺失/为空/无受管 block，或用户要求时，**加载 `bmad-project-context` playbook 跑 `setup`/`adopt`**；已有受管 block 按需 `refresh`/`audit`。
  - **写前经 Lead 取用户批准**；`AGENTS.md` 放项目根；`writeScopes` 含 `AGENTS.md`。
  - SHA / `git log` / 需实跑的命令请 **Lead 代跑**，拿不到写 `TODO(待 Lead 补)`；能读脚本核对的就核对，不臆造。
- **验收标准**：persona 明确「能力 + 边界 + 经 Lead」；`node scripts/build_patch.mjs` 后 `cordis.patch.yml` 对应 `@@PROMPT:architect@@` 段包含该文本。

### 2.7 `persona/squad-lead.md` — **修改（真相源）**
- **改什么**：在「运行协议」加**第 0 步 / 路由话术**：
  - 接手（尤其新建项目/首次 initiative）时判断 `AGENTS.md` 条件；需要时用 `ask_user` 访谈，并按需 `delegate_architect`（任务写清「产出 AGENTS.md 受管 block、边界、验收」，`writeScopes=[AGENTS.md]`、注明「需用户确认后写」）。
  - 已有受管 block **不静默跳过**，按需派 refresh/audit；**不强制每次跑**。
- **验收标准**：Lead persona 有明确条件触发与委派话术；build 后 patch 同步。

### 2.8 `cordis.patch.tmpl.yml` — **不修改**
- **理由**：`customSkillDirs` 已覆盖整个 `playbooks/` 目录，新增子目录自动可见（F2）；无新增/删除 preset、无 `presets/` 变更。
- **验收标准**：`git diff -- cordis.patch.tmpl.yml` 为空；确认无任何 preset 结构变化。

### 2.9 `presets/*` — **不修改**
- **理由**：无新增 preset；`presets/` 仅为既有预设的模块再导出 + locale。
- **验收标准**：`git diff -- presets/` 为空。

### 2.10 `scripts/verify.mjs` — **修改（建议）**
- **改什么**：① 增加断言：`playbooks/bmad-project-context/SKILL.md` 及两份 references 存在；② 可选断言该 `SKILL.md` 不含 `uv run` / `_bmad`（防回退）；③ 顺手修正 F9 的过时 docstring（`:8-9` 改为「bundled `skills/` kept on disk, not wired」并说明 playbook 才是启用路径）。
- **验收标准**：`node scripts/verify.mjs` 通过；故意删除该 playbook 文件时 verify 失败。

### 2.11 `scripts/squad_validate.mjs` — **不改（推荐）／或不进门**
- **评估与理由**：当前 validator 只针对 `bmad-output/`，是**确定性硬门**；`AGENTS.md` 是**可选**产物且在 `bmad-output/` 之外，把它纳入硬/软警告会污染「Lead 收尾必须 0 警告」的契约，可能误挡交付。故**建议不放进 `squad_validate`**。
- **若一定要做**（可选）：新增**独立**脚本 `scripts/check_agents_block.mjs`（有 `AGENTS.md` 时提示：受管标记成对、6 小节是否齐全、provenance 是否含日期+SHA/TODO），**手动/CI 可选跑**，默认不影响阶段门；或给 `squad_validate` 加 `--check-agents` 显式开关、默认关闭。
- **验收标准（若做）**：无 `AGENTS.md` → 退出 0、无输出；有受管 block 但缺 provenance → **非阻断**提示；不改变 `squad_validate` 现有退出码语义。

### 2.12 生成 / 校验命令 — **运行**
- 因改了 `persona/*.md`（真相源），必须：
  1. `node scripts/build_patch.mjs` — 重新生成 `cordis.patch.yml`（把新的 architect/lead persona 内联进去）。
  2. `node scripts/verify.mjs` — 校验生成物同步 + 8 preset/7 delegate/playbook/skills/元数据。
  3. `node scripts/squad_validate.mjs --self-test` — 校验器自检（红/绿夹具）；阶段门可对真实 `bmad-output` 跑 `node scripts/squad_validate.mjs ./bmad-output`。
- **注意**：**只改 playbook / protocol 时不需要 `build_patch.mjs`**（playbooks 不内联进 patch）；只有改 `persona/*.md` 才需要。任何改动后都建议跑一次 `verify.mjs`。
- **验收标准**：三条命令均退出 0；`node scripts/build_patch.mjs` 后 `git diff cordis.patch.yml` 仅含预期 persona 变化。

### 2.13 文档（可选）— `README.md` / `ROADMAP.md` / `CHANGELOG.md`
- **改什么**：README「默认启用零依赖 playbook」段补一句 `bmad-project-context`（AGENTS.md 能力）；ROADMAP 记 R1.1；CHANGELOG 记本次接入。
- **验收标准**：文档与实现一致，读者能发现该能力。

---

## 3. 落地顺序与依赖

1. **先落 playbook（2.1–2.4）**：完全独立、无依赖；完成后 `grep "uv run\|_bmad\|npx skills add"` 应为 0，且成员会话能加载。
2. **改 protocol（2.5）**：引用 playbook 名；依赖 2.1 的命名（`bmad-project-context`）。
3. **改两处 prompt（2.6、2.7）**：依赖 2.5 定的「第 0 步」话术与 playbook 名。
4. **（可选）verify.mjs（2.10）与文档（2.13）**。
5. **跑生成/校验（2.12）**：`build_patch.mjs` → `verify.mjs` → `squad_validate.mjs`。**这一步是阶段门**。
6. **真机验证**：开一个 architect 会话，确认 `tool-skill` 里能看到 `bmad-project-context`；对一个**无 `AGENTS.md` 的测试目录**走一遍 setup（Lead 访谈 + 用户批准后由 architect 写），检查产物标记、6 小节（有内容才写）、provenance。建议在临时目录验证，不污染真实项目。

依赖关系：`2.6/2.7` →（`build_patch.mjs`）→ `2.12.verify`；`2.5` 依赖 `2.1`；`2.8/2.9` 明确不改，作为对比基线。

---

## 4. 风险与回滚

| 风险 | 说明 | 缓解 |
|---|---|---|
| **R1** 污染真实 repo | 把「写 `AGENTS.md`」当常规产出，未经同意就改用户仓库 | 强制**用户批准** + `writeScopes=[AGENTS.md]` + **不 commit**；playbook 明确「show block before writing」 |
| **R2** 同名技能冲突 | 未来若把 `skills/` 也接入 `skill-filesystem`，会与 playbook 同名 `bmad-project-context` | 保持 `skills/` 不接线；或改名 `squad-project-context`；或接线时去重 |
| **R3** 生成物漂移 | 改了 `persona/*.md` 却忘跑 `build_patch.mjs`，`cordis.patch.yml` 落后 | `verify.mjs` 会比对失败兜底；CI（`.github/workflows/verify.yml`）拦截 |
| **R4** 弱 provenance | Winston 无 shell，SHA/`git log` 取不到 → refresh/audit 退化 | Lead 代跑 `git rev-parse --short HEAD`；取不到写 `TODO(待 Lead 补)`；refresh 至少做到「读当前文件 diff」 |
| **R5** 交互过长 | 无直连 ask-user，访谈/批准多轮 | Lead 一次性批量访谈（≤8 问，原技能口径）；把「草稿+ledger」随消息回传减少来回 |
| **R6** 与上游漂移 | playbook 是副本，上游更新不流入 | 接受（R1 同类代价）；可在 CHANGELOG 记录基线版本，定期对照 |

**回滚**：删除 `playbooks/bmad-project-context/`；`git checkout` 还原 `persona/architect.md`、`persona/squad-lead.md`、`playbooks/bmad-squad-protocol/SKILL.md`（及可选的 `verify.mjs`/文档）；重跑 `build_patch.mjs` + `verify.mjs`。因**零 preset/presets/tmpl 改动**，回滚干净、无残留接线。

---

## 5. 待确认 / 开放问题（请 Lead 决策）

1. **Winston 的 `tool-fs` 写权限默认值**：推断为「默认可写/可改」（仅 `lead` 显式 `write:false, edit:false`），建议实现前用 `dsh-tool-fs` 文档或实测确认——否则「architect 写 AGENTS.md」不成立。
2. **是否给 architect 加 shell**：为拿 SHA / 实跑命令。建议**不加**（最小权限），全部由 Lead 代跑；若你认为 refresh/audit 需常跑，可评估只读 shell。
3. **是否让 Winston 直连 ask_user**：当前 preset 无该工具；若要多轮访谈直连用户，需在 architect preset 加 `tool-ask-user`（扩大改动面到 preset）。建议**不改**，Lead 中介。
4. **provenance 缺 SHA 的写法**：`TODO(待 Lead 补)` / `unknown` / 只写日期？建议统一 `SHA: TODO(待 Lead 补)`。
5. **playbook 命名**：`bmad-project-context`（贴合上游）vs `squad-project-context`（规避 R2 同名）？
6. **references 形态**：独立 `references/` 文件（贴合原技能、改动小）vs 内联进 `SKILL.md`（规避对 `{skill-root}` 解析的依赖）？建议独立文件，若担心解析再内联。
7. **软检查是否做**（2.11）：建议仅独立脚本、默认不进门；是否本轮就做？
8. **monorepo/多子仓**：原技能有 `Children` 节（子目录各自 `AGENTS.md`）。首版是否只覆盖 root + 询问是否需要子仓？建议首版 root-only + 询问。
9. **`verify.mjs` docstring 不一致（F9）** 是否顺手修正？建议修正。
10. **触发时机**：只在「新建项目 / 首次 initiative」自动提示，还是任意时刻用户点名都可（含 `record`）？建议**两者都要**：入口自动提示 + 用户点名随时跑。

---

## 6. 验收标准汇总（怎样算这轮改造成功）

1. **零依赖**：`playbooks/bmad-project-context/SKILL.md` 中 `grep "uv run\|_bmad\|npx skills add"` 命中 0；两份 references 与源一致（diff 空）。
2. **可见性**：任一成员（含 architect、lead）会话里 `tool-skill` 能列出并加载 `bmad-project-context`。
3. **setup 路径**：对无 `AGENTS.md` 的测试目录，经 Lead 访谈 + 用户批准，architect 在**项目根**生成 `AGENTS.md`，含成对 `<!-- bmad:context -->` 标记、6 小节（有内容才写）、provenance（日期 + SHA 或 `TODO`）。
4. **adopt 路径**：已有 `AGENTS.md`（有内容、无受管 block）→ 走 adopt，输出 ledger、保留原指令、不静默删除。
5. **refresh/audit 路径**：已有受管 block → **不静默跳过**；按需 refresh/audit，删除项在 ledger 逐项呈现；`record` 可随时记录。
6. **判定口径**：空/脚手架文件判定为 `setup`（脚手架不算 meaningful）；矛盾 intent 上报确认不静默执行。
7. **构建一致**：`node scripts/build_patch.mjs` 后 `cordis.patch.yml` 与 `persona/*.md` 同步；`node scripts/verify.mjs` **退出 0**；`node scripts/squad_validate.mjs` **退出 0**。
8. **未越界**：`cordis.patch.tmpl.yml` 与 `presets/` **diff 为空**（零 preset 改动）。
9. **纪律**：用户批准前不写 `AGENTS.md`；不 commit；命令拿不准写 `TODO` 不臆造；需实跑的命令由 Lead 代跑。
10. **文档**（可选）：README/ROADMAP/CHANGELOG 记录了本次接入，读者可发现该能力。

---

### 附：零依赖改造映射（原 SKILL.md → playbook，逐处）

| 原 `SKILL.md` 位置 | 原内容 | 零依赖改法 | 复用/改写 |
|---|---|---|---|
| `:22` | `uv run .../resolve_customization.py` | 删除；只保留「直接读 `{skill-root}/customize.toml`，默认全空」 | 改写 |
| `:23` | 脚本缺失 → `npx skills add ...` 引导 | 删除（不引导安装完整 bmad） | 删除 |
| `:24` | 「Any other failure: 直接读 customize.toml 用默认」 | **固化为唯一行为** | 复用 |
| `:26` | `{workflow.activation_steps_prepend}` / `persistent_facts` | 按空处理（读 customize.toml，默认空） | 复用（空） |
| `:27` | `uv run .../resolve_config.py`，`_bmad` 存在才跑，Standalone: skip | **恒 Standalone: skip**；`{output_folder}`→`bmad-output/` | 改写 |
| `:29` | `{workflow.external_sources}` / `activation_steps_append` | 默认空 | 复用（空） |
| `:87` | `{workflow.on_complete}` | 默认空 | 复用（空） |
| `:51` | 「Fan out with parallel subagents」 | 用自身 `read/glob/grep/web` 顺序扫描 | 改写 |
| `:91` | `git log --diff-filter=DR --name-only` 自证 | 请 Lead 代跑 / 读 `.git` / 标 `TODO` | 改写（弱化） |
| `:101` | Greenfield 从 `initiative-<slug>.md` 播种 | → `bmad-output/initiative.md` | 改写 |
| `:105` | `{output_folder}` 下 `project-context.md` | → `bmad-output/project-context.md` | 改写 |
| `:44-66, :72, :111` | 访谈用户 / 展示整块 / 用户批准每次写入 / record | **经 Lead（ask_user）中介** | 改写（交互） |
| Overview / Resolution rules / Setup-Adoption-Refresh 步骤逻辑 / Audit / Children | 文件读写逻辑 | 原样复用 | **复用** |
| `references/best-practices.md` / `references/template.md` | 准入规则 + block 模板 | 照搬 | **复用** |
| `customize.toml` | 全空默认 | 照搬 | **复用** |
