#!/usr/bin/env node
/**
 * check_dag.mjs — 依赖图无环校验（零依赖 Node，ESM）。
 *
 * 用法：
 *   node scripts/check_dag.mjs <plan.json | dag.json>
 *
 * 接受三种输入（自动识别）：
 *   1) 单元计划：{ "units": [ { "id": "U1", "blocked_by": ["U0"] }, ... ] }
 *      blocked_by 列出「本单元依赖的前置单元」→ 依赖边 [被依赖, 本单元]。
 *   2) 图包装：  { "dag": { "nodes": [...], "edges": [[from,to], ...] } }
 *   3) 裸图：    { "nodes": [...], "edges": [[from,to], ...] }
 *
 * 退出码：0 = 无环（可派活）；1 = 有环；2 = 输入非法 / 悬空引用（blocked_by 指向不存在的节点）。
 *
 * 可作为库被 import：`import { buildGraph, analyze } from './check_dag.mjs'`。
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** 从任意支持格式构建 { nodes:string[], edges:[string,string][] }。 */
export function buildGraph(doc) {
  const g = doc && (doc.dag || doc.plan) ? (doc.dag || doc.plan) : doc;
  if (!g || typeof g !== 'object') throw new Error('输入为空或非对象');
  if (Array.isArray(g.units)) {
    const nodes = [];
    const seen = new Set();
    for (const u of g.units) {
      if (!u || typeof u.id !== 'string' || !u.id) throw new Error('unit 缺 id');
      if (seen.has(u.id)) throw new Error(`unit id 重复: ${u.id}`);
      seen.add(u.id);
      nodes.push(u.id);
    }
    const edges = [];
    for (const u of g.units) {
      const bb = Array.isArray(u.blocked_by) ? u.blocked_by : [];
      for (const b of bb) edges.push([String(b), u.id]);
    }
    return { nodes, edges };
  }
  if (Array.isArray(g.nodes) && Array.isArray(g.edges)) {
    return {
      nodes: g.nodes.map(String),
      edges: g.edges.map((e) => (Array.isArray(e) ? [String(e[0]), String(e[1])] : [String(e.from), String(e.to)])),
    };
  }
  throw new Error('无法识别的图格式（需 units[] 或 nodes[]+edges[]）');
}

/** 分析 DAG：返回 { nodes, edges, dangling, cycle, acyclic }。 */
export function analyze(doc) {
  const { nodes, edges } = buildGraph(doc);
  const nodeSet = new Set(nodes);
  const dangling = [];
  for (const [a, b] of edges) {
    if (!nodeSet.has(a)) dangling.push(a);
    if (!nodeSet.has(b)) dangling.push(b);
  }
  const uniqDangling = [...new Set(dangling)];

  const adj = new Map(nodes.map((n) => [n, []]));
  for (const [a, b] of edges) if (adj.has(a) && adj.has(b)) adj.get(a).push(b);

  // DFS 找环（返回一条环路径）
  const state = new Map(); // 1=在栈上，2=已完成
  const stack = [];
  let cycle = null;
  const dfs = (n) => {
    state.set(n, 1);
    stack.push(n);
    for (const m of adj.get(n) || []) {
      if (state.get(m) === 1) {
        cycle = [...stack.slice(stack.indexOf(m)), m];
        return true;
      }
      if (!state.get(m) && dfs(m)) return true;
    }
    stack.pop();
    state.set(n, 2);
    return false;
  };
  for (const n of nodes) {
    if (!state.get(n) && dfs(n)) break;
  }

  return {
    nodes,
    edges,
    dangling: uniqDangling,
    cycle,
    acyclic: uniqDangling.length === 0 && !cycle,
  };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/check_dag.mjs <plan.json|dag.json>');
    process.exit(2);
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[FATAL] 解析失败 ${file}: ${e.message}`);
    process.exit(2);
  }
  let r;
  try {
    r = analyze(doc);
  } catch (e) {
    console.error(`[INVALID] ${e.message}`);
    process.exit(2);
  }
  console.log(`check_dag: ${file}`);
  console.log(`  nodes: ${r.nodes.length}  edges: ${r.edges.length}`);
  if (r.dangling.length) {
    console.error(`  [DANGLING] blocked_by/edge 引用不存在的节点: ${r.dangling.join(', ')}`);
    console.error('RESULT: INVALID (exit 2)');
    process.exit(2);
  }
  if (r.cycle) {
    console.error(`  [CYCLE] ${r.cycle.join(' -> ')}`);
    console.error('RESULT: CYCLE (exit 1)');
    process.exit(1);
  }
  console.log('  [OK] DAG 无环');
  console.log('RESULT: ACYCLIC (exit 0)');
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
