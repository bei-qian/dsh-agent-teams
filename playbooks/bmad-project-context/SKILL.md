---
name: bmad-project-context
description: '项目级 agent 指令（AGENTS.md 受管 block）能力：为项目根 AGENTS.md 做 setup / adopt / refresh / record / audit。小队内由 architect（Winston）执行，访谈与写前批准经 Lead 中介；条件触发——无 / 空 / 无受管 block 时 setup/adopt，已有 `<!-- bmad:context -->` 时按需 refresh/audit。Use when invoked by name.'
---
# 项目级 agent 指令（AGENTS.md）

把一份「已验证的受管 block」写进项目的 `AGENTS.md`：用户带来他要求遵守的规则（治理、安全、标准），仓库提供其余可核实的内容。**对话始终进行；每次写入都由用户批准（经 Lead 呈报）。**

**Args（intent）**：`setup` | `adopt` | `refresh` | `record` | `audit`；一个目标 repo 或路径；可选的额外来源路径或 URL。

## 何时用
- 项目根**没有 `AGENTS.md` / 为空 / 有内容但无受管 block** → 走 `setup` / `adopt`（建 / 吸收）。
- **已有受管 `<!-- bmad:context -->` block** → **不静默跳过**，按需 `refresh` / `audit`（不强制每次跑，防止指令腐烂）。
- 用户点名要用（含 `record`）时随时可跑。

**判定口径**：脚手架空文件（空标题、注释、孤立 import 行）不算 meaningful → `setup`；拿不准时按 `adopt`（吸收近空文件只多一条 ledger，而把有内容的文件当 setup 会丢指令）。用户给的 intent 与探测结果矛盾时（例如对已有内容的文件下 `setup`）要上报确认，绝不静默照办。

**执行者与中介**：本 playbook 由 architect（Winston）执行；Winston 无 `ask_user`、无 shell。**访谈用户 / 写入前用户批准 → 经 Lead 中介**；**SHA / `git log` / 需实跑的命令 → 请 Lead 代跑**，拿不到写 `TODO(待 Lead 补)`。

## 先读
- `bmad-output/initiative.md`（greenfield 播种口径）
- 目标仓库现有的 `AGENTS.md`、`CLAUDE.md` 及同类 harness / agent 规则文件、docs 目录、任何含经验教训的笔记
- `references/best-practices.md`（准入 / 排除 / 退役 / 规模 / 检索 / 维护 / 判断既有文件的规则）
- `references/template.md`（受管 block 的形状、6 小节顺序、provenance 行示例）

**先读这两份 references 再做任何决定**——下文所有判断都以它们为准。

## 步骤

**第 5 步之前不写任何东西。**

### 0. 解析（替代原激活步骤，零依赖）
- 直接读**本技能目录**下的 `customize.toml`；工作流键默认全空（`activation_steps_prepend=[]`、`activation_steps_append=[]`、`persistent_facts=[]`、`on_complete=""`、`external_sources=[]`）。**不走 resolver；缺失即用内置默认。**
- 原 `{workflow.*}` 占位一律按空处理。
- `{output_folder}` → `bmad-output/`；恒为 Standalone（不依赖上游 METHOD 目录，不读任何外部脚本）。
- `{skill-root}` 指本技能安装目录；`{project-root}` 指项目工作目录；**Target** 默认 `{project-root}`。若解析到多个工作树，或用户无法在其中提交，先经 Lead 问再写。

### 1. 评估并报告
读 `AGENTS.md`、harness / agent 专用规则文件、docs 目录、任何带经验教训的笔记。按 `best-practices.md` 报告：存在什么、达标如何。

既有指令是要被改进的**基线**，绝不是可丢弃的原料。开一个 **ledger（台账）**：每条既有小节、每条独立有意义的指令一条，初始为 `retain` 或 `rewrite`，注明「没有它 agent 会出什么错」。条目随第 2–4 步证据落定——`retain | rewrite | relocate | automate | delete`，每条带：理由、证据、若丢失的风险、relocate 的目标、批准标记。删除必须有 `best-practices.md` 里四类依据之一；relocate 的目标本身必须会被加载、或处于可观察触发之后（搬进没人读的文件等于删除，需要删除依据）。`setup` 无既有可映射，不开 ledger；`refresh` 为它提议改动 / 删除的每一行（含 block 自身）开条目。指令文件之外发现的教训（README 里的警告、notes 文件）是普通候选，不是 ledger 条目。

若 target 含可分离单元（列出成员的 workspace manifest，或各自带 build manifest 的目录），点名并问这次是否只覆盖 root、全部、还是哪些。没有这种证据就别问。兄弟仓库不算 children，各自是独立 target，逐个来。**首版只覆盖仓库 root；monorepo / 子仓 children 先询问用户，不自动展开。**

