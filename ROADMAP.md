# Roadmap / 待办

> 本文件跟踪三处较大改法的进度。版本策略：维持在 **0.1.x** 迭代，重大改动再升大版本。
> 最近更新：2026-11-22（R1 已完成归档；R2 仅规划；新增 R3 候选，待调研）。

## 状态总览

| 项 | 内容 | 状态 |
|---|---|---|
| R1 | 零依赖自包含 playbook（去掉 `_bmad` / Python / `uv` 依赖） | ✅ 已完成（随 0.1.0 落地并安装验证） |
| R2 | v2 小队 Web 面板（Multica 完整形态） | ⬜ 未开始（仅规划，无实现） |
| R3 | 小队评测（Eval）体系 | ⬜ 待调研（仅候选，未实现） |

---

## ✅ R1 · 零依赖自包含 playbook（已完成）

**状态（已完成）**：校验器 + 协议 + 7 个角色 playbook（`playbooks/`）；成员预设已改扫 `playbooks/`（`includeDefaultRoots:false`）并安装验证，8 预设全 `active`。完整 BMad 技能保留在 `skills/` 但**未启用**（可回退/删除）。阶段门由 Lead 跑校验器；`verify.py` 与 CI 覆盖 playbook + 校验器。
关键提交：`3b6c2f3`（校验器 + 协议 + 示例）→ `dbe7782`（接入 7 角色 playbook）→ `6ebe33a`（index/initiative 归 Sofia，Lead 只读 + 门禁）。

**当初要解决的问题**：插件已内置完整 BMad 技能，但它们是「方法驱动器」——`SKILL.md` 里会
`uv run {project-root}/_bmad/scripts/*.py`（resolve_config、resolve_customization、
list_templates…）并调用兄弟技能，所以完整流程需要目标项目有 `_bmad/` 脚本 + Python/uv。

**当初的改法**：把每个角色/阶段改写成**纯 Markdown 的自包含 playbook 技能**：
- 保留：角色人设、BMad 四阶段路由、各文档模板（PRD / brief / 架构 / 票据等以 Markdown 内联）、验收清单；
- 去掉：一切 `uv`/Python 调用与 `_bmad` 项目状态依赖；
- 做法：`skills/` 换成一套精简 playbook（每角色一个 `SKILL.md`，内联模板与步骤），agent 用自身
  read/write/bash 工具直接执行，不再跑外部脚本。

**代价**：失去 BMad「引擎」的自动化（配置驱动定制、ticket-store 脚本、模板库脚本、跨模块知识、
自动校验），能力更「轻」、更依赖提示词质量；上游 BMad 更新不会自动流入，模板需自行维护。
**收益**：任意项目零安装即可用，仓库更小、更易读改。

### R1 设计（已落地：保留校验器）

- **固定目录** `bmad-output/`：`initiative.md`（举措真相）+ `index.md`（票据真相）+ 固定产出位
  `research/`、`prd.md`、`architecture.md`、`design.md`、`experience.md`、`epics/`、`stories/`。
- **index.md 契约**：表格列固定 `id | type | title | status | file`；status ∈ `todo|in_progress|in_review|done|blocked`；
  `file` 相对 `bmad-output/` 且必须存在；状态变化只改这一张索引。
- **校验器（保留，Node 单文件、零 bmad 依赖）**：`scripts/squad_validate.mjs`。检查目录/文件存在、index 指向的文件、
  重复 id、非法状态；对 `done` 的 story/task 提示缺「验收标准/实现/验证」。退出码 0/1 作为阶段门。
  用法：`node scripts/squad_validate.mjs [./bmad-output]`。
- **阶段门**：每阶段完成、或 story 置 `done` 前必须跑校验器且通过；Lead 收尾再跑一遍、0 警告才交付。

---

## ⬜ R2 · v2 小队 Web 面板（Multica 完整形态）· 未开始

> 状态：仅规划，仓库内**无任何实现**（`dsh-squad` / `dsh-client-ui-squad` / `squad_delegate` 只出现在本文档与 `DESIGN.md`）。配置型 v1 仍是默认。

