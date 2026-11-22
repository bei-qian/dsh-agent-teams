# capability-router · evals

本目录是 `capability-router` 的**确定性评测 fixture**（Phase 6 回归基线）。每个 fixture 是一条 `{expect, record}` 包装的 selection record：

- `record`：待校验的选择记录（schema 见 `../references/capability-index.yaml` 与 `../references/routing-rules.md`）。
- `expect`：期望的退出码 `exit`（0 合法 / 1 应被拒）、期望命中的 `rule_ids`、期望的 `selected`。

## 如何运行

```bash
# 在 dsh-agent-teams/capabilities/capability-router/ 目录下：
node scripts/validate_selection.mjs evals/01-normal-bugfix.json
# 或批量：
for f in evals/*.json; do node scripts/validate_selection.mjs "$f"; echo "exit=$?"; done
```

脚本会自动比对 `expect.exit`，一致时打印 `[EVAL-OK]`；不一致打印 `[EVAL-MISMATCH]` 并以非零退出。

## Fixture 清单

每个 fixture 带 `category`（`normal | boundary | ambiguous | negative-trigger | regression`），用于机器统计五类覆盖率。

| # | 文件 | category | 场景 | expect.exit | 期望 selected |
|---|---|---|---|---|---|
| 01 | `01-normal-bugfix.json` | normal | 典型 bug 修复（低风险/单 owner/后端） | **0** | debugging, testing, code-review |
| 02 | `02-ui-feature.json` | boundary | UI 特性 + a11y（frontend-ux 未登记→回退 bmad-ux） | **0** | testing, code-review |
| 03 | `03-auth-highrisk-missing-security.json` | regression | 反例：认证高危漏选 security（应被拒） | **1**（规则 `R2`,`R3`） | code-review, testing |
| 04 | `04-trivial-negative.json` | negative-trigger | 琐碎文案 typo：负触发→最小/空集 | **0** | （空集） |
| 05 | `05-auth-highrisk-with-security.json` | regression | 正向对照：认证高危正确选中 security | **0** | security, code-review, testing |
| 06 | `06-ambiguous-notes-crud-authscope.json` | ambiguous | 含糊可两解：`/notes` CRUD 是否属安全基线范围（取保守读法并记录取舍） | **0** | security, testing, code-review |
| 07 | `07-regression-case08-bugfix-routing.json` | regression | 真实失败 CASE-08 泛化：回归缺陷修复须路由到 debugging+testing+review | **0** | debugging, testing, code-review |

**五类覆盖**：normal=`01`、boundary=`02`、ambiguous=`06`、negative-trigger=`04`、regression=`03`/`05`/`07`。

> 03 与 05 成对：同一 `risk_level=high` + `security-test`，漏选 security 被 R2/R3 拒绝（03），正确选中则通过（05）——证明「高危强制安全」规则真实生效，而非纸面约定。
>
> 06 是**含糊**用例（`CAPABILITY_ROUTING_DESIGN §6` C1 `maxConfidentRoutesOnAmbiguous`）：两条读法都合法，fixture 的 `ambiguity` 段记录两种读法与取舍；断言校验器给出**合法选择**（exit 0）而非「自信选错」。
>
> 07 是**真实失败泛化**（来自 CASE-08）：回归修复不能只丢给 review，也不能漏 testing（先红后绿）；断言 exit 0 且 selected 恰为 debugging+testing+code-review。

## 与 Phase 6 的衔接

Phase 6b 已在此基线上补齐 `normal / boundary / ambiguous / negative-trigger / regression` 五类用例（见上表；`category` 元数据可机器统计覆盖率），并保持 `validate_selection.mjs` 对每条 `evals/*.json` 实跑、退出码与 `expect.exit` 一致（`verify.py §4d` 亦逐个复跑）。收益侧（`baseline（无路由）vs router-enabled` 同模型/工具/时间对照）仍属 Gate 3 端到端待办（见 `CAPABILITY_ROUTING_DESIGN.md` §6 与 `CAPABILITY_ARCHITECTURE.md` §7.2）。
