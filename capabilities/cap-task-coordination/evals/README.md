# cap-task-coordination · evals

本目录是 `cap-task-coordination` 的**确定性评测 fixture**（Phase 6 回归基线）。每个 fixture 带 `kind` 与 `expect`，由零依赖 runner 校验：

| kind | 校验内容 | 产出字段（`expect` 可断言） |
|---|---|---|
| `decompose` | 单元计划：scope/interface/AC/writeScopes 齐全、blocked_by 无悬空、DAG 无环、无序单元 writeScopes 不重叠 | `valid` / `acyclic` / `parallel_safe` / `requires_stop` / `parallel_pairs` |
| `dag` | 仅依赖图：无环性 | `acyclic` / `exit_code` / `cycle` |
| `review` | worker 自述 vs diff 重推（决定性 claim） | `catch_mismatch` / `self_report_all_green` / `verdict` |
| `trigger` | 是否启用协调（负触发判定） | `activate` |

## 如何运行

```bash
# 在 dsh-agent-teams/capabilities/cap-task-coordination/ 目录下：
node scripts/run_evals.mjs          # 跑全部 fixture，全部 [PASS] 则 exit 0
node scripts/check_dag.mjs evals/01-normal-decompose.json   # 单独校验样例计划的 DAG（exit 0）
node scripts/check_dag.mjs evals/02-boundary-dag-cycle.json # 有环用例（exit 1）
```

## Fixture 清单（覆盖 §7.2 五类：normal / boundary / ambiguous / negative-trigger / regression）

| # | 文件 | 类别 | 场景 | 期望 |
|---|---|---|---|---|
| 01 | `01-normal-decompose.json` | normal | 多模块特性，拆 3 单元、DAG 无环、U2/U3 可并行 | `valid`/`acyclic`/`parallel_safe`=true，`parallel_pairs=[[U2,U3]]` |
| 02 | `02-boundary-dag-cycle.json` | boundary | 依赖图成环，派活前必须拒绝 | `acyclic`=false，`exit_code`=1 |
| 03 | `03-review-worker-claim-mismatch.json` | regression（worker 复核） | 自述全绿但 diff 不符，重推抓出 mismatch | `catch_mismatch`=true，`verdict`=block |
| 04 | `04-negative-single-file.json` | negative-trigger | 单文件文案 typo，单 owner 小改 | `activate`=false（不启用协调） |
| 05 | `05-ambiguous-vague-ac.json` | ambiguous | AC 不可断言且无 verify，需停机补 AC | `valid`=false，`requires_stop`=true |

> 02 与 01 成对：01 证明合法 DAG 的 `check_dag` exit 0；02 证明成环被 exit 1 拒绝——「控制要能拒绝才算存在」。
> 03 是「worker 自述 vs diff 复核」的对照：若照抄 `worker_self_report`（全 pass）会全部接受而漏掉两个缺陷；只有对 `rederived`（对 diff/重跑）逐条重推才 `catch_mismatch` 并 `block`。

## 与 Phase 6 的衔接

Phase 6 可在此基线上扩展 more fixtures 与 baseline-vs-enabled 对照（见 `CAPABILITY_ARCHITECTURE.md` §7.2 与 `CAPABILITY_ROUTING_DESIGN.md` §6）。
