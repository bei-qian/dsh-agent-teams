#!/usr/bin/env node
/**
 * squad_validate.mjs — deterministic validator for the zero-dependency BMad squad.
 *
 * Pure Node, no external deps (DSH ships Node). It checks the fixed `bmad-output/`
 * layout + `index.md` ticket contract so a pure-skill (no _bmad/Python) squad still
 * has a hard determinism gate. Exit 0 = OK, 1 = problems.
 *
 * Usage:
 *   node scripts/squad_validate.mjs [dir]        (default: ./bmad-output)
 *   node scripts/squad_validate.mjs --self-test  (red/green self-test for the removal-semantics rule)
 *   node scripts/squad_validate.mjs --help
 *
 * Contract it enforces (see playbooks/squad-protocol/SKILL.md):
 *   bmad-output/
 *     initiative.md                    # required; has a title/goal
 *     index.md                         # required; ticket table = source of truth
 *     <phase artifacts>: prd.md, architecture.md, design.md, experience.md, research/...
 *     epics/epic-*.md, stories/story-*.md   # referenced by index.md
 *   index.md table columns (in order): id | type | title | status | file
 *   type ∈ {epic, story, task}; status ∈ {todo, in_progress, in_review, done, blocked}
 *   every `file` must exist (relative to bmad-output/)
 *   a `story`/`task` marked `done` should contain 验收标准 / 实现 / 验证 sections (warning)
 */
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TYPES = new Set(['epic', 'story', 'task']);
const STATUSES = new Set(['todo', 'in_progress', 'in_review', 'done', 'blocked']);
const DONE_SECTIONS = ['验收标准', '实现', '验证'];
const ROW = /^\s*\|\s*([^|]+?)\s*\|\s*(epic|story|task)\s*\|\s*([^|]*?)\s*\|\s*([a-z_]+)\s*\|\s*([^|]+?)\s*\|\s*$/;

function read(p) {
  return readFileSync(p, 'utf8');
}

// ---------------------------------------------------------------------------
// Removal/hide semantics ↔ 用户授权 line (story-055 · issue #31 T4+T5 / D4).
//
// A story/task whose 验收标准 or 实现 asks to REMOVE / HIDE / DOWNGRADE an
// existing USER-VISIBLE element must carry a following `用户授权：<原话>` line
// (see playbooks/bmad-tickets/SKILL.md template convention). Missing it =
// unauthorized → hard error for in_progress/in_review/done, warn for todo.
//
// Discriminator (A ∧ B ∧ ¬C):
//   A = removal semantics  (CSS hiding: display:none / visibility:hidden /
//                            font-size:0, OR prose verbs: 隐藏 / 删除 / 移除)
//   B = a user-visible noun (标题/品牌/logo/导航/入口/按钮/标签/字段/列)
//   C = the 用户授权：... authorization line
// To avoid cross-context false positives ("删除临时文件 / 移除死代码"), prose
// verbs must sit within a small character window of the visible noun, while a
// CSS hiding declaration (unambiguous on its own) only needs a visible noun in
// the same section. Word lists stay broad; the window narrows co-occurrence,
// never "ignore".
// ---------------------------------------------------------------------------
const ACTIVE_STATUSES = new Set(['in_progress', 'in_review', 'done']);
const CSS_HIDE_RE = /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0/i;
const REMOVAL_VERB_RE = /隐藏|删除|移除/;
const VISIBLE_NOUN_RE = /标题|品牌|\blogo\b|导航|入口|按钮|标签|字段|列/;
const AUTH_LINE_RE = /用户授权\s*[:：]/;
const PROXIMITY_WINDOW = 12;

// Extract one `## <name>` section body (up to the next `## ` heading), or null.
function sectionOf(body, name) {
  const m = body.match(new RegExp('^##\\s*' + name + '\\s*$', 'm'));
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^##\s+/m);
  return next === -1 ? rest : rest.slice(0, next);
}

