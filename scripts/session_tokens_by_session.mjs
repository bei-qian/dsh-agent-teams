#!/usr/bin/env node
/**
 * session_tokens_by_session.mjs — 逐会话（per-session）token / 步数 / cost 归因（零依赖 Node，
 * 仅 stdlib：node:fs / node:path / node:url / node:zlib）。
 *
 * 背景：`session_tokens.mjs` 只能对「会话树」整棵聚合（一个会话树 = Lead + 全部子代理 + 历史运行，
 * 仅输出单一汇总）。磁盘本已是「每会话一个 `session.v4.jsonl.zstd`」，本脚本**逐文件**跑同一口径，
 * 输出 per-session 列表 + 目录合计 + 场景汇总，并可派生 cost。
 *
 * 口径（与 `session_tokens.mjs` 逐项一致，保证合计无损回归）：
 *   steps            带 usage 的 assistant/message 记录条数
 *   inputTokens      所有步 usage.inputTokens 之和
 *   cacheReadTokens  所有步 usage.cacheReadTokens 之和
 *   outputTokens     所有步 usage.outputTokens 之和
 *   effectiveIn      inputTokens + cacheReadTokens
 *   peakContext      每步 (inputTokens + cacheReadTokens) 的最大值
 *   逐文件聚合后做「目录合计」：steps/input/cacheRead/output 求和，effectiveIn=合计input+合计cacheRead，
 *   peakContext=各文件 peakContext 的最大值 —— 与 `session_tokens.mjs` 目录模式六字段逐字段相等。
 *
 * 用法：
 *   node scripts/session_tokens_by_session.mjs <target> [--json] [--sum] [--cost] [--prices <f>]
 *   node scripts/session_tokens_by_session.mjs --scenario <scenario.manifest.json> [--json] [--sum] [--cost] [--target <root>]
 *   node scripts/session_tokens_by_session.mjs --self-test
 *   node scripts/session_tokens_by_session.mjs --help
 *
 *   <target> 可为：会话树「目录」（递归查找其下所有 `session.v4.jsonl.zstd`）、workspace 根、或单个 .zstd 文件。
 *   相对路径按当前工作目录解析。
 *
 * 场景映射（scenario manifest）两种方式：
 *   1) 隔离 workspace 根：评测每个场景跑在唯一 cwd，则其 sessions 根（`~/.dsh/sessions/--<encoded>--`）
 *      只含本场景会话；直接把它当 <target>，再按场景根汇总即可。
 *   2) sidecar manifest：`{scenarioId, runId, workspaceRoot, capturedAt, sessionIds:[...]}`；`--scenario` 精确选会话。
 *      定位顺序：显式 <target>/`--target` → manifest.workspaceRoot → `~/.dsh/sessions`（回退）。
 *
 * 退出码：0 = 正常 / 自测通过；1 = 用法错误、路径/文件/解析错误、manifest/会话缺失、价格表缺失或未知模型、或 self-test 失败。
 *   坏路径 / 坏文件 / 未知会话一律给出人类可读原因（含路径 / 行号 / 缺失项）到 stderr，绝不静默吞。
 *
 * 只读：本脚本只读 `~/.dsh`（及其它 target），不写 `~/.dsh`、不改 DSH 内核。
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, isAbsolute, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';

const SESSION_FILE = 'session.v4.jsonl.zstd';
const METRIC_KEYS = ['steps', 'inputTokens', 'cacheReadTokens', 'outputTokens', 'effectiveIn', 'peakContext'];
const DISCLAIMER = '按配置单价派生，非 provider 实时账单';
const DEFAULT_PRICES_PATH = fileURLToPath(new URL('../config/model_prices.json', import.meta.url));

/** 非负安全整数化；非法/缺失归一为 0，避免 NaN 污染累加（与 session_tokens.mjs 一致）。 */
function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function resolvePath(p) {
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

/** 解压单个 zstd 文件为 utf8 文本；失败抛带路径的清晰错误。 */
function decompressFile(file) {
  if (typeof zlib.zstdDecompressSync !== 'function') {
    throw new Error(`当前 Node 不支持 zstd（需 Node ≥ 22.15，zlib.zstdDecompressSync 不可用）；当前 ${process.version}`);
  }
  let buf;
  try {
    buf = readFileSync(file);
  } catch (e) {
    throw new Error(`无法读取文件: ${file}: ${e.message}`);
  }
  try {
    return zlib.zstdDecompressSync(buf).toString('utf8');
  } catch (e) {
    throw new Error(`无法解压（非 zstd / 截断或损坏？）: ${file}: ${e.message}`);
  }
}

/** 递归查找目录下所有 session.v4.jsonl.zstd（稳定排序）。 */
function findZstdFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch (e) {
      throw new Error(`无法读取目录: ${d}: ${e.message}`);
    }
    for (const ent of entries) {
      const full = join(d, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile() && ent.name === SESSION_FILE) out.push(full);
    }
  }
  return out.sort();
}

