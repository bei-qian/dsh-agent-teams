# cap-debugging-systematic · evals

本目录是该能力的**确定性评测 fixture**（Phase 6 回归基线）。每个 fixture 为 JSON：

- `fixture` / `category`：名称与类别（`normal | boundary | ambiguous | negative-trigger | regression`）。
- `input`：症状 / 复现 / 日志（喂给能力的场景）。
- `expect`：期望行为（是否激活、必须包含的流程步骤、≥2 竞争假设、证据前缀要求、禁止的反模式；负触发用例则 `activate=false`）。

## 如何运行

```bash
node scripts/run_evals.mjs     # 校验全部 fixture + 实跑先红后绿断言
node scripts/red_green_demo.mjs  # 单独看「旧代码 RED → 新代码 GREEN」证据
```

`run_evals.mjs` 会校验结构、类别覆盖（normal/boundary/ambiguous/negative-trigger/regression 五类齐全），并调用 `red_green_demo.mjs` 证明回归测试确实能抓住缺陷。全部通过打印 `[EVAL-OK]` 并以 exit 0 结束。

## Fixture 清单

| # | 文件 | category | 场景 | 期望 |
|---|---|---|---|---|
| 01 | `01-normal-failing-test.json` | normal | off-by-one 红测 | 激活 + 全流程 + 先红后绿 |
| 02 | `02-boundary-cannot-reproduce.json` | boundary | 偶现不可稳定复现 | 先取证、禁止复现前散弹改 |
| 03 | `03-ambiguous-two-hypotheses.json` | ambiguous | 数据缺 vs 逻辑漏的歧义 | ≥2 竞争假设 + 证据裁决 |
| 04 | `04-negative-new-feature.json` | negative-trigger | 新增 CSV 导出功能 | **不激活**（greenfield/新功能） |
| 05 | `05-regression-red-green.json` | regression | 先红后绿可复现断言 | `expect.red_green=true` 且脚本 exit 0 |

> 04 与 01 成对照：同一「代码任务」语境下，缺陷→激活、新功能→不激活，证明负触发真实约束过度激活。

## 与 Phase 6 的衔接

Phase 6 在此基线扩展 `baseline（无能力）vs capability-enabled` 同模型/工具/时间对照，指标含「缺陷严重度、返工、墙钟与 token、无关任务回归」（见 `CAPABILITY_ARCHITECTURE.md` §7.2）。