// True if any VISIBLE_NOUN sits within `window` chars of any REMOVAL_VERB match.
function verbNearVisibleNoun(seg, window) {
  const apos = [];
  const vr = new RegExp(REMOVAL_VERB_RE.source, 'gi');
  let m;
  while ((m = vr.exec(seg))) apos.push([m.index, m.index + m[0].length]);
  if (!apos.length) return false;
  const bpos = [];
  const nr = new RegExp(VISIBLE_NOUN_RE.source, 'gi');
  while ((m = nr.exec(seg))) bpos.push([m.index, m.index + m[0].length]);
  for (const [as, ae] of apos) {
    for (const [bs, be] of bpos) {
      const gap = bs >= ae ? bs - ae : (as >= be ? as - be : 0);
      if (gap <= window) return true;
    }
  }
  return false;
}

// A ∧ B (CSS path is unambiguous; prose path needs proximity).
function hasRemovalSemantics(seg) {
  if (!new RegExp(VISIBLE_NOUN_RE.source, 'i').test(seg)) return false;
  if (CSS_HIDE_RE.test(seg)) return true;
  return verbNearVisibleNoun(seg, PROXIMITY_WINDOW);
}

// Build a throwaway bmad-output fixture for --self-test (red: no auth line;
// green: auth line added).
function buildSelfTestFixture(rootDir, authLine) {
  mkdirSync(join(rootDir, 'stories'), { recursive: true });
  writeFileSync(join(rootDir, 'initiative.md'), '# fixture 举措\n目标：selftest fixture\n');
  const lines = [
    '# story-003 · selftest fixture',
    '- **前置 / blocked_by**: 无（可立即开工）',
    '## 验收标准',
    '- 1024–1199 隐藏平台标题文字',
  ];
  if (authLine) lines.push(authLine);
  lines.push(
    '## 实现',
    '| 元素 | 处理 |',
    '| 平台标题 | display:none |',
    '## 验证',
    '（待填）',
    '',
  );
  writeFileSync(join(rootDir, 'stories', 'story-003.md'), lines.join('\n'));
  writeFileSync(join(rootDir, 'index.md'), [
    '| id | type | title | status | file |',
    '|---|---|---|---|---|',
    '| story-003 | story | selftest fixture | in_progress | stories/story-003.md |',
    '',
  ].join('\n'));
}

