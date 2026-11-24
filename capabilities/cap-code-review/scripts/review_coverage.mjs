#!/usr/bin/env node
/**
 * review_coverage.mjs — 覆盖率账本硬门（零依赖 Node 单文件，ESM）。
 *
 * 目的（对应 open-code-review M5 / 缺口 G2 / 弱点 C1）：
 *   评审前**冻结变更文件分母**，为每个分母文件要求一个终态：
 *     - reviewed            —— 已审；
 *     - skipped(可核理由)   —— 有意跳过，理由去空白后非空且非平凡词；
 *   计算并打印 coverage_rate = reviewed / 冻结分母；
 *   **存在未记账文件（既非 reviewed，也非带可核理由的 skipped）→ exit≠0（硬门）**；
 *   全覆盖 → exit 0。
 *
 * 零依赖承诺：纯 Node 单文件，只用 Node 内置模块；`--from/--to` 模式仅调用系统
 * `git`（`git diff --name-status` / `git merge-base`），不联网、不执行任何外部脚本、
 * 不 import 任何第三方包。
 *
 * 输入分母（可组合，取并集后去重）：
 *   --from <ref> [--to <ref>]   git diff --name-status 得到变更文件；--to 缺省 HEAD；
 *                               缺省用 merge-base（三分点语义），加 --no-merge-base 用直接 range。
 *   --files a.js b.js ...        显式文件列表。
 *   --files-from <file>          从文件逐行读文件列表（空行与 # 开头忽略）。
 *
 * 账本：
 *   --ledger <path.json>         读取 reviewed/skipped 账本（schema 见 references/coverage.md）。
 *
 * 退出码：
 *   0 = 全覆盖（所有分母文件均 reviewed 或 skipped 带理由；空分母视为 100% 覆盖）
 *   1 = 存在未记账文件（硬门拦截）
 *   2 = 用法 / IO / git / 账本格式错误
 *
 * 用法： node scripts/review_coverage.mjs --help
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const LEDGER_SCHEMA = 'cap-code-review/coverage-ledger/v1';

/**
 * 平凡/空洞 skipped 理由词表（**整串精确匹配、大小写不敏感**）。
 * 命中即视为「未记账」（MISSING → exit≠0），防止用「n/a」「later」等占位词假跳过。
 * 只做整串匹配、不做子串匹配，避免误伤含这些字样的合法理由（如「skip generated vendor file」）。
 */
export const TRIVIAL_REASONS = new Set([
  'n/a', 'na', 'n.a.', 'later', 'skip', 'skipped', 'none', 'nil', 'null',
  'tbd', 'todo', 'x', 'xx', '略', '无', '先不看了', '不重要', '待定',
]);

/** skipped 理由是否有效：去首尾空白后非空，且整串（小写化）不命中平凡词表。 */
export function isValidSkipReason(reason) {
  const r = String(reason == null ? '' : reason).trim();
  if (!r) return false;
  return !TRIVIAL_REASONS.has(r.toLowerCase());
}