/** 枚举 target（文件或目录）为会话文件列表；目录为空时报错。 */
function enumerateFiles(target) {
  const p = resolvePath(target);
  if (!existsSync(p)) throw new Error(`路径不存在: ${p}`);
  let st;
  try {
    st = statSync(p);
  } catch (e) {
    throw new Error(`无法访问路径: ${p}: ${e.message}`);
  }
  if (st.isDirectory()) {
    const files = findZstdFiles(p);
    if (files.length === 0) throw new Error(`目录下未找到 ${SESSION_FILE}: ${p}`);
    return { base: p, files };
  }
  return { base: p, files: [p] };
}

/** 由目录名推导规范化 sessionId（`session-<uuid>`）。 */
function sessionIdFromDir(dirName) {
  return dirName.startsWith('session-') ? dirName : `session-${dirName}`;
}

/**
 * 聚合单个会话文件。
 * 返回 { file, sessionId, mtime, sizeBytes, steps, inputTokens, cacheReadTokens, outputTokens,
 *        effectiveIn, peakContext, models }。
 * 坏 JSONL 抛 `JSON 解析失败: <file>:第 N 行: ...`（含文件 + 行号，与 session_tokens.mjs 一致，绝不静默吞）。
 */
function aggregateFile(file) {
  let st;
  try {
    st = statSync(file);
  } catch (e) {
    throw new Error(`无法访问文件: ${file}: ${e.message}`);
  }
  const text = decompressFile(file);
  const lines = text.split('\n');

  let steps = 0;
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  let peakContext = 0;
  let recordSessionId = null;
  const models = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // 跳过空行（含尾部空行）
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      // 逐条容错但绝不静默吞掉：指出文件 + 行号并以非零退出，避免口径悄悄漂移。
      throw new Error(`JSON 解析失败: ${file}:第 ${i + 1} 行: ${e.message}`);
    }
    if (!obj) continue;
    if (obj.type === 'session' && obj.id && !recordSessionId) {
      recordSessionId = String(obj.id);
    }
    if (obj.type === 'request/header') {
      const m = obj.data && obj.data.header && obj.data.header.config && obj.data.header.config.model;
      if (m) models.add(String(m));
    }
    if (obj.type !== 'assistant/message') continue; // 忽略非 assistant/message 记录
    const usage = (obj.data && obj.data.usage) || obj.usage; // 真实录音在 data.usage
    if (!usage) continue; // 带 assistant/message 但无 usage 的记录不计步

    const it = toInt(usage.inputTokens);
    const cr = toInt(usage.cacheReadTokens);
    const ot = toInt(usage.outputTokens);
    steps += 1;
    inputTokens += it;
    cacheReadTokens += cr;
    outputTokens += ot;
    const eff = it + cr; // 每步 effectiveIn
    if (eff > peakContext) peakContext = eff;
  }

  const dirName = basename(dirname(file));
  const sessionId = recordSessionId
    ? (recordSessionId.startsWith('session-') ? recordSessionId : `session-${recordSessionId}`)
    : sessionIdFromDir(dirName);

  return {
    file,
    sessionId,
    mtime: new Date(st.mtimeMs).toISOString(),
    sizeBytes: st.size,
    steps,
    inputTokens,
    cacheReadTokens,
    outputTokens,
    effectiveIn: inputTokens + cacheReadTokens,
    peakContext,
    models: [...models].sort(),
  };
}

