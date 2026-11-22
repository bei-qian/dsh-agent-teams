#!/usr/bin/env node
/**
 * run_evals.mjs — cap-testing-strategy 的确定性覆盖校验器（零依赖 Node，ESM，不调用 LLM）。
 *
 * 目的：把 evals/*.json 的「语义期望」落成机器可检的 `expects`
 * （activation / required_controls / required_anti_patterns），并对本模块
 * `SKILL.md` + `references/**.md` 作结构断言——每个 fixture 声称必备的测试设计要素/反模式，
 * 必须在正文里**确有定义**（覆盖即通过）；缺项则打印缺失 token 并 exit≠0。
 *
 * 边界（对齐 EVAL_RESULTS §4.1 R-A）：本脚本**只**证明「评测期望引用的测试设计要素/反模式
 * 在本能力正文里有据可查」，不评估模型是否照做——那属 Gate 3 真模型 harness。
 * 它不是替代 falsification_demo.mjs（后者演示证伪性可执行样例），而是补上
 * 「5 fixture 的激活/工件期望可被确定性校验」这个诚实缺口（EVAL_RESULTS §1.6/§4.3 R-C）。
 *
 * 用法： node scripts/run_evals.mjs
 * 退出码：0 = 全部 fixture 覆盖校验通过；1 = 有缺项 / 结构不合法 / 类别缺失。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const EVALS = join(ROOT, 'evals');
const REQUIRED_CATEGORIES = ['normal', 'boundary', 'ambiguous', 'negative-trigger', 'regression'];
const VALID_ACTIVATION = [true, false, 'conditional'];

// 正文语料：SKILL.md + references/*.md —— 覆盖校验的唯一事实来源
function loadCorpus() {
  let s = readFileSync(join(ROOT, 'SKILL.md'), 'utf8');
  const refDir = join(ROOT, 'references');
  for (const f of readdirSync(refDir).filter((x) => x.endsWith('.md')).sort()) {
    s += '\n' + readFileSync(join(refDir, f), 'utf8');
  }
  return s;
}

let failures = 0;
const fail = (msg) => { console.error(`  [FAIL] ${msg}`); failures += 1; };

function validateFixture(name, doc, corpus) {
  if (!doc.id) fail(`${name}: 缺 id`);
  if (!REQUIRED_CATEGORIES.includes(doc.category)) fail(`${name}: category=${doc.category} 非法/缺失`);
  if (doc.expect === undefined) fail(`${name}: 缺 expect（语义期望，供盲评）`);

  const ex = doc.expects;
  if (!ex || typeof ex !== 'object') {
    fail(`${name}: 缺机器可检 expects（activation/required_controls/required_anti_patterns）`);
    return;
  }
  // 激活期望 + 与 category 的一致性
  if (!VALID_ACTIVATION.includes(ex.activation)) {
    fail(`${name}: expects.activation=${JSON.stringify(ex.activation)} 非法（true|false|"conditional"）`);
  }
  if (doc.category === 'negative-trigger' && ex.activation !== false) {
    fail(`${name}: negative-trigger 必须 expects.activation=false`);
  }
  if (doc.category !== 'negative-trigger' && doc.category !== 'ambiguous' && ex.activation !== true) {
    fail(`${name}: ${doc.category} 应 expects.activation=true`);
  }
  // 结构覆盖断言：必备测试设计要素 / 反模式必须在正文有定义
  for (const key of ['required_controls', 'required_anti_patterns']) {
    const arr = ex[key];
    if (!Array.isArray(arr) || arr.length === 0) { fail(`${name}: expects.${key} 必须是非空数组`); continue; }
    for (const tok of arr) {
      if (typeof tok !== 'string' || tok.trim() === '') { fail(`${name}: ${key} 含空/非字符串 token`); continue; }
      if (!corpus.includes(tok)) fail(`${name}: ${key} 缺项 → 正文未定义必备项 ${JSON.stringify(tok)}`);
    }
  }
}

function main() {
  console.log('run_evals: cap-testing-strategy（确定性覆盖校验器，不调 LLM）');
  const corpus = loadCorpus();
  console.log(`  corpus: SKILL.md + references/*.md = ${corpus.length} bytes`);

  const files = readdirSync(EVALS).filter((f) => f.endsWith('.json')).sort();
  if (files.length < 4) fail(`期望 >=4 个 eval fixture，实际 ${files.length}`);

  const seen = new Set();
  for (const f of files) {
    let doc;
    try { doc = JSON.parse(readFileSync(join(EVALS, f), 'utf8')); }
    catch (e) { fail(`${f}: JSON 解析失败: ${e.message}`); continue; }
    seen.add(doc.category);
    const before = failures;
    validateFixture(f, doc, corpus);
    if (failures === before) {
      const nC = (doc.expects.required_controls || []).length;
      const nA = (doc.expects.required_anti_patterns || []).length;
      console.log(`  [EVAL-OK] ${f} (category=${doc.category}, activation=${JSON.stringify(doc.expects.activation)}, controls=${nC}, anti_patterns=${nA})`);
    }
  }
  for (const c of REQUIRED_CATEGORIES) {
    if (!seen.has(c)) fail(`缺少类别覆盖: ${c}`);
  }

  const ok = failures === 0;
  console.log(`RESULT: ${ok ? 'ALL EVALS PASS（5 类 fixture 覆盖校验通过；必备测试设计要素/反模式均在正文有定义）' : `${failures} FAILURE(S)`} (exit ${ok ? 0 : 1})`);
  process.exit(ok ? 0 : 1);
}

main();
