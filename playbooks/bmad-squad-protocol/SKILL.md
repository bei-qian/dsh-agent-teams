---
name: bmad-squad-protocol
description: Olympus Squad 的零依赖运行协议：固定 bmad-output/ 目录、index.md 票据真相、squad_validate 确定性校验。Lead 与成员开工/收尾时加载。
---
# Olympus Squad · 零依赖运行协议

这是「零依赖版」小队的纪律基线。不依赖 `_bmad/`、不依赖 Python/uv，但用**固定目录 + 索引文件 + 校验器**保证确定性。所有成员与负责人每次开工、收尾都遵守。

## 输出目录（固定契约）

小队的一切产出都写到当前工作区的 `bmad-output/` 下，路径固定、不得自创：

```
bmad-output/
  initiative.md        # 唯一真相：举措目标/范围/开放问题（Themis 维护）
  index.md             # 唯一真相：票据清单（Themis 维护）
  research/            # Apollo：调研笔记、brief
  prd.md               # Prometheus：PRD
  architecture.md      # Athena：架构 + ADR 摘要
  design.md            # Ariadne：设计
  experience.md        # Ariadne：体验/行为
  epics/epic-*.md      # Themis：epic
  stories/story-*.md   # Themis：story
  tasks/task-*.md      # 可选：拆到 task
```

## 第 0 步 · AGENTS.md（项目级 agent 指令）

`AGENTS.md` 承载「项目级 agent 指令」，由 architect（Athena）用 `bmad-project-context` playbook 维护。它是**条件触发**，不是每次必跑：

- 目标项目**无 `AGENTS.md` / 为空 / 有内容但无受管 block** → 走 `setup` / `adopt`（建 / 吸收）。
- **已有受管 `<!-- bmad:context -->` block** → **不静默跳过**，按需 `refresh` / `audit`（不强制每次跑，防止指令腐烂）。
- 用户点名要用（含 `record`）时随时可跑。

纪律：

- **仅 architect（Athena）执行**：由它加载 `bmad-project-context` playbook。Themis 维护的 `index.md` / 票据流程不受影响（`AGENTS.md` 不是票据，不写 `index.md`）。
- **`AGENTS.md` 在项目根**，是「一切产出写 `bmad-output/`」契约的**唯一明确例外**；除此之外仍只写 `bmad-output/`。
- 派活前由 **Lead 用 `ask_user`** 访谈用户（治理 / 安全 / 禁改目录 / 术语 / 已知坑）；命令拿不准写 `TODO(待 Lead 补)`。
- **写入前必须用户确认**；任务上标 `writeScopes=[AGENTS.md]`；**不 commit**。

## index.md 格式（票据真相）

Markdown 表格，列顺序固定 `id | type | title | status | file`：

```
| id | type | title | status | file |
|---|---|---|---|---|
| epic-001 | epic | 周报自动汇总 | in_progress | epics/epic-001.md |
| story-001 | story | 收集来源数据 | done | stories/story-001.md |
```

- `type` ∈ `epic|story|task`；`status` ∈ `todo|in_progress|in_review|done|blocked`。
- `file` 相对 `bmad-output/`，必须真实存在。
- 任何票据状态变化，**改 index.md 的那一行**，不要新建第二份索引。

## 阶段门（Gate，强制）

每完成一个阶段、或把一个 story 置为 `done` 之前，**必须**跑校验器并让它通过：

```
node <本技能目录>/../../scripts/squad_validate.mjs ./bmad-output
```

由 **Lead**（有 shell）在每个阶段门执行；`dev`/`tea` 完成自己阶段时可自行执行；其他成员交付时报告 Lead 由其执行。加载本技能时 DSH 会给出该 SKILL.md 的真实路径；校验器就在插件 `scripts/squad_validate.mjs`（本技能目录的上两级 `../../scripts/`）。

- 退出码 0 = 通过，可以继续/收尾；
- 退出码 1 = 有硬错误（缺文件、重复 id、非法状态、index 指向不存在的文件），**修好再跑**，不得跳过；
- 警告（如 story 标 done 但缺「验收标准/实现/验证」）不阻断，但应在收尾前补齐。

