#!/usr/bin/env node
/**
 * upstream_drift.mjs — 上游漂移报告（零依赖 Node，纯 stdlib + child_process，调用系统 git）。
 *
 * 一条命令看清「参考克隆相对上游落后多少」：扫描 --root 下一层的 git 克隆，逐仓输出
 *   ahead/behind（`git rev-list --left-right --count HEAD...@{u}`）+ 本地 tip（sha/简述）
 *   + `HEAD..@{u}` 的新提交标题。默认只读、不改任何工作树、不 merge；`--fetch` 仅在显式
 *   开启时才 `git fetch`（仍只读，不改工作树）。
 *
 * 用法：
 *   node scripts/upstream_drift.mjs [--root <dir>] [--json] [--fetch]
 *   node scripts/upstream_drift.mjs --self-test   # 用临时 git 仓库自证（不碰真实仓库）
 *   node scripts/upstream_drift.mjs --help
 *
 * --root 的相对路径按“包根（即本脚本所在包 dsh-olympus/）”解析；默认 `..` = 它的父目录
 *         （通常是存放各上游参考克隆的那一层）。
 *
 * 退出码：0 = 正常/自证通过；1 = self-test 失败或用法/IO 错误。
 */
import { writeFileSync, mkdtempSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 跑一条 git 命令；返回 spawnSync 结果（encoding utf-8）。 */
function git(args, cwd) {
  const full = cwd ? ['-C', cwd, ...args] : args;
  return spawnSync('git', full, { encoding: 'utf8' });
}

function gitOut(args, cwd) {
  const r = git(args, cwd);
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * 分析单个仓库（纯只读；fetch=true 时先 git fetch）。
 * 返回 { name, isGit, hasUpstream, upstream?, ahead?, behind?, tip:{sha,subject}, newCommits:[{sha,subject}], note? }
 */
export function analyzeRepo(dir, { fetch = false } = {}) {
  const name = basename(dir);
  const inside = git(['rev-parse', '--is-inside-work-tree'], dir);
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    return { name, isGit: false, hasUpstream: false };
  }
  if (fetch) git(['fetch', '--quiet'], dir);

  const sha = gitOut(['rev-parse', '--short', 'HEAD'], dir) || null;
  const subject = gitOut(['log', '-1', '--format=%s'], dir) || '';
  const tip = { sha, subject };

  // 是否有上游跟踪分支（@{u}）：无则优雅标记 no-upstream。
  const upRef = gitOut(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], dir);
  if (!upRef) {
    return { name, isGit: true, hasUpstream: false, tip, note: 'no upstream' };
  }

  let ahead = null;
  let behind = null;
  const cnt = gitOut(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], dir);
  if (cnt) {
    const parts = cnt.split(/\s+/).map((x) => Number(x));
    ahead = Number.isFinite(parts[0]) ? parts[0] : null;
    behind = Number.isFinite(parts[1]) ? parts[1] : null;
  }

  const log = gitOut(['log', '--format=%h %s', 'HEAD..@{u}'], dir) || '';
  const newCommits = log
    ? log.split('\n').filter(Boolean).map((line) => {
        const i = line.indexOf(' ');
        return i === -1 ? { sha: line, subject: '' } : { sha: line.slice(0, i), subject: line.slice(i + 1) };
      })
    : [];

  return { name, isGit: true, hasUpstream: true, upstream: upRef, ahead, behind, tip, newCommits };
}

/** 扫描 root 下一层目录，返回 { root, clones, skipped }。 */
export function scanRoot(root, { fetch = false } = {}) {
  const clones = [];
  const skipped = [];
  let entries = [];
  try {
    entries = readdirSync(root);
  } catch (e) {
    return { root, error: `cannot read root ${root}: ${e.message}`, clones, skipped };
  }
  for (const name of entries.sort()) {
    if (name === '.git') continue;
    const full = join(root, name);
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { isDir = false; }
    if (!isDir) continue;
    const res = analyzeRepo(full, { fetch });
    if (!res.isGit) { skipped.push({ name, reason: 'not a git repo' }); continue; }
    clones.push(res);
  }
  return { root, clones, skipped };
}

function printReport(report) {
  console.log(`上游漂移报告 · root: ${report.root}`);
  console.log('='.repeat(60));
  const withUp = report.clones.filter((c) => c.hasUpstream);
  const noUp = report.clones.filter((c) => c.isGit && !c.hasUpstream);
  if (withUp.length === 0) {
    console.log('（没有带 upstream 跟踪的 git 克隆）');
  }
  for (const c of withUp) {
    const ab = `ahead=${c.ahead} behind=${c.behind}`;
    const drift = c.behind > 0 ? '  ← 上游有新提交' : '  ✓ 已对齐';
    console.log(`\n● ${c.name}  ${ab}${drift}   (upstream: ${c.upstream})`);
    console.log(`  tip: ${c.tip.sha || '?'} ${c.tip.subject}`);
    for (const n of c.newCommits) console.log(`  new: ${n.sha} ${n.subject}`);
  }
  if (noUp.length) {
    console.log('\n— 无 upstream（未配置跟踪分支，跳过计数）—');
    for (const c of noUp) console.log(`  ${c.name}  (no upstream; tip ${c.tip.sha || '?'} ${c.tip.subject})`);
  }
  if (report.skipped.length) {
    console.log('\n— 跳过（非 git 目录）—');
    for (const s of report.skipped) console.log(`  ${s.name}  (${s.reason})`);
  }
  const behind = withUp.filter((c) => c.behind > 0).length;
  console.log(`\n汇总：${withUp.length} 个带 upstream 克隆 · ${behind} 个有上游新提交 · ${noUp.length} 个无 upstream · ${report.skipped.length} 个非 git 目录`);
}

