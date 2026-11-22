# Handoff Contract · 可复用交接契约与单元计划模板

> 单一真源：本文件维护 `cap-task-coordination` 的**单元计划模板**与**handoff 契约 schema**，其它处只引用、不复制。字段为**可机械检查**的最小集；未知可选字段可加，不改语义。

## A. 单元计划模板（unit plan）

```yaml
plan_version: 1
goal: "<一句话目标；含完成定义>"
units:
  - id: U1                       # 稳定 ID，勿重编号
    scope: "<有界职责：做什么 / 不做什么>"
    interface:                   # 显式接口/产出契约（下游只依赖此接线）
      inputs: ["<入参/事件>"]
      outputs: ["<返回值/产物>"]
      touched_files: ["<主要改动文件>"]
    acceptance_criteria:         # 每单元 ≥1 条可执行/可断言 AC（可独立验收）
      - id: AC1
        check: "<可观察行为断言>"
        verify: "<命令 或 断言方式>"
    writeScopes: ["<可写路径前缀>"]   # 与其他并行单元必须不相交
    blocked_by: []               # 依赖的前置单元 id（构成 DAG；必须无环）
    role: dev                    # 期望角色（dev/architect/tea/...）
```

**校验**：`node scripts/check_dag.mjs plan.json` 应 exit 0；`node scripts/run_evals.mjs` 覆盖 scope/AC/writeScopes/blocked_by 齐全性、DAG 无环、无序重叠检测。

## B. handoff 契约（worker → lead/orchestrator）

```yaml
handoff_version: 1
from: "<worker id>"
to: "lead"
unit_id: U1
changed:                          # 改了什么（对 diff，不凭记忆）
  - file: "<path>"
    summary: "<一句话>"
evidence:                         # 证据命令 + 结果（可复现）
  - command: "<测试/构建/校验命令>"
    result: "<exit code / 关键输出>"
decisive_claims:                  # 必须能被复核者重推的决定性声明
  - claim: "<如：新增回归测试且通过>"
    rederive_by: "<复核者该如何对 diff/重跑验证>"
    rederived: null               # 复核前留空；复核后填 true/false
residual_risks: ["<残余风险 / 未覆盖>"]
next_steps: ["<下一步建议>"]
```

**纪律**：`decisive_claims` 里每条都要给出 `rederive_by`（可执行/可检的复核方式）；worker 自述只是输入，复核者负责把 `rederived` 落成 true/false。

## C. 复核记录（review record，独立复核者填写）

```yaml
review_version: 1
handoff_unit: U1
reviewer: "<独立于实现者的角色>"
claims_checked:
  - claim: "<决定性 claim>"
    method: "<对 diff / 重跑 / grep / 大小比对>"
    outcome: match            # match | mismatch
verdict: accept               # accept | block
notes: "<mismatch 时写清差距：自述 vs 事实>"
```

**判定**：任一 `outcome: mismatch` → `verdict: block`，回退 worker 补做；全部 `match` 才 `accept`。样例见 `../evals/03-review-worker-claim-mismatch.json`。

## D. 与 Team 任务板的映射（可选）

- `scope`/`interface`/`acceptance_criteria` → 任务 `description` 的验收标准段；
- `writeScopes` → 共享任务的 `write_scopes`（派活前登记，冲突即可见）；
- `blocked_by` → 任务的 `blocked_by` 依赖；
- `handoff`/`review` 记录 → 任务完成前的 self-check 证据。