### 2. 问他们带来什么（经 Lead）
无论仓库做什么都要遵守的规则：治理、安全与合规、编码标准、风格指南、冻结区。也问外部文档——手册、wiki、架构文档、MCP 知识库。记下路径，先不读。Greenfield：这就是全部内容。Brownfield：这是扫描够不着的那一半。

**Winston 不能直连用户**：由 architect 把问题清单交回 Lead（**每批 ≤8 问，越少越好**），Lead 用 `ask_user` 收集答复后回传。

### 3. 发现与核实（用自身工具顺序扫描）
用自身 `read` / `glob` / `grep` / `web` 工具**顺序扫描**（Winston 无 subagent，不并行扇出），针对各小节所需：可执行配置与 CI（政策、以及它们已声明的内容）、受版本控制的源码（约定与边界）、有针对性的历史（其理由仍须成立的那些约束）。

读 `package.json`、`Makefile`、`pyproject.toml`、贡献指南、PR 模板、CI 配置，是为了知道 block **不该重复**什么；其注意事项来自第 4 步的人。对每条点名文件的断言做**路径核对**。对 block 关于某命令行为的每条断言，读真正执行它的 target 或脚本核实。第 1 步商定的每个 child 按其自身 manifest 作为独立范围扫描。

**需实跑的命令 / `git log` / 取 SHA**：architect 无 shell，**请 Lead 代跑**；拿不到就标注 `TODO(待 Lead 补)`，绝不臆造。

### 4. 访谈缺口（经 Lead）
只问扫描够不着的东西：agent 在这里老犯什么错、什么不能动、某领域术语什么意思、某约束为什么存在。
- 扫描能答的绝不问用户。让用户确认一条已路径核对的断言、或配置文件已写明的事实，是缺陷。
- 问回忆式问题，不问审查清单；绝不把扫描造成的选择题丢给用户。
- 本次会话犯过并抓到的错是观察到的证据——可以提出来。
- 本次读到的任何东西里发现的、正确形式不是显然猜想的可复现命令（日志、文档、自身运行）是候选行，可以提出——例如需要 `poetry run pytest`，而直接 `pytest` 看似对却在项目环境外运行。
- 一批最多 8 条，越少越好；一批问不出新东西就该写。
- 仓库与用户矛盾时，出示证据再问；绝不照用户原话写，也绝不静默丢弃。

**由 Lead 用 `ask_user` 问，architect 提供问题、整理答复。**

### 5. 展示整块，然后写
按 `template.md` 组织。每个候选先问：hook / lint 规则 / CI 检查是否比散文更能强制它？能就提议该检查，该行作为用户拒绝时的兜底。标 `automate` 的 ledger 条目在其检查到位前保留指令（后续 run 在检查上线后按依据 2 删除该行）。

**写入前把完整 block 展示出来（经 Lead 呈报用户）**，每个 child block 一并展示——一次批准覆盖整组。**连同已落定的 ledger 一起展示**：只给替换文本是不完整的提案，因为它只显示用户得到什么、隐藏失去什么。每条既有指令都带决策与理由出现；保留与改写若保留完整规则可合并。若改写削弱、收窄或删掉规则的一部分，把丢掉的部分当作删除单独列出。保留规则本身；例子可解释它但不能替代它。每条 relocate、automate、delete 逐项列出。没有前三类依据的删除要单独逐条批准——批准 block 不等于批准它；被拒绝的删除 / relocate / automate 回到 retain。批准后，**只在标记之间拼接**（splice 本身不碰标记之外的任何东西）。标记之外的文本只能通过已落定 ledger 条目或用户已见的修复提议改动，绝不作为 splice 的副作用。provenance 行填今天的日期与核实过的 SHA——**architect 取不到 SHA 时写 `TODO(待 Lead 补)`**，由 Lead 补。

若别处指令与 block 冲突且会改变行为（过时的 `CLAUDE.md` 行、已退役的命令），向该文件提议修复。两条同时生效且矛盾的指令是缺陷。

**Never commit.**

### Refresh
同上的步骤，第 1 步做成 diff。读 provenance 行，重新核实每条路径与注意事项，并对每一行检查自记录 SHA 以来的删除 / 改名（原技能的 `git log --diff-filter=DR --name-only`：**请 Lead 代跑 / 读 `.git`，拿不到就标 `TODO(待 Lead 补)`**），更新或移除证据已消失的行。每个提议的移除都是第 5 步展示的 ledger 条目，绝不静默改；block 之外手写的指令按 adoption 处理——任何触及它们的提议都进 ledger。绝不重问上一次 run 已定的事；访谈缩小到「团队工作方式有什么变化」。**block 只因新证据而增长。**

