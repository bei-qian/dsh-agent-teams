#!/usr/bin/env node
/**
 * run_evals.mjs — cap-debugging-systematic 的确定性 eval 运行器（零依赖 Node，ESM）。
 *
 * 做两件事：
 *   1) 校验 evals/*.json 的结构与类别覆盖（normal / boundary / ambiguous / negative-trigger / regression）；
 *   2) 实跑「先红后绿」断言（red_green_demo），证明回归测试能区分 buggy/fixed。
 *
 * 用法： node scripts/run_evals.mjs
 * 退出码：0 = 全部通过；1 = 有 fixture 不合法或红绿断言不成立。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runRedGreen } from './red_green_demo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVALS = join(HERE, '..', 'evals');
const REQUIRED_CATEGORIES = ['normal', 'boundary', 'ambiguous', 'negative-trigger', 'regression'];

let failures = 0;
const fail = (msg) => { console.error(`  [FAIL] ${msg}`); failures += 1; };

function validateFixture(file) {
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { fail(`${file}: JSON 解析失败: ${e.message}`); return null; }
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
  if (exp.min_competing_hypotheses !== undefined && !(exp.min_competing_hypotheses >= 2)) {
    fail(`${file}: min_competing_hypotheses 必须 >= 2（否则违反竞争假设要求）`);
  }
  return doc;
}

function main() {
  console.log('run_evals: cap-debugging-systematic');
  const files = readdirSync(EVALS).filter((f) => f.endsWith('.json')).sort();
  if (files.length < 4) fail(`期望 >=4 个 eval fixture，实际 ${files.length}`);

  const seen = new Set();
  for (const f of files) {
    const doc = validateFixture(join(EVALS, f));
    if (!doc) continue;
    seen.add(doc.category);
    console.log(`  [EVAL-OK] ${f} (category=${doc.category})`);
  }
  for (const c of REQUIRED_CATEGORIES) {
    if (!seen.has(c)) fail(`缺少类别覆盖: ${c}`);
  }

  // 先红后绿断言（真正的可执行证据）
  const { red, green } = runRedGreen();
  if (red && green) {
    console.log('  [EVAL-OK] red-green assertion: buggy=RED, fixed=GREEN（回归测试能区分缺陷）');
  } else {
    fail(`red-green assertion 不成立: red=${red} green=${green}`);
  }

  const ok = failures === 0;
  console.log(`RESULT: ${ok ? 'ALL EVALS PASS' : `${failures} FAILURE(S)`} (exit ${ok ? 0 : 1})`);
  process.exit(ok ? 0 : 1);
}

main();