/** self-test：在临时目录里建 bare origin + clone，自证 behind 计算正确，全程不碰真实仓库。 */
function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), 'upstream-drift-'));
  const fail = (m) => { throw new Error(m); };
  try {
    const origin = join(tmp, 'origin.git');
    const seed = join(tmp, 'seed');
    const clone = join(tmp, 'clone');
    const cfg = ['-c', 'user.email=self@test', '-c', 'user.name=selftest'];

    let r = git(['init', '--bare', '-q', origin]); if (r.status !== 0) fail('init bare: ' + r.stderr);
    git(['-C', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
    r = git(['init', '-q', seed]); if (r.status !== 0) fail('init seed: ' + r.stderr);
    git(['-C', seed, 'checkout', '-b', 'main']);
    writeFileSync(join(seed, 'a.txt'), '1\n');
    git(['-C', seed, 'add', '-A']);
    r = git(['-C', seed, ...cfg, 'commit', '-q', '-m', 'c1 initial']); if (r.status !== 0) fail('commit c1: ' + r.stderr);
    git(['-C', seed, 'remote', 'add', 'origin', origin]);
    r = git(['-C', seed, 'push', '-q', '-u', 'origin', 'main']); if (r.status !== 0) fail('push c1: ' + r.stderr);

    r = git(['clone', '-q', origin, clone]); if (r.status !== 0) fail('clone: ' + r.stderr);

    // 情形 1：对齐 → 0/0
    const aligned = analyzeRepo(clone);
    if (!aligned.hasUpstream) fail('clone has no upstream');
    if (aligned.ahead !== 0 || aligned.behind !== 0) fail(`aligned expected 0/0, got ahead=${aligned.ahead} behind=${aligned.behind}`);
    console.log(`  [self-test] 对齐 → ahead=${aligned.ahead} behind=${aligned.behind} ✓`);

    // 上游再提交 1 次（seed push），clone 侧 fetch 后应 behind=1
    writeFileSync(join(seed, 'b.txt'), '2\n');
    git(['-C', seed, 'add', '-A']);
    r = git(['-C', seed, ...cfg, 'commit', '-q', '-m', 'c2 second change']); if (r.status !== 0) fail('commit c2: ' + r.stderr);
    r = git(['-C', seed, 'push', '-q', 'origin', 'main']); if (r.status !== 0) fail('push c2: ' + r.stderr);

    const leading = analyzeRepo(clone, { fetch: true });
    if (leading.ahead !== 0 || leading.behind !== 1) fail(`leading expected ahead=0 behind=1, got ahead=${leading.ahead} behind=${leading.behind}`);
    if (!leading.newCommits.some((c) => /second change/.test(c.subject))) fail('missing new commit title (c2)');
    console.log(`  [self-test] 上游领先 1 → ahead=${leading.ahead} behind=${leading.behind}，新提交: ${leading.newCommits.map((c) => c.subject).join(' | ')} ✓`);

    console.log('SELF-TEST OK（临时仓库自证：对齐=0/0，上游领先 1=behind 1；未触碰真实仓库）');
    return 0;
  } catch (e) {
    console.error('SELF-TEST FAIL: ' + e.message);
    return 1;
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function usage() {
  console.log(`upstream_drift.mjs — 上游漂移报告（零依赖，只读）

用法:
  node scripts/upstream_drift.mjs [--root <dir>] [--json] [--fetch]
  node scripts/upstream_drift.mjs --self-test
  node scripts/upstream_drift.mjs --help

参数:
  --root <dir>   扫描该目录「下一层」的 git 克隆。相对路径按包根（dsh-olympus/）解析；
                 默认 .. = 包根的父目录（通常存放各上游参考克隆处）。
  --json         输出机读 JSON（{root, clones, skipped}）。
  --fetch        仅显式开启时对每个克隆执行 git fetch（仍只读、不改工作树、不 merge）。
  --self-test    在临时 git 仓库（bare origin + clone）自证 behind 计算：上游领先 1 → behind=1；
                 对齐 → 0/0。全程只在临时目录，不碰真实仓库，结束清理。
  --help, -h     打印本帮助。

每个克隆报告: ahead/behind（HEAD...@{u}）、本地 tip（sha/简述）、HEAD..@{u} 的新提交标题。
缺克隆/非 git 目录/无 upstream 跟踪分支 → 优雅跳过并说明原因，不崩溃。

退出码: 0 = 正常/自证通过；1 = self-test 失败或用法/IO 错误。`);
}

function main(argv) {
  let root = '..';
  let json = false;
  let fetch = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { usage(); return 0; }
    else if (a === '--self-test') { return selfTest(); }
    else if (a === '--json') { json = true; }
    else if (a === '--fetch') { fetch = true; }
    else if (a === '--root') { root = argv[++i]; if (root === undefined) { console.error('--root 需要一个目录参数'); return 1; } }
    else if (a.startsWith('--root=')) { root = a.slice('--root='.length); }
    else { console.error('未知参数: ' + a + '（用 --help 查看用法）'); return 1; }
  }
  const resolved = isAbsolute(root) ? root : resolve(PKG_ROOT, root);
  if (!existsSync(resolved)) { console.error(`root 不存在: ${resolved}`); return 1; }
  const report = scanRoot(resolved, { fetch });
  if (report.error) { console.error(report.error); return 1; }
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  return 0;
}

// 仅当直接运行时执行（被 import 时只导出 analyzeRepo/scanRoot，便于测试）。
const invokedDirectly = (() => {
  try { return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}

export { main };
