#!/usr/bin/env node
/**
 * session_trace_manifest.mjs — 原始 session trace 留存 / 校验清单（零依赖 Node，
 * 仅 stdlib：node:fs / node:path / node:node:crypto / node:zlib）。
 *
 * 用途（story-071 / epic-025 #2）：V2 评测 transcript 仅摘要，独立复核只能重跑复算，
 * 缺原始 `session.v4.jsonl.zstd`（report.md §6.2）。spike 判定：原始 zstd 全文入 git = NO-GO
 * （PII / 体积），改用「引用 / sha256 校验清单 + 可选 gitignored 副本」：
 *   - 生成 `trace-manifest.json`：每会话记录
 *     {sessionId, sourcePath, sizeBytes, sha256(zstd 原文件), decompressedSha256, lineCount, firstTs, lastTs}，
 *     按 scenario → run → sessions[] 组织。
 *   - `--verify <manifest>` 对 sourcePath（或副本）重算 sha256 比对：一致 → exit 0；
 *     失配 → exit≠0 并「点名」不符会话（绝不静默通过）。
 *   - `--copy` 把 raw `.zstd` 复制到 gitignored 的 `traces/`，复制后以 manifest sha256 校验副本。
 *
 * 红线：只读源 trace（不写 `~/.dsh`、不改 DSH 内核、不 commit）；原始 zstd 全文不入 git；
 *   不引入第三方依赖、不联网。
 *
 * 组织口径（与本仓库 session_tokens* 系列一致）：
 *   - `<target>` 可为：会话树「目录」（递归查找其下所有 `session.v4.jsonl.zstd`）、
 *     单个 `.zstd` 文件、或一个含 `scenario.manifest.json` 的场景目录（据此取 scenarioId/runId/sessionIds）。
 *   - sessionId = 会话目录名（该 `session.v4.jsonl.zstd` 所在目录的 basename，与 scenario.manifest 的 sessionIds 口径一致）。
 *   - firstTs / lastTs = 记录 `time`（epoch ms）的最小 / 最大值；无 `time` 时回退会话记录 `createdAt`。
 *   - lineCount = 解压后「非空行数」（= JSONL 记录条数）。
 *
 * 用法：
 *   node scripts/session_trace_manifest.mjs <target> [--out trace-manifest.json] [--scenario <id>] [--run <id>] [--copy [dir]] [--json]
 *   node scripts/session_trace_manifest.mjs --verify <manifest>
 *   node scripts/session_trace_manifest.mjs --self-test
 *   node scripts/session_trace_manifest.mjs --help
 *
 * 运行时依赖：Node ≥ 22.15（需要 zlib.zstdDecompressSync；自测另需 zlib.zstdCompressSync）。
 * 退出码：0 = 正常 / 校验一致 / 自测通过；1 = 用法错误、路径/文件/解析错误、校验失配或自测失败。
 *   坏路径 / 坏文件 / 失配一律给出人类可读原因（含路径 / sessionId）到 stderr，不以裸异常栈作为唯一输出。
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  statSync,
  existsSync,
  copyFileSync,
} from 'node:fs';
import { join, resolve, isAbsolute, basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import * as zlib from 'node:zlib';

const SESSION_FILE = 'session.v4.jsonl.zstd';
const MANIFEST_NAME = 'trace-manifest.json';
const SCENARIO_MANIFEST = 'scenario.manifest.json';
const COPY_SUFFIX = '.session.v4.jsonl.zstd';

/** 临时目录根（不引入 os 模块，遵守「仅 node:fs / node:path / node:crypto / node:zlib」约束）。 */
function tmpBase() {
  return process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
}

/** 对一段字节求 sha256（小写 hex）。 */
function sha256Buf(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** 读取并解压单个 zstd 文件为 Buffer；失败抛带路径的清晰错误。 */
function decompressFileBuffer(file) {
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
    return zlib.zstdDecompressSync(buf);
  } catch (e) {
    throw new Error(`无法解压（非 zstd / 截断或损坏？）: ${file}: ${e.message}`);
  }
}

/** 递归查找目录下所有 session.v4.jsonl.zstd（深度优先，结果排序稳定）。 */
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

