#!/usr/bin/env node
/**
 * run_evals.mjs — cap-requirements-grilling 的确定性 eval 运行器（零依赖 Node，ESM）。
 *
 * 做两件事：
 *   1) 校验 evals/*.json 的结构与类别覆盖（normal / boundary / ambiguous / negative-trigger / regression）；
 *   2) 用 fixture 内置的「正确执行产物」确定性断言 AC2–AC5：
 *      - AC2：决策记录 ∪ 未决问题 覆盖每类模糊需求已知的隐含假设清单；
 *      - AC3：决策记录四字段齐全、未决问题三字段齐全且满足最小条数；
 *      - AC4：事实项归 owner=fact 自查（不重复问用户）、必须问项落 must-ask、可假设项写默认并可回填；
 *      - AC5：负样本不展开设计树、提问数 ≤ 阈值、直接确认执行（不过度提问）。
 *
 * 用法： node scripts/run_evals.mjs
 * 退出码：0 = 全部通过；1 = 有 fixture 不合法或断言不成立（可作负向对照）。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVALS = join(HERE, '..', 'evals');
const REQUIRED_CATEGORIES = ['normal', 'boundary', 'ambiguous', 'negative-trigger', 'regression'];
const DECISION_FIELDS = ['decision', 'chosen', 'rationale', 'status'];
const OPENQ_FIELDS = ['question', 'owner', 'blocking'];
const DECISION_STATUSES = new Set(['decided', 'must-ask', 'assumed', 'fact-checked']);
const OWNERS = new Set(['user', 'fact']);

let failures = 0;
const fail = (msg) => { console.error(`  [FAIL] ${msg}`); failures += 1; };
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
const has = (hay, kw) => String(hay).toLowerCase().includes(String(kw).toLowerCase());

// 决策条目的可检索文本（decision + chosen + rationale）。
const decisionText = (d) => [d.decision, d.chosen, d.rationale].join(' ');
// 决策记录 ∪ 未决问题 的全文（用于「隐含假设覆盖」存在性断言）。
function coveredText(doc) {
  const parts = [];
  for (const d of doc.output.decision_record || []) parts.push(decisionText(d));
  for (const q of doc.output.open_questions || []) parts.push(q.question);
  return parts.join(' \n ');
}

function checkCommon(file, doc) {
  for (const f of ['fixture', 'category', 'description', 'input', 'output', 'expect']) {
    if (doc[f] === undefined) fail(`${file}: 缺字段 ${f}`);
  }
  if (!REQUIRED_CATEGORIES.includes(doc.category)) fail(`${file}: category=${doc.category} 非法`);
  if (!doc.output || typeof doc.output !== 'object') { fail(`${file}: output 缺失或非对象`); return false; }
  if (!Array.isArray(doc.output.decision_record)) fail(`${file}: output.decision_record 必须是数组`);
  if (!Array.isArray(doc.output.open_questions)) fail(`${file}: output.open_questions 必须是数组`);
  return true;
}

// 校验决策记录 / 未决问题的字段与状态。
function checkRecordAndQuestions(file, doc) {
  const dr = doc.output.decision_record || [];
  const oq = doc.output.open_questions || [];
  const dfields = doc.expect.decision_record_required_fields || DECISION_FIELDS;
  const ofields = doc.expect.open_question_required_fields || OPENQ_FIELDS;

  for (let i = 0; i < dr.length; i++) {
    const d = dr[i] || {};
    for (const f of dfields) if (!nonEmpty(d[f])) fail(`${file}: decision_record[${i}] 缺/空字段 ${f}`);
    if (!DECISION_STATUSES.has(d.status)) fail(`${file}: decision_record[${i}] status=${d.status} 非法`);
  }
  for (let i = 0; i < oq.length; i++) {
    const q = oq[i] || {};
    for (const f of ofields) {
      if (f === 'blocking') { if (typeof q.blocking !== 'boolean') fail(`${file}: open_questions[${i}].blocking 必须是布尔`); }
      else if (!nonEmpty(q[f])) fail(`${file}: open_questions[${i}] 缺/空字段 ${f}`);
    }
    if (q.owner !== undefined && !OWNERS.has(q.owner)) fail(`${file}: open_questions[${i}].owner=${q.owner} 非法（user|fact）`);
  }
  const minD = doc.expect.min_decisions;
  if (typeof minD === 'number' && dr.length < minD) fail(`${file}: 决策记录 ${dr.length} < 最小条数 ${minD}`);
  const minQ = doc.expect.min_open_questions;
  if (typeof minQ === 'number' && oq.length < minQ) fail(`${file}: 未决问题 ${oq.length} < 最小条数 ${minQ}`);
}

// AC2 + 回归守卫：隐含假设清单被决策记录 ∪ 未决问题覆盖。
function checkAssumptionCoverage(file, doc, key) {
  const list = doc.expect[key];
  if (!Array.isArray(list)) return;
  const text = coveredText(doc);
  const missing = list.filter((kw) => !has(text, kw));
  if (missing.length) fail(`${file}: ${key} 未被决策记录∪未决问题覆盖: ${missing.join(', ')}`);
}

// AC4：事实归 agent 自查（owner=fact），且不得把同一事实抛给用户。
function checkFactsSelfChecked(file, doc) {
  const facts = doc.expect.facts_self_checked;
  if (!Array.isArray(facts) || facts.length === 0) return;
  const oq = doc.output.open_questions || [];
  const dr = doc.output.decision_record || [];
  for (const kw of facts) {
    const asFact = oq.some((q) => q.owner === 'fact' && has(q.question, kw))
      || dr.some((d) => d.status === 'fact-checked' && has(decisionText(d), kw));
    if (!asFact) fail(`${file}: 事实项「${kw}」未归 owner=fact 自查`);
    const askedToUser = oq.some((q) => q.owner === 'user' && q.blocking === true && has(q.question, kw));
    if (askedToUser) fail(`${file}: 事实项「${kw}」被重复抛给用户（应 agent 自查）`);
  }
}

// AC4：必须问触发命中会提问（must-ask 或 user 阻塞问题）。
function checkMustAsk(file, doc) {
  const mustAsk = doc.expect.must_ask_decisions;
  if (!Array.isArray(mustAsk) || mustAsk.length === 0) return;
  const oq = doc.output.open_questions || [];
  const dr = doc.output.decision_record || [];
  for (const kw of mustAsk) {
    const hit = dr.some((d) => d.status === 'must-ask' && has(decisionText(d), kw))
      || oq.some((q) => q.owner === 'user' && q.blocking === true && has(q.question, kw));
    if (!hit) fail(`${file}: 必须问决策「${kw}」未落 must-ask / 未进 user 阻塞问题`);
  }
}

// AC4：可假设项写默认并可回填（至少一条 assumed 且有 assumptions_defaulted）。
function checkDefaulted(file, doc) {
  if (doc.expect.allow_defaulted_assumptions !== true) return;
  const dr = doc.output.decision_record || [];
  const adopted = dr.filter((d) => d.status === 'assumed');
  if (adopted.length === 0) fail(`${file}: 无可假设项（status=assumed）示例，无法证明可假设并可回填`);
  if (!Array.isArray(doc.output.assumptions_defaulted) || doc.output.assumptions_defaulted.length === 0) {
    fail(`${file}: allow_defaulted_assumptions=true 但 assumptions_defaulted 为空（未写明默认/回填）`);
  }
}

// AC5：负样本不展开设计树、提问数 ≤ 阈值、直接确认执行。
function checkNegative(file, doc) {
  if (doc.output.design_tree !== false) fail(`${file}: 负样本不应展开设计树（design_tree 应为 false）`);
  if (doc.output.direct_execute !== true) fail(`${file}: 负样本应直接确认执行（direct_execute 应为 true）`);
  const maxQ = typeof doc.expect.max_questions === 'number' ? doc.expect.max_questions : 1;
  const qc = typeof doc.output.question_count === 'number' ? doc.output.question_count : (doc.output.open_questions || []).length;
  if (qc > maxQ) fail(`${file}: 负样本提问数 ${qc} > 阈值 ${maxQ}（过度提问）`);
  if ((doc.output.open_questions || []).length > maxQ) fail(`${file}: 负样本未决问题数 > 阈值 ${maxQ}`);
}

function validateFixture(file) {
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { fail(`${file}: JSON 解析失败: ${e.message}`); return null; }
  if (!checkCommon(file, doc)) return doc;

  checkRecordAndQuestions(file, doc);

  const activate = doc.expect.activate;
  if (activate === false) {
    checkNegative(file, doc);
  } else if (activate === true) {
    if (doc.expect.require_design_tree === true && doc.output.design_tree !== true) {
      fail(`${file}: 正样本应展开设计树（design_tree 应为 true）`);
    }
    if (doc.output.direct_execute !== false) fail(`${file}: 正样本不应直接执行（应先澄清）`);
    checkAssumptionCoverage(file, doc, 'implicit_assumptions');
    checkAssumptionCoverage(file, doc, 'regression_guards');
    checkFactsSelfChecked(file, doc);
    checkMustAsk(file, doc);
    checkDefaulted(file, doc);
  } else {
    fail(`${file}: expect.activate 必须是布尔（true|false）`);
  }
  return doc;
}

function main() {
  console.log('run_evals: cap-requirements-grilling');
  const files = readdirSync(EVALS).filter((f) => f.endsWith('.json')).sort();
  if (files.length < 5) fail(`期望 >=5 个 eval fixture，实际 ${files.length}`);

  const seen = new Set();
  let passed = 0;
  for (const f of files) {
    const before = failures;
    const doc = validateFixture(join(EVALS, f));
    if (!doc) continue;
    seen.add(doc.category);
    if (failures === before) {
      passed += 1;
      console.log(`  [EVAL-OK] ${f} (category=${doc.category})`);
    }
  }
  for (const c of REQUIRED_CATEGORIES) {
    if (!seen.has(c)) fail(`缺少类别覆盖: ${c}`);
  }

  const ok = failures === 0;
  console.log(`  fixtures=${files.length} passed=${passed} categories=[${[...seen].sort().join(', ')}]`);
  console.log(`RESULT: ${ok ? 'ALL EVALS PASS' : `${failures} FAILURE(S)`} (exit ${ok ? 0 : 1})`);
  process.exit(ok ? 0 : 1);
}

main();