const HELP = `review_coverage.mjs — 覆盖率账本硬门（零依赖，仅用系统 git）

用法：
  node scripts/review_coverage.mjs [分母来源...] [--ledger <path.json>]

分母来源（可组合，取并集去重；至少给一个）：
  --from <ref> [--to <ref>]   用 git diff --name-status 取变更文件。
                              --to 缺省 HEAD；缺省 merge-base（三分点，审“本分支相对基点改了什么”），
                              加 --no-merge-base 则直接用 <from> <to> 两点的 range 对比。
                              只读系统 git，不联网、不执行外部脚本。
  --files <p1> <p2> ...       显式文件列表（直到下一个 --flag 为止）。
  --files-from <file>         从文件逐行读路径（空行与 # 开头注释忽略）。

账本：
  --ledger <path.json>        读取账本 JSON（reviewed[] + skipped[{path,reason}]）。
                              不传则视为空账本 → 分母文件全部未记账。

其他：
  --merge-base / --no-merge-base  切换 --from 模式的 range 语义（默认 merge-base）。
  --quiet                     只打印结果行。
  -h, --help                  打印本帮助。

账本 schema（${LEDGER_SCHEMA}）：
  {
    "schema": "${LEDGER_SCHEMA}",
    "reviewed": ["src/a.js", "src/b.js"],
    "skipped": [{ "path": "docs/legacy.md", "reason": "纯文档，属轻量路径" }],
    "denominator": ["src/a.js", "src/b.js", "docs/legacy.md"]   // 可选，仅供对账/提示
  }

口径与硬门：
  - 分母 = 变更文件全集，评审前**冻结**；事后不得缩小。
  - coverage_rate = reviewed 数 / 冻结分母数；空分母视为 1.0（100%，vacuous）。
  - 未记账文件（不在 reviewed、也不在带可核理由的 skipped）→ 列清单并 exit 1（硬门）。
  - skipped 的 reason 判定：去首尾空白后**非空**，且**整串（大小写不敏感）不命中平凡词表**
    （n/a、na、n.a.、later、skip、skipped、none、nil、null、tbd、todo、x、xx、略、无、
    先不看了、不重要、待定）；命中平凡词或不填 → 视同未记账（MISSING）。只做整串匹配、不做子串匹配。
  - 全部 reviewed 或 skipped(可核理由) → exit 0。
  - 重复路径去重；账本引用分母外文件 → 警告并按忽略处理（不影响 rate）。
  - 空变更集 → coverage_rate 100%，exit 0。

退出码：0 全覆盖 / 1 有未记账（block）/ 2 用法或 IO 错误。
详见 references/coverage.md。`;

function die(msg, code = 2) {
  console.error(`[review_coverage] ERROR: ${msg}`);
  process.exit(code);
}

/** 解析 argv（手写，避免依赖）。--files 收集到下一个 --flag 为止。 */
export function parseArgs(argv) {
  const opts = {
    files: [],
    filesFrom: null,
    from: null,
    to: 'HEAD',
    mergeBase: true,
    ledger: null,
    quiet: false,
    help: false,
    sourceProvided: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { opts.help = true; continue; }
    if (a === '--quiet') { opts.quiet = true; continue; }
    if (a === '--merge-base') { opts.mergeBase = true; continue; }
    if (a === '--no-merge-base') { opts.mergeBase = false; continue; }
    if (a === '--from') { opts.from = argv[++i]; opts.sourceProvided = true; if (opts.from === undefined) die('--from 需要一个 ref'); continue; }
    if (a === '--to') { opts.to = argv[++i]; if (opts.to === undefined) die('--to 需要一个 ref'); continue; }
    if (a === '--ledger') { opts.ledger = argv[++i]; if (opts.ledger === undefined) die('--ledger 需要路径'); continue; }
    if (a === '--files-from') { opts.filesFrom = argv[++i]; opts.sourceProvided = true; if (opts.filesFrom === undefined) die('--files-from 需要路径'); continue; }
    if (a === '--files') {
      opts.sourceProvided = true;
      // 收集到下一个以 -- 开头的 flag 为止
      let j = i + 1;
      while (j < argv.length && !argv[j].startsWith('--')) { opts.files.push(argv[j]); j += 1; }
      i = j - 1;
      continue;
    }
    die(`未知参数 ${a}（用 --help 查看用法）`);
  }
  return opts;
}

/** 规范化路径：去首尾空白、去 ./ 前缀、统一 \ 为 /。不做绝对路径解析（保持与 git 输出一致）。 */
export function normalizePath(p) {
  let s = String(p == null ? '' : p).trim().replace(/\\/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  // 折叠重复斜杠
  s = s.replace(/\/{2,}/g, '/');
  return s;
}

function uniqSorted(list) {
  return [...new Set(list.map(normalizePath).filter((s) => s.length > 0))].sort();
}

function execGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const stderr = e && e.stderr ? String(e.stderr).trim() : '';
    throw new Error(`git ${args.join(' ')} 失败: ${stderr || (e && e.message) || 'unknown'}`);
  }
}

