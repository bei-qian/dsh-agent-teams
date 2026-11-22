# cap-security-baseline · evals

Phase 6 评测前置 fixture（prompt + 期望行为）。覆盖 `CAPABILITY_ARCHITECTURE.md` §7.2 五类：normal / boundary / ambiguous / negative-trigger / regression。

| # | 文件 | 类别 | 期望 |
|---|---|---|---|
| 01 | `01-normal-auth-highrisk.json` | normal | **激活**；产出 STRIDE abuse case + ≥3 条确定性安全测试 + 供应链清单 + 残余风险 |
| 02 | `02-boundary-config-and-input.json` | boundary | **激活**；配置/输入边界矩阵（缺失/临界/越界/合法两端），负路径拒绝 |
| 03 | `03-ambiguous-crud-authscope.json` | ambiguous | **条件激活**；按是否含对象级授权/多租户/敏感数据判信号并记录取舍 |
| 04 | `04-negative-trigger-pure-copy.json` | negative-trigger | **不激活**全量基线（pure-copy-change/docs，无风险信号） |
| 05 | `05-regression-missing-security-tests.json` | regression | **点出缺安全测试**；happy-path 全绿不算安全完成，判 blocker/残余风险 |

## 如何用

- **自动化**：`node scripts/security_invariants_demo.mjs` 演示并断言 5 类确定性安全约束，退出码 0 = 通过（这是「风险触发 → 可断言测试」的可执行样例）。
- **覆盖校验（不调 LLM）**：`node scripts/run_evals.mjs` 读取本目录 5 个 fixture 的机器可检 `expects`（`activation` / `required_controls` / `required_anti_patterns`），结构断言这些必备控制/反模式**确实在本模块 `SKILL.md`/`references/` 里有定义**；缺项则打印缺失 token 并 exit≠0（控制能拒绝）。退出码 0 = 5 类 fixture 覆盖校验通过。
- **人工/评测**：Phase 6 用同模型/工具/时间跑 `baseline vs capability-enabled`，对每个 fixture 比对 `expect`：是否激活、是否产出必备工件、是否命中 `must_not` 反模式。主观处盲评。
- `category` 枚举：`normal | boundary | ambiguous | negative-trigger | regression`（与 §7.2 对齐）。

## 指标

激活精度/召回、确定性测试覆盖率（≥3 约束）、供应链清单完成度、残余风险登记率、负触发未激活率、回归（缺测试是否被点出）。