/** 解压后非空行数（= JSONL 记录条数）。 */
function countLines(buf) {
  const s = buf.toString('utf8');
  let n = 0;
  for (const line of s.split('\n')) if (line.trim()) n += 1;
  return n;
}

/**
 * 从解压内容提取 firstTs / lastTs（epoch ms）。
 * 优先用各记录 `time`；缺失时回退会话记录的 `createdAt`。坏行容错跳过（不抛），
 * 但仅在「该行确实无法解析」时跳过时间提取，不影响 lineCount 口径。
 */
function extractTimeRange(buf) {
  const s = buf.toString('utf8');
  let first = null;
  let last = null;
  let sessionCreated = null;
  for (const line of s.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // 坏行不阻断 manifest（哈希仍是权威校验），仅跳过时间提取
    }
    if (obj && obj.type === 'session' && Number.isFinite(obj.createdAt)) {
      sessionCreated = obj.createdAt;
      const t = obj.createdAt; // 会话创建时间视为首个时间点
      if (first === null || t < first) first = t;
      if (last === null || t > last) last = t;
    }
    if (obj && Number.isFinite(obj.time)) {
      const t = obj.time;
      if (first === null || t < first) first = t;
      if (last === null || t > last) last = t;
    }
  }
  if (first === null && sessionCreated !== null) {
    first = sessionCreated;
    last = sessionCreated;
  }
  return { firstTs: first, lastTs: last };
}

/** 为单个 session.v4.jsonl.zstd 构建 manifest 记录（只读，不写源文件）。 */
function buildSessionRecord(file) {
  const raw = readFileSync(file); // 只读源文件
  const dec = decompressFileBuffer(file);
  const { firstTs, lastTs } = extractTimeRange(dec);
  return {
    sessionId: basename(dirname(file)),
    sourcePath: file,
    sizeBytes: raw.length,
    sha256: sha256Buf(raw),
    decompressedSha256: sha256Buf(dec),
    lineCount: countLines(dec),
    firstTs,
    lastTs,
  };
}

/**
 * 构建 manifest（scenario → run → sessions[]）。
 * opts: { scenarioId?, runId? } 显式标签（缺省回退 scenario.manifest.json / 目录名）。
 * 若目标目录含 scenario.manifest.json，则读其 scenarioId / runId / sessionIds 并按其精确选会话；
 * 列出的 sessionId 找不到时明确报错（绝不静默漏选）。
 */
function buildManifest(target, opts = {}) {
  const p = isAbsolute(target) ? target : resolve(process.cwd(), target);
  if (!existsSync(p)) throw new Error(`路径不存在: ${p}`);
  const st = statSync(p);

  let files;
  let scenarioDir;
  if (st.isDirectory()) {
    files = findZstdFiles(p);
    scenarioDir = p;
    if (files.length === 0) throw new Error(`目录下未找到 ${SESSION_FILE}: ${p}`);
  } else {
    files = [p];
    scenarioDir = dirname(p);
  }

  let scenarioId = opts.scenarioId || null;
  let runId = opts.runId || null;
  let sessionIds = null;
  const smPath = existsSync(join(scenarioDir, SCENARIO_MANIFEST)) ? join(scenarioDir, SCENARIO_MANIFEST) : null;
  if (smPath) {
    let sm;
    try {
      sm = JSON.parse(readFileSync(smPath, 'utf8'));
    } catch (e) {
      throw new Error(`无法解析 ${SCENARIO_MANIFEST}: ${smPath}: ${e.message}`);
    }
    if (!scenarioId && sm && typeof sm.scenarioId === 'string') scenarioId = sm.scenarioId;
    if (!runId && sm && typeof sm.runId === 'string') runId = sm.runId;
    if (sm && Array.isArray(sm.sessionIds)) sessionIds = sm.sessionIds;
  }

  let selected = files;
  if (sessionIds) {
    const available = new Set(files.map((f) => basename(dirname(f))));
    const missing = sessionIds.filter((id) => !available.has(id));
    if (missing.length) {
      throw new Error(`scenario.manifest.json 列出的 sessionId 未找到（目录: ${scenarioDir}）: ${missing.join(', ')}`);
    }
    const wanted = new Set(sessionIds);
    selected = files.filter((f) => wanted.has(basename(dirname(f))));
  }

  if (!scenarioId) scenarioId = basename(scenarioDir) || 'scenario';
  if (!runId) runId = 'default';

  const sessions = selected.map(buildSessionRecord).sort((a, b) => a.sessionId.localeCompare(b.sessionId));

  return {
    manifestVersion: 1,
    generator: 'session_trace_manifest.mjs',
    generatedAt: new Date().toISOString(),
    target: p,
    scenarios: [
      {
        scenarioId,
        runs: [{ runId, sessions }],
      },
    ],
  };
}

