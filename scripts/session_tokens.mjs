#!/usr/bin/env node
/**
 * session_tokens.mjs — 会话 token / 步数统计（零依赖 Node，仅 stdlib：node:fs / node:path / node:zlib）。
 *
 * 用途：解压一个会话树里的 `session.v4.jsonl.zstd`，逐行解析 JSONL，只聚合
 *   `type === "assistant/message"` 且带 `usage` 的记录，输出「步数 + token 用量 + 峰值上下文」。
 * 把 issue #25 §复现 里的一次性 inline 统计沉淀为可复用、可回归的度量（R3 L0 确定性指标）。
 *
 * 口径（与 issue #25 §复现 内联脚本逐项一致；字段别名见括号）：
 *   steps            带 usage 的 assistant/message 记录条数            (= inline steps)
 *   inputTokens      所有步 usage.inputTokens 之和                     (= inline freshIn)
 *   cacheReadTokens  所有步 usage.cacheReadTokens 之和                 (= inline cacheRead)
 *   outputTokens     所有步 usage.outputTokens 之和                    (= inline out)
 *   effectiveIn      inputTokens + cacheReadTokens                     (= inline effectiveIn；注意≠usage.totalTokens)
 *   peakContext      每步 (inputTokens + cacheReadTokens) 的最大值     (= 每步 effectiveIn 的 max)
 *
 * 用法：
 *   node scripts/session_tokens.mjs <target> [--json]
 *   node scripts/session_tokens.mjs --self-test
 *   node scripts/session_tokens.mjs --help
 *
 *   <target> 可接受两种输入：
 *     1) 会话树「目录」：递归查找其下所有 `session.v4.jsonl.zstd`（一个会话树 = Lead 会话 + 各成员子会话），
 *        把这些文件的 usage 合并聚合（与 issue #25 §复现 的「一个会话树」收集范围一致）；
 *     2) 直接指向「单个」`session.v4.jsonl.zstd` 文件。
 *   相对路径按当前工作目录解析。
 *
 * 运行时依赖：Node ≥ 22.15（需要 `zlib.zstdDecompressSync`；自测另需 `zlib.zstdCompressSync`）。
 * 退出码：0 = 正常 / 自测通过；1 = 用法错误、路径/文件/解析错误，或 self-test 失败。
 *   坏路径 / 坏文件一律给出人类可读原因（含路径/行号）到 stderr，不以裸异常栈作为唯一输出。
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute, basename } from 'node:path';
import * as zlib from 'node:zlib';

const SESSION_FILE = 'session.v4.jsonl.zstd';

/** 临时目录根（不引入 os 模块，遵守「仅 node:fs / node:path / node:zlib」约束）。 */
function tmpBase() {
  return process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
}

/** 非负安全整数化；非法/缺失归一为 0，避免 NaN 污染累加。 */
function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
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

/**
 * 聚合一个 target（会话树目录 或 单个 .zstd 文件）。
 * 返回 { steps, inputTokens, cacheReadTokens, outputTokens, effectiveIn, peakContext, files }。
 * 坏路径 / 坏文件 / 非法 JSONL 抛清晰错误（带路径 + 行号）。
 */
function aggregatePath(target) {
  const p = isAbsolute(target) ? target : resolve(process.cwd(), target);
  if (!existsSync(p)) throw new Error(`路径不存在: ${p}`);
  let st;
  try {
    st = statSync(p);
  } catch (e) {
    throw new Error(`无法访问路径: ${p}: ${e.message}`);
  }

  let files;
  if (st.isDirectory()) {
    files = findZstdFiles(p);
    if (files.length === 0) throw new Error(`目录下未找到 ${SESSION_FILE}: ${p}`);
  } else {
    files = [p];
  }

  let steps = 0;
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  let peakContext = 0;

  for (const f of files) {
    const text = decompressFile(f);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue; // 跳过空行（含尾部空行）
      let obj;
      try {
        obj = JSON.parse(line);
      } catch (e) {
        // 逐条容错但绝不静默吞掉：指出文件 + 行号并以非零退出，避免口径悄悄漂移。
        throw new Error(`JSON 解析失败: ${f}:第 ${i + 1} 行: ${e.message}`);
      }
      if (!obj || obj.type !== 'assistant/message') continue; // 忽略非 assistant/message 记录
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
  }

  return {
    steps,
    inputTokens,
    cacheReadTokens,
    outputTokens,
    effectiveIn: inputTokens + cacheReadTokens,
    peakContext,
    files: files.length,
  };
}

