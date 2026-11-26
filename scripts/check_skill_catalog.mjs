#!/usr/bin/env node
/**
 * check_skill_catalog.mjs — 技能目录收敛门禁（零依赖 Node，仅 stdlib：node:fs / node:path / node:zlib）。
 *
 * 背景（GitHub issue #28 · Design A）：DSH profile 全局层会向 squad-lead / 成员会话的模型技能目录
 *   （<available_skills>）注入 6 条与本小队无关的技能（office / office-docx / office-pptx /
 *   office-xlsx / official-plugins / personalized-pages）。本仓库用「同名占位 SKILL.md +
 *   disable-model-invocation:true」靠宿主『就近层同名覆盖 → 再按 modelInvocable 过滤』把它们摘掉。
 *   shadows/targets.json 是遮蔽目标的唯一真相源；本脚本是它的确定性门禁。
 *
 * 两种能力分层（对齐 brief §4.4 / §4.5 的「CI 兜确定性层 / 人工兜真实环境层」范式）：
 *   - --check-files（离线、进 CI）：纯文件/配置校验，抓「删占位 / 去 disable-model-invocation /
 *     tmpl 断线 / targets 与目录不一致」等漂移。**抓不到宿主语义漂移**（分层/合并/过滤规则变了）。
 *   - --assert / --list（需真实会话）：解压真实会话 session.v4.jsonl.zstd，抽出会话开头的真实系统 prompt
 *     <available_skills> 技能名单（正确配对、取技能名最多的块，平手取最早）后断言。这是唯一能抓「宿主语义漂移导致占位静默失效」的检查；CI 无真实会话，故不进 CI，
 *     作为发布前人工步骤。
 *
 * 用法：
 *   node scripts/check_skill_catalog.mjs --list <target> [--targets shadows/targets.json]
 *   node scripts/check_skill_catalog.mjs --assert <target> [--expect N] [--targets shadows/targets.json]
 *   node scripts/check_skill_catalog.mjs --check-files [--targets shadows/targets.json]
 *   node scripts/check_skill_catalog.mjs --self-test
 *   node scripts/check_skill_catalog.mjs --help
 *
 *   <target> 可为会话树「目录」（递归找其下所有 session.v4.jsonl.zstd）或直接指向「单个」
 *   session.v4.jsonl.zstd 文件。相对路径按当前工作目录解析。
 *
 * 运行时依赖：Node ≥ 22.15（--list/--assert 需要 zlib.zstdDecompressSync；--self-test 另需
 *   zlib.zstdCompressSync）。--check-files / --help 不需要 zstd。
 * 退出码：0 = 通过 / 自测通过；1 = 校验失败、用法错误、路径/解析错误，或 self-test 失败。
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
} from 'node:fs';
import { join, resolve, isAbsolute, dirname, relative } from 'node:path';
import * as zlib from 'node:zlib';

const SESSION_FILE = 'session.v4.jsonl.zstd';
const ROOT = resolve(import.meta.dirname, '..');
const DISABLE_KEY = 'disable-model-invocation';
const EXPECTED_WIRING = 8;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 临时目录根（不引入 os 模块，遵守零依赖约束）。 */
function tmpBase() {
  return process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
}

// --------------------------------------------------------------------------
// 真实会话目录抽取（--list / --assert）
// --------------------------------------------------------------------------
function decompressFile(file) {
  if (typeof zlib.zstdDecompressSync !== 'function') {
    throw new Error(
      `当前 Node 不支持 zstd（需 Node ≥ 22.15，zlib.zstdDecompressSync 不可用）；当前 ${process.version}`,
    );
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

/** 收集一个 JSON 值里所有字符串（recursively），用于在任意字段里找 <available_skills> 块。 */
function collectStrings(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, out);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) collectStrings(v[k], out);
}