/** 展平 manifest 的所有会话记录，附带其 scenarioId / runId。 */
function flattenSessions(manifest) {
  const out = [];
  const scenarios = Array.isArray(manifest.scenarios) ? manifest.scenarios : [];
  for (const sc of scenarios) {
    const scenarioId = sc && sc.scenarioId;
    const runs = sc && Array.isArray(sc.runs) ? sc.runs : [];
    for (const run of runs) {
      const runId = run && run.runId;
      const sessions = run && Array.isArray(run.sessions) ? run.sessions : [];
      for (const s of sessions) out.push({ scenarioId, runId, session: s });
    }
  }
  return out;
}

/**
 * 校验 manifest：对每个会话重算 sha256（优先 sourcePath，缺失则回退 copyPath），
 * 并复核 decompressedSha256 / lineCount。返回 { ok, checked, problems[] }。
 * problems 每条含 sessionId 与 kind / 期望 / 实际，供「点名」不符会话。
 */
function verifyManifestObject(manifest) {
  const entries = flattenSessions(manifest);
  const problems = [];
  let checked = 0;
  for (const { session } of entries) {
    checked += 1;
    const sessionId = session.sessionId;
    let path = null;
    let using = null;
    if (session.sourcePath && existsSync(session.sourcePath)) {
      path = session.sourcePath;
      using = 'source';
    } else if (session.copyPath && existsSync(session.copyPath)) {
      path = session.copyPath;
      using = 'copy';
    } else {
      problems.push({
        sessionId,
        kind: 'missing',
        detail: `sourcePath 与 copyPath 均不存在（sourcePath=${session.sourcePath || '(空)'}${
          session.copyPath ? `, copyPath=${session.copyPath}` : ''
        }）`,
      });
      continue;
    }

    let raw;
    try {
      raw = readFileSync(path);
    } catch (e) {
      problems.push({ sessionId, kind: 'read', using, path, detail: e.message });
      continue;
    }

    const actualSha = sha256Buf(raw);
    if (actualSha !== session.sha256) {
      problems.push({ sessionId, kind: 'sha256', using, path, expected: session.sha256, actual: actualSha });
      continue; // 原文件已不符，无需再解压
    }

    // 原文件 sha 一致 → 进一步复核解压内容（decompressedSha256 / lineCount）
    try {
      const dec = zlib.zstdDecompressSync(raw);
      if (session.decompressedSha256 !== undefined) {
        const dsha = sha256Buf(dec);
        if (dsha !== session.decompressedSha256) {
          problems.push({ sessionId, kind: 'decompressedSha256', using, path, expected: session.decompressedSha256, actual: dsha });
        }
      }
      if (session.lineCount !== undefined) {
        const lc = countLines(dec);
        if (lc !== session.lineCount) {
          problems.push({ sessionId, kind: 'lineCount', using, path, expected: session.lineCount, actual: lc });
        }
      }
    } catch (e) {
      problems.push({ sessionId, kind: 'decompress', using, path, detail: e.message });
    }
  }
  return { ok: problems.length === 0, checked, problems };
}