/** 由 per-file 聚合求「目录合计」（与 session_tokens.mjs 目录模式六字段逐字段相等）。 */
function combineTotals(items) {
  let steps = 0;
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  let peakContext = 0;
  for (const s of items) {
    steps += s.steps;
    inputTokens += s.inputTokens;
    cacheReadTokens += s.cacheReadTokens;
    outputTokens += s.outputTokens;
    if (s.peakContext > peakContext) peakContext = s.peakContext;
  }
  return {
    sessionCount: items.length,
    files: items.length,
    steps,
    inputTokens,
    cacheReadTokens,
    outputTokens,
    effectiveIn: inputTokens + cacheReadTokens,
    peakContext,
  };
}

/** 读取并校验价格表。缺失 / 坏 JSON / 无 models → 明确报错（不静默）。 */
function loadPrices(pricesPath) {
  const p = resolvePath(pricesPath);
  if (!existsSync(p)) throw new Error(`价格表缺失 / 不可读: ${p}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`价格表 JSON 解析失败: ${p}: ${e.message}`);
  }
  if (!raw || typeof raw.models !== 'object' || raw.models === null) {
    throw new Error(`价格表格式错误（缺少 models 对象）: ${p}`);
  }
  return { path: p, models: raw.models, currency: raw._currency || 'USD', unit: raw._unit || 'per token' };
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

/**
 * 为单个会话派生 cost（按配置单价）。未知模型 → 抛错（不静默）；多模型 → cost=null 并标明残余（避免误价）。
 * 返回 { cost, costNote }。
 */
function costForSession(session, prices) {
  const models = session.models || [];
  if (models.length === 0) {
    return { cost: null, costNote: '无 request/header 模型信息，未计价（残余，非 0）' };
  }
  if (models.length > 1) {
    return { cost: null, costNote: `多模型会话 (${models.join(' | ')})，按单一价派生会误价 → 未计价（残余）` };
  }
  const model = models[0];
  const entry = prices.models[model];
  if (!entry) {
    throw new Error(`model_prices.json 缺少模型 "${model}" 的单价（未知模型，不静默）; 价格表: ${prices.path}`);
  }
  const ip = Number(entry.inputPer1M);
  const cp = Number(entry.cacheReadPer1M);
  const op = Number(entry.outputPer1M);
  if (![ip, cp, op].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new Error(`模型 "${model}" 单价非法（inputPer1M/cacheReadPer1M/outputPer1M 需为非负数字）; 价格表: ${prices.path}`);
  }
  const inputCost = (session.inputTokens / 1e6) * ip;
  const cacheReadCost = (session.cacheReadTokens / 1e6) * cp;
  const outputCost = (session.outputTokens / 1e6) * op;
  const cost = {
    model,
    currency: prices.currency,
    inputCost: round6(inputCost),
    cacheReadCost: round6(cacheReadCost),
    outputCost: round6(outputCost),
    totalCost: round6(inputCost + cacheReadCost + outputCost),
  };
  return { cost, costNote: null };
}

/** 对一组会话做 cost 汇总（含未计价残余计数）。 */
function costTotals(sessions, prices) {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  for (const s of sessions) {
    if (s.cost) {
      total += s.cost.totalCost;
      priced += 1;
    } else {
      unpriced += 1;
    }
  }
  return { currency: prices.currency, totalCost: round6(total), pricedSessions: priced, unpricedSessions: unpriced };
}

function aggregateTarget(target) {
  const { base, files } = enumerateFiles(target);
  const sessions = files.map(aggregateFile);
  sessions.sort((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0));
  const total = combineTotals(sessions);
  return { base, sessions, total };
}

/* ------------------------------ scenario ------------------------------ */

function readManifest(manifestPath) {
  const p = resolvePath(manifestPath);
  if (!existsSync(p)) throw new Error(`manifest 路径不存在: ${p}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`manifest JSON 解析失败: ${p}: ${e.message}`);
  }
  if (!raw || typeof raw !== 'object') throw new Error(`manifest 格式错误（非对象）: ${p}`);
  const missing = [];
  if (!raw.scenarioId) missing.push('scenarioId');
  if (!raw.runId) missing.push('runId');
  if (!raw.workspaceRoot) missing.push('workspaceRoot');
  if (!raw.capturedAt) missing.push('capturedAt');
  if (!Array.isArray(raw.sessionIds) || raw.sessionIds.length === 0) missing.push('sessionIds(非空数组)');
  if (missing.length) throw new Error(`manifest 缺少必需字段: ${missing.join(', ')} (${p})`);
  return { path: p, data: raw };
}

