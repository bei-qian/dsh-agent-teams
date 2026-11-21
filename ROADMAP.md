# Roadmap / 待办

> 本文件跟踪两处较大改法的进度。版本策略：维持在 **0.1.x** 迭代，重大改动再升大版本。
> 最近更新：2026-11-21（R1 已完成归档，仅剩 R2）。

## 状态总览

| 项 | 内容 | 状态 |
|---|---|---|
| R1 | 零依赖自包含 playbook（去掉 `_bmad` / Python / `uv` 依赖） | ✅ 已完成（随 0.1.0 落地并安装验证） |
| R2 | v2 小队 Web 面板（Multica 完整形态） | ⬜ 未开始（仅规划，无实现） |

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
