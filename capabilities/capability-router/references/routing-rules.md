# Routing Rules · 路由判据与确定性校验规则

本文件把 `bmad-output/capability/CAPABILITY_ROUTING_DESIGN.md` §1（信号）与 §2.2（选择记录 schema + 6 条规则）写成**可执行判据**。`scripts/validate_selection.mjs` 即按此实现。

---

## A. 输入信号枚举（§S1–S6）

| # | 字段 | 取值 / 规则 |
|---|---|---|
| S1 | `task_type` | `feature \| bug \| refactor \| api \| ui \| database \| auth \| deployment \| performance \| incident` |
| S2 | `stack` | 字符串数组（如 `[node, postgres]`，可为 `[]`）；**只激活匹配的专用能力**，无匹配则不用栈专用能力 |
| S3 | `risk_level` | `low \| medium \| high \| critical`；`high/critical` **强制** `cap-security-baseline`（除 risk-ack 排除） |
| S4 | `size` / `complexity` | `small \| medium \| large` |
| S5 | `required_validation` | 字符串数组，如 `[regression-test]`、`[security-test]`、`[a11y-check]` |
| S6 | `capability dependencies` | 由所选能力的 `depends_on` **传递闭包**自动补入 |

**判定优先级**：S3(风险) > S5(必需验证) > S1(任务类型) > S2(栈) > S4(规模)。

---

## B. 选择记录（selection record）6 条确定性规则

> 校验对象是一条 selection record；`validate_selection.mjs` 违规时 **exit≠0** 并打印对应 `rule id`。

### R1-schema — schema 与枚举
- `signals` 六字段齐全：`task_type / risk_level / size / stack / required_validation / complexity`；枚举合法（见 §A）。
- `selected_capabilities` 与 `excluded[*].id` **都必须 ∈ 索引 id**；`selected` 内不得重复，`selected` 与 `excluded` 不得出现同一 id。
- 失败 → `R1-schema`。

### R2-risk-gate — 高危强制安全
- `risk_level ∈ {high, critical}` → **必须** `selected_capabilities` 含 `cap-security-baseline`；**或** `excluded` 中对 `cap-security-baseline` 给出**含子串 `risk-ack`** 的 reason（显式风险豁免）。
- 否则失败 → `R2-risk-gate`。

### R3-required-validation — 必需验证映射
- `required_validation` 含 `security-test` → 必须选 `cap-security-baseline`，否则失败 `R3-required-validation`。
- 含 `a11y-check` → 若索引已登记 `cap-frontend-ux` 则必须选它；**未登记（P1 延后）→ 仅 WARN**，不失败。

### R4-excluded-reason — 排除须有理由 / 过度激活告警
- 每条 `excluded[*].reason` **非空**，否则失败 `R4-excluded-reason`。
- `selected` 的每个 id，其 `triggers` 至少命中 1 个信号值或 `task_type`，否则 **WARN**（疑似过度激活，不失败）。

### R5-dependency-closure — 依赖不可悬空
- 对每个 `selected` 的 id，其 `depends_on` **传递闭包 ⊆ `selected ∪ excluded`**（依赖必须被显式选中或显式排除且有理由）。
- 任一依赖既不在 selected 也不在 excluded → 失败 `R5-dependency-closure`。

### R6-exit-code — 退出码契约
- 全部通过 → **exit 0**；任一失败 → **exit≠0**，逐条打印 rule id；索引自身不合法 → **exit 2**（`INDEX_*`）。

---

## C. 索引自身校验（加载时先做，`INDEX_*`）

1. `id` 唯一且 kebab（`^[a-z0-9]+(?:-[a-z0-9]+)*$`）；`priority∈{P0,P1,P2}`、`cost_tier∈{low,medium,high}`、`activation∈{auto,risk-gated,stack-gated,manual}`。
2. `activation: risk-gated` 必须有非空 `risk_signals`；`stack-gated` 必须有 `stack_scope`。
3. 所有 `depends_on` 引用存在（无悬空）；依赖图无环（DFS）。
4. `triggers` 与 `negative_triggers` 不重叠（同一短语不得既正又负）。

---

## D. 运行方式

```bash
node scripts/validate_selection.mjs <record.json|record.yaml>
# 退出码：0 合法 / 1 记录违规 / 2 索引不合法
```

`evals/` 下的 fixture 是 `{expect, record}` 包装：通过后退出码与 `expect.exit` 一致，可作 Phase 6 回归基线。见 `evals/README.md`。
