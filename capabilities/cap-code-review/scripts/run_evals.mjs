#!/usr/bin/env node
/**
 * run_evals.mjs — cap-code-review 的确定性 eval 运行器（零依赖 Node，ESM）。
 *
 * 做三件事：
 *   1) 校验 evals/*.json 结构与类别覆盖（normal / boundary / ambiguous / negative-trigger / regression）；
 *   2) 实跑改动缺陷检测证据：
 *      - 对埋 3 缺陷的 diff 检出 3 个 blocker（含删测试），漏报 0（01）；
 *      - 对干净 diff 零误报（02）；
 *      - reviewer==author → 红标 block:true, severity blocker（05）。
 *   3) 实跑覆盖率账本硬门（review_coverage.mjs）：
 *      - 全覆盖 fixture（07）→ exit 0，coverage_rate 正确；
 *      - 漏审 fixture（06）→ exit≠0 且列出未记账文件；
 *      - 空洞理由 fixture（08，skipped 理由为 n/a/later/skip）→ 视同未记账 exit≠0；
 *      - **负向对照**：删掉一条 reviewed 记账 / 清空 skipped 理由后仍须 exit≠0，
 *        证明覆盖率门非恒过（记账被删/弱化时会失败）。
 *
 * 用法： node scripts/run_evals.mjs
 * 退出码：0 = 全部通过；1 = 有失败。
 */
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { scanText, evaluateReviewMeta } from './detect_review_defects.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const EVALS = join(ROOT, 'evals');
const COVERAGE_CLI = join(ROOT, 'scripts', 'review_coverage.mjs');
const REQUIRED_CATEGORIES = ['normal', 'boundary', 'ambiguous', 'negative-trigger', 'regression'];

let failures = 0;
const fail = (m) => { console.error(`  [FAIL] ${m}`); failures += 1; };
const ok = (m) => console.log(`  [EVAL-OK] ${m}`);

function readJson(f) { return JSON.parse(readFileSync(join(EVALS, f), 'utf8')); }

