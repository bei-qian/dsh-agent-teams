#!/usr/bin/env node
/**
 * red_green_demo.mjs — 「先红后绿」最小可复现证明（零依赖 Node，ESM）。
 *
 * 目的：用一个 off-by-one 缺陷的最小样例，确定性地证明：
 *   1) 回归测试在 buggy 实现上 FAIL（RED，pre-fix）；
 *   2) 同一回归测试在 fixed 实现上 PASS（GREEN，post-fix）。
 * 这正是 cap-debugging-systematic 要求的「旧代码失败、新代码通过」回归证据。
 *
 * 用法：
 *   node scripts/red_green_demo.mjs
 * 退出码：0 = 先红后绿成立；1 = 未成立（说明回归测试区分不了 buggy/fixed）。
 */
import { fileURLToPath } from 'node:url';

/**
 * 缺陷样例：计算 1..n 的整数和（闭区间）。
 * buggy: 循环条件写成 i < n（off-by-one），漏掉 n。
 */
export function sumRangeBuggy(n) {
  let s = 0;
  for (let i = 1; i < n; i++) s += i; // BUG: 应为 i <= n
  return s;
}

/** fixed: 条件改为 i <= n。 */
export function sumRangeFixed(n) {
  let s = 0;
  for (let i = 1; i <= n; i++) s += i; // FIX: 闭区间
  return s;
}

/**
 * 回归测试：编码「正确行为」的确定性断言。
 * 不只测 happy path，还含边界 n=1、n=0。返回 true=通过，false=失败。
 */
export function regressionTest(fn) {
  const cases = [
    { n: 5, want: 15 }, // 1+2+3+4+5
    { n: 1, want: 1 },  // 边界：单元素
    { n: 0, want: 0 },  // 边界：空区间
  ];
  return cases.every(({ n, want }) => fn(n) === want);
}

/** 返回 { red, green }：red=true 表示 buggy 被测试判失败；green=true 表示 fixed 通过。 */
export function runRedGreen() {
  const red = regressionTest(sumRangeBuggy) === false; // 期望：buggy 判失败
  const green = regressionTest(sumRangeFixed) === true; // 期望：fixed 通过
  return { red, green };
}

function main() {
  console.log('red_green_demo: off-by-one 缺陷的最小回归样例');
  console.log(`  sumRangeBuggy(5) = ${sumRangeBuggy(5)}  (期望 15，缺陷漏掉 n)`);
  console.log(`  sumRangeFixed(5) = ${sumRangeFixed(5)}`);

  // 两次独立运行，证明确定性（结果不随运行波动）。
  const r1 = runRedGreen();
  const r2 = runRedGreen();
  const deterministic = r1.red === r2.red && r1.green === r2.green;

  console.log(`  RED   (pre-fix):  ${r1.red ? 'FAIL（符合预期）' : 'PASS（异常：测试没抓到缺陷！）'}`);
  console.log(`  GREEN (post-fix): ${r1.green ? 'PASS' : 'FAIL（异常：修复后仍失败）'}`);
  console.log(`  deterministic: ${deterministic ? 'yes（两次结果一致）' : 'NO（不稳定）'}`);

  const ok = r1.red && r1.green && deterministic;
  console.log(`RESULT: ${ok ? 'RED->GREEN OK' : 'RED->GREEN FAILED'} (exit ${ok ? 0 : 1})`);
  process.exit(ok ? 0 : 1);
}

// 仅当作为 CLI 直接运行时执行 main（被 import 时不执行）。
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
