#!/usr/bin/env node
/**
 * detect_review_defects.mjs — 代码评审缺陷启发式检测（零依赖 Node，ESM）。
 *
 * 目的：对一段 unified diff 做确定性检查，专抓「删/弱化测试求绿」「越权/裸异常/密文泄露」
 * 这类严重失败，输出带 severity 与证据行号的 findings，并给出检出/漏报统计。
 * 它是「控制要能拒绝违规才算存在」的可执行落地：命中即 blocker。
 *
 * 用法：
 *   node scripts/detect_review_defects.mjs evals/fixtures/defective.patch [--expect 3]
 * 退出码：0 = 检出数 >= expect（默认 0）；1 = 少于 expect（存在漏报）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 规则表：每条 {id, severity, kind:'removed'|'added', re}。命中即产一条 finding。
 * - deleted-test：删除用例行（求绿）。
 * - test-weakening：|| true / continue-on-error / .skip / xit / passWithNoTests / 空断言。
 * - secret-leak：明文密钥/口令/凭据。
 * - swallowed-exception：裸 catch 静默吞错。
 * - auth-bypass：越权/鉴权绕过/过度授权。
 */
export const RULES = [
  { id: 'deleted-test', severity: 'blocker', kind: 'removed', re: /\b(it|test|describe)\s*\(/ },
  { id: 'test-weakening', severity: 'blocker', kind: 'added', re: /\|\|\s*true|continue-on-error\s*:\s*true|\.skip\s*\(|xit\s*\(|--passWithNoTests|expect\s*\(\s*true\s*\)/ },
  { id: 'secret-leak', severity: 'blocker', kind: 'added', re: /(api[_-]?key|secret|passwd|password|token)\s*[:=]\s*["'][^"']{6,}["']|sk-live-|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY/ },
  { id: 'swallowed-exception', severity: 'blocker', kind: 'added', re: /swallow|ignore[ds]?\s+(all\s+)?error|catch\s*\(\s*\w*\s*\)\s*\{\s*\}/i },
  { id: 'auth-bypass', severity: 'blocker', kind: 'added', re: /authorize\s*[:=]\s*false|permission\s*[:=]\s*["']\*["']|if\s*\(\s*true\s*\)|permitAll|\/\/.*bypass/i },
];

/**
 * 扫描一段 unified diff 文本，返回 {findings, summary}。
 * findings: 每个命中的规则一条（同规则合并，记 count 与首个证据）。
 */
export function scanText(diffText, { expect = null } = {}) {
  const lines = diffText.split(/\r?\n/);
  let file = '(unknown)';
  let oldLine = 0;
  let newLine = 0;
  const buckets = new Map(); // rule.id -> {id,severity,count,samples:[]}

  for (const raw of lines) {
    if (raw.startsWith('+++ ')) { file = raw.slice(4).replace(/^b\//, '').trim(); continue; }
    if (raw.startsWith('--- ')) continue;
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); continue; }

    let kind = null;
    let ln = null;
    if (raw.startsWith('+')) { kind = 'added'; ln = newLine; newLine += 1; }
    else if (raw.startsWith('-')) { kind = 'removed'; ln = oldLine; oldLine += 1; }
    else { oldLine += 1; newLine += 1; continue; }

    const body = raw.slice(1);
    for (const rule of RULES) {
      if (rule.kind !== kind) continue;
      if (!rule.re.test(body)) continue;
      if (!buckets.has(rule.id)) buckets.set(rule.id, { id: rule.id, severity: rule.severity, count: 0, samples: [] });
      const b = buckets.get(rule.id);
      b.count += 1;
      if (b.samples.length < 3) b.samples.push({ file, line: ln, diff: raw.trim() });
    }
  }

  const findings = [...buckets.values()].map((b) => ({
    rule_id: b.id,
    severity: b.severity,
    file: b.samples[0].file,
    line: b.samples[0].line,
    evidence: b.samples.map((s) => `${s.file}:${s.line}  ${s.diff}`).join(' | '),
    count: b.count,
  }));

  const blockers = findings.filter((f) => f.severity === 'blocker').length;
  const detected = findings.length;
  const expected = expect === null ? detected : expect;
  return {
    findings,
    summary: {
      blockers,
      major: findings.filter((f) => f.severity === 'major').length,
      minor: findings.filter((f) => f.severity === 'minor').length,
      nit: findings.filter((f) => f.severity === 'nit').length,
      detected,
      expected,
      missed: Math.max(0, expected - detected),
      rule_ids: findings.map((f) => f.rule_id),
    },
  };
}

/**
 * reviewer==author 检测：自评审不得作为唯一独立门 → 红标 + block。
 */
export function evaluateReviewMeta({ reviewer, author } = {}) {
  const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
  const selfReview = norm(reviewer) !== '' && norm(reviewer) === norm(author);
  return {
    selfReview,
    block: selfReview,
    severity: selfReview ? 'blocker' : null,
    note: selfReview
      ? 'SELF-REVIEW (red): reviewer == author，不得作为独立验证的唯一门，须升级独立评审/人工复核'
      : 'independent reviewer present',
  };
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/detect_review_defects.mjs <diff> [--expect N]'); process.exit(2); }
  const ei = process.argv.indexOf('--expect');
  const expect = ei > -1 ? Number(process.argv[ei + 1]) : null;

  let text;
  try { text = readFileSync(file, 'utf8'); }
  catch (e) { console.error(`[FATAL] 读文件失败 ${file}: ${e.message}`); process.exit(2); }

  const { findings, summary } = scanText(text, { expect });
  console.log(`detect_review_defects: ${file}`);
  for (const f of findings) console.log(`  [${f.severity}] ${f.rule_id} (x${f.count}) @ ${f.evidence}`);
  console.log(`  summary: detected=${summary.detected} expected=${summary.expected} missed=${summary.missed} blockers=${summary.blockers}`);
  const ok = summary.missed === 0;
  console.log(`RESULT: ${ok ? 'ALL EXPECTED DEFECTS FOUND' : `${summary.missed} MISSED`} (exit ${ok ? 0 : 1})`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
