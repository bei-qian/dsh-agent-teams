# cap-requirements-grilling · evals

本目录是该能力的**确定性评测 fixture**（离线、零依赖）。每个 fixture 为 JSON：

- `fixture` / `category`：名称与类别（`normal | boundary | ambiguous | negative-trigger | regression`）。
- `input`：喂给能力的输入（含糊需求原文 + 可自查事实的提示）。
- `output`：一次**正确执行**本能力应产出的代表性结果，含 `design_tree`（是否展开设计树）、`direct_execute`（是否直接执行）、`question_count`（提问数）、`decision_record[]`、`open_questions[]`、`assumptions_defaulted[]`。
- `expect`：期望的判据（是否激活、是否展开设计树、隐含假设清单、决策记录/未决问题必填字段、最小条数、事实自查项、必须问决策、可假设项、提问上限等）。

> 说明：本能力是访谈流程，真实使用需与用户交互；`output` 是「正确执行时的产物样例」，供 `run_evals.mjs` 做**确定性结构 + 覆盖 + 门控**断言。它不是对任意真实需求的自动澄清。

## 如何运行

```bash
node scripts/run_evals.mjs
```

`run_evals.mjs` 会：
1. 校验 fixture 结构与类别覆盖（五类齐全、≥5 条）；
2. 对非负样本断言：决策记录字段齐全、状态合法、未决问题字段齐全、**隐含假设清单被决策记录∪未决问题覆盖**（AC2）、事实项归 `owner=fact` 自查（AC4）、必须问项落 `must-ask`（AC4）、可假设项写默认并可回填（AC4）；
3. 对负样本断言：`activate=false`、**不展开设计树**、提问数 ≤ 阈值、直接确认执行（AC5）。

全部通过打印 `[EVAL-OK]` 并以 exit 0 结束；任一断言失败 exit 1（可作负向对照）。

## Fixture 清单

| # | 文件 | category | 场景 | 期望 |
|---|---|---|---|---|
| 01 | `01-normal-notification.json` | normal | 做一个通知功能 | 展开设计树 + 覆盖 渠道/触发/受众/持久化/退订 |
| 02 | `02-ambiguous-search.json` | ambiguous | 让搜索更快 | 覆盖 目标延迟/基线/数据规模/查询范围；基线/规模归事实自查 |
| 03 | `03-ambiguous-i18n.json` | ambiguous | 支持多语言 | 覆盖 语种/runtime-vs-build/回退/RTL/覆盖界面；runtime-vs-build 必须问 |
| 04 | `04-boundary-bulk-delete.json` | boundary | 后台批量删除用户 | 同一需求内 must-ask（软删除/审计日志）+ assumed（批量上限）+ fact（权限）分流 |
| 05 | `05-negative-simple-explicit.json` | negative-trigger | 按钮文案「保存」→「提交」 | **不激活**、不展开设计树、提问 ≤1、直接执行 |
| 06 | `06-regression-export-permission.json` | regression | 导出用户列表 CSV | 回归守卫：权限范围/数据范围必须问（防历史越权复发） |

> 05 与 01/02/03 成对照：同样「一句需求」，模糊→展开访谈、简单明确→直接执行，证明负触发真实约束过度提问。
>
> 04 是边界样本：门控不是「整体问/整体不问」，而是在**同一条需求内**按不可逆/合规/可回填/可自查分流。