/** 打印校验结果；返回进程退出码（0 通过 / 1 失配）。 */
function printVerifyResult(result, manifestPath) {
  console.log('session trace manifest 校验');
  console.log('='.repeat(52));
  console.log(`manifest: ${manifestPath}`);
  console.log(`已校验会话: ${result.checked}`);
  if (result.ok && result.checked > 0) {
    console.log('结果: PASS（所有会话 sha256 / decompressedSha256 / lineCount 一致）');
    return 0;
  }
  if (result.checked === 0) {
    console.error('结果: FAIL（manifest 内无可校验会话，拒绝静默通过）');
    return 1;
  }
  console.error(`结果: FAIL（${result.problems.length} 项不符）`);
  for (const p of result.problems) {
    const loc = p.path ? ` @ ${p.path} (${p.using})` : '';
    if (p.kind === 'sha256' || p.kind === 'decompressedSha256' || p.kind === 'lineCount') {
      console.error(`  ✗ 会话 ${p.sessionId}: ${p.kind} 不符${loc}: 期望 ${p.expected} / 实际 ${p.actual}`);
    } else {
      console.error(`  ✗ 会话 ${p.sessionId}: ${p.kind}${loc}: ${p.detail || ''}`);
    }
  }
  return 1;
}

/** 读取 manifest 文件并校验。 */
function verifyManifestFile(manifestPath) {
  const p = isAbsolute(manifestPath) ? manifestPath : resolve(process.cwd(), manifestPath);
  if (!existsSync(p)) throw new Error(`manifest 不存在: ${p}`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`无法解析 manifest: ${p}: ${e.message}`);
  }
  return printVerifyResult(verifyManifestObject(manifest), p);
}

/**
 * 把 manifest 中每个会话的 raw .zstd 复制到 baseDir/<scenarioId>/<runId>/<sessionId>.session.v4.jsonl.zstd，
 * 复制后以 manifest sha256 校验副本（不符即抛错）。只读源文件。返回复制数量。
 * 副作用：就地给会话记录补 copyPath 字段。
 */
