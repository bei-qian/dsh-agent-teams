#!/usr/bin/env node
/**
 * run_evals.mjs — 跑 evals/*.json 的确定性回归（零依赖 Node，ESM）。
 *
 * 每个 fixture 的 `kind` 决定检查逻辑，`expect` 给出期望值（只比对 expect 中出现的键）：
 *   - kind: "decompose"  校验单元计划：scope/interface/acceptance_criteria/writeScopes 齐全、
 *                        blocked_by 无悬空、DAG 无环、无序单元 writeScopes 不重叠。
 *                        产出 { valid, acyclic, parallel_safe, requires_stop, parallel_pairs }
 *   - kind: "dag"        仅校验依赖图：{ acyclic, exit_code, cycle }
 *   - kind: "review"     worker 自述 vs diff 重推：{ catch_mismatch, self_report_all_green, verdict }
 *   - kind: "trigger"    是否启用协调（负触发判定）：{ activate }
 *
 * 用法：node scripts/run_evals.mjs
 * 退出码：0 = 全部 PASS；1 = 有 FAIL。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyze } from './check_dag.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVALS = join(HERE, '..', 'evals');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 计算每个节点的前向可达集（a 可达 b 表示 a 阻塞 b，即 a 排在 b 前）
function reachability(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const [a, b] of edges) if (adj.has(a) && adj.has(b)) adj.get(a).push(b);
  const reach = new Map();
  for (const n of nodes) {
    const seen = new Set();
    const dfs = (x) => {
      for (const m of adj.get(x) || []) if (!seen.has(m)) { seen.add(m); dfs(m); }
    };
    dfs(n);
    reach.set(n, seen);
  }
  return reach;
}

function validatePlan(plan) {
  const errors = [];
  const stop = [];
  const units = Array.isArray(plan && plan.units) ? plan.units : [];
  if (units.length === 0) {
    return { valid: false, acyclic: false, parallel_safe: false, requires_stop: true, parallel_pairs: [], errors: ['plan 无 units'], stop: ['plan 为空'] };
  }
  const ids = new Set();
  for (const u of units) {
    if (!u || typeof u.id !== 'string' || !u.id) { errors.push('unit 缺 id'); continue; }
    if (ids.has(u.id)) errors.push(`unit id 重复 ${u.id}`);
    ids.add(u.id);
    if (!u.scope || !String(u.scope).trim()) errors.push(`${u.id} 缺 scope（有界职责）`);
    if (!Array.isArray(u.writeScopes) || u.writeScopes.length === 0) errors.push(`${u.id} 缺 writeScopes`);
    const acs = Array.isArray(u.acceptance_criteria) ? u.acceptance_criteria : [];
    if (acs.length === 0) {
      errors.push(`${u.id} 缺 acceptance_criteria（不可独立验收）`);
      stop.push(`${u.id} AC 缺失→停机问`);
    } else {
      for (const ac of acs) {
        if (!ac || !ac.check || !ac.verify) {
          errors.push(`${u.id} 的 AC 缺 check/verify（不可断言）`);
          stop.push(`${u.id} AC 含糊→停机问`);
        }
      }
    }
  }
  // blocked_by 悬空
  for (const u of units) {
    for (const b of (u && u.blocked_by) || []) {
      if (!ids.has(String(b))) errors.push(`${u.id} blocked_by 引用不存在 ${b}`);
    }
  }
  // DAG 结构
  let dag = { acyclic: false, cycle: null, dangling: [], nodes: [], edges: [] };
  try {
    dag = analyze({ units });
  } catch (e) {
    errors.push('DAG 解析失败: ' + e.message);
  }
  if (dag.cycle) errors.push('DAG 有环: ' + dag.cycle.join(' -> '));
  if (dag.dangling && dag.dangling.length) errors.push('DAG 悬空: ' + dag.dangling.join(', '));

  // writeScope 冲突（仅在两单元无序、可能并行时才算冲突）
  const reach = reachability(dag.nodes || [], dag.edges || []);
  const ordered = (a, b) => (reach.get(a) && reach.get(a).has(b)) || (reach.get(b) && reach.get(b).has(a));
  let conflict = false;
  const parallelPairs = [];
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      if (!a || !b || !a.id || !b.id || !Array.isArray(a.writeScopes) || !Array.isArray(b.writeScopes)) continue;
      const overlap = a.writeScopes.filter((s) => b.writeScopes.includes(s));
      if (ordered(a.id, b.id)) continue;
      if (overlap.length) {
        conflict = true;
        errors.push(`writeScope 冲突（无序却重叠）: ${a.id} & ${b.id} → ${overlap.join(', ')}`);
        stop.push(`${a.id}&${b.id} writeScope 冲突→串行化`);
      } else {
        parallelPairs.push([a.id, b.id].sort());
      }
    }
  }
  parallelPairs.sort();
  const valid = errors.length === 0;
  return { valid, acyclic: Boolean(dag.acyclic), parallel_safe: valid && !conflict, requires_stop: stop.length > 0, parallel_pairs: parallelPairs, errors, stop };
}

function validateReview(fx) {
  const claims = Array.isArray(fx.claims) ? fx.claims : [];
  const mismatches = claims.filter((c) => c.worker_self_report !== c.rederived);
  const selfReportAllGreen = claims.every((c) => c.worker_self_report === 'pass' || c.worker_self_report === true);
  return {
    catch_mismatch: mismatches.length > 0,
    mismatch_ids: mismatches.map((c) => c.id),
    self_report_all_green: selfReportAllGreen,
    verdict: mismatches.length ? 'block' : 'accept',
  };
}

function decideActivation(sig) {
  const reasons = [];
  const s = sig || {};
  if ((s.files_touched ?? 99) <= 1) reasons.push('单文件');
  if ((s.modules ?? 99) <= 1 && (s.owners ?? 99) <= 1 && s.size === 'small') reasons.push('单 owner 小改');
  if (/(typo|docs?|文案|单文件|single[- ]?file|rename|注释)/i.test(String(s.description || ''))) reasons.push('琐碎文案');
  return { activate: reasons.length === 0, reasons };
}

function evalFixture(fx) {
  switch (fx.kind) {
    case 'decompose': return validatePlan(fx.plan);
    case 'dag': {
      const r = analyze(fx.dag);
      const exit_code = r.dangling.length ? 2 : r.cycle ? 1 : 0;
      return { acyclic: r.acyclic, exit_code, cycle: r.cycle };
    }
    case 'review': return validateReview(fx);
    case 'trigger': return decideActivation(fx.signals);
    default: throw new Error(`未知 kind: ${fx.kind}`);
  }
}

function main() {
  const files = readdirSync(EVALS).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) { console.error('evals/ 下没有 *.json'); process.exit(1); }
  let allPass = true;
  let n = 0;
  for (const f of files) {
    n++;
    let fx;
    try {
      fx = JSON.parse(readFileSync(join(EVALS, f), 'utf8'));
    } catch (e) {
      console.log(`[FAIL] ${f}: JSON 解析失败 ${e.message}`);
      allPass = false;
      continue;
    }
    let got;
    try {
      got = evalFixture(fx);
    } catch (e) {
      console.log(`[FAIL] ${f}: ${e.message}`);
      allPass = false;
      continue;
    }
    const diffs = [];
    for (const [k, want] of Object.entries(fx.expect || {})) {
      if (!same(got[k], want)) diffs.push(`${k}: want=${JSON.stringify(want)} got=${JSON.stringify(got[k])}`);
    }
    if (diffs.length) {
      console.log(`[FAIL] ${f} (kind=${fx.kind})`);
      for (const d of diffs) console.log(`        ${d}`);
      allPass = false;
    } else {
      console.log(`[PASS] ${f} (kind=${fx.kind})`);
    }
  }
  console.log(`\nRESULT: ${allPass ? 'ALL PASS' : 'FAILURES'} (${n} fixtures)`);
  process.exit(allPass ? 0 : 1);
}

main();