/** 实跑 review_coverage.mjs 子进程，返回 {code, out}（out=stdout+stderr）。 */
function runCoverageCli(args) {
  const r = spawnSync(process.execPath, [COVERAGE_CLI, ...args], { cwd: ROOT, encoding: 'utf8' });
  const code = r.status === null ? -1 : r.status;
  return { code, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function parseRate(out) {
  const m = out.match(/coverage_rate=([0-9.]+)/);
  return m ? Number(m[1]) : NaN;
}

function structural(doc, file) {
  for (const f of ['fixture', 'category', 'description', 'input', 'expect']) {
    if (doc[f] === undefined) fail(`${file}: 缺字段 ${f}`);
  }
  if (!REQUIRED_CATEGORIES.includes(doc.category)) fail(`${file}: category=${doc.category} 非法`);
  const exp = doc.expect || {};
  if (doc.category === 'negative-trigger') {
    if (exp.activate !== false) fail(`${file}: negative-trigger 必须 expect.activate=false`);
  } else if (exp.activate !== true) {
    fail(`${file}: 非负触发用例应 expect.activate=true`);
  }
}

function runDetect(fixtureFile, wantDetected, wantBlockers, mustRules) {
  const path = join(ROOT, fixtureFile);
  const { findings, summary } = scanText(readFileSync(path, 'utf8'), { expect: wantDetected });
  if (summary.detected !== wantDetected) fail(`${fixtureFile}: detected=${summary.detected} != expected ${wantDetected}`);
  if (summary.missed !== 0) fail(`${fixtureFile}: missed=${summary.missed} != 0`);
  if (wantBlockers !== undefined && summary.blockers !== wantBlockers) fail(`${fixtureFile}: blockers=${summary.blockers} != expected ${wantBlockers}`);
  for (const r of mustRules || []) {
    if (!summary.rule_ids.includes(r)) fail(`${fixtureFile}: 漏检规则 ${r}`);
  }
  return summary;
}

function main() {
  console.log('run_evals: cap-code-review');
  const files = readdirSync(EVALS).filter((f) => f.endsWith('.json')).sort();
  if (files.length < 4) fail(`期望 >=4 个 eval fixture，实际 ${files.length}`);

  const seen = new Set();
  const byName = {};
  for (const f of files) {
    const doc = readJson(f);
    structural(doc, f);
    seen.add(doc.category);
    byName[f] = doc;
  }

  // 01 normal: 埋 3 缺陷（含删测试）→ 检出 3 blocker、漏报 0
  const d1 = byName['01-normal-planted-defects.json'];
  if (d1) {
    const s = runDetect(d1.expect.detect_from, d1.expect.expected_detected, d1.expect.expected_blockers, d1.expect.must_detect_rules);
    ok(`01 planted-defects: detected=${s.detected}/3 blockers=${s.blockers} missed=${s.missed} rules=[${s.rule_ids.join(',')}]`);
  }
  // 02 boundary: 干净 diff → 0 缺陷、0 误报
  const d2 = byName['02-boundary-clean-diff.json'];
  if (d2) {
    const s = runDetect(d2.expect.detect_from, d2.expect.expected_detected, d2.expect.expected_blockers);
    ok(`02 clean-diff: detected=${s.detected} false-positives=${s.detected}`);
  }
  // 05 regression: reviewer==author → 红标 block
  const d5 = byName['05-regression-reviewer-equals-author.json'];
  if (d5) {
    const meta = evaluateReviewMeta(d5.input);
    if (meta.block !== true) fail('05: reviewer==author 未标 block');
    if (meta.severity !== 'blocker') fail('05: reviewer==author severity 应为 blocker');
    ok(`05 reviewer==author: block=${meta.block} severity=${meta.severity} (${meta.note})`);
  }

  // 07 boundary: 全覆盖账本 → exit 0 且 coverage_rate 正确（覆盖率硬门正向基线）
  const d7 = byName['07-boundary-coverage-full.json'];
  if (d7) {
    const r = runCoverageCli(['--ledger', join(ROOT, d7.input.ledger), '--files', ...d7.input.files]);
    if (r.code !== 0) fail(`07 coverage-full 应 exit 0，实际 ${r.code}\n${r.out}`);
    const rate = parseRate(r.out);
    if (Number.isNaN(rate) || Math.abs(rate - d7.expect.expected_coverage_rate) > 0.001) {
      fail(`07 coverage_rate=${rate} != expected ${d7.expect.expected_coverage_rate}`);
    }
    ok(`07 coverage-full: exit=${r.code} coverage_rate=${rate} (expect 0)`);
  }

  // 06 regression: 漏审文件（分母有文件未记账）→ exit≠0 且列出未记账文件
  const d6 = byName['06-regression-coverage-missed.json'];
  if (d6) {
    const r = runCoverageCli(['--ledger', join(ROOT, d6.input.ledger), '--files', ...d6.input.files]);
    if (r.code === 0) fail('06 coverage-missed 应 exit≠0（硬门未生效）');
    for (const u of d6.expect.expected_unaccounted) {
      if (!r.out.includes(u)) fail(`06 未列出未记账文件 ${u}\n${r.out}`);
    }
    ok(`06 coverage-missed: exit=${r.code} (expect ≠0) 列出未记账 [${d6.expect.expected_unaccounted.join(',')}]`);
  }

  // 08 boundary: skipped 理由命中平凡词表（n/a/later/skip）→ 视同未记账 exit≠0（防“假通过”）
  const d8 = byName['08-boundary-coverage-trivial-reason.json'];
  if (d8) {
    const r = runCoverageCli(['--ledger', join(ROOT, d8.input.ledger), '--files', ...d8.input.files]);
    if (r.code === 0) fail(`08 coverage-trivial-reason 应 exit≠0（平凡理由被误判为通过/假控制）\n${r.out}`);
    for (const u of d8.expect.expected_unaccounted) {
      if (!r.out.includes(u)) fail(`08 未列出未记账文件 ${u}\n${r.out}`);
    }
    ok(`08 coverage-trivial-reason: exit=${r.code} (expect ≠0) 列出未记账 [${d8.expect.expected_unaccounted.join(',')}]`);
  }

  // 负向对照：证明覆盖率门非恒过——删/弱化记账后必须失败。
  // 以 07 的全覆盖账本为基线（上面已证其 exit 0），做两种破坏后必须 exit≠0。
  if (d7) {
    const good = JSON.parse(readFileSync(join(ROOT, d7.input.ledger), 'utf8'));
    const tmp = mkdtempSync(join(tmpdir(), 'cov-eval-'));
    try {
      // 对照 A：删除一条 reviewed 记账（模拟“记账被删”）
      const dropReviewed = { ...good, reviewed: (good.reviewed || []).slice(1) };
      const pathA = join(tmp, 'drop-reviewed.json');
      writeFileSync(pathA, JSON.stringify(dropReviewed));
      const rA = runCoverageCli(['--ledger', pathA, '--files', ...d7.input.files]);
      if (rA.code === 0) fail('负向对照A 失败：删掉一条 reviewed 记账后仍 exit 0（门恒过）');
      else ok(`负向对照A 删记账: exit=${rA.code}（应≠0，门非恒过）`);

      // 对照 B：把 skipped 理由清空（模拟“弱化”，skipped 缺理由视同未记账）
      const blankReason = { ...good, skipped: (good.skipped || []).map((s) => ({ ...s, reason: '' })) };
      const pathB = join(tmp, 'blank-reason.json');
      writeFileSync(pathB, JSON.stringify(blankReason));
      const rB = runCoverageCli(['--ledger', pathB, '--files', ...d7.input.files]);
      if (rB.code === 0) fail('负向对照B 失败：清空 skipped 理由后仍 exit 0（门恒过）');
      else ok(`负向对照B 清空理由: exit=${rB.code}（应≠0，门非恒过）`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  for (const c of REQUIRED_CATEGORIES) if (!seen.has(c)) fail(`缺少类别覆盖: ${c}`);

  console.log(`RESULT: ${failures === 0 ? 'ALL EVALS PASS' : failures + ' FAILURE(S)'} (exit ${failures === 0 ? 0 : 1})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