/** 从若干根目录收集会话文件并构建 sessionId → file 索引（目录名推导，廉价，不预先解压）。 */
function indexPathMap(roots) {
  const map = new Map();
  for (const root of roots) {
    const p = resolvePath(root);
    if (!existsSync(p)) continue;
    let files = [];
    try {
      const st = statSync(p);
      files = st.isDirectory() ? findZstdFiles(p) : [p];
    } catch {
      continue;
    }
    for (const f of files) {
      const id = sessionIdFromDir(basename(dirname(f)));
      if (!map.has(id)) map.set(id, f);
    }
  }
  return map;
}

function buildScenario(manifestPath, opts) {
  const { path: mp, data } = readManifest(manifestPath);
  const requested = data.sessionIds.map((x) => String(x));

  const primaryRoots = [];
  if (opts.target) primaryRoots.push(opts.target);
  if (data.workspaceRoot) primaryRoots.push(data.workspaceRoot);
  let map = indexPathMap(primaryRoots);

  let missing = requested.filter((id) => !map.has(id));
  if (missing.length) {
    // 回退：全局扫 ~/.dsh/sessions 找缺失会话
    const home = process.env.HOME;
    const globalRoots = home ? [join(home, '.dsh', 'sessions')] : [];
    const gmap = indexPathMap(globalRoots);
    for (const id of missing) if (!map.has(id) && gmap.has(id)) map.set(id, gmap.get(id));
    missing = requested.filter((id) => !map.has(id));
  }
  if (missing.length) {
    throw new Error(`scenario "${data.scenarioId}" 指定的会话未找到（不静默）: ${missing.join(', ')}; manifest: ${mp}`);
  }

  const sessions = requested.map((id) => {
    const s = aggregateFile(map.get(id));
    if (s.sessionId !== id) {
      // 目录名推导 id 与文件内 id 不一致：以文件内为准并告警，仍视为匹配到该请求
      s._requestedId = id;
    }
    return s;
  });
  sessions.sort((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0));
  const total = combineTotals(sessions);
  return { base: mp, scenario: { scenarioId: data.scenarioId, runId: data.runId }, sessions, total };
}