/** 从一个 <available_skills> 块里抽反引号技能名（按 `- \`name\`: ...` 行），去重保序。 */
function extractNames(block) {
  const names = [];
  const seen = new Set();
  const re = /^[ \t]*-[ \t]+`([^`]+)`/gm;
  let m;
  while ((m = re.exec(block)) !== null) {
    const name = m[1].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/**
 * 从一段字符串里抽出所有「正确配对」的 <available_skills>…</available_skills> 块内容。
 * 关键：对每个开标签用 indexOf(CLOSE, openEnd) 取「其后紧跟」的关闭标签，禁止用
 * lastIndexOf 跨无关文本把某个开标签和很远的关闭标签误配（真实会话里 <available_skills>
 * 会在后续消息 / 工具输出中被反复引用，裸开标签没有自己的关闭标签）。
 */
function extractBlocks(s) {
  const OPEN = '<available_skills>';
  const CLOSE = '</available_skills>';
  const blocks = [];
  let from = 0;
  while (from < s.length) {
    const start = s.indexOf(OPEN, from);
    if (start === -1) break;
    const contentStart = start + OPEN.length;
    const end = s.indexOf(CLOSE, contentStart);
    if (end === -1) break; // 该开标签后无紧随关闭标签 → 丢弃（后续消息里的裸引用）
    blocks.push(s.slice(contentStart, end));
    from = end + CLOSE.length;
  }
  return blocks;
}

/** 单行是否为 bullet 技能行（`- \`name\`: …`）；无 `$` 锚，允许闭反引号后有描述。 */
const CLEAN_BULLET_LINE = /^[ \t]*-[ \t]+`[^`]+`/;

/**
 * 干净块判定：块内每个非空行都必须是 bullet 技能行（纯 bullet 技能列表，无正文噪声）。
 * 至少含 1 行 bullet 才算干净块。噪声块 / 残块（含截断行或正文行）一律非干净块。
 */
function isCleanBlock(block) {
  const lines = block.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return false;
  return lines.every((l) => CLEAN_BULLET_LINE.test(l));
}

/**
 * 从 target（会话树目录或单个 .zstd 文件）里抽出会话开头的真实系统 prompt
 * <available_skills>…</available_skills> 块并解析出技能名。返回 { names, block }。
 *
 * 选块判据：在所有「正确配对」的候选块里，取「最后一个干净块」（按发现顺序 seq 最大者）。
 * 干净块 = 块内每个非空行都是 `- \`name\`: …` 形式的 bullet 技能行（纯技能列表、无正文噪声）；
 * 噪声块 / 裸引用（已被 extractBlocks 丢弃）/ 残块（含截断或正文行）都不是干净块。
 *
 * 为什么不用「技能名最多」：会话重启后沿用同一 session，旧目录（如 24 条含 office）仍在文件
 * 开头的系统 prompt 里，新目录（如 20 条不含 office）出现在更晚的消息里。此时「名字最多」会
 * 误选到旧的更大块。按「最后出现的干净块」取最新真值才是对的；噪声块因不是干净块被跳过，
 * 不会被「最后」这一顺序假设带偏。若一个干净块都没有，退回「最后一个非空块」兜底，保持不崩。
 */