/** 从 git diff --name-status 取变更文件路径（含 A/M/D/T/U/X；--no-renames 保证单路径）。 */
export function gitChangedFiles({ from, to = 'HEAD', mergeBase = true }) {
  if (!from) throw new Error('--from 需要一个 ref');
  let base = from;
  if (mergeBase) {
    const mb = execGit(['merge-base', from, to]).trim();
    if (!mb) throw new Error(`无法计算 ${from} 与 ${to} 的 merge-base`);
    base = mb;
  }
  const out = execGit(['diff', '--name-status', '--no-renames', base, to]);
  const paths = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    // 仅在 --no-renames 下每行形如 "M\tpath"；path 可含空格，故只切首个 tab。
    const path = line.slice(tab + 1).trim();
    if (path) paths.push(path);
  }
  return paths;
}

/** 读取分母（-files / --files-from / --from 的并集，去重排序）。 */
export function collectDenominator(opts) {
  const collected = [...opts.files];
  if (opts.filesFrom) {
    let text;
    try { text = readFileSync(opts.filesFrom, 'utf8'); }
    catch (e) { throw new Error(`读 --files-from 失败 ${opts.filesFrom}: ${e.message}`); }
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      collected.push(t);
    }
  }
  if (opts.from) {
    for (const p of gitChangedFiles({ from: opts.from, to: opts.to, mergeBase: opts.mergeBase })) collected.push(p);
  }
  if (collected.length === 0 && !opts.sourceProvided) {
    throw new Error('缺少分母来源：请给 --from/--to、--files 或 --files-from（见 --help）');
  }
  // 注意：来源已提供但结果为空（空变更集 / --from 无差异 / 空 --files-from）是合法输入，
  // 返回空分母 → coverage_rate=100%（vacuous 全覆盖），由 evaluateCoverage 处理。
  return uniqSorted(collected);
}

/** 读取账本 JSON；缺失文件/格式错误抛错。 */
export function loadLedger(ledgerPath) {
  if (!ledgerPath) return { reviewed: [], skipped: [] };
  let text;
  try { text = readFileSync(ledgerPath, 'utf8'); }
  catch (e) { throw new Error(`读账本失败 ${ledgerPath}: ${e.message}`); }
  let doc;
  try { doc = JSON.parse(text); }
  catch (e) { throw new Error(`账本不是合法 JSON ${ledgerPath}: ${e.message}`); }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`账本顶层必须是对象 ${ledgerPath}`);
  }
  if (doc.schema && doc.schema !== LEDGER_SCHEMA) {
    console.error(`[review_coverage] WARN: 账本 schema=${doc.schema} 与期望 ${LEDGER_SCHEMA} 不一致（继续处理）`);
  }
  const reviewed = Array.isArray(doc.reviewed) ? doc.reviewed : [];
  const skipped = Array.isArray(doc.skipped) ? doc.skipped : [];
  return { reviewed, skipped, denominator: Array.isArray(doc.denominator) ? doc.denominator : null };
}

/**
 * 纯函数：给定冻结分母 + 账本，判定每个文件终态并计算 coverage_rate。
 * 返回 { rows, reviewedCount, skippedCount, unaccounted, total, coverageRate, extraneous, conflicts, ok }。
 */