function copyTraces(manifest, baseDir) {
  const base = isAbsolute(baseDir) ? baseDir : resolve(process.cwd(), baseDir);
  const entries = flattenSessions(manifest);
  let n = 0;
  for (const { scenarioId, runId, session } of entries) {
    if (!session.sourcePath || !existsSync(session.sourcePath)) {
      throw new Error(`源 trace 不存在，无法复制: 会话 ${session.sessionId}: ${session.sourcePath}`);
    }
    const rel = join(String(scenarioId || 'scenario'), String(runId || 'default'), `${session.sessionId}${COPY_SUFFIX}`);
    const dest = join(base, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(session.sourcePath, dest); // 只读源
    const copySha = sha256Buf(readFileSync(dest));
    if (copySha !== session.sha256) {
      throw new Error(`副本 sha256 与 manifest 不符（复制损坏？）: 会话 ${session.sessionId}: ${dest}`);
    }
    session.copyPath = dest;
    n += 1;
  }
  return n;
}

/**
 * self-test：纯离线确定性自证（合成 zstd fixture 到临时目录，结束清理；不依赖 ~/.dsh、不联网）。
 * 覆盖：manifest 字段齐全 + 结构 scenario→run→sessions[]、sha256 == 原文件实际 sha256、
 *   decompressedSha256 == 解压内容 sha256、lineCount == 解压后非空行数、firstTs/lastTs 正确、
 *   干净校验 exit 0、篡改任一字节后校验 exit≠0 且点名不符会话、--copy 副本 sha256 一致、
 *   源文件被清走后回退校验副本、副本被篡改可检出。
 */
function selfTest() {
  if (typeof zlib.zstdCompressSync !== 'function') {
    console.error(`SELF-TEST FAIL: 需要 Node ≥ 22.15（缺少 zlib.zstdCompressSync），当前 ${process.version}`);
    return 1;
  }
  const tmp = mkdtempSync(join(tmpBase(), 'session-trace-'));
  try {
    const scen = join(tmp, 'scenario-a');
    const mkSession = (name, jsonl) => {
      const dir = join(scen, name);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, SESSION_FILE);
      writeFileSync(file, zlib.zstdCompressSync(Buffer.from(jsonl, 'utf8')));
      return { dir, file, jsonl };
    };
    const jsonl1 = [
      { type: 'session', id: 'uuid-1', createdAt: 1000 },
      { type: 'turn/start', time: 1000 },
      { type: 'assistant/message', time: 1500, data: { usage: { inputTokens: 10, outputTokens: 5 } } },
      { type: 'assistant/message', time: 2000, data: { usage: { inputTokens: 20, outputTokens: 7 } } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n';
    const s1 = mkSession('sess-1', jsonl1);
    // 尾部显式空行：验证 lineCount 按「非空行」计数不受影响
    const jsonl2 = [
      { type: 'session', id: 'uuid-2', createdAt: 3000 },
      { type: 'assistant/message', time: 3400, data: {} },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n\n';
    const s2 = mkSession('sess-2', jsonl2);

    const manifest = buildManifest(scen);
    const sc = manifest.scenarios[0];
    if (sc.scenarioId !== 'scenario-a') throw new Error(`scenarioId 期望 scenario-a，实得 ${sc.scenarioId}`);
    if (sc.runs[0].runId !== 'default') throw new Error(`runId 期望 default，实得 ${sc.runs[0].runId}`);
    const sess = sc.runs[0].sessions;
    if (sess.length !== 2) throw new Error(`sessions 数量期望 2，实得 ${sess.length}`);
    if (sess[0].sessionId !== 'sess-1' || sess[1].sessionId !== 'sess-2') throw new Error('sessions 未按 sessionId 排序');

    // 逐会话断言：sha256 / decompressedSha256 / lineCount / sizeBytes / firstTs / lastTs（独立重算）
    const expect = [
      { f: s1, recs: 4, first: 1000, last: 2000 },
      { f: s2, recs: 2, first: 3000, last: 3400 },
    ];
    for (let i = 0; i < expect.length; i++) {
      const got = sess[i];
      const { file, jsonl } = expect[i].f;
      const rawNow = readFileSync(file);
      const expSha = sha256Buf(rawNow); // 独立于记录生成路径，重算文件字节 sha
      const expDecSha = sha256Buf(Buffer.from(jsonl, 'utf8')); // 解压内容应为原始 JSONL
      if (got.sha256 !== expSha) throw new Error(`[${got.sessionId}] sha256 不符: ${got.sha256} != ${expSha}`);
      if (got.decompressedSha256 !== expDecSha) throw new Error(`[${got.sessionId}] decompressedSha256 不符`);
      if (got.lineCount !== expect[i].recs) throw new Error(`[${got.sessionId}] lineCount 期望 ${expect[i].recs}，实得 ${got.lineCount}`);
      if (got.sizeBytes !== rawNow.length) throw new Error(`[${got.sessionId}] sizeBytes 不符`);
      if (got.firstTs !== expect[i].first) throw new Error(`[${got.sessionId}] firstTs 期望 ${expect[i].first}，实得 ${got.firstTs}`);
      if (got.lastTs !== expect[i].last) throw new Error(`[${got.sessionId}] lastTs 期望 ${expect[i].last}，实得 ${got.lastTs}`);
      if (!isAbsolute(got.sourcePath)) throw new Error(`[${got.sessionId}] sourcePath 非绝对路径`);
    }
    console.log('  [self-test] 字段/结构/双 sha/lineCount/firstTs-lastTs 断言通过 ✓');

    // 干净校验 → exit 0
    const clean = verifyManifestObject(manifest);
    if (!clean.ok || clean.checked !== 2) throw new Error(`干净校验应 PASS(2)，实得 ok=${clean.ok} checked=${clean.checked}`);
    console.log('  [self-test] 干净校验 → PASS（2 会话）✓');

    // 篡改任一字节 → 校验 FAIL 且点名会话（负向）
    const orig = readFileSync(s1.file);
    const flipped = Buffer.from(orig);
    flipped[Math.floor(flipped.length / 2)] ^= 0xff; // 翻转中间一个字节
    writeFileSync(s1.file, flipped);
    const tampered = verifyManifestObject(manifest);
    if (tampered.ok) throw new Error('篡改后校验不应 PASS（应 FAIL）');
    if (!tampered.problems.some((p) => p.sessionId === 'sess-1' && p.kind === 'sha256')) {
      throw new Error(`篡改后应点名 sess-1 的 sha256 不符，实得: ${JSON.stringify(tampered.problems)}`);
    }
    // 复原，供后续 copy 用例
    writeFileSync(s1.file, orig);
    console.log('  [self-test] 篡改一字节 → 校验 FAIL 且点名 sess-1 ✓');

    // --copy 副本：复制后 sha256 与 manifest 一致；源被清走后回退校验副本；副本被篡改可检出
    const copyBase = join(tmp, 'traces');
    const nCopied = copyTraces(manifest, copyBase);
    if (nCopied !== 2) throw new Error(`--copy 期望复制 2 个，实得 ${nCopied}`);
    for (const s of sess) {
      if (!s.copyPath || !existsSync(s.copyPath)) throw new Error(`[${s.sessionId}] copyPath 缺失或文件不存在`);
      if (sha256Buf(readFileSync(s.copyPath)) !== s.sha256) throw new Error(`[${s.sessionId}] 副本 sha256 与 manifest 不符`);
    }
    console.log('  [self-test] --copy 副本落盘且 sha256 一致 ✓');

    // 模拟源 trace 被清理（GC）→ 校验回退到副本
    rmSync(s1.dir, { recursive: true, force: true });
    const viaCopy = verifyManifestObject(manifest);
    if (!viaCopy.ok || viaCopy.checked !== 2) throw new Error(`源缺失后应回退副本校验 PASS(2)，实得 ok=${viaCopy.ok} checked=${viaCopy.checked}`);

    // 篡改副本 → 检出点名（负向）
    const cbuf = readFileSync(sess[0].copyPath);
    const cflip = Buffer.from(cbuf);
    cflip[Math.floor(cflip.length / 2)] ^= 0xff;
    writeFileSync(sess[0].copyPath, cflip);
    const copyTampered = verifyManifestObject(manifest);
    if (copyTampered.ok) throw new Error('副本篡改后校验不应 PASS');
    if (!copyTampered.problems.some((p) => p.sessionId === 'sess-1')) throw new Error('副本篡改后应点名 sess-1');
    console.log('  [self-test] 源清理后回退副本校验 + 副本篡改可检出 ✓');

    console.log(
      'SELF-TEST OK（合成 zstd fixture 离线自证：字段/结构 scenario→run→sessions / 双 sha / lineCount / ' +
        'firstTs-lastTs / 干净 exit0 / 篡改 exit≠0 且点名 / --copy 副本一致与篡改可检出；未触碰真实会话）',
    );
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

function usage() {
  console.log(`session_trace_manifest.mjs — 原始 session trace 留存 / 校验清单（零依赖，仅 node:fs/node:path/node:crypto/node:zlib）

用法:
  node scripts/session_trace_manifest.mjs <target> [--out <path>] [--scenario <id>] [--run <id>] [--copy [dir]] [--json]
  node scripts/session_trace_manifest.mjs --verify <manifest>
  node scripts/session_trace_manifest.mjs --self-test
  node scripts/session_trace_manifest.mjs --help

参数:
  <target>        会话树「目录」（递归查找其下所有 ${SESSION_FILE}）、单个 ${SESSION_FILE} 文件、
                  或含 ${SCENARIO_MANIFEST} 的场景目录（据此取 scenarioId/runId/sessionIds）。相对路径按 cwd 解析。
  --out <path>    输出 manifest 路径（默认 ./${MANIFEST_NAME}）。
  --scenario <id> 覆盖 scenarioId（缺省取 scenario.manifest.json / 目录名）。
  --run <id>      覆盖 runId（缺省取 scenario.manifest.json / "default"）。
  --copy [dir]    生成同时把 raw .zstd 复制到 dir（默认 ./traces，gitignored），复制后以 manifest sha256 校验副本。
  --json          额外把 manifest JSON 打到 stdout。
  --verify <m>    对 manifest 中各会话重算 sha256（优先 sourcePath，缺失回退 copyPath）并复核 decompressedSha256/lineCount；
                  一致 → exit 0；失配 → exit≠0 并点名不符会话。
  --self-test     合成最小 zstd fixture（临时目录，结束清理）离线自证；不依赖真实会话、不联网。
  --help, -h      打印本帮助。

manifest 结构: { manifestVersion, generator, generatedAt, target, scenarios:[{ scenarioId, runs:[{ runId, sessions:[
  { sessionId, sourcePath, sizeBytes, sha256(zstd 原文件), decompressedSha256, lineCount, firstTs, lastTs, [copyPath] } ] }] }] }
  sessionId = 会话目录名；firstTs/lastTs = 记录 time(epoch ms) 的最小/最大（无则回退会话 createdAt）；lineCount = 解压后非空行数。

红线: 只读源 trace（不写 ~/.dsh、不改内核、不 commit）；原始 zstd 全文不入 git；原始副本含潜在 PII，仅本地/受控存储。
运行时依赖: Node ≥ 22.15（zlib.zstdDecompressSync；自测另需 zlib.zstdCompressSync）。
退出码: 0 = 正常 / 校验一致 / 自测通过；1 = 用法错误、路径/文件/解析错误、校验失配或自测失败。`);
}

function main(argv) {
  let target = null;
  let out = null;
  let scenarioId = null;
  let runId = null;
  let copyFlag = false;
  let copyDir = null;
  let verifyPath = null;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      usage();
      return 0;
    } else if (a === '--self-test') {
      return selfTest();
    } else if (a === '--json') {
      json = true;
    } else if (a === '--verify' || a.startsWith('--verify=')) {
      if (a.includes('=')) {
        verifyPath = a.slice(a.indexOf('=') + 1);
      } else {
        verifyPath = argv[++i];
        if (!verifyPath) {
          console.error('--verify 需要一个 manifest 路径参数（用 --help 查看用法）');
          return 1;
        }
      }
    } else if (a === '--out' || a.startsWith('--out=')) {
      out = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      if (!out) {
        console.error('--out 需要一个路径参数（用 --help 查看用法）');
        return 1;
      }
    } else if (a === '--scenario' || a.startsWith('--scenario=')) {
      scenarioId = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      if (!scenarioId) {
        console.error('--scenario 需要一个 id 参数（用 --help 查看用法）');
        return 1;
      }
    } else if (a === '--run' || a.startsWith('--run=')) {
      runId = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      if (!runId) {
        console.error('--run 需要一个 id 参数（用 --help 查看用法）');
        return 1;
      }
    } else if (a === '--copy' || a.startsWith('--copy=')) {
      copyFlag = true;
      if (a.includes('=')) {
        copyDir = a.slice(a.indexOf('=') + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        copyDir = argv[++i]; // 可选值：下一个非 -- 参数作为目录
      }
    } else if (a.startsWith('--')) {
      console.error('未知参数: ' + a + '（用 --help 查看用法）');
      return 1;
    } else if (target === null) {
      target = a;
    } else {
      console.error('多余的参数: ' + a + '（一次只处理一个 target；用 --help 查看用法）');
      return 1;
    }
  }

  if (verifyPath !== null) {
    try {
      return verifyManifestFile(verifyPath);
    } catch (e) {
      console.error('错误: ' + e.message);
      return 1;
    }
  }

  if (target === null) {
    console.error('缺少输入路径（会话树目录 / 单个 ' + SESSION_FILE + '）；用 --help 查看用法。');
    return 1;
  }

  if (typeof zlib.zstdDecompressSync !== 'function') {
    console.error(`本脚本需要 Node ≥ 22.15（缺少 zlib.zstdDecompressSync）。当前 ${process.version}`);
    return 1;
  }

  let manifest;
  try {
    manifest = buildManifest(target, { scenarioId, runId });
    if (copyFlag) {
      const n = copyTraces(manifest, copyDir || 'traces');
      console.log(`已复制 ${n} 个 raw .zstd 副本到 ${resolve(process.cwd(), copyDir || 'traces')}（已按 manifest sha256 校验）`);
    }
  } catch (e) {
    console.error('错误: ' + e.message);
    return 1;
  }

  const outPath = out ? resolve(process.cwd(), out) : resolve(process.cwd(), MANIFEST_NAME);
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
  } catch (e) {
    console.error(`无法写入 manifest: ${outPath}: ${e.message}`);
    return 1;
  }

  const total = flattenSessions(manifest).length;
  console.log('session trace manifest 生成');
  console.log('='.repeat(52));
  console.log(`target: ${manifest.target}`);
  console.log(`scenario: ${manifest.scenarios[0].scenarioId} / run: ${manifest.scenarios[0].runs[0].runId}`);
  console.log(`会话数: ${total}`);
  console.log(`manifest: ${outPath}`);
  if (json) console.log(JSON.stringify(manifest, null, 2));
  return 0;
}

process.exit(main(process.argv.slice(2)));