/* ------------------------------ 输出 ------------------------------ */

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function printTable(result, costOn) {
  const rows = [['sessionId', 'steps', 'input', 'cacheRead', 'output', 'effectiveIn', 'peak', 'sizeBytes', 'mtime']];
  for (const s of result.sessions) {
    rows.push([s.sessionId, s.steps, s.inputTokens, s.cacheReadTokens, s.outputTokens, s.effectiveIn, s.peakContext, s.sizeBytes, s.mtime]);
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  console.log('per-session token / 步数 归因');
  console.log('='.repeat(80));
  if (result.scenario) console.log(`场景: ${result.scenario.scenarioId}  runId: ${result.scenario.runId}`);
  console.log(`target: ${result.base}`);
  console.log(`会话数: ${result.total.sessionCount}（${SESSION_FILE}）\n`);
  for (const r of rows) console.log(r.map((c, i) => pad(c, widths[i])).join('  '));
  if (costOn) {
    console.log('\ncost（' + DISCLAIMER + '；单位: ' + (result._pricesUnit || '') + '，币种: ' + (result._pricesCurrency || '') + '）');
    for (const s of result.sessions) {
      const c = s.cost;
      if (c) {
        console.log(`  ${pad(s.sessionId, widths[0])}  model=${c.model}  input=${c.inputCost}  cacheRead=${c.cacheReadCost}  output=${c.outputCost}  total=${c.totalCost} ${c.currency}`);
      } else {
        console.log(`  ${pad(s.sessionId, widths[0])}  未计价: ${s.costNote}`);
      }
    }
  }
}

function printTotals(result, costOn) {
  const t = result.total;
  const label = result.scenario ? `场景 ${result.scenario.scenarioId} 合计` : '目录合计';
  console.log(`${label}（${t.sessionCount} 会话 / ${t.files} 文件）`);
  console.log('='.repeat(52));
  for (const k of METRIC_KEYS) console.log(`${pad(k + ':', 16)} ${t[k]}`);
  if (costOn && result.costTotals) {
    const c = result.costTotals;
    console.log(`${pad('totalCost:', 16)} ${c.totalCost} ${c.currency}  (${c.pricedSessions} 已计价 / ${c.unpricedSessions} 未计价残余)  —— ${DISCLAIMER}`);
  }
}

function toJson(result, costOn) {
  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: result.base,
    ...(result.scenario ? { scenario: result.scenario } : {}),
    sessions: result.sessions.map((s) => ({
      sessionId: s.sessionId,
      file: s.file,
      mtime: s.mtime,
      sizeBytes: s.sizeBytes,
      steps: s.steps,
      inputTokens: s.inputTokens,
      cacheReadTokens: s.cacheReadTokens,
      outputTokens: s.outputTokens,
      effectiveIn: s.effectiveIn,
      peakContext: s.peakContext,
      ...(costOn ? { model: s.models.length === 1 ? s.models[0] : null, cost: s.cost, costNote: s.costNote } : {}),
    })),
    total: { ...result.total },
  };
  if (costOn) {
    out.cost = {
      disclaimer: DISCLAIMER,
      unit: result._pricesUnit,
      currency: result._pricesCurrency,
      source: result._pricesPath,
      totals: result.costTotals,
    };
  }
  return out;
}

/* ------------------------------ self-test ------------------------------ */