function loadCatalog(target) {
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

  const candidates = [];
  for (const f of files) {
    const text = decompressFile(f);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch (e) {
        throw new Error(`JSON 解析失败: ${f}:第 ${i + 1} 行: ${e.message}`);
      }
      const strings = [];
      collectStrings(obj, strings);
      for (const s of strings) {
        for (const block of extractBlocks(s)) {
          candidates.push({ names: extractNames(block), block });
        }
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(`未找到 <available_skills>…</available_skills> 块（target 无该内容？）: ${p}`);
  }

  // 选块判据：取「最后一个干净块」（发现顺序 seq 最大者）。见上方 loadCatalog 说明。
  // 兜底：若一个干净块都没有，取最后一个非空块，保持不崩。
  let best = null;
  for (const c of candidates) {
    if (isCleanBlock(c.block)) best = c;
  }
  if (best === null) {
    for (let k = candidates.length - 1; k >= 0; k--) {
      if (candidates[k].block.trim() !== '') {
        best = candidates[k];
        break;
      }
    }
  }
  if (best === null) best = candidates[candidates.length - 1];
  return { names: best.names, block: best.block };
}

// --------------------------------------------------------------------------
// targets.json 读取 / 校验
// --------------------------------------------------------------------------
function resolveTargetsPath(targetsArg) {
  if (targetsArg) return isAbsolute(targetsArg) ? targetsArg : resolve(process.cwd(), targetsArg);
  return join(ROOT, 'shadows', 'targets.json');
}

function loadTargets(targetsPath) {
  if (!existsSync(targetsPath)) throw new Error(`缺少 ${targetsPath}`);
  let doc;
  try {
    doc = JSON.parse(readFileSync(targetsPath, 'utf-8'));
  } catch (e) {
    throw new Error(`targets.json 无法解析: ${e.message}`);
  }
  return doc;
}

function loadActiveNames(targetsPath) {
  const doc = loadTargets(targetsPath);
  const targets = Array.isArray(doc && doc.targets) ? doc.targets : [];
  return targets.filter((t) => t && t.status === 'active').map((t) => t.name);
}

/** 解析 SKILL.md 的 YAML frontmatter（只支持单行 `key: value`），无 frontmatter 返回 null。 */
function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines.length === 0 || lines[0].trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const fm = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) fm[key] = val;
  }
  return fm;
}

// --------------------------------------------------------------------------
// --check-files（离线结构自检）
// --------------------------------------------------------------------------
/**
 * 校验 root 下的 shadows/targets.json + 占位 SKILL.md + cordis.patch.yml 接线。
 * 返回 { ok, problems: string[], activeCount, wireCount }。
 * problems 里的字符串已「指名具体目标」，调用方统一加 `FAIL:` 前缀。
 */
function checkFiles(root, targetsPath) {
  const problems = [];
  const relTargets = relative(root, targetsPath) || targetsPath;

  if (!existsSync(targetsPath)) {
    return { ok: false, problems: [`missing ${relTargets}`], activeCount: 0, wireCount: 0 };
  }

  let doc;
  try {
    doc = JSON.parse(readFileSync(targetsPath, 'utf-8'));
  } catch (e) {
    return { ok: false, problems: [`targets.json invalid JSON: ${e.message}`], activeCount: 0, wireCount: 0 };
  }

  if (!doc || typeof doc !== 'object') problems.push('targets.json: root is not an object');
  if (doc && doc.version === undefined) problems.push('targets.json: missing "version"');
  if (!doc || !Array.isArray(doc.targets)) problems.push('targets.json: missing "targets" array');

  const targets = doc && Array.isArray(doc.targets) ? doc.targets : [];
  const seen = new Set();
  for (const t of targets) {
    const name = t && t.name;
    if (typeof name !== 'string' || !KEBAB.test(name)) {
      problems.push(`targets.json: invalid name ${JSON.stringify(name)} (must be kebab-case)`);
      continue;
    }
    if (seen.has(name)) problems.push(`targets.json: duplicate target name '${name}'`);
    seen.add(name);
    if (t.status !== 'active' && t.status !== 'retired') {
      problems.push(`targets.json: target '${name}' has invalid status ${JSON.stringify(t.status)} (active|retired)`);
    }
  }

  const active = targets.filter((t) => t && t.status === 'active' && typeof t.name === 'string');
  const activeNames = new Set(active.map((t) => t.name));
  const shadowsDir = join(root, 'shadows');

  // 每个 active 目标必须有占位，且 frontmatter 契约成立。
  for (const t of active) {
    const fmPath = join(shadowsDir, t.name, 'SKILL.md');
    const rel = relative(root, fmPath) || fmPath;
    if (!existsSync(fmPath)) {
      problems.push(`active target '${t.name}' missing ${rel}`);
      continue;
    }
    const fm = parseFrontmatter(readFileSync(fmPath, 'utf-8'));
    if (!fm) {
      problems.push(`'${t.name}' SKILL.md has no valid frontmatter`);
      continue;
    }
    if ((fm.name || '').trim() !== t.name) {
      problems.push(`'${t.name}' SKILL.md name mismatch: frontmatter name='${(fm.name || '').trim()}' != '${t.name}'`);
    }
    if (!fm.description || !fm.description.trim()) {
      problems.push(`'${t.name}' SKILL.md missing non-empty description`);
    }
    if ((fm[DISABLE_KEY] || '').trim() !== 'true') {
      problems.push(`'${t.name}' SKILL.md missing ${DISABLE_KEY}: true`);
    }
  }

  // 孤儿：shadows/ 下任何含 SKILL.md 的目录都必须对应一条 active 目标。
  if (existsSync(shadowsDir)) {
    for (const ent of readdirSync(shadowsDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (existsSync(join(shadowsDir, ent.name, 'SKILL.md')) && !activeNames.has(ent.name)) {
        problems.push(`orphan shadow '${ent.name}' (has SKILL.md but is not an active target in targets.json)`);
      }
    }
  } else {
    problems.push('missing shadows/ directory');
  }

  // 生成物接线：cordis.patch.yml 里 'shadows') 必须出现 ×8。
  const patchPath = join(root, 'cordis.patch.yml');
  let wireCount = 0;
  if (!existsSync(patchPath)) {
    problems.push('missing cordis.patch.yml (run: npm run build:patch)');
  } else {
    const patch = readFileSync(patchPath, 'utf-8');
    wireCount = (patch.match(/'shadows'\)/g) || []).length;
    if (wireCount !== EXPECTED_WIRING) {
      problems.push(`'shadows')' expected ×${EXPECTED_WIRING}, found ${wireCount}`);
    }
  }

  return { ok: problems.length === 0, problems, activeCount: active.length, wireCount };
}