## 安全 / 非功能约束 → 可执行验收标准（Lead）

架构文档（`bmad-output/architecture.md`）里的安全与非功能约束不是「参考」，是可验收的硬要求。规划与派活时 **Lead** 必须：

- **逐条转写**：把每条安全/非功能约束（认证/授权、密钥与凭据管理、防账号枚举、时序/侧信道、失败语义一致性、启动期不变量、配置边界等）转写为票据里的**可测验收标准**——可断言、含负路径与边界，而不是形容词。
- **门禁用证据**：阶段门不只跑功能测试，还要用**确定性证据**（KDF/调用计数、桩、状态断言，而非不稳定耗时）确认这些约束已落实；功能通过 ≠ 安全约束通过。
- **如实标记**：约束暂时无法被现有测试确定性覆盖时，在票据标注为「残余风险 / 待补测试」，不得默认视为通过。

## Token 纪律（每个成员、每一步）

成本 ≈ 步数 × 每步上下文：历史上下文每一步都要重发，日志与大文档一旦进上下文就永久驻留。以下三条是硬规则，违反算流程错误，不是风格偏好。

### A · 日志摘要化

- 长日志 / 构建 / 测试 / dev-server 输出**一律重定向到文件**（如 `/tmp/<role>-build.log`），命令只看文件，不把原始输出拉进上下文。
- 回传只允许**状态行 + 错误行 + 行号**（如 `exit 1 · 3 errors · /tmp/dev-build.log:88`）。
- **单次工具输出目标 ≤ 40 行**；超了先 `grep` / `tail -n 40` 收敛，再回传。
- **禁 `cat` 大文件、禁全量 `tail`**；同一文件同一票内不反复 tail。

### B · 等待不轮询

- 等端口 / 构建 / dev-server / 后台进程：**后台 job + 一次有界等待**（`job_output` 带明确的上限）。`dev` / `tea` 有 job 工具，按此执行。
- **禁止** step 内写 `for i in $(seq 1 N)` / `while true` / `sleep` 轮询循环。
- **禁止**连续多步重复 `tail` 同一日志、反复探测同一端口：等待本身没有信息增量，但每一步都是一次完整 step、重发全部上下文。
- 没有 job 工具的角色（如 Lead）用一次有界等待（`wait_agent`）等回报，不逐条去查队员状态，也不得用轮询顶替。

### C · 段读

- 单次读文件 **≤ 200 行**；先 `grep` / `rg` 定位，再按行段读（`offset` + `limit`）。
- **同一张票内不重复整读同一文件**：跨成员共用的结论写进票据 / 回报，别让每个人各自重读一遍。
- 大文档**先读索引**（目录 / 摘要），再按需取段，不整份贴进上下文。

### 每票步数预算（按票型可调）

| 角色 | 默认预算（步） | 超预算时 |
|---|---|---|
| dev | ≤ 60 | 停手，向 Lead 报告：已完成 / 卡点 / 还差几步，由 Lead 决定是否续 |
| tea | ≤ 40 | 同上 |
| po | ≤ 20 | 同上 |

- 预算由 Lead 派活时写明（按改动大小 / 风险调整）；未写明时用上表默认值。
- **超预算必须停手回报，不得自行续跑**；需要扩大探索范围同样先停下请示。
- 收尾把「步数 / 上下文峰值」记进 story 文件（如 `步数 38 · 峰值 96K`），供复盘与回归。

## 角色命名 / Roster 约定（唯一真源）

小队成员与子代理一律按「**`<角色前缀>-<序号>`**」命名；命名规则只在此处维护，其它 playbook / prompt 只引用本节。

**Roster 角色前缀**（与 `persona/squad-lead.md` 的 Roster 对齐）：

| 角色 | 预设（preset id） | 显示名 |
|---|---|---|
| 调度 / 负责人 Lead | `squad-lead` | （自身，不代为命名） |
| 业务分析师 Apollo | `analyst` | `apollo-1`（之后递增） |
| 产品经理 Prometheus | `pm` | `prometheus-1`（之后递增） |
| 产品负责人 Themis | `po` | `themis-1`（之后递增） |
| UX 设计师 Ariadne | `ux` | `ariadne-1`（之后递增） |
| 架构师 Athena | `architect` | `athena-1`（之后递增） |
| 开发者 Hephaestus | `dev` | `hephaestus-1`（之后递增） |
| 测试架构师 Argus | `tea` | `argus-1`（之后递增） |

