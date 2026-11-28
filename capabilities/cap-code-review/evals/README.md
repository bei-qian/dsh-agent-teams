# cap-code-review · evals

本目录是该能力的**确定性评测 fixture**（Phase 6 回归基线）。每个 fixture 为 JSON：

- `fixture` / `category`：名称与类别（`normal | boundary | ambiguous | negative-trigger | regression`）。
- `input`：diff 路径或 diff 摘要 + `reviewer`/`author` 身份。
- `expect`：期望（是否激活、检出缺陷数、blocker 数、必须检出的规则、漏报上限、自评审红标等）。

## 如何运行

```bash
node scripts/detect_review_defects.mjs evals/fixtures/defective.patch --expect 3   # 埋 3 缺陷 → 检出 3/3
node scripts/detect_review_defects.mjs evals/fixtures/clean.patch     --expect 0   # 干净 diff → 零误报
node scripts/review_coverage.mjs --ledger evals/fixtures/coverage-missed.ledger.json --files src/a.js src/b.js src/c.js  # 漏审 → exit≠0
node scripts/review_coverage.mjs --ledger evals/fixtures/coverage-full.ledger.json   --files src/app.js src/db.js docs/legacy.md  # 全覆盖 → exit 0
node scripts/review_coverage.mjs --ledger evals/fixtures/coverage-trivial-reason.ledger.json --files src/a.js src/b.js src/c.js  # 空洞理由 → exit≠0
node scripts/run_evals.mjs                                                        # 批量校验 + 可执行断言
```

`run_evals.mjs` 校验结构、类别覆盖（五类齐全），并实跑可执行证据：埋 3 缺陷检出 3 blocker（含删测试）/ 干净 diff 零误报 / reviewer==author 红标 block / 覆盖率全覆盖 exit 0（`coverage_rate=0.6667`）/ 覆盖率漏审 exit≠0 / 空洞理由（n/a/later/skip）exit≠0，并含**负向对照**（删一条 reviewed 记账、清空 skipped 理由后仍须 exit≠0，证明覆盖率门非恒过）。全通过打印 `[EVAL-OK]` 并 exit 0。

## Fixture 清单

| # | 文件 | category | 场景 | 期望 |
|---|---|---|---|---|
| 01 | `01-normal-planted-defects.json` | normal | `fixtures/defective.patch` 埋 3 缺陷（删测试 + 明文密钥 + 裸异常吞错〔含空 `catch (e) {}` 静默吞错〕） | 检出 **3/3** blocker，漏报 0；弱化 swallowed-exception→major 即失败 |
| 02 | `02-boundary-clean-diff.json` | boundary | `fixtures/clean.patch` 良性重构（含 `logger.error` + `throw` 的记录+重抛） | 检出 **0**，零误报（记录+重抛不误升为 swallowed-exception blocker） |
| 03 | `03-ambiguous-style-vs-behavior.json` | ambiguous | 仅命名/注释风格问题 | 不加 blocker，仅 nit/minor，结论 accept |
| 04 | `04-negative-docs-typo.json` | negative-trigger | 纯文档 typo | **不激活**完整评审（docs-typo） |
| 05 | `05-regression-reviewer-equals-author.json` | regression | `reviewer==author`（self-review 唯一门，GAP#17） | 红标 `block:true`、severity blocker |
| 06 | `06-regression-coverage-missed.json` | regression | 变更集 3 文件，ledger 只记账 2（`src/c.js` 漏审） | **exit≠0**（硬门），列出未记账 `src/c.js` |
| 07 | `07-boundary-coverage-full.json` | boundary | 3 分母文件全部有终态（2 reviewed + 1 skipped 带理由） | **exit 0**，`coverage_rate=0.6667` |
| 08 | `08-boundary-coverage-trivial-reason.json` | boundary | 3 文件全 skip 但理由为平凡词（`n/a`/`later`/`skip`，无具体依据） | **exit≠0**，视同未记账（防假通过） |

> 01 的 3 个缺陷对应任务要求的「埋 3 个缺陷含 1 个删测试」；检出/漏报由 `detect_review_defects.mjs` 的 `summary{detected,expected,missed}` 可算。02 与 01 成对照，证明「控制能拒绝违规」且不误报。
>
> **裸 except 吞异常 severity 双向锁定（story-069）**：01 内 `src/config.js` 空 `catch (e) {}`（无记录/无重抛）→ `swallowed-exception` blocker（锁定 severity.md「静默吞错恒 blocker」，与 SKILL「四类一律 blocker」一致）；02 内 `safeSum` 的 `catch (e) { logger.error(...); throw e; }`（记录+重抛，已非静默吞错）→ 零命中（锁定 major/非静默边界不被误升为 blocker）。弱化 `swallowed-exception` severity→`major` 会使 01 的 `blockers==3` 断言失败（`run_evals.mjs` 负向锁定）。06/07/08 是覆盖率账本硬门的**正反向对照**：07 全覆盖通过、06 漏审被拦截、08 空洞理由被拦截（`skipped` 的 `reason` 命中平凡词表视同未记账），`run_evals.mjs` 另用 07 的账本做「删记账 / 清理由」两种破坏做负向对照，证明门非恒过。

## 与 Phase 6 的衔接

Phase 6 在此基线扩展 `baseline（无能力）vs capability-enabled` 同模型/工具/时间对照，指标含评审 false-positive / missed、任务成功、返工与冲突、token（见 `CAPABILITY_ARCHITECTURE.md` §7.2）。