### Adoption
对「本技能从未碰过的指令」做 refresh。上次 run 什么都没定，所以完整访谈适用——而文件本身就是维护者的证词，**ledger 是本次 run 的主要产出**：用户应能读懂它并看到自己每条指令去了哪。

提案要说明「指令被移出的每个文件」还剩下什么——通常是 `CLAUDE.md` 缩减为 `@AGENTS.md`（在每种在用 harness 都验证过该 import 之后，如同任何加载机制）。**没有指令同时存在于两个被加载的文件**（会被付两遍代价）；重复（逐字或改写）只保留一处——block 保留存活者——并同时了结两条条目。

### Greenfield
从 initiative 票据（读全 `bmad-output/initiative.md`）、规划文档、或纯访谈播种。尚不存在的命令写成显式 TODO、点名已定的技术栈，绝不把猜的命令写成事实，并在代码出现后的首次 refresh 核实。真正有争议的设计决策（真实权衡、多种可行形态）交给 `bmad-architecture`。

### Migration
若 target 有旧技能留下的 `project-context.md`（常见于 `bmad-output/project-context.md`），第 1 步读它并提议吸收其内容。未经同意不删、不静默遗弃。

### Record
在 agent 犯错当下捕获一条观察到的错误——这是 pitfall 唯一可采纳的来源。取任务、错误、纠正、证据；检查 block 是否已有条目覆盖。出现一次记下；反复或代价高的错误现在就挣一行——命令错误写成 **Running and verifying** 下的精确调用，否则写成 pitfall。写完展示 diff。若可机械防止，提议 hook / lint 规则 / CI 检查代替。

### Audit
重新核实每条注意事项、对每个文件做路径核对、跟随每个指针，并对每一行问「删掉它会不会改变 agent 行为」。对真正执行命令的 target 或脚本核实每条命令断言。检查与其他指令文件的矛盾。失败的行：修复、移到可观察触发之后、或变成 ledger 条目——删除需要 `best-practices.md` 四类依据之一，并在移除任何东西前按第 5 步展示、落定。**政策或 pitfall 只在其守护之物消失、或用户退役它时才走；「最近没失败」不是依据。** Audit 结束时应更小或相等。

### Children
组件、嵌套仓库、或抽出的规则文件，在工作持续落在那里且以下条件全部成立时，按同样形状得到自己的文件：其规则为子树独占、足够多（少数几条规则不成文件）、拆分实质减小父 block、每种在用 harness 的加载机制都验证过（核实，绝不假设）、且用户批准拆分。即便加载已验证，当某规则必须在会话进入该目录前就生效、或违反它会波及 child 之外时，仍保留在 root。否则规则以路径限定行留在父 block（如「在 `src/importer/` 中：……」），比一个没人加载的文件更省。用 linked file 仅当触发不是路径。选定的 child 若最后没有父 block 尚未说的内容，就不建文件，说明后跳过。**每个 child 在父 block 的 Where things are 用一行 + 其路径列出**；发现永不依赖 harness 是否找到它。

## 模板
写入目标仓库**项目根**的 `AGENTS.md`（这是「一切产出写 `bmad-output/`」契约的唯一例外）。按 `references/template.md` 的 block 形状，小节顺序如下（无内容则省略，**绝不写空节**）：

1. **Orientation** —— 3~4 句：是什么、技术栈、规划与更深文档在哪。
2. **Policy** —— 组织要求。
3. **Where things are** —— 入口点，及指向 children 与 linked files 的指针。
4. **Running and verifying** —— 该跑的命令与必需工具版本，以及 `package.json` / `pyproject.toml` / `Makefile` / CI 配置没说明的内容。
5. **Conventions that differ from defaults**
6. **Known pitfalls**

受管标记成对包裹：`<!-- bmad:context -->` … `<!-- /bmad:context -->`；provenance 行含日期 + SHA（取不到写 `TODO(待 Lead 补)`）。写法要求（平实祈使句、不写散文、最多两个强调标记等）见 `references/template.md`。

## 收尾
- 经 Lead 报告用户：进了什么、漏了什么及为什么、adopt / refresh 后每条既有指令的落点。
- 用用户的术语解释（依据 `best-practices.md`）：为什么小、为什么仓库已声明的不进、为什么某 pitfall 在其成因消失前保留。
- 说明怎么加载、其他 harness 文件如何指向它。
- 提交这些指令改动时适用的分支 / 票据 / commit / PR 规则。
- 维护：显著变更后重跑；agent 出错当下就 `record`；优先检查而非新增行。
- 跨项目重复的规则、或个人而非团队的偏好，属于用户的全局 agent 配置。
- **不 commit**；产物是项目根 `AGENTS.md`，通过 Lead 交用户复核 / 落库。
