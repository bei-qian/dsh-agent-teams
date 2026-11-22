#!/usr/bin/env node
/**
 * validate_selection.mjs — 校验一条 capability-router 的 selection record（零依赖 Node，ESM）。
 *
 * 用法：
 *   node scripts/validate_selection.mjs <record.json | record.yaml>
 *
 * 输入格式（二选一，说明取舍见文末）：
 *   - JSON（.json，原生 JSON.parse，推荐给机器/评测）：直接是 selection record，
 *     或 eval fixture 包装 { "expect": {...}, "record": {...} } / { "input": {...} }。
 *   - YAML（.yaml/.yml，内置极简 subset parser）：直接是 selection record。
 *     内置 parser 只支持本项目用到的子集（缩进映射/序列、行内数组、引号标量），
 *     不是通用 YAML；复杂 YAML 请先转 JSON。
 *
 * 规则（见 references/routing-rules.md §B/§C）：
 *   INDEX-*  索引自身（唯一 kebab / 枚举 / risk-gated 有 risk_signals / 依赖存在且无环 / 正负触发不重叠）
 *   R1-schema               六字段齐全 + 枚举合法 + id∈索引 + 无重复/冲突
 *   R2-risk-gate            risk∈{high,critical} 必选 security（或 excluded 带 risk-ack）
 *   R3-required-validation  security-test→必选 security；a11y-check→frontend-ux（未登记仅 warn）
 *   R4-excluded-reason      每条 excluded 带非空 reason；selected 未命中 trigger→warn
 *   R5-dependency-closure   selected 的 depends_on 传递闭包 ⊆ selected ∪ excluded
 *   R6-exit-code            0 合法 / 1 记录违规 / 2 索引不合法
 *
 * 退出码：0=合法；1=记录违规或 fixture 期望不符；2=索引不合法或用法错误。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(HERE, '..', 'references', 'capability-index.yaml');
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENUMS = {
  task_type: ['feature', 'bug', 'refactor', 'api', 'ui', 'database', 'auth', 'deployment', 'performance', 'incident'],
  risk_level: ['low', 'medium', 'high', 'critical'],
  size: ['small', 'medium', 'large'],
  complexity: ['small', 'medium', 'large'],
};
const PRIORITIES = ['P0', 'P1', 'P2'];
const COST_TIERS = ['low', 'medium', 'high'];
const ACTIVATIONS = ['auto', 'risk-gated', 'stack-gated', 'manual'];

// ---------- minimal YAML subset parser (index + optional YAML records) ----------
function stripComment(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
function splitTop(s) {
  const out = []; let buf = '', inS = false, inD = false, depth = 0;
  for (const c of s) {
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '[' && !inS && !inD) { depth++; }
    else if (c === ']' && !inS && !inD) { depth--; }
    if (c === ',' && !inS && !inD && depth === 0) { out.push(buf); buf = ''; }
    else buf += c;
  }
  if (buf.trim() !== '') out.push(buf);
  return out;
}
function parseScalar(raw) {
  const s = raw.trim();
  if (s === '[]') return [];
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner === '' ? [] : splitTop(inner).map((x) => parseScalar(x));
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}
function parseYaml(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const nc = stripComment(raw);
    if (nc.trim() === '') continue;
    lines.push({ indent: nc.length - nc.trimStart().length, text: nc.trim() });
  }
  let i = 0;
  const blockAt = (indent) => (lines[i] && lines[i].indent >= indent ? (lines[i].text.startsWith('- ') ? seq(indent) : map(indent)) : null);
  function map(indent) {
    const obj = {};
    while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith('- ')) {
      const ci = lines[i].text.indexOf(':');
      const key = lines[i].text.slice(0, ci).trim();
      const rest = lines[i].text.slice(ci + 1).trim();
      i++;
      if (rest === '') obj[key] = i < lines.length && lines[i].indent > indent ? blockAt(lines[i].indent) : null;
      else obj[key] = parseScalar(rest);
    }
    return obj;
  }
  function seq(indent) {
    const arr = [];
    while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith('- ')) {
      const content = lines[i].text.slice(2).trim();
      i++;
      const isInlineMap = /^[^:[\]]+:\s?/.test(content) || /^[^:[\]]+:$/.test(content);
      if (content === '') {
        arr.push(i < lines.length && lines[i].indent > indent ? blockAt(lines[i].indent) : null);
      } else if (isInlineMap) {
        const ci = content.indexOf(':');
        const obj = {};
        const key = content.slice(0, ci).trim();
        const rest = content.slice(ci + 1).trim();
        obj[key] = rest === '' ? (i < lines.length && lines[i].indent > indent ? blockAt(lines[i].indent) : null) : parseScalar(rest);
        if (i < lines.length && lines[i].indent > indent && !lines[i].text.startsWith('- ')) {
          Object.assign(obj, map(lines[i].indent));
        }
        arr.push(obj);
      } else arr.push(parseScalar(content));
    }
    return arr;
  }
  return lines.length ? map(lines[0].indent) : null;
}
function parseDoc(text, isJson) {
  if (isJson) return JSON.parse(text);
  return parseYaml(text);
}

// ---------- index ----------
function validateIndex(idx) {
  const errs = [];
  const caps = (idx && idx.capabilities) || [];
  if (!Array.isArray(caps) || caps.length === 0) errs.push('INDEX-empty: capabilities[] 缺失或为空');
  const byId = new Map();
  for (const c of caps) {
    const id = c && c.id;
    if (!id || !KEBAB.test(id)) errs.push(`INDEX-kebab: id ${JSON.stringify(id)} 非 kebab`);
    if (byId.has(id)) errs.push(`INDEX-dup: id ${id} 重复`);
    byId.set(id, c);
    if (!PRIORITIES.includes(c.priority)) errs.push(`INDEX-enum: ${id}.priority=${c.priority} 非法`);
    if (!COST_TIERS.includes(c.cost_tier)) errs.push(`INDEX-enum: ${id}.cost_tier=${c.cost_tier} 非法`);
    if (!ACTIVATIONS.includes(c.activation)) errs.push(`INDEX-enum: ${id}.activation=${c.activation} 非法`);
    if (c.activation === 'risk-gated' && (!Array.isArray(c.risk_signals) || c.risk_signals.length === 0))
      errs.push(`INDEX-risk-signals: ${id} activation=risk-gated 缺 risk_signals`);
    if (c.activation === 'stack-gated' && !c.stack_scope) errs.push(`INDEX-stack-scope: ${id} activation=stack-gated 缺 stack_scope`);
    const t = new Set((c.triggers || []).map(String));
    for (const n of c.negative_triggers || []) if (t.has(String(n))) errs.push(`INDEX-overlap: ${id} trigger 与 negative_trigger 重叠: ${n}`);
  }
  for (const c of caps) for (const d of c.depends_on || []) if (!byId.has(d)) errs.push(`INDEX-dangling: ${c.id} depends_on ${d} 不存在`);
  // cycle detection
  const state = new Map();
  const dfs = (id, stack) => {
    if (state.get(id) === 1) { errs.push(`INDEX-cycle: ${[...stack, id].join(' -> ')}`); return; }
    if (state.get(id) === 2) return;
    state.set(id, 1);
    for (const d of (byId.get(id)?.depends_on) || []) if (byId.has(d)) dfs(d, [...stack, id]);
    state.set(id, 2);
  };
  for (const id of byId.keys()) dfs(id, []);
  return { errs, byId };
}

// ---------- record ----------
function closure(id, byId, seen = new Set()) {
  for (const d of byId.get(id)?.depends_on || []) if (!seen.has(d)) { seen.add(d); closure(d, byId, seen); }
  return seen;
}
function validateRecord(rec, byId) {
  const fails = [], warns = [];
  if (!rec || typeof rec !== 'object') { fails.push(['R1-schema', '记录为空或非对象']); return { fails, warns }; }
  const s = rec.signals || {};
  // R1 schema
  for (const f of ['task_type', 'risk_level', 'size', 'complexity']) {
    if (s[f] === undefined) fails.push(['R1-schema', `signals.${f} 缺失`]);
    else if (!ENUMS[f].includes(s[f])) fails.push(['R1-schema', `signals.${f}=${s[f]} 非枚举值`]);
  }
  if (!Array.isArray(s.stack)) fails.push(['R1-schema', 'signals.stack 必须是数组']);
  if (!Array.isArray(s.required_validation)) fails.push(['R1-schema', 'signals.required_validation 必须是数组']);
  const selected = Array.isArray(rec.selected_capabilities) ? rec.selected_capabilities : [];
  const excluded = Array.isArray(rec.excluded) ? rec.excluded : [];
  if (!Array.isArray(rec.selected_capabilities)) fails.push(['R1-schema', 'selected_capabilities 必须是数组']);
  if (!Array.isArray(rec.excluded)) fails.push(['R1-schema', 'excluded 必须是数组']);
  const selSet = new Set();
  for (const id of selected) {
    if (selSet.has(id)) fails.push(['R1-schema', `selected 重复 id: ${id}`]);
    selSet.add(id);
    if (!byId.has(id)) fails.push(['R1-schema', `selected id 不在索引: ${id}`]);
  }
  const excSet = new Set();
  for (const e of excluded) {
    if (!e || typeof e.id !== 'string') { fails.push(['R1-schema', 'excluded 项缺 id']); continue; }
    if (!byId.has(e.id)) fails.push(['R1-schema', `excluded id 不在索引: ${e.id}`]);
    if (selSet.has(e.id)) fails.push(['R1-schema', `id 同时出现在 selected 与 excluded: ${e.id}`]);
    if (excSet.has(e.id)) fails.push(['R1-schema', `excluded 重复 id: ${e.id}`]);
    excSet.add(e.id);
  }
  // R2 risk gate
  const risk = s.risk_level;
  if (risk === 'high' || risk === 'critical') {
    const sel = selSet.has('cap-security-baseline');
    const ack = excluded.some((e) => e.id === 'cap-security-baseline' && typeof e.reason === 'string' && e.reason.includes('risk-ack'));
    if (!sel && !ack) fails.push(['R2-risk-gate', `risk_level=${risk} 但未选 cap-security-baseline 且无 risk-ack 豁免`]);
  }
  // R3 required validation
  const rv = Array.isArray(s.required_validation) ? s.required_validation : [];
  if (rv.includes('security-test') && !selSet.has('cap-security-baseline'))
    fails.push(['R3-required-validation', 'required_validation 含 security-test 但未选 cap-security-baseline']);
  if (rv.includes('a11y-check')) {
    if (byId.has('cap-frontend-ux') && !selSet.has('cap-frontend-ux'))
      fails.push(['R3-required-validation', 'required_validation 含 a11y-check 但未选 cap-frontend-ux']);
    else if (!byId.has('cap-frontend-ux'))
      warns.push(['R3-required-validation', 'a11y-check 要求 frontend-ux，但该能力(P1)尚未登记 → 回退 bmad-ux']);
  }
  // R4 excluded reason + over-activation warn
  for (const e of excluded) {
    if (!e || typeof e.reason !== 'string' || e.reason.trim() === '')
      fails.push(['R4-excluded-reason', `excluded id=${e && e.id} 缺非空 reason`]);
  }
  const hay = JSON.stringify(s).toLowerCase();
  for (const id of selected) {
    const cap = byId.get(id);
    const hit = (cap?.triggers || []).some((t) => hay.includes(String(t).toLowerCase())) || hay.includes(String(s.task_type).toLowerCase());
    if (!hit) warns.push(['R4-excluded-reason', `selected ${id} 的 triggers 未命中任何信号（疑似过度激活，warn）`]);
  }
  // R5 dependency closure
  const allowed = new Set([...selSet, ...excSet]);
  for (const id of selected) {
    for (const d of closure(id, byId)) {
      if (!allowed.has(d)) fails.push(['R5-dependency-closure', `selected ${id} 的依赖 ${d} 既未 selected 也未 excluded（悬空）`]);
    }
  }
  return { fails, warns };
}

// ---------- main ----------
function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/validate_selection.mjs <record.json|record.yaml>'); process.exit(2); }
  let doc;
  try {
    doc = parseDoc(readFileSync(file, 'utf8'), file.endsWith('.json'));
  } catch (e) {
    console.error(`[FATAL] 解析失败 ${file}: ${e.message}`); process.exit(2);
  }
  // fixture wrapper: {expect, record|input}
  const record = doc && (doc.record || doc.input) ? (doc.record || doc.input) : doc;
  const expect = doc && doc.expect;

  console.log(`validate_selection: ${file}`);
  // index first
  let idx;
  try { idx = parseDoc(readFileSync(INDEX_PATH, 'utf8'), false); }
  catch (e) { console.error(`[INDEX-FATAL] 无法读/解析索引 ${INDEX_PATH}: ${e.message}`); process.exit(2); }
  const { errs, byId } = validateIndex(idx);
  if (errs.length) {
    for (const e of errs) console.error(`  [INDEX-FAIL] ${e}`);
    console.error('RESULT: INDEX INVALID (exit 2)');
    process.exit(2);
  }
  console.log(`  index: ${byId.size} capabilities ok`);

  const { fails, warns } = validateRecord(record, byId);
  const sig = (record && record.signals) || {};
  console.log(`  record: task_id=${record?.task_id} task_type=${sig.task_type} risk=${sig.risk_level} size=${sig.size}`);
  console.log(`  selected: [${(record?.selected_capabilities || []).join(', ')}]`);
  console.log(`  excluded: [${(record?.excluded || []).map((e) => e && e.id).join(', ')}]`);
  for (const [rule, msg] of warns) console.log(`  [WARN] ${rule}: ${msg}`);
  for (const [rule, msg] of fails) console.log(`  [FAIL] ${rule}: ${msg}`);

  const ruleExit = fails.length ? 1 : 0;
  let finalExit = ruleExit;
  if (expect && typeof expect.exit === 'number') {
    if ((expect.exit === 0) !== (ruleExit === 0)) {
      console.log(`  [EVAL-MISMATCH] expect.exit=${expect.exit} 实际规则退出=${ruleExit}`);
      finalExit = 1;
    } else {
      console.log(`  [EVAL-OK] 退出码符合 expect.exit=${expect.exit}`);
    }
  }
  const ruleIds = [...new Set(fails.map((f) => f[0]))];
  console.log(`RESULT: ${ruleExit ? 'INVALID' : 'VALID'} (exit ${finalExit})${ruleIds.length ? ' rules=[' + ruleIds.join(',') + ']' : ''}`);
  process.exit(finalExit);
}
main();