function selfTest() {
  if (typeof zlib.zstdCompressSync !== 'function') {
    console.error(`SELF-TEST FAIL: 需要 Node ≥ 22.15（缺少 zlib.zstdCompressSync），当前 ${process.version}`);
    return 1;
  }
  const tmpBase = process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  const tmp = mkdtempSync(join(tmpBase, 'stbs-'));
  const checks = [];
  const ok = (name) => checks.push(name);
  const eq = (a, b, msg) => {
    if (a !== b) throw new Error(`${msg}: got ${a} != expect ${b}`);
  };
  const zeroAction = (fn, needle, msg) => {
    let threw = false;
    let err = '';
    try {
      fn();
    } catch (e) {
      threw = true;
      err = e.message;
    }
    if (!threw) throw new Error(`${msg}: 未抛错（应非零/报错，不静默）`);
    if (needle && !new RegExp(needle).test(err)) throw new Error(`${msg}: 错误信息未含 ${needle} → ${err}`);
  };
  try {
    const compress = (records) => zlib.zstdCompressSync(Buffer.from(records.map((r) => JSON.stringify(r)).join('\n') + '\n\n', 'utf8'));
    const ws = join(tmp, 'ws');
    const dirA = join(ws, 'session-aaaa1111-0000');
    const dirB = join(ws, 'bbbb2222-0000');
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    const recA = [
      { type: 'session', version: 4, id: 'aaaa1111-0000' },
      { type: 'request/header', data: { header: { config: { model: 'test/model-a' } } } },
      { type: 'user/message', data: { message: 'hi' } },
      { type: 'assistant/message', data: { usage: { inputTokens: 100, cacheReadTokens: 900, outputTokens: 50 } } }, // eff1000
      { type: 'assistant/message', data: { usage: { inputTokens: 200, cacheReadTokens: 1800, outputTokens: 70 } } }, // eff2000 peak
      { type: 'assistant/message', data: { message: 'no usage' } }, // 忽略
    ];
    const recB = [
      { type: 'session', version: 4, id: 'bbbb2222-0000' },
      { type: 'request/header', data: { header: { config: { model: 'test/model-a' } } } },
      { type: 'assistant/message', data: { usage: { inputTokens: 50, cacheReadTokens: 250, outputTokens: 30 } } }, // eff300 peak
      { type: 'assistant/message', data: { usage: { inputTokens: 10, cacheReadTokens: 90, outputTokens: 5 } } }, // eff100
    ];
    writeFileSync(join(dirA, SESSION_FILE), compress(recA));
    writeFileSync(join(dirB, SESSION_FILE), compress(recB));

    const expA = { steps: 2, inputTokens: 300, cacheReadTokens: 2700, outputTokens: 120, effectiveIn: 3000, peakContext: 2000 };
    const expB = { steps: 2, inputTokens: 60, cacheReadTokens: 340, outputTokens: 35, effectiveIn: 400, peakContext: 300 };
    const expTotal = { steps: 4, inputTokens: 360, cacheReadTokens: 3040, outputTokens: 155, effectiveIn: 3400, peakContext: 2000 };

    // 1) 单会话文件聚合 == 手算
    const ga = aggregateFile(join(dirA, SESSION_FILE));
    eq(ga.sessionId, 'session-aaaa1111-0000', 'A.sessionId');
    for (const k of METRIC_KEYS) eq(ga[k], expA[k], `A.${k}`);
    ok('单会话六字段手算相等');

    // 2) 目录合计 == 手算 & sum(steps)==total.steps（无重复计数）
    const res = aggregateTarget(ws);
    eq(res.sessions.length, 2, 'sessions.length');
    for (const k of METRIC_KEYS) eq(res.total[k], expTotal[k], `total.${k}`);
    eq(res.sessions.reduce((a, s) => a + s.steps, 0), res.total.steps, 'sum(steps)==total.steps');
    ok('目录合计六字段相等 + sum(steps)==total.steps');

    // 3) 单会话目录（只含 A）聚合 == A 单文件 == 手算（AC1 结构）
    const resA = aggregateTarget(dirA);
    for (const k of METRIC_KEYS) eq(resA.total[k], expA[k], `resA.total.${k}`);
    ok('单会话目录聚合 == 单文件（AC1 结构）');

    // 4) 坏 JSONL → 非零 + 文件:行号
    const badDir = join(tmp, 'bad');
    mkdirSync(badDir, { recursive: true });
    const badFile = join(badDir, SESSION_FILE);
    writeFileSync(badFile, zlib.zstdCompressSync(Buffer.from('{"type":"assistant/message"\n', 'utf8')));
    zeroAction(() => aggregateFile(badFile), 'JSON 解析失败.*第 \\d+ 行', '坏 JSONL');
    ok('坏 JSONL 报 文件:行号');

    // 5) scenario 正常汇总
    const manifest = join(tmp, 'scenario.manifest.json');
    writeFileSync(manifest, JSON.stringify({ scenarioId: 'S1', runId: 'R1', workspaceRoot: ws, capturedAt: new Date().toISOString(), sessionIds: ['session-aaaa1111-0000'] }));
    const sc = buildScenario(manifest, { target: ws });
    eq(sc.sessions.length, 1, 'scenario.sessions.length');
    for (const k of METRIC_KEYS) eq(sc.total[k], expA[k], `scenario.total.${k}`);
    ok('--scenario 只汇总指定会话');

    // 6) 未知 scenario 会话 → 非零 + 报缺失项
    const manifestMiss = join(tmp, 'miss.manifest.json');
    writeFileSync(manifestMiss, JSON.stringify({ scenarioId: 'S2', runId: 'R2', workspaceRoot: ws, capturedAt: new Date().toISOString(), sessionIds: ['session-nope-9999'] }));
    zeroAction(() => buildScenario(manifestMiss, { target: ws }), 'session-nope-9999', '未知 sessionId');
    ok('未知 sessionId 报缺失项');

    // 7) cost 派生 + 标注；未知模型报错；价格表缺失报错
    const pricesPath = join(tmp, 'prices.json');
    writeFileSync(pricesPath, JSON.stringify({ _currency: 'USD', _unit: 'USD per 1,000,000 tokens', models: { 'test/model-a': { inputPer1M: 1000000, cacheReadPer1M: 0, outputPer1M: 2000000 } } }));
    const prices = loadPrices(pricesPath);
    const ca = costForSession(ga, prices);
    // input 300/1e6*1e6=300 ; output 120/1e6*2e6=240 ; total=540
    eq(ca.cost.inputCost, 300, 'cost.inputCost');
    eq(ca.cost.outputCost, 240, 'cost.outputCost');
    eq(ca.cost.totalCost, 540, 'cost.totalCost');
    ok('cost 按配置单价派生');

    // 未知模型：用只含别的模型的价表
    const pricesOther = join(tmp, 'prices-other.json');
    writeFileSync(pricesOther, JSON.stringify({ models: { 'x/y': { inputPer1M: 1, cacheReadPer1M: 1, outputPer1M: 1 } } }));
    zeroAction(() => costForSession(ga, loadPrices(pricesOther)), '缺少模型', '未知模型');
    ok('未知模型明确报错');

    zeroAction(() => loadPrices(join(tmp, 'nope.json')), '价格表缺失', '价格表缺失');
    ok('价格表缺失明确报错');

    console.log('[self-test] ' + checks.join(' | '));
    console.log(`SELF-TEST OK（合成 zstd fixture 离线自证：${checks.length} 项全过；未触碰真实会话 / 未联网 / 未写 ~/.dsh）`);
    return 0;
  } catch (e) {
    console.error('SELF-TEST FAIL: ' + e.message);
    return 1;
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------ help / main ------------------------------ */

function usage() {
  console.log(`session_tokens_by_session.mjs — 逐会话 token / 步数 / cost 归因（零依赖，仅 node:fs/node:path/node:zlib）

用法:
  node scripts/session_tokens_by_session.mjs <target> [--json] [--sum] [--cost] [--prices <file>]
  node scripts/session_tokens_by_session.mjs --scenario <scenario.manifest.json> [--json] [--sum] [--cost] [--target <root>]
  node scripts/session_tokens_by_session.mjs --self-test
  node scripts/session_tokens_by_session.mjs --help

参数:
  <target>          会话树「目录」（递归查找其下所有 ${SESSION_FILE}）/ workspace 根 / 单个 .zstd 文件。
  --scenario <f>    按 scenario.manifest.json 精确选会话（schema: {scenarioId, runId, workspaceRoot, capturedAt, sessionIds:[...]}）。
  --target <root>   scenario 模式下用于定位会话文件的根（缺省：manifest.workspaceRoot → ~/.dsh/sessions）。
  --json            机读 JSON：sessions[] + total（六字段）+（--cost 时）cost{disclaimer,...}。
  --sum             只打印「合计」（与目录模式 session_tokens.mjs 六字段对齐）。
  --cost            读取 config/model_prices.json 派生 cost，并显式标注「${DISCLAIMER}」。
  --prices <f>      覆盖价格表路径（默认 config/model_prices.json）。
  --self-test       合成 zstd fixture 离线自证（红/绿）；不依赖真实会话、不联网。
  --help, -h        打印本帮助。

口径（与 session_tokens.mjs 逐字段一致）:
  steps / inputTokens / cacheReadTokens / outputTokens / effectiveIn(=input+cacheRead) / peakContext(每步 input+cacheRead 的最大值)
  逐文件聚合后合计：steps/input/cacheRead/output 求和，effectiveIn=Σinput+ΣcacheRead，peakContext=max(各文件 peak)。
  故目录合计与 session_tokens.mjs 目录模式六字段逐字段相等（口径无损回归），且 sum(per-session.steps)==合计.steps。

场景映射（1 隔离 workspace 根 / 2 sidecar manifest）:
  1) 每场景跑在唯一 cwd → 其 sessions 根只含本场景会话，直接作为 <target> 汇总。
  2) 写 scenario.manifest.json，用 --scenario 精确选 sessionIds；缺失会话会明确报错（不静默）。

cost: 单价来自 config/model_prices.json（占位/可配置）；tokens × 单价派生，非 provider 实时账单。
      未知模型 / 价格表缺失明确报错（不静默）；多模型会话不单一计价（标残余）。

退出码: 0 = 正常 / 自测通过；1 = 用法/路径/解析错误、manifest 或会话缺失、价格表缺失或未知模型、self-test 失败。`);
}

function parseArgs(argv) {
  const opts = { json: false, sum: false, cost: false, prices: null, scenario: null, target: null, help: false, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--self-test') opts.selfTest = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--sum') opts.sum = true;
    else if (a === '--cost') opts.cost = true;
    else if (a === '--prices') {
      if (i + 1 >= argv.length) throw new Error('--prices 缺少参数');
      opts.prices = argv[++i];
    } else if (a === '--scenario') {
      if (i + 1 >= argv.length) throw new Error('--scenario 缺少参数');
      opts.scenario = argv[++i];
    } else if (a === '--target') {
      if (i + 1 >= argv.length) throw new Error('--target 缺少参数');
      opts.target = argv[++i];
    } else if (a.startsWith('--')) {
      throw new Error('未知参数: ' + a + '（用 --help 查看用法）');
    } else if (opts.target === null) {
      opts.target = a;
    } else {
      throw new Error('多余的参数: ' + a + '（一次只处理一个 target；scenario 模式用 --target 指定根）');
    }
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error('错误: ' + e.message);
    return 1;
  }
  if (opts.help) {
    usage();
    return 0;
  }
  if (opts.selfTest) return selfTest();

  if (typeof zlib.zstdDecompressSync !== 'function') {
    console.error(`本脚本需要 Node ≥ 22.15（缺少 zlib.zstdDecompressSync）。当前 ${process.version}`);
    return 1;
  }

  let result;
  try {
    if (opts.scenario) {
      if (!opts.target) {
        // 允许 manifest 模式无显式 target；buildScenario 会用 workspaceRoot / ~/.dsh 回退
      }
      result = buildScenario(opts.scenario, { target: opts.target });
    } else {
      if (!opts.target) {
        console.error('缺少输入路径（会话树目录 / workspace 根 / 单个 .zstd）或 --scenario <manifest>；用 --help 查看用法。');
        return 1;
      }
      result = aggregateTarget(opts.target);
    }

    if (opts.cost) {
      const prices = loadPrices(opts.prices || DEFAULT_PRICES_PATH);
      for (const s of result.sessions) {
        const { cost, costNote } = costForSession(s, prices);
        s.cost = cost;
        s.costNote = costNote;
      }
      result.costTotals = costTotals(result.sessions, prices);
      result._pricesPath = prices.path;
      result._pricesUnit = prices.unit;
      result._pricesCurrency = prices.currency;
    }
  } catch (e) {
    console.error('错误: ' + e.message);
    return 1;
  }

  if (opts.json) {
    console.log(JSON.stringify(toJson(result, opts.cost), null, 2));
  } else if (opts.sum) {
    printTotals(result, opts.cost);
  } else {
    printTable(result, opts.cost);
    console.log('');
    printTotals(result, opts.cost);
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