// Red/green self-test: the red fixture MUST fail (exit 1) for the missing
// 用户授权 line, the green fixture MUST pass (exit 0). Exit 0 = self-test OK.
function selfTest() {
  console.log('SELF-TEST: squad_validate 移除语义检查（红例应 FAIL exit 1；绿例应 OK exit 0）');
  const selfPath = fileURLToPath(import.meta.url);
  const tmp = mkdtempSync(join(tmpdir(), 'squad-validate-selftest-'));
  let ok = true;
  try {
    const redDir = join(tmp, 'red');
    buildSelfTestFixture(redDir, null);
    const red = spawnSync(process.execPath, [selfPath, redDir], { encoding: 'utf-8' });
    const redOut = (red.stdout || '') + (red.stderr || '');
    const redOk = red.status === 1 && redOut.includes('用户授权');
    console.log(`  红例（display:none/隐藏平台标题，无授权行）：${redOk ? 'PASS ✓ FAIL exit ' + red.status : 'FAIL ✗ exit ' + red.status}`);

    const greenDir = join(tmp, 'green');
    buildSelfTestFixture(greenDir, '用户授权：「我也没说要去掉呀」');
    const green = spawnSync(process.execPath, [selfPath, greenDir], { encoding: 'utf-8' });
    const greenOk = green.status === 0;
    console.log(`  绿例（补 用户授权 行）：${greenOk ? 'PASS ✓ OK exit ' + green.status : 'FAIL ✗ exit ' + green.status + ' ' + tail(green)}`);

    ok = redOk && greenOk;
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  console.log(ok ? 'SELF-TEST PASS' : 'SELF-TEST FAIL');
  return ok;
}

function tail(r) {
  return ((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(-3).join(' | ');
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(read(new URL(import.meta.url)).split('\n').slice(1, 26).join('\n'));
    return;
  }
  if (args[0] === '--self-test') {
    process.exit(selfTest() ? 0 : 1);
  }
  const dir = resolve(args[0] || 'bmad-output');
  const errors = [];
  const warns = [];

  if (!existsSync(dir)) {
    console.error(`SQUAD VALIDATE: FAIL\n  ✗ missing output directory: ${dir}`);
    process.exit(1);
  }

  // initiative.md
  const initPath = join(dir, 'initiative.md');
  if (!existsSync(initPath)) {
    errors.push('missing initiative.md');
  } else {
    const t = read(initPath);
    if (!/^#\s+\S/m.test(t) && !/(目标|Goal)[:：]\s*\S/i.test(t)) {
      errors.push('initiative.md lacks a title (# ...) or a 目标/Goal line');
    }
  }

  // index.md
  const idxPath = join(dir, 'index.md');
  const tickets = [];
  if (!existsSync(idxPath)) {
    errors.push('missing index.md (ticket source of truth)');
  } else {
    for (const line of read(idxPath).split(/\r?\n/)) {
      const m = line.match(ROW);
      if (m) tickets.push({ id: m[1], type: m[2], title: m[3], status: m[4], file: m[5] });
    }
    if (tickets.length === 0) warns.push('index.md has no ticket rows yet');
    const ids = new Set();
    for (const t of tickets) {
      if (ids.has(t.id)) errors.push(`duplicate ticket id: ${t.id}`);
      ids.add(t.id);
      if (!TYPES.has(t.type)) errors.push(`ticket ${t.id}: invalid type '${t.type}'`);
      if (!STATUSES.has(t.status)) errors.push(`ticket ${t.id}: invalid status '${t.status}'`);
      const fp = isAbsolute(t.file) ? t.file : join(dir, t.file);
      if (!existsSync(fp)) {
        errors.push(`ticket ${t.id}: file not found: ${t.file}`);
        continue;
      }
      if ((t.type === 'story' || t.type === 'task') && t.status === 'done') {
        const body = read(fp);
        const missing = DONE_SECTIONS.filter((s) => !body.includes(s));
        if (missing.length) warns.push(`ticket ${t.id} done but missing sections: ${missing.join(' / ')}`);
      }
    }
  }

  // Removal/hide semantics must carry a 用户授权 line (story-055). Pure increment:
  // runs after the existing checks, never relaxes them. todo → warn only.
  for (const t of tickets) {
    if (t.type !== 'story' && t.type !== 'task') continue;
    if (t.status !== 'todo' && !ACTIVE_STATUSES.has(t.status)) continue;
    const fp = isAbsolute(t.file) ? t.file : join(dir, t.file);
    if (!existsSync(fp)) continue;
    const body = read(fp);
    const ac = sectionOf(body, '验收标准');
    const im = sectionOf(body, '实现');
    if (ac === null && im === null) continue; // missing sections handled by existing warning
    const seg = (ac || '') + '\n' + (im || '');
    if (AUTH_LINE_RE.test(seg)) continue;
    if (!hasRemovalSemantics(seg)) continue;
    const msg = `ticket ${t.id}: 移除/隐藏语义缺少「用户授权：<原话>」行`;
    if (t.status === 'todo') warns.push(msg + '（todo，仅提示）');
    else errors.push(msg);
  }

  if (warns.length) warns.forEach((w) => console.warn('  ! ' + w));
  if (errors.length) {
    console.error('SQUAD VALIDATE: FAIL');
    errors.forEach((e) => console.error('  ✗ ' + e));
    process.exit(1);
  }
  console.log(`SQUAD VALIDATE: OK (${tickets.length} tickets, dir=${dir})`);
}

main();
