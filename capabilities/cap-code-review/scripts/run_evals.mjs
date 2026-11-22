#!/usr/bin/env node
/**
 * run_evals.mjs — cap-code-review 的确定性 eval 运行器（零依赖 Node，ESM）。
 *
 * 做两件事：
 *   1) 校验 evals/*.json 结构与类别覆盖（normal / boundary / ambiguous / negative-trigger / regression）；
 *   2) 实跑可执行证据：
 *      - 对埋 3 缺陷的 diff 检出 3 个 blocker（含删测试），漏报 0（01）；
 *      - 对干净 diff 零误报（02）；
 *      - reviewer==author → 红标 block:true, severity blocker（05）。
 *
 * 用法： node scripts/run_evals.mjs
 * 退出码：0 = 全部通过；1 = 有失败。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanText, evaluateReviewMeta } from './detect_review_defects.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const EVALS = join(ROOT, 'evals');
const REQUIRED_CATEGORIES = ['normal', 'boundary', 'ambiguous', 'negative-trigger', 'regression'];

let failures = 0;
const fail = (m) => { console.error(`  [FAIL] ${m}`); failures += 1; };
const ok = (m) => console.log(`  [EVAL-OK] ${m}`);

function readJson(f) { return JSON.parse(readFileSync(join(EVALS, f), 'utf8')); }

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

  for (const c of REQUIRED_CATEGORIES) if (!seen.has(c)) fail(`缺少类别覆盖: ${c}`);

  console.log(`RESULT: ${failures === 0 ? 'ALL EVALS PASS' : failures + ' FAILURE(S)'} (exit ${failures === 0 ? 0 : 1})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