function printStats(stat, target) {
  console.log('会话 token / 步数统计');
  console.log('='.repeat(52));
  console.log(`目标: ${target}`);
  console.log(`聚合文件数: ${stat.files} 个 ${SESSION_FILE}`);
  console.log(`steps:            ${stat.steps}`);
  console.log(`inputTokens:      ${stat.inputTokens}   (issue 别名 freshIn)`);
  console.log(`cacheReadTokens:  ${stat.cacheReadTokens}   (issue 别名 cacheRead)`);
  console.log(`outputTokens:     ${stat.outputTokens}   (issue 别名 out)`);
  console.log(`effectiveIn:      ${stat.effectiveIn}   (= inputTokens + cacheReadTokens)`);
  console.log(`peakContext:      ${stat.peakContext}   (每步 input+cacheRead 的最大值)`);
}

/** 对比一个 stat 的 6 个口径字段与期望值，不一致则抛差异。 */
function assertMetrics(got, expect, label) {
  const keys = ['steps', 'inputTokens', 'cacheReadTokens', 'outputTokens', 'effectiveIn', 'peakContext'];
  const diffs = [];
  for (const k of keys) {
    if (got[k] !== expect[k]) diffs.push(`${k}: got ${got[k]} != expect ${expect[k]}`);
  }
  if (diffs.length) throw new Error(`[${label}] 断言失败: ${diffs.join('; ')}`);
  if (got.effectiveIn !== got.inputTokens + got.cacheReadTokens) {
    throw new Error(`[${label}] 自洽失败: effectiveIn != inputTokens + cacheReadTokens`);
  }
  if (!(got.peakContext >= 0) || !Number.isInteger(got.steps) || got.steps < 0) {
    throw new Error(`[${label}] 类型/边界失败: peakContext>=0 或 steps 非负整数不成立`);
  }
}

/**
 * self-test：纯离线确定性自证。
 * 运行时用 zlib.zstdCompressSync 合成最小 zstd fixture 到临时目录（结束清理），
 * 手算期望值断言 steps / inputTokens / cacheReadTokens / outputTokens / effectiveIn / peakContext，
 * 覆盖：多步累加、effectiveIn=input+cacheRead、peakContext=max(每步 input+cacheRead)、
 *       非 assistant/message 记录与「无 usage 的 assistant/message」被忽略、坏 JSONL 被识别。
 * 不依赖 ~/.dsh 真实会话、不联网。
 */
