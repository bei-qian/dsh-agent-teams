# Severity · 评审严重度定级规则

本文件定义 `cap-code-review` 的 severity 枚举与定级判据。**每个 blocker 必须附可执行证据**（会失败的测试 / 复现命令 / 被删断言原行），否则降级并注明「需人工判断」。

## 枚举（固定 4 档）

| severity | 含义 | 是否阻断 merge |
|---|---|---|
| **blocker** | 会导致错误结果、安全漏洞、掩盖失败、破坏契约；**必须修** | **是** |
| **major** | 明显缺陷/风险或缺失关键测试，但非立即灾难；应修 | 否（要求跟进） |
| **minor** | 可维护性/健壮性小问题，建议修 | 否 |
| **nit** | 风格/措辞/等价写法偏好，可选 | 否 |

> 兼容旧表述：`blocker|major|minor` 三档是子集；本能力**增加 nit** 用于「不阻断的风格建议」，并防止用 nit 凑数掩盖行为审查。

## 定级判据（按影响，不按偏好）

1. **正确性**：产生错误结果/崩溃/数据损坏 → **blocker**；边界可疑未复现 → **major**。
2. **安全**：越权 / 鉴权绕过 / 明文密钥 / 可用注入 → **blocker**；弱策略/潜在泄露 → **major**。
3. **测试完整性**：删测试 / 弱化测试（`.skip`、`|| true`、`continue-on-error`、空断言）求绿 → **blocker**；关键路径无测试 → **major**。
4. **错误处理（裸 except 吞异常）**：按下列**判定锚点**逐条裁定，命中即定级（自上而下，先命中先定级）：
   - **blocker · 静默吞错**：异常被捕获后，处理块内**既不记录、也不重抛 / 向上传播、也不上报异常**（即"丢弃异常"）——空 `catch {}` / `except: pass` / 处理块仅注释 / 仅 `return`·`continue`·`return None` 吞掉。**可机器裁定**：处理块内无 `throw|raise|rethrow|log|logger|console|report|print` 等可观测副作用、且无重抛。此类**恒为 blocker**。
   - **major · 非静默但不足**：异常**已被记录或重抛 / 传播**（处理块含 `logger.*` / `console.*` / `print` / `throw` / `raise` / 错误上报），但处理仍不足（宽泛 catch 吞并本应区分的错误类型、重抛丢失原始栈、记录后继续致状态不一致等）。此类**已非"静默吞错"**，需人工判断 → **major**，标 `needs-human-judgment`；无法给客观证据时不得升 blocker（遵循 §证据要求）。
   - 无法归入以上（语义不确定）→ **major** + `needs-human-judgment`。

   > **与 SKILL 口径 reconcile**：`SKILL.md:48`「四类一律 blocker」的第四类指**"裸异常静默吞错"**这一子类；本判据 blocker 分支与之逐字一致（静默吞错恒 blocker，绝不弱化）。major 分支是"有记录 / 重抛但不足"，**已不属于静默吞错**，故降为 major 不构成对 SKILL「四类一律 blocker」的背离。机器检测锚点：`scripts/detect_review_defects.mjs` 的 `rule_id=swallowed-exception`（命中即 blocker），由 `evals/01-normal-planted-defects.json`（含空 `catch` 静默吞错用例，`blockers==detected==3`）与 `evals/02-boundary-clean-diff.json`（记录+重抛用例零误报）双向锁定。
5. **契约**：破坏调用方预期且无迁移 → **blocker**；范围蔓延 → **major**。
6. **可维护性**：默认 **nit/minor**。

## 证据要求（blocker 强约束）

每个 blocker 的 `evidence` 字段必须是**可核验**的，例如：
- 会失败的测试：`node --test test/auth.test.js`（贴失败输出）；
- 复现命令：`git diff -- <file>` 中被删的断言行、或最小触发输入；
- 静态锚点：`grep -nE '\.skip\(|\|\|\s*true' src/` 命中行号。

**错误处理机器锚点（"静默吞错 → blocker"可裁定）**：`rule_id=swallowed-exception` 命中即 blocker。正向锁定——`evals/fixtures/defective.patch` 的 `src/config.js` 内空 `catch (e) {}`（无记录/无重抛）必须被检出为 blocker；反向锁定——`evals/fixtures/clean.patch` 的 `catch (e) { logger.error(...); throw e; }`（记录+重抛，已非静默吞错）必须零命中。把该规则 severity 弱化为 `major` 会使 `evals/01` 的 `blockers==3` 断言失败（负向锁定见 `run_evals.mjs`）。

无法给出客观证据的判断：降为 **major** 并标 `needs-human-judgment`。

## 校准与去重（多评审）

- **去重**：同一根因多处出现按 1 条计，列出代表位置。
- **校准**：blocker 宁严勿松（漏放严重缺陷代价高）；但不得把风格 nit 升格为 blocker。
- **不凑数**：汇报以「是否查过行为/安全/测试」为准，不以 finding 数量论好坏。
- **reviewer==author 红标**：`reviewer == author` 时结论标注 `SELF-REVIEW (red)`，**不得**作为「独立验证通过」的唯一门。

## 报告字段（每条 finding）

```
{ severity: "blocker|major|minor|nit", file: "path:line", evidence: "<命令/复现/锚点>", remediation: "<怎么修>", rule_id?: "deleted-test|test-weakening|secret-leak|swallowed-exception|auth-bypass|..." }
```
