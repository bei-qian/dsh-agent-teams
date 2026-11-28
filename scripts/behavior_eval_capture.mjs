#!/usr/bin/env node
/**
 * behavior_eval_capture.mjs — 评测证据采集「接线」脚本（story-073 · epic-025）。
 *
 * 目标：**跑一次即自动**把某场景的 ① per-session token/cost 报告（#1）
 * ② 原始 trace sha256 manifest（#2）落到该场景目录，闭环 report.md §6.2 的 open item #1/#2。
 *
 * 本脚本**只编排、不重算**：内部**原样 spawn** 既有两工具，产物字段/口径与直跑完全一致：
 *   - `session_tokens_by_session.mjs`（#1，story-070）：per-session token/cost 归因。
 *   - `session_trace_manifest.mjs`（#2，story-071）：trace sha256 manifest + `--verify`。
 * 本脚本不改两工具任何输出字段，不 reserve 第二套口径。
 *
 * 用法：
 *   node scripts/behavior_eval_capture.mjs --scenario <scenarioDir> [--manifest <scenario.manifest.json>] [--out <dir>] [--json] [--no-cost]
 *   node scripts/behavior_eval_capture.mjs --self-test
 *   node scripts/behavior_eval_capture.mjs --help
 *
 *   --scenario <dir>   场景目录（内含 scenario.manifest.json；默认 out=该目录）。
 *   --manifest <f>     覆盖场景 manifest 路径（默认 <scenarioDir>/scenario.manifest.json）。
 *   --out <dir>        产物输出目录（默认 = scenarioDir）。
 *   --json             把采集结果摘要打成 JSON 到 stdout。
 *   --no-cost          不派生 cost（默认派生，需 config/model_prices.json）。
 *   --self-test        离线合成 zstd fixture 自证（红/绿），不依赖真实会话、不联网。
 *   --help, -h         打印本帮助。
 *
 * 产物（默认落到场景目录）：
 *   <out>/session-tokens.json   ① per-session token/cost 报告（= 直跑 `--scenario <manifest> --json --sum --cost` 原样输出）。
 *   <out>/trace-manifest.json   ② trace sha256 manifest（= 直跑 `session_trace_manifest.mjs <session 目录> --out ...` 原样输出）。
 *
 * manifest（场景→会话映射，schema，与两工具共用）：
 *   { scenarioId, runId, workspaceRoot, capturedAt, sessionIds:[...] }（允许附加只读注解字段，如 mapping/note）。
 *
 * 定位会话文件：以 manifest.workspaceRoot 为主根，缺失时回退 `~/.dsh/sessions`（与 session_tokens_by_session.mjs 一致）。
 *   逐 sessionId 解析真实 `session.v4.jsonl.zstd`；任一缺失即非零并「点名」缺失 sessionId（不静默、不写残缺产物）。
 *
 * 原子性（AC4）：先完成全部校验与两工具调用（trace 写到临时文件并 `--verify` 自校验），
 *   全部成功后才一次性写 <out> 下两产物；任一步失败 → 非零退出 + 点名原因 + 清理临时文件、**不留半成品/空证据**。
 *
 * 红线：只读源 trace（只读 ~/.dsh，绝不写 ~/.dsh、不改 DSH 内核、不 commit）；不引入第三方依赖、不联网；
 *   不臆造证据——映射若为启发式须在 manifest/文档显式标注、trace 不可得须显式标缺。
 *
 * 运行时依赖：Node ≥ 22.15（zlib.zstdDecompressSync；自测另需 zstdCompressSync）。
 * 退出码：0 = 正常 / 自测通过；1 = 用法/manifest/会话缺失/工具失败/自校验失败/自测失败。
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
  mkdirSync,
  rmSync,
  mkdtempSync,
  linkSync,
  copyFileSync,
} from 'node:fs';
import { join, resolve, isAbsolute, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

const SESSION_FILE = 'session.v4.jsonl.zstd';
const SCENARIO_MANIFEST = 'scenario.manifest.json';
const TOKENS_TOOL = fileURLToPath(new URL('./session_tokens_by_session.mjs', import.meta.url));
const TRACE_TOOL = fileURLToPath(new URL('./session_trace_manifest.mjs', import.meta.url));
const TOKENS_OUT = 'session-tokens.json';
const TRACE_OUT = 'trace-manifest.json';
const SIX_KEYS = ['steps', 'inputTokens', 'cacheReadTokens', 'outputTokens', 'effectiveIn', 'peakContext'];
const ADDITIVE_KEYS = ['steps', 'inputTokens', 'cacheReadTokens', 'outputTokens'];

function resolvePath(p) {
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

function tmpBase() {
  return process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
}

/** 递归查找目录下所有 session.v4.jsonl.zstd（稳定排序，绝对路径）。 */
function findZstdFiles(dir) {
  const root = resolvePath(dir);
  const out = [];
  const stack = [root];
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

/** 目录名 → 规范化 sessionId（`session-<uuid>`），与 session_tokens_by_session.mjs 一致。 */
function sessionIdFromDir(dirName) {
  return dirName.startsWith('session-') ? dirName : `session-${dirName}`;
}

/** 校验并读取场景 manifest（缺字段即抛，点名缺项）。 */
function readManifestStrict(manifestPath) {
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

/** 从若干根目录建 sessionId → file 索引（目录名推导，与 token 工具口径一致）。 */
function indexPathMap(roots) {
  const map = new Map();
  for (const root of roots) {
    if (!root) continue;
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

/**
 * 解析 manifest.sessionIds 对应的真实会话文件（以 workspaceRoot 为主根，回退 ~/.dsh/sessions）。
 * 缺失 → 抛错点名缺失 sessionId（不静默）。返回 { id → file }。
 */
function resolveSessionFiles(data) {
  const requested = data.sessionIds.map((x) => sessionIdFromDir(String(x)));
  const roots = [data.workspaceRoot];
  const home = process.env.HOME;
  if (home) roots.push(join(home, '.dsh', 'sessions'));
  const map = indexPathMap(roots);
  const missing = requested.filter((id) => !map.has(id));
  if (missing.length) {
    throw new Error(`scenario "${data.scenarioId}" 指定的会话未找到（不静默）: ${missing.join(', ')}; manifest 会话根=${data.workspaceRoot}`);
  }
  const out = new Map();
  for (const id of requested) out.set(id, map.get(id));
  return { requested, files: out };
}

/** 找「恰好只含这些会话文件」的最深祖先目录，作 trace 工具 target（保留真实 sourcePath）。找不到返回 null（需 staging）。 */
function pickTraceTarget(selectedFiles) {
  const files = selectedFiles.map((f) => resolvePath(f)).sort();
  if (files.length === 0) return null;
  const want = new Set(files);
  let candidate = dirname(files[0]);
  // 从文件所在目录逐级上溯，取第一个「findZstdFiles == 精确选中集」的目录
  // 上限防御：最多上溯到 filesystem root
  while (true) {
    let matches = null;
    try {
      const found = findZstdFiles(candidate);
      matches = found.length === want.size && found.every((f) => want.has(f));
    } catch {
      matches = false;
    }
    if (matches) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

/** N>1 且无合适公共根时：建临时 staging（hardlink 布局 session-<id>/session.v4.jsonl.zstd + manifest）供 trace 工具扫描。 */
function stageHardlinks(files, data, tmpRoot) {
  const stage = join(tmpRoot, 'trace-stage');
  mkdirSync(stage, { recursive: true });
  const sessionIds = [];
  let i = 0;
  for (const f of files) {
    // 用「会话记录 id 或目录名」无法廉价取得时，顺序命名，避免与真实同名冲突；记录到 manifest。
    let sid = basename(dirname(f));
    if (!sid.startsWith('session-')) sid = `session-${sid}`;
    // 同名防御（不同根同名目录）：加序号
    while (sessionIds.includes(sid)) sid = `${sid}-${++i}`;
    sessionIds.push(sid);
    const dir = join(stage, sid);
    mkdirSync(dir, { recursive: true });
    linkSync(resolvePath(f), join(dir, SESSION_FILE));
  }
  const stageManifest = {
    scenarioId: data.scenarioId,
    runId: data.runId,
    workspaceRoot: stage,
    capturedAt: data.capturedAt,
    sessionIds,
    note: 'staging: trace target hardlinks（多会话无公共隔离根时的降级路径）',
  };
  writeFileSync(join(stage, SCENARIO_MANIFEST), JSON.stringify(stageManifest, null, 2) + '\n');
  return stage;
}

/** spawn 一个 node 工具，返回 { status, stdout, stderr }。 */
function spawnNode(toolPath, args) {
  const res = spawnSync(process.execPath, [toolPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw new Error(`无法启动工具 ${basename(toolPath)}: ${res.error.message}`);
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

/**
 * 核心采集：校验 → 解析会话 → 跑 token 工具（不改口径）→ 跑 trace 工具 + verify → 原子写两产物。
 * 任一步失败抛错（调用方不写任何产物）。返回 { scenarioId, runId, token, trace, tokenPath, tracePath, tokenRaw }。
 */
function runCapture(opts) {
  const scenarioDir = resolvePath(opts.scenarioDir);
  const manifestPath = resolvePath(opts.manifestPath || join(scenarioDir, SCENARIO_MANIFEST));
  const outDir = resolvePath(opts.outDir || scenarioDir);
  const cost = opts.cost !== false;

  const { path: mp, data } = readManifestStrict(manifestPath);
  const { requested, files } = resolveSessionFiles(data);
  const orderedFiles = requested.map((id) => files.get(id));

  // ① token 报告：原样调用 token 工具（--scenario 精确选会话）
  const tokArgs = ['--scenario', mp, '--json', '--sum'];
  if (cost) tokArgs.push('--cost');
  const tok = spawnNode(TOKENS_TOOL, tokArgs);
  if (tok.status !== 0) {
    throw new Error(`session_tokens_by_session.mjs 失败（exit ${tok.status}）: ${tok.stderr.trim() || tok.stdout.trim()}`);
  }
  let tokenJson;
  try {
    tokenJson = JSON.parse(tok.stdout);
  } catch (e) {
    throw new Error(`token 工具输出非合法 JSON: ${e.message}`);
  }
  // 内部一致性：逐会话六字段求和 == 场景合计（AC3「场景合计==逐会话求和」）
  if (!tokenJson.total || !Array.isArray(tokenJson.sessions)) throw new Error('token 工具输出缺少 total/sessions');
  if (tokenJson.sessions.length !== requested.length) {
    throw new Error(`token 报告会话数(${tokenJson.sessions.length}) != manifest 请求数(${requested.length})`);
  }
  for (const k of ADDITIVE_KEYS) {
    const sum = tokenJson.sessions.reduce((a, s) => a + Number(s[k] || 0), 0);
    if (sum !== Number(tokenJson.total[k])) {
      throw new Error(`token 一致性失败：Σsession.${k}=${sum} != total.${k}=${tokenJson.total[k]}`);
    }
  }
  const peak = Math.max(...tokenJson.sessions.map((s) => Number(s.peakContext || 0)));
  if (peak !== Number(tokenJson.total.peakContext)) {
    throw new Error(`token 一致性失败：max(session.peakContext)=${peak} != total.peakContext=${tokenJson.total.peakContext}`);
  }

  // ② trace manifest：定位「恰好只含本场景会话」的目录（保留真实 sourcePath），必要时 staging
  const tmpRoot = mkdtempSync(join(tmpBase(), 'bec-'));
  const tmpTrace = join(tmpRoot, TRACE_OUT);
  let traceTarget;
  let staged = false;
  try {
    traceTarget = pickTraceTarget(orderedFiles);
    if (!traceTarget) {
      traceTarget = stageHardlinks(orderedFiles, data, tmpRoot);
      staged = true;
    }
    const tr = spawnNode(TRACE_TOOL, [
      traceTarget,
      '--out',
      tmpTrace,
      '--scenario',
      String(data.scenarioId),
      '--run',
      String(data.runId),
    ]);
    if (tr.status !== 0) {
      throw new Error(`session_trace_manifest.mjs 失败（exit ${tr.status}）: ${tr.stderr.trim() || tr.stdout.trim()}`);
    }
    if (!existsSync(tmpTrace)) throw new Error('trace 工具未产出 manifest 文件');
    const traceRaw = readFileSync(tmpTrace, 'utf8');
    let traceJson;
    try {
      traceJson = JSON.parse(traceRaw);
    } catch (e) {
      throw new Error(`trace manifest 非合法 JSON: ${e.message}`);
    }
    // trace 生成后立刻自校验（sha256 / decompressedSha256 / lineCount 一致 → exit 0）
    const ver = spawnNode(TRACE_TOOL, ['--verify', tmpTrace]);
    if (ver.status !== 0) {
      throw new Error(`trace 自校验失败（exit ${ver.status}）: ${ver.stderr.trim() || ver.stdout.trim()}`);
    }
    // 全部成功 → 原子写两产物到 outDir
    mkdirSync(outDir, { recursive: true });
    const tokenPath = join(outDir, TOKENS_OUT);
    const tracePath = join(outDir, TRACE_OUT);
    writeFileSync(tokenPath, tok.stdout.endsWith('\n') ? tok.stdout : tok.stdout + '\n');
    writeFileSync(tracePath, traceRaw.endsWith('\n') ? traceRaw : traceRaw + '\n');
    return { scenarioId: data.scenarioId, runId: data.runId, token: tokenJson, trace: traceJson, tokenPath, tracePath, traceTarget, staged };
  } finally {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------ self-test ------------------------------ */

function selfTest() {
  if (typeof zlib.zstdCompressSync !== 'function') {
    console.error(`SELF-TEST FAIL: 需要 Node ≥ 22.15（缺少 zlib.zstdCompressSync），当前 ${process.version}`);
    return 1;
  }
  const tmp = mkdtempSync(join(tmpBase(), 'bec-selftest-'));
  const checks = [];
  const ok = (name) => checks.push(name);
  const expectThrow = (fn, needle, msg) => {
    let threw = false;
    let err = '';
    try {
      fn();
    } catch (e) {
      threw = true;
      err = e.message;
    }
    if (!threw) throw new Error(`${msg}: 未抛错（应非零/报错，不静默）`);
    if (needle && !new RegExp(needle).test(err)) throw new Error(`${msg}: 错误未含 ${needle} → ${err}`);
  };
  const compress = (records) => zlib.zstdCompressSync(Buffer.from(records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8'));

  try {
    const makeSession = (parent, name, id, steps) => {
      const dir = join(parent, name);
      mkdirSync(dir, { recursive: true });
      const recs = [{ type: 'session', version: 4, id }];
      recs.push({ type: 'request/header', data: { header: { config: { model: 'workbuddy/deepseek-v4.1-flash' } } } });
      let i = 0;
      for (const [it, cr, ot] of steps) {
        recs.push({ type: 'assistant/message', time: 1000 + i++, data: { usage: { inputTokens: it, cacheReadTokens: cr, outputTokens: ot } } });
      }
      writeFileSync(join(dir, SESSION_FILE), compress(recs));
      return { dir, file: join(dir, SESSION_FILE) };
    };
    const writeManifest = (path, obj) => writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');

    // ---- 场景 1：双会话（标准隔离根布局 session-<uuid>/...）----
    const sc1 = join(tmp, 'scenario-1');
    makeSession(sc1, 'session-aaaa1111', 'session-aaaa1111', [[100, 900, 50], [200, 1800, 70]]); // eff 1000/2000 peak 2000
    makeSession(sc1, 'session-bbbb2222', 'session-bbbb2222', [[50, 250, 30], [10, 90, 5]]); // eff 300/100
    const man1 = join(sc1, SCENARIO_MANIFEST);
    writeManifest(man1, { scenarioId: 'scenario-1', runId: 'selftest', workspaceRoot: sc1, capturedAt: new Date().toISOString(), sessionIds: ['session-aaaa1111', 'session-bbbb2222'] });
    const out1 = join(tmp, 'out-1');
    const r1 = runCapture({ scenarioDir: sc1, outDir: out1 });
    if (r1.token.sessions.length !== 2) throw new Error('双会话 token 报告数量 != 2');
    const sumSteps = r1.token.sessions.reduce((a, s) => a + s.steps, 0);
    if (sumSteps !== r1.token.total.steps) throw new Error('Σsteps != total.steps');
    if (r1.token.total.steps !== 4) throw new Error(`steps 期望 4，实得 ${r1.token.total.steps}`);
    if (r1.token.total.peakContext !== 2000) throw new Error(`peak 期望 2000，实得 ${r1.token.total.peakContext}`);
    for (const s of r1.token.sessions) {
      if (!s.cost || typeof s.cost.totalCost !== 'number') throw new Error(`会话 ${s.sessionId} 缺 cost`);
    }
    const r1TraceSessions = r1.trace.scenarios[0].runs[0].sessions;
    if (r1TraceSessions.length !== 2) throw new Error('trace manifest 会话数 != 2');
    for (const s of r1TraceSessions) {
      for (const f of ['sessionId', 'sizeBytes', 'sha256', 'decompressedSha256', 'lineCount']) {
        if (s[f] === undefined) throw new Error(`trace 记录缺字段 ${f}`);
      }
    }
    // 产物已落盘且 verify 通过
    const ver1 = spawnNode(TRACE_TOOL, ['--verify', r1.tracePath]);
    if (ver1.status !== 0) throw new Error('自测 trace verify 应 exit 0: ' + ver1.stderr);
    ok('双会话：token 六字段+合计+cost 齐全、trace 字段齐全、verify exit0');

    // 单会话场景（N=1 路径）
    const sc2 = join(tmp, 'scenario-2');
    makeSession(sc2, 'session-cccc3333', 'session-cccc3333', [[100, 900, 50]]);
    writeManifest(join(sc2, SCENARIO_MANIFEST), { scenarioId: 'scenario-2', runId: 'selftest', workspaceRoot: sc2, capturedAt: new Date().toISOString(), sessionIds: ['session-cccc3333'] });
    const r2 = runCapture({ scenarioDir: sc2, outDir: join(tmp, 'out-2') });
    if (r2.token.sessions.length !== 1) throw new Error('单会话 token 数量 != 1');
    if (spawnNode(TRACE_TOOL, ['--verify', r2.tracePath]).status !== 0) throw new Error('单会话 verify 失败');
    ok('单会话：token+cost 齐全、trace verify exit0');

    // ---- 红：坏 manifest（缺 sessionIds）----
    const bad1 = join(tmp, 'bad1.json');
    writeFileSync(bad1, JSON.stringify({ scenarioId: 'x', runId: 'y', workspaceRoot: sc1, capturedAt: 'now', sessionIds: [] }));
    expectThrow(() => runCapture({ scenarioDir: sc1, manifestPath: bad1, outDir: join(tmp, 'o-bad1') }), 'sessionIds', '空 sessionIds');
    ok('红：空 sessionIds 非零并点名');

    // ---- 红：坏 JSON ----
    const bad2 = join(tmp, 'bad2.json');
    writeFileSync(bad2, '{ this is not json ');
    expectThrow(() => runCapture({ scenarioDir: sc1, manifestPath: bad2, outDir: join(tmp, 'o-bad2') }), 'JSON 解析失败', '坏 JSON');
    ok('红：坏 JSON 非零并点名');

    // ---- 红：缺失会话 → 点名缺失 sessionId，且不留产物 ----
    const bad3 = join(tmp, 'bad3.json');
    writeManifest(bad3, { scenarioId: 'x', runId: 'y', workspaceRoot: sc1, capturedAt: 'now', sessionIds: ['session-zzz-9999'] });
    const oBad3 = join(tmp, 'o-bad3');
    expectThrow(() => runCapture({ scenarioDir: sc1, manifestPath: bad3, outDir: oBad3 }), 'session-zzz-9999', '缺失会话');
    if (existsSync(join(oBad3, TRACE_OUT)) || existsSync(join(oBad3, TOKENS_OUT))) throw new Error('缺失会话后不应留下产物（半成品）');
    ok('红：缺失 sessionId 非零点名且不留半成品');

    // ---- 红：篡改 trace 1 字节 → verify 非零并点名 ----
    const s = r1TraceSessions[0];
    const srcBuf = readFileSync(s.sourcePath);
    const flipped = Buffer.from(srcBuf);
    flipped[Math.floor(flipped.length / 2)] ^= 0xff;
    writeFileSync(s.sourcePath, flipped); // 直接篡改 synthetic 源（仅 tmp）
    const verTamper = spawnNode(TRACE_TOOL, ['--verify', r1.tracePath]);
    if (verTamper.status === 0) throw new Error('篡改后 verify 不应 exit 0');
    if (!new RegExp(s.sessionId).test(verTamper.stderr)) throw new Error('篡改后 verify 未点名会话: ' + verTamper.stderr);
    writeFileSync(s.sourcePath, srcBuf); // 复原
    ok('红：篡改 1 字节 verify 非零并点名会话');

    console.log('[self-test] ' + checks.join(' | '));
    console.log(`SELF-TEST OK（合成 zstd fixture 离线自证：${checks.length} 项全过；两工具真实集成、未触碰真实会话 / 未联网 / 未写 ~/.dsh）`);
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
  console.log(`behavior_eval_capture.mjs — 评测证据采集接线（story-073）：跑一次自动产出 per-session token/cost + trace manifest

用法:
  node scripts/behavior_eval_capture.mjs --scenario <scenarioDir> [--manifest <scenario.manifest.json>] [--out <dir>] [--json] [--no-cost]
  node scripts/behavior_eval_capture.mjs --self-test
  node scripts/behavior_eval_capture.mjs --help

参数:
  --scenario <dir>   场景目录（默认从 <dir>/${SCENARIO_MANIFEST} 读映射；默认 out=<dir>）。
  --manifest <f>     覆盖场景 manifest 路径。
  --out <dir>        产物输出目录（默认 = scenarioDir）。
  --json             采集结果摘要打 JSON 到 stdout。
  --no-cost          不派生 cost（默认派生，读 config/model_prices.json）。
  --self-test        离线合成 zstd fixture 自证（红/绿）；不依赖真实会话、不联网。
  --help, -h         打印本帮助。

产物（默认落场景目录）:
  ${TOKENS_OUT}   ① per-session token/cost 报告（= 直跑 session_tokens_by_session.mjs --scenario <manifest> --json --sum --cost 原样输出）。
  ${TRACE_OUT}    ② trace sha256 manifest（= 直跑 session_trace_manifest.mjs <session 目录> --out ... 原样输出；生成后自动 --verify）。

manifest schema（与两工具共用，允许附加只读注解）:
  { scenarioId, runId, workspaceRoot, capturedAt, sessionIds:[...] }

口径: 接线只编排，不重算、不改两工具输出；token 六字段 steps/inputTokens/cacheReadTokens/outputTokens/effectiveIn/peakContext（+cost），
   trace 记录 sessionId/sizeBytes/sha256/decompressedSha256/lineCount/firstTs/lastTs。
原子性: 全部校验 + 两工具 + trace verify 成功后才写产物；失败 → 非零 + 点名 + 清理，绝不留半成品/空证据。

红线: 只读 ~/.dsh（绝不写）；不改 DSH 内核；不 commit；不引入第三方依赖、不联网；不臆造证据（启发式映射 / trace 不可得须显式标注）。
退出码: 0 = 正常 / 自测通过；1 = 用法/manifest/会话缺失/工具失败/自校验失败/自测失败。`);
}

function parseArgs(argv) {
  const opts = { scenario: null, manifest: null, out: null, json: false, cost: true, selfTest: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--self-test') opts.selfTest = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--no-cost') opts.cost = false;
    else if (a === '--scenario' || a.startsWith('--scenario=')) {
      opts.scenario = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      if (!opts.scenario) throw new Error('--scenario 缺少参数');
    } else if (a === '--manifest' || a.startsWith('--manifest=')) {
      opts.manifest = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      if (!opts.manifest) throw new Error('--manifest 缺少参数');
    } else if (a === '--out' || a.startsWith('--out=')) {
      opts.out = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      if (!opts.out) throw new Error('--out 缺少参数');
    } else if (a.startsWith('--')) {
      throw new Error('未知参数: ' + a + '（用 --help 查看用法）');
    } else {
      throw new Error('多余的位置参数: ' + a + '（用 --scenario <dir> 指定场景；--help 查看用法）');
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
  if (!opts.scenario) {
    console.error('缺少 --scenario <scenarioDir>；用 --help 查看用法。');
    return 1;
  }

  let r;
  try {
    r = runCapture({ scenarioDir: opts.scenario, manifestPath: opts.manifest, outDir: opts.out, cost: opts.cost });
  } catch (e) {
    console.error('错误: ' + e.message);
    return 1;
  }

  const traceSessions = r.trace.scenarios[0].runs[0].sessions;
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          scenarioId: r.scenarioId,
          runId: r.runId,
          tokenReport: r.tokenPath,
          traceManifest: r.tracePath,
          traceTarget: r.traceTarget,
          stagedTraceTarget: r.staged,
          sessionCount: r.token.sessions.length,
          tokenTotal: r.token.total,
          costTotals: r.token.cost ? r.token.cost.totals : null,
          traceSessions: traceSessions.map((s) => ({ sessionId: s.sessionId, sha256: s.sha256, sizeBytes: s.sizeBytes, lineCount: s.lineCount })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log('behavior_eval_capture — 采集完成');
    console.log('='.repeat(56));
    console.log(`场景: ${r.scenarioId} / run: ${r.runId}`);
    console.log(`token 报告: ${r.tokenPath}`);
    console.log(`trace manifest: ${r.tracePath}`);
    console.log(`会话数: ${r.token.sessions.length}`);
    const t = r.token.total;
    console.log(`合计: steps=${t.steps} input=${t.inputTokens} cacheRead=${t.cacheReadTokens} output=${t.outputTokens} effectiveIn=${t.effectiveIn} peakContext=${t.peakContext}`);
    if (r.token.cost) console.log(`cost: ${r.token.cost.totals.totalCost} ${r.token.cost.totals.currency}（${r.token.cost.disclaimer}）`);
    for (const s of traceSessions) console.log(`trace ${s.sessionId}: sha256=${s.sha256.slice(0, 16)}… size=${s.sizeBytes} lines=${s.lineCount}`);
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