新增 `dsh-squad` Host 服务 + `dsh-client-ui-squad` Web 面板：
- 小队 CRUD（Leader / 成员 / 角色描述 / 小队指令）；
- 「把工作指派给小队」，`/squad` 一键开跑并程序化打开 Team 模式；
- `squad_delegate` 动态选预设（不再受「一成员一工具行」限制）；
- 按小队记录动态注入 Roster / 指令（`ctx.systemPrompt.section()` / `agent.inject()`）。

**代价**：需要 Host 代码 + 客户端 UI，工程量大、需大量 API 核对；配置型 v1 仍是默认。

---

## ⬜ R3 · 小队评测（Eval）体系 · 待调研

> 状态：**仅候选，仓库内无任何实现**。以下均为待调研的规划，不是已定的设计；未验证处一律「待调研」，不替使用者拍板。

**问题**：本小队很多流程蒸馏自 BMad，后续还会持续加规范、再蒸馏；没有评测就没有回归护栏，每次「优化」都是盲改。要回答的核心不是「产物文笔好不好」，而是「这套多 agent 编排（路由 + 阶段门 + 协议纪律）有没有稳定兑现价值」。

**思路（评什么，按成本从低到高分层）**：
- **L0 协议不变量**（确定性、0 模型花费）：`bmad-output/` 结构与命名、`index.md` 票据真相一致、`scripts/squad_validate.mjs` 退出码、「Lead 不亲自实现」、单阶段对应单 artifact。
- **L1 路由**：意图→正确首位队员+阶段；模糊→该提问；超范围→该拒绝。可把 TEA 的 `bmad-tea-routing` 意图集范式改造成「7 队员 + ask/decline」的 squad 路由套件，并配硬 0 的 controls（`maxConfidentRoutesOnAmbiguous/Unservable=0`、`maxUnroutedClearIntents=0`）。
- **L2 阶段门**：validator 未过前是否拒绝推进、是否跳阶段（看调用序列）。
- **L3 端到端场景**（少量 5–8 个）：模糊需求→可评审 artifact。
- **L4 鲁棒/对抗**：信息缺失该问不该编、冲突指令、无 AGENTS.md 受管 block、validator-fail 自恢复。

**复用既有范式**：照搬 `bmad-method-test-architecture-enterprise/test/evals` 里已沉淀的做法——ground-truth 与 prompt 分离、controls 关闭 recall 漏洞、repetitions≥2 且单列 unstable、用 mutation 证明 grader 能挂、ciTier 分层（确定性层每 PR、真模型层 nightly）。

**范围与顺序**：
- 先**只评当前这支 8 人小队，并作为标准模板**；评测内核（引擎/grader/契约范式，可复用）与小队专属数据（意图集/fixtures/thresholds，不可复用）从第一天就分两层，便于日后迁移到其它 BMad 仓库。
- **关键实验**：加 baseline 消融——同一批任务分别给「单体强 agent」「原生 BMad skills 不套小队壳」「本小队」，若小队打不过基线，说明架构没在挣饭钱。
- **建议顺序**：A) L0+L1 确定性 CI 层（最高 ROI）→ B) 5–8 个 L3 + rubric（nightly）→ C) L4 对抗 + baseline 消融；暂缓评「文风/审美」。

**待调研 / 未定**（务必当作待调研，勿视为已定）：成功口径取「宽（过 validator 即可评审）」还是「严（人基本不返工）」；stub vs 真模型的边界；L3 素材来源（可用 `bmad-output/research/` 里已有的 open-design brief 作真实种子）；holdout 怎么留防过拟合。

**代价与收益**：
- **代价**：fixture 维护、真模型跑有成本、评分器可能抖动、有被过拟合/Goodhart 的风险。
- **收益**：给「蒸馏 + 加规范」的持续演进装上可回归的质量护栏，并用 baseline 量化小队架构本身的价值。