// --------------------------------------------------------------------------
// self-test：合成 zstd fixture + 临时 shadows 目录，红/绿各验一次（离线、不联网）
// --------------------------------------------------------------------------
function writeShadowFixture(root, names) {
  // targets.json
  mkdirSync(join(root, 'shadows'), { recursive: true });
  const targets = names.map((name) => ({
    name,
    source: 'self-test',
    status: 'active',
    reason: 'self-test fixture',
    added: '2026-11-26',
  }));
  writeFileSync(
    join(root, 'shadows', 'targets.json'),
    JSON.stringify({ version: 1, description: 'self-test fixture', targets }, null, 2) + '\n',
    'utf-8',
  );
  for (const name of names) {
    mkdirSync(join(root, 'shadows', name), { recursive: true });
    const md = [
      '---',
      `name: ${name}`,
      `description: Shadow placeholder for "${name}" (self-test fixture). Do not invoke.`,
      `${DISABLE_KEY}: true`,
      'user-invocable: false',
      '---',
      '',
      `# ${name}（shadow placeholder）`,
      '',
      'shadow placeholder，勿调用',
      '',
    ].join('\n');
    writeFileSync(join(root, 'shadows', name, 'SKILL.md'), md, 'utf-8');
  }
  // cordis.patch.yml：写 EXPECTED_WIRING 条含 'shadows') 的 join 行。
  const wiring = Array.from(
    { length: EXPECTED_WIRING },
    () => "              - !!js join(base, 'shadows')",
  ).join('\n');
  writeFileSync(join(root, 'cordis.patch.yml'), wiring + '\n', 'utf-8');
}

function assertTrue(cond, label) {
  if (!cond) throw new Error(`self-test 断言失败: ${label}`);
}