export function evaluateCoverage(denominator, ledger = {}) {
  const denom = uniqSorted(denominator);
  const denomSet = new Set(denom);

  const reviewedSet = new Set((ledger.reviewed || []).map(normalizePath).filter(Boolean));

  const skippedMap = new Map(); // path -> reason（首个非空理由优先）
  for (const raw of ledger.skipped || []) {
    const path = normalizePath(typeof raw === 'string' ? raw : raw && raw.path);
    const reason = typeof raw === 'object' && raw && typeof raw.reason === 'string' ? raw.reason : '';
    if (!path) continue;
    if (!skippedMap.has(path)) skippedMap.set(path, reason);
    else if (!skippedMap.get(path) && reason) skippedMap.set(path, reason);
  }

  // 账本中引用但不在分母内的文件：警告并按忽略处理（不影响 rate）。
  const ledgerPaths = new Set([...reviewedSet, ...skippedMap.keys()]);
  const extraneous = [...ledgerPaths].filter((p) => !denomSet.has(p)).sort();

  // reviewed 与 skipped 冲突：reviewed 优先，并记录警告。
  const conflicts = denom.filter((f) => reviewedSet.has(f) && skippedMap.has(f));

  const rows = denom.map((file) => {
    if (reviewedSet.has(file)) return { file, status: 'reviewed' };
    if (skippedMap.has(file)) {
      const reason = (skippedMap.get(file) || '').trim();
      if (isValidSkipReason(reason)) return { file, status: 'skipped', reason };
      if (!reason) return { file, status: 'unaccounted', why: 'skipped-without-reason' };
      // 有字但为平凡词（n/a、later、skip…）→ 视同未记账（MISSING）。
      return { file, status: 'unaccounted', why: 'skipped-trivial-reason', reason };
    }
    return { file, status: 'unaccounted', why: 'not-in-ledger' };
  });

  const reviewedCount = rows.filter((r) => r.status === 'reviewed').length;
  const skippedCount = rows.filter((r) => r.status === 'skipped').length;
  const unaccounted = rows.filter((r) => r.status === 'unaccounted');
  const total = denom.length;
  const coverageRate = total === 0 ? 1 : reviewedCount / total;

  return {
    rows,
    reviewedCount,
    skippedCount,
    unaccounted,
    total,
    coverageRate,
    extraneous,
    conflicts,
    ok: unaccounted.length === 0,
  };
}

function pct(rate) {
  return `${(rate * 100).toFixed(2)}%`;
}

/** 打印人类可读报告 + 稳定机读行（coverage_rate=<ratio>）。返回是否 pass。 */
export function printReport(result, { quiet = false } = {}) {
  const { rows, reviewedCount, skippedCount, unaccounted, total, coverageRate } = result;
  if (!quiet) {
    console.log('review_coverage: cap-code-review');
    console.log(`denominator (frozen): ${total} file(s)`);
    for (const r of rows) {
      if (r.status === 'reviewed') console.log(`  [reviewed]  ${r.file}`);
      else if (r.status === 'skipped') console.log(`  [skipped ]  ${r.file}  — ${r.reason}`);
      else {
        const why = r.why === 'skipped-trivial-reason'
          ? `skipped 理由空洞（"${r.reason}" 命中平凡词，视同未记账）`
          : r.why === 'skipped-without-reason' ? 'skipped 缺理由' : '未记账';
        console.log(`  [MISSING ]  ${r.file}  — ${why}`);
      }
    }
    if (result.conflicts.length) console.log(`  WARN conflict(reviewed+skipped，按 reviewed 计): ${result.conflicts.join(', ')}`);
    if (result.extraneous.length) console.log(`  WARN extraneous(账本引用分母外文件，已忽略): ${result.extraneous.join(', ')}`);
  }
  console.log(`reviewed=${reviewedCount} skipped=${skippedCount} unaccounted=${unaccounted.length} total=${total}`);
  console.log(`coverage_rate=${coverageRate.toFixed(4)} (${pct(coverageRate)}) = reviewed ${reviewedCount}/${total}`);
  if (unaccounted.length > 0) {
    console.log(`RESULT: FAIL — ${unaccounted.length} unaccounted file(s): ${unaccounted.map((u) => u.file).join(', ')} (exit 1)`);
    return false;
  }
  console.log('RESULT: PASS — full coverage (exit 0)');
  return true;
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) { console.log(HELP); return 0; }
  let denominator;
  let ledger;
  try {
    denominator = collectDenominator(opts);
    ledger = loadLedger(opts.ledger);
  } catch (e) {
    die(e.message, 2);
  }
  const result = evaluateCoverage(denominator, ledger);
  const pass = printReport(result, { quiet: opts.quiet });
  return pass ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main());
}