> `name` 必须传具体数字，首次 `-1`、第 k 次 `-k`，不要把 `-n` 占位当字面量。

**命名规则**：

- **Lead 委派时指定显示名**：Lead 用 `delegate_*` 派活时**必须传 `name`**，取「该队员前缀-序号」（如 `apollo-1`、`prometheus-2`）；序号 `n` 按本会话该队员第几次被委派递增，首次为 1；不确定已用名时先 `list_agents` 查，取该队员下一个未占用序号，报 `DUPLICATE_AGENT_NAME` 则顺延。
- **派生帮手同样传 `name`**：成员若被授予委派 / 子代理工具，派生下属时也必须传 `name`（同一前缀，序号在其名下递增），不要省略。
- **不命名即不可辨**：省略 `name` 会让编队面板只显示 `agent-1` / `agent-2`，无法辨认执行者，务必按此命名。

> 角色 prompt 只写「命名遵循 `bmad-squad-protocol` 约定」，不重复本节规则；`persona/squad-lead.md` 的 Roster 也是本节的前缀来源之一。

## 花名 ↔ id ↔ 上游角色（唯一映射表）

**id = 地址，花名 = 称呼。** id 里绝不出现神话名；换花名只改人读层（`persona/*.md`、`locale/*.json`、本表），不动 id。

| 花名 | preset id | 上游 BMad 角色（仅来源说明） | 座位 | 状态 |
|---|---|---|---|---|
| Hermes 赫尔墨斯 | `squad-lead` | （上游无对应，队长） | 调度 | 已建 |
| Apollo 阿波罗 | `analyst` | Mary | 分析 | 已建 |
| Prometheus 普罗米修斯 | `pm` | John | 产品 | 已建 |
| Themis 忒弥斯 | `po` | Sofia | 票据 | 已建 |
| Ariadne 阿里阿德涅 | `ux` | Sally | 体验 | 已建 |
| Athena 雅典娜 | `architect` | Winston | 架构 | 已建 |
| Hephaestus 赫菲斯托斯 | `dev` | Amelia | 开发 | 已建 |
| Argus 阿耳戈斯 | `tea` | Murat | 测试 | 已建 |
| Nemesis 涅墨西斯 | —（占位，无 preset） | reviewer | 评审 | **未开**（用户明确「先不开」；不建 preset、不配工具、不进 `squad.roles.json`） |

- `squad-lead` 不叫裸 `lead`：DSH 运行时的根 agent 就叫 `lead`，裸 `lead` 会让 `list_agents` 寻址混淆。
- 本小队的方法参考 BMad Method（MIT © BMad Code, LLC）；花名是自有品牌，与上游人名不是同一身份。

## 规则

1. **先读后写**：开工先读 `initiative.md` 与 `index.md`；只处理自己票据范围内的文件。
2. **改状态走索引**：`index.md` 由 Themis 维护（成员可改自己票据的行；派活/重排由 Lead 指示、Themis 执行）。
3. **不自创路径**：产出只写进上面的固定位置；需要新目录先与 Lead 确认。
4. **交付前跑 Gate**：见上；不通过不算完成。
5. **Lead 收尾**：整队目标达成时，Lead 跑一次校验并确保 0 警告，再向用户交付「可评审」。
6. **跨角色通信须 CC Lead**：成员之间的协作 / 请示类消息必须同时 CC Lead（`send_message` 收件人包含 Lead），由 Lead 掌握全队状态并裁决；成员不得私下互相编排分工，派发仍只由 Lead 的 `delegate_*` 发起。
7. **交接包（handoff）单一真源**：跨 agent / 跨角色的结构化交接包，其 schema 与模板的单一真源在 `capabilities/cap-task-coordination/references/handoff-contract.md` §B；本协议**只留这一行指针、不复述字段**。