function selfTest() {
  if (typeof zlib.zstdDecompressSync !== 'function' || typeof zlib.zstdCompressSync !== 'function') {
    console.error(`SELF-TEST FAIL: 需要 Node ≥ 22.15（缺少 zstd compress/decompress），当前 ${process.version}`);
    return 1;
  }
  const tmp = mkdtempSync(join(tmpBase(), 'skill-catalog-'));
  try {
    // ---- (1) --list / --assert 的目录抽取层（合成 zstd 会话 fixture） ----
    const sessDir = join(tmp, 'sess');
    mkdirSync(sessDir, { recursive: true });
    const names = ['alpha', 'office', 'beta']; // 含被遮蔽目标 office
    const block = '<available_skills>\n' + names.map((n) => `- \`${n}\`: desc`).join('\n') + '\n</available_skills>';
    const jsonl =
      JSON.stringify({ type: 'user/message', data: { content: 'noise' } }) +
      '\n' +
      JSON.stringify({ type: 'user/message', data: { content: block } }) +
      '\n';
    writeFileSync(join(sessDir, SESSION_FILE), zlib.zstdCompressSync(Buffer.from(jsonl, 'utf8')));

    const got = loadCatalog(sessDir);
    assertTrue(got.names.length === 3, `catalog 应抽到 3 条，实得 ${got.names.length}`);
    assertTrue(got.names.includes('office'), 'catalog 应含 office');
    console.log(`  [self-test] --list 目录抽取：${got.names.length} 条（含 office）✓`);

    // --assert 红：office 仍在 → 必报 target still present
    const activeNames = ['office'];
    const activeSet = new Set(activeNames);
    const present = got.names.filter((n) => activeSet.has(n));
    assertTrue(present.length === 1 && present[0] === 'office', '--assert 应检出 office 仍在（红）');
    console.log("  [self-test] --assert 红：target still present: office ✓");

    // --assert 绿：目标缺席且计数匹配
    const clean = ['alpha', 'beta'];
    const cleanPresent = clean.filter((n) => activeSet.has(n));
    assertTrue(cleanPresent.length === 0 && clean.length === 2, '--assert 应在目标缺席+计数匹配时通过（绿）');
    console.log('  [self-test] --assert 绿：catalog=2, none present ✓');

    // ---- (1b) 噪声回归：同一会话多条消息多次出现 <available_skills>，最后一条是 0 条噪声 ----
    // 真实 bug 场景：真块在会话开头（技能名最全），后续消息/工具输出反复引用 <available_skills>
    // （残块 / 裸开标签 / 0 条块）。旧逻辑取「最后一个」候选块 → 命中 0 条噪声；修复后必须选中真块。
    const sessDir2 = join(tmp, 'sess-noise');
    mkdirSync(sessDir2, { recursive: true });
    const realNames = ['alpha', 'office', 'beta', 'gamma'];
    const realBlock =
      '<available_skills>\n' + realNames.map((n) => `- \`${n}\`: real desc`).join('\n') + '\n</available_skills>';
    // 残块：被截断的引用里除 1 条 bullet 外还混有正文噪声行 → 按新判据「非干净块」，应被跳过。
    const partialBlock = '<available_skills>\n- `noise-only`: partial desc\n（残块：后续引用被截断，混有正文噪声）\n</available_skills>';
    const emptyBlock = '<available_skills>\n(此消息仅引用、无 bullet)\n</available_skills>'; // 0 条噪声
    const bareRef = '宿主在别处注入 <available_skills>，本条无关闭标签'; // 裸开标签：应被丢弃
    const jsonl2 = [
      JSON.stringify({ type: 'user/message', data: { content: 'session start' } }),
      JSON.stringify({ type: 'system/prompt', data: { content: realBlock } }), // 真块（最早、技能名最多）
      JSON.stringify({ type: 'tool/output', data: { content: bareRef } }),
      JSON.stringify({ type: 'user/message', data: { content: partialBlock } }),
      JSON.stringify({ type: 'tool/output', data: { content: emptyBlock } }), // 最后一块：0 条噪声
    ].join('\n') + '\n';
    writeFileSync(join(sessDir2, SESSION_FILE), zlib.zstdCompressSync(Buffer.from(jsonl2, 'utf8')));
    const gotNoise = loadCatalog(sessDir2);
    assertTrue(gotNoise.names.length === realNames.length, `噪声回归：应抽到真块 ${realNames.length} 条，实得 ${gotNoise.names.length}`);
    for (const n of realNames) assertTrue(gotNoise.names.includes(n), `噪声回归：应含真块名字 ${n}`);
    assertTrue(!gotNoise.names.includes('noise-only'), '噪声回归：不得抽到残块噪声名字 noise-only');
    console.log(`  [self-test] 噪声回归：${gotNoise.names.length} 条真块（含 office，未命中 0 条噪声）✓`);

    // ---- (1c) 目录变少：同会话较早 24 条干净块（含 office）、较晚 20 条干净块（不含 office） ----
    // 重启沿用同一 session：旧目录仍在开头、新目录在更晚消息。旧判据「名字最多」会误选 24；
    // 修复后「最后出现的干净块」应取 20。用该结果模拟 --assert --expect 20 通过、--expect 24 失败。
    const sessDir3 = join(tmp, 'sess-shrink');
    mkdirSync(sessDir3, { recursive: true });
    const oldNames = ['office', ...Array.from({ length: 23 }, (_, i) => `old${i + 1}`)]; // 24 条（含 office）
    const curNames = Array.from({ length: 20 }, (_, i) => `cur${i + 1}`); // 20 条（不含 office）
    const oldBlock = '<available_skills>\n' + oldNames.map((n) => `- \`${n}\`: old desc`).join('\n') + '\n</available_skills>';
    const curBlock = '<available_skills>\n' + curNames.map((n) => `- \`${n}\`: cur desc`).join('\n') + '\n</available_skills>';
    const jsonl3 = [
      JSON.stringify({ type: 'system/prompt', data: { content: oldBlock } }), // 较早：24 条旧目录
      JSON.stringify({ type: 'tool/output', data: { content: '中间噪声，无块' } }),
      JSON.stringify({ type: 'user/message', data: { content: curBlock } }), // 较晚：20 条新目录
    ].join('\n') + '\n';
    writeFileSync(join(sessDir3, SESSION_FILE), zlib.zstdCompressSync(Buffer.from(jsonl3, 'utf8')));
    const got3 = loadCatalog(sessDir3);
    assertTrue(got3.names.length === 20, `目录变少：应抽到最新 20 条，实得 ${got3.names.length}`);
    assertTrue(!got3.names.includes('office'), '目录变少：结果不应含 office');
    assertTrue(got3.names.includes('cur1') && got3.names.includes('cur20'), '目录变少：应含新目录名字 cur1/cur20');
    // 模拟 --assert：active=[office]；--expect 20 通过、--expect 24 失败
    const activeSet3 = new Set(['office']);
    const assertOk = (ns, set, exp) => ns.length === exp && ns.filter((n) => set.has(n)).length === 0;
    assertTrue(assertOk(got3.names, activeSet3, 20), '目录变少：--expect 20 应通过');
    assertTrue(!assertOk(got3.names, activeSet3, 24), '目录变少：--expect 24 应失败');
    console.log('  [self-test] 目录变少(1c)：取最新 20 条（不含 office），--expect 20 通过 / --expect 24 失败 ✓');

    // ---- (2) --check-files 结构层：绿 ----
    const good = join(tmp, 'good');
    writeShadowFixture(good, ['office', 'office-docx']);
    const goodRes = checkFiles(good, join(good, 'shadows', 'targets.json'));
    assertTrue(goodRes.ok, `check-files 应通过，实得 problems: ${goodRes.problems.join(' | ')}`);
    assertTrue(goodRes.activeCount === 2 && goodRes.wireCount === EXPECTED_WIRING, 'check-files 应统计 2 active + 8 wiring');
    console.log('  [self-test] --check-files 绿：2 targets shadowed, wired ×8 ✓');

    // ---- (3) --check-files 红：删占位 → 指名目标 ----
    const red1 = join(tmp, 'red1');
    writeShadowFixture(red1, ['office', 'office-docx']);
    rmSync(join(red1, 'shadows', 'office', 'SKILL.md'));
    const r1 = checkFiles(red1, join(red1, 'shadows', 'targets.json'));
    assertTrue(!r1.ok && r1.problems.some((p) => p.includes("active target 'office' missing")), '删占位应红且指名 office');
    console.log('  [self-test] --check-files 红：missing shadow 被指名 ✓');

    // ---- (4) --check-files 红：去 disable-model-invocation → 指名目标 ----
    const red2 = join(tmp, 'red2');
    writeShadowFixture(red2, ['office', 'office-docx']);
    const fmPath = join(red2, 'shadows', 'office', 'SKILL.md');
    writeFileSync(fmPath, readFileSync(fmPath, 'utf-8').replace(`${DISABLE_KEY}: true\n`, ''), 'utf-8');
    const r2 = checkFiles(red2, join(red2, 'shadows', 'targets.json'));
    assertTrue(
      !r2.ok && r2.problems.some((p) => p.includes("'office' SKILL.md missing disable-model-invocation: true")),
      '去 disable-model-invocation 应红且指名 office',
    );
    console.log('  [self-test] --check-files 红：missing disable-model-invocation 被指名 ✓');

    // ---- (5) --check-files 红：接线掉到 7 → 报 found 7 ----
    const red3 = join(tmp, 'red3');
    writeShadowFixture(red3, ['office', 'office-docx']);
    const patch3 = join(red3, 'cordis.patch.yml');
    const kept = readFileSync(patch3, 'utf-8').split('\n').filter((l) => l.trim() !== '').slice(0, EXPECTED_WIRING - 1);
    writeFileSync(patch3, kept.join('\n') + '\n', 'utf-8');
    const r3 = checkFiles(red3, join(red3, 'shadows', 'targets.json'));
    assertTrue(!r3.ok && r3.problems.some((p) => p.includes(`expected ×8, found 7`)), '接线 7 条应红且报 found 7');
    console.log("  [self-test] --check-files 红：'shadows')' expected ×8, found 7 ✓");

    // ---- (6) --check-files 红：孤儿 → 指名 ----
    const red4 = join(tmp, 'red4');
    writeShadowFixture(red4, ['office', 'office-docx']);
    mkdirSync(join(red4, 'shadows', 'rogue'), { recursive: true });
    writeFileSync(join(red4, 'shadows', 'rogue', 'SKILL.md'), '---\nname: rogue\ndescription: x\ndisable-model-invocation: true\n---\n', 'utf-8');
    const r4 = checkFiles(red4, join(red4, 'shadows', 'targets.json'));
    assertTrue(!r4.ok && r4.problems.some((p) => p.includes("orphan shadow 'rogue'")), '孤儿目录应红且指名 rogue');
    console.log('  [self-test] --check-files 红：orphan shadow 被指名 ✓');

    console.log(
      'SELF-TEST OK（合成 zstd + 临时 shadows 目录离线自证：目录抽取 / --assert 红绿 / ' +
        'check-files 绿 + 删占位·去 disable-model-invocation·接线不足·孤儿 四类红均指名目标；未触碰真实会话）',
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

// --------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------
function usage() {
  console.log(`check_skill_catalog.mjs — 技能目录收敛门禁（零依赖，仅 node:fs/node:path/node:zlib）

用法:
  node scripts/check_skill_catalog.mjs --list <target> [--targets shadows/targets.json]
  node scripts/check_skill_catalog.mjs --assert <target> [--expect N] [--targets shadows/targets.json]
  node scripts/check_skill_catalog.mjs --check-files [--targets shadows/targets.json]
  node scripts/check_skill_catalog.mjs --self-test
  node scripts/check_skill_catalog.mjs --help

模式:
  --list <target>    解压真实会话，抽出最新 <available_skills> 名单，打印「共 N 条」+ 名单，退出 0。
                     <target> = 会话树目录（递归找 ${SESSION_FILE}）或单个 ${SESSION_FILE}。
  --assert <target>  断言 |catalog|==--expect（默认 20）且 6 个 active 遮蔽目标均不在目录中；
                     失败逐条打印 FAIL: target still present: <name>，退出 1；全过退出 0。
                     **真实会话门禁，CI 无会话故不进 CI，作为发布前人工步骤。**
  --check-files      离线结构自检（进 CI）：targets.json schema / 每个 active 目标的 SKILL.md
                     frontmatter 契约 / 无孤儿 / cordis.patch.yml 中 'shadows') 出现 ×8。
                     全过打印 OK: N targets shadowed, shadows wired ×8 退出 0；否则退出 1 并指名目标。
  --self-test        合成 zstd + 临时 shadows 目录，红/绿各验一次；离线、不联网。
  --help, -h         打印本帮助。

参数:
  --expect N          --assert 期望的目录条数（默认 20）。
  --targets <path>    targets.json 路径（默认 <repo>/shadows/targets.json）。

退出码: 0 = 通过 / 自测通过；1 = 校验失败 / 用法错误 / 路径或解析错误 / self-test 失败。`);
}

function main(argv) {
  let mode = null;
  let target = null;
  let expect = 20;
  let targetsArg = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      usage();
      return 0;
    } else if (a === '--self-test') {
      mode = 'self-test';
    } else if (a === '--check-files') {
      mode = 'check-files';
    } else if (a === '--list') {
      mode = 'list';
      target = argv[++i];
    } else if (a === '--assert') {
      mode = 'assert';
      target = argv[++i];
    } else if (a === '--expect') {
      const v = argv[++i];
      expect = parseInt(v, 10);
      if (!Number.isInteger(expect) || expect < 0) {
        console.error('--expect 需要一个非负整数');
        return 1;
      }
    } else if (a === '--targets') {
      targetsArg = argv[++i];
    } else {
      console.error('未知参数: ' + a + '（用 --help 查看用法）');
      return 1;
    }
  }

  if (mode === null) {
    console.error('缺少模式（--list / --assert / --check-files / --self-test）；用 --help 查看用法。');
    return 1;
  }
  if (mode === 'self-test') return selfTest();

  const targetsPath = resolveTargetsPath(targetsArg);

  if (mode === 'check-files') {
    const r = checkFiles(ROOT, targetsPath);
    if (!r.ok) {
      for (const p of r.problems) console.error('FAIL: ' + p);
      return 1;
    }
    console.log(`OK: ${r.activeCount} targets shadowed, shadows wired ×${EXPECTED_WIRING}`);
    return 0;
  }

  // --list / --assert 需要 <target>
  if (!target) {
    console.error(`--${mode} 需要一个 <target>（会话树目录或单个 ${SESSION_FILE}）`);
    return 1;
  }
  if (typeof zlib.zstdDecompressSync !== 'function') {
    console.error(`本模式需要 Node ≥ 22.15（缺少 zlib.zstdDecompressSync）。当前 ${process.version}`);
    return 1;
  }

  let catalog;
  try {
    catalog = loadCatalog(target);
  } catch (e) {
    console.error('错误: ' + e.message);
    return 1;
  }

  if (mode === 'list') {
    console.log(`技能目录 / available_skills（${target}）`);
    console.log(`共 ${catalog.names.length} 条：`);
    console.log(catalog.names.join(' '));
    return 0;
  }

  // mode === 'assert'
  let activeNames;
  try {
    activeNames = loadActiveNames(targetsPath);
  } catch (e) {
    console.error('错误: ' + e.message);
    return 1;
  }
  const activeSet = new Set(activeNames);
  const fails = [];
  if (catalog.names.length !== expect) {
    fails.push(`catalog size ${catalog.names.length} != expected ${expect}`);
  }
  const present = catalog.names.filter((n) => activeSet.has(n));
  for (const n of present) fails.push(`target still present: ${n}`);
  if (fails.length) {
    for (const f of fails) console.error('FAIL: ' + f);
    return 1;
  }
  console.log(`OK: catalog=${catalog.names.length}, none of ${activeNames.length} targets present`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