function selfTest() {
  if (typeof zlib.zstdCompressSync !== 'function') {
    console.error(`SELF-TEST FAIL: 需要 Node ≥ 22.15（缺少 zlib.zstdCompressSync），当前 ${process.version}`);
    return 1;
  }
  const tmp = mkdtempSync(join(tmpBase(), 'session-tokens-'));
  try {
    const ws = join(tmp, 'ws');
    const sub = join(ws, 'session-A');
    mkdirSync(sub, { recursive: true });

    const records = [
      { type: 'session', seq: 0 }, // 干扰：非 assistant/message
      { type: 'user/message', data: { message: 'hi' } }, // 干扰：非 assistant/message
      { type: 'assistant/message', data: { usage: { inputTokens: 100, cacheReadTokens: 900, outputTokens: 50 } } }, // 步1 eff=1000
      { type: 'assistant/message', data: { usage: { inputTokens: 200, cacheReadTokens: 1800, outputTokens: 70 } } }, // 步2 eff=2000(peak)
      { type: 'assistant/message', data: { message: 'no usage here' } }, // 干扰：assistant/message 但无 usage → 不计步
      { type: 'tool/result', data: {} }, // 干扰：非 assistant/message
      { type: 'assistant/message', data: { usage: { inputTokens: 50, cacheReadTokens: 250, outputTokens: 30 } } }, // 步3 eff=300
    ];
    // 尾部空行：验证空行被跳过
    const jsonl = records.map((r) => JSON.stringify(r)).join('\n') + '\n\n';
    const fixture = join(sub, SESSION_FILE);
    writeFileSync(fixture, zlib.zstdCompressSync(Buffer.from(jsonl, 'utf8')));

    // 手算期望：steps=3, input=350, cacheRead=2950, out=150, effectiveIn=3300, peak=2000
    const expect = { steps: 3, inputTokens: 350, cacheReadTokens: 2950, outputTokens: 150, effectiveIn: 3300, peakContext: 2000 };

    const gotFile = aggregatePath(fixture); // 单文件模式
    assertMetrics(gotFile, expect, 'file-mode');

    const gotDir = aggregatePath(ws); // 会话树目录模式（递归找到同一个 fixture）
    assertMetrics(gotDir, expect, 'dir-mode');

    // 坏 JSONL 必须被识别（不得静默吞掉）
    const badDir = join(tmp, 'bad');
    mkdirSync(badDir, { recursive: true });
    const badFile = join(badDir, SESSION_FILE);
    writeFileSync(badFile, zlib.zstdCompressSync(Buffer.from('{"type":"assistant/message"\n', 'utf8')));
    let threw = false;
    let msg = '';
    try {
      aggregatePath(badFile);
    } catch (e) {
      threw = true;
      msg = e.message;
    }
    if (!threw || !/JSON 解析失败/.test(msg)) throw new Error(`坏 JSONL 未被识别（应报「JSON 解析失败」）: ${msg || '(未抛错)'}`);

    console.log(`  [self-test] 坏 JSONL → 正确报错（含文件:行号）✓`);
    console.log(
      `  [self-test] steps=${gotFile.steps} inputTokens=${gotFile.inputTokens} cacheReadTokens=${gotFile.cacheReadTokens} ` +
        `outputTokens=${gotFile.outputTokens} effectiveIn=${gotFile.effectiveIn} peakContext=${gotFile.peakContext} ✓`,
    );
    console.log(
      'SELF-TEST OK（合成 zstd fixture 离线自证：多步累加 / effectiveIn=input+cacheRead / ' +
        'peakContext=max(每步 input+cacheRead) / 非 assistant-message 与无 usage 记录被忽略 / 坏 JSONL 被识别；未触碰真实会话）',
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
  console.log(`session_tokens.mjs — 会话 token / 步数统计（零依赖，仅 node:fs/node:path/node:zlib）

用法:
  node scripts/session_tokens.mjs <target> [--json]
  node scripts/session_tokens.mjs --self-test
  node scripts/session_tokens.mjs --help

参数:
  <target>       会话树「目录」（递归查找其下所有 ${SESSION_FILE}，合并聚合 —— 一个会话树
                 = Lead 会话 + 各成员子会话）或 直接指向「单个」${SESSION_FILE} 文件。
                 相对路径按当前工作目录解析。
  --json         输出机读 JSON（含 steps/inputTokens/cacheReadTokens/outputTokens/effectiveIn/peakContext，整数）。
  --self-test    合成最小 zstd fixture（临时目录，结束清理）离线自证口径；不依赖真实会话、不联网。
  --help, -h     打印本帮助（不因缺少 zstd / 无真实会话而失败）。

统计口径（与 issue #25 §复现 内联脚本逐项一致）:
  steps            带 usage 的 assistant/message 记录条数         (= inline steps)
  inputTokens      所有步 usage.inputTokens 之和                  (= inline freshIn)
  cacheReadTokens  所有步 usage.cacheReadTokens 之和              (= inline cacheRead)
  outputTokens     所有步 usage.outputTokens 之和                 (= inline out)
  effectiveIn      inputTokens + cacheReadTokens                  (= inline effectiveIn；注意≠usage.totalTokens)
  peakContext      每步 (inputTokens + cacheReadTokens) 的最大值  (每步 effectiveIn 的 max)

运行时依赖: Node ≥ 22.15（zlib.zstdDecompressSync；自测另需 zlib.zstdCompressSync）。

退出码: 0 = 正常 / 自测通过；1 = 用法错误、路径/文件/解析错误，或 self-test 失败。
  坏路径 / 坏文件给出人类可读原因（含路径/行号）到 stderr，不以裸异常栈作为唯一输出。`);
}

function main(argv) {
  let json = false;
  let target = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      usage();
      return 0;
    } else if (a === '--self-test') {
      return selfTest();
    } else if (a === '--json') {
      json = true;
    } else if (a.startsWith('--')) {
      console.error('未知参数: ' + a + '（用 --help 查看用法）');
      return 1;
    } else if (target === null) {
      target = a;
    } else {
      console.error('多余的参数: ' + a + '（一次只统计一个 target；用 --help 查看用法）');
      return 1;
    }
  }

  if (target === null) {
    console.error('缺少输入路径（会话树目录 或 单个 ' + SESSION_FILE + '）；用 --help 查看用法。');
    return 1;
  }

  if (typeof zlib.zstdDecompressSync !== 'function') {
    console.error(`本脚本需要 Node ≥ 22.15（缺少 zlib.zstdDecompressSync）。当前 ${process.version}`);
    return 1;
  }

  let stat;
  try {
    stat = aggregatePath(target);
  } catch (e) {
    console.error('错误: ' + e.message);
    return 1;
  }

  if (json) console.log(JSON.stringify(stat, null, 2));
  else printStats(stat, target);
  return 0;
}

process.exit(main(process.argv.slice(2)));
