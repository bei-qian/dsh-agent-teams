# cap-testing-strategy · evals

Phase 6 评测前置 fixture（prompt + 期望行为）。覆盖 `CAPABILITY_ARCHITECTURE.md` §7.2 五类。

| # | 文件 | 类别 | 期望 |
|---|---|---|---|
| 01 | `01-normal-feature-ac-traceability.json` | normal | **激活**；AC→测试追溯表 + 层级 + 负路径 + 实跑证据 |
| 02 | `02-boundary-negative-path-matrix.json` | boundary | **激活**；缺失/临界/越界/合法两端/非法类型矩阵，负路径断言正确拒绝 |
| 03 | `03-ambiguous-e2e-vs-integration.json` | ambiguous | **激活**；按跨进程/外部系统判层级并记录取舍 |
| 04 | `04-negative-trigger-config-only.json` | negative-trigger | **不启用**完整策略（config-only/docs，无逻辑分支） |
| 05 | `05-falsification-injected-bug.json` | regression（证伪） | **埋 1 个行为缺陷被测试抓住**；数量/浅测 ≠ 质量 |
| 06 | `06-mandatory-action-missing.json` | regression（零动作缺陷） | **埋一个『跳过必须动作』的坏实现被测试抓住**；只测 happy path 会漏做 |

## 如何用

- **自动化**：`node scripts/falsification_demo.mjs` 演示证伪性——行为测试在缺陷实现上失败、在正确实现上通过，而 3 条浅测在缺陷实现上仍全绿；退出码 0 = 证伪性成立。
- **覆盖校验（不调 LLM）**：`node scripts/run_evals.mjs` 读取本目录各 fixture（覆盖 5 类）的机器可检 `expects`（`activation` / `required_controls` / `required_anti_patterns`），结构断言这些必备测试设计要素/反模式**确实在本模块 `SKILL.md`/`references/` 里有定义**；缺项则打印缺失 token 并 exit≠0（控制能拒绝）。退出码 0 = 各类 fixture 覆盖校验通过。
- **人工/评测**：Phase 6 用同模型/工具/时间跑 `baseline vs capability-enabled`，比对每个 fixture 的 `expect`：是否激活、是否产出必备工件、是否命中 `must_not`。主观处盲评。
- `category` 枚举：`normal | boundary | ambiguous | negative-trigger | regression`（`05` 的证伪性用例归 `regression`）。

## 指标

AC 覆盖率（每 AC ≥1 测试）、负路径/边界完整度、证伪性命中（注入缺陷被抓住率）、坏味道检出（assertTrue/纯快照/覆盖率自嗨）、flake 根因诊断率、负触发未激活率。
