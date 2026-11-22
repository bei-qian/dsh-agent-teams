#!/usr/bin/env node
/**
 * falsification_demo.mjs — 零依赖演示「测试质量 ≠ 测试数量」与「变异/证伪思维」。
 *
 * 做法：对同一个函数规格给两份实现（正确 fixed / 注入 1 个行为缺陷 buggy），
 * 跑两组测试：
 *   - 行为测试（断言可观察结果，含边界/负路径）
 *   - 浅测（只断言「返回数字/有限/不抛」这类永远为真的坏味道）
 * 断言：
 *   1) 行为测试在 fixed 上全绿；
 *   2) 行为测试在 buggy 上**至少失败 1 条**（即：缺陷被抓住 = 证伪性成立）；
 *   3) 浅测在 buggy 上**仍然全绿**（数量/浅测抓不住 bug）。
 * 全部成立 → exit 0；否则 exit 1。
 */
import assert from "node:assert/strict";

// 规格：applyPercentageDiscount(priceCents, percent)
//   priceCents：非负整数（分）；percent：可为任意数，但语义上 clamp 到 [0,100]
//   返回：整数分，= round(priceCents * (100 - clamp(percent)) / 100)，且 ∈ [0, priceCents]
function fixed(priceCents, percent) {
  if (!Number.isInteger(priceCents) || priceCents < 0) throw new RangeError("price must be non-negative integer");
  const p = Math.min(100, Math.max(0, percent)); // 关键：clamp
  return Math.round((priceCents * (100 - p)) / 100);
}
function buggy(priceCents, percent) {
  // 注入的 1 个行为缺陷：未 clamp percent（<0 会加价、>100 会变负），且用 floor 致边界舍入错
  return priceCents - Math.floor((priceCents * percent) / 100);
}

// 行为测试（断言可观察结果，含边界/负路径）：fn(impl)
const behaviorSuite = [
  ["零折扣不变价", (impl) => assert.equal(impl(1000, 0), 1000)],
  ["满折扣归零", (impl) => assert.equal(impl(1000, 100), 0)],
  ["负百分比应 clamp 到 0（不得加价）", (impl) => assert.equal(impl(1000, -10), 1000)],
  ["超 100% 应 clamp（结果不得为负）", (impl) => assert.equal(impl(1000, 150), 0)],
  ["边界舍入 99@33% == 66", (impl) => assert.equal(impl(99, 33), 66)],
  ["任意边界结果 ∈ [0, price]", (impl) => {
    for (const [price, pct] of [[199, 50], [1, 99], [1000, 0], [1000, 100]]) {
      const r = impl(price, pct);
      assert.ok(Number.isInteger(r) && r >= 0 && r <= price, `price=${price} pct=${pct} -> ${r}`);
    }
  }],
];

// 浅测（坏味道：永远为真，抓不住任何行为缺陷）
const shallowSuite = [
  ["返回一个数字", (impl) => assert.equal(typeof impl(1000, 10), "number")],
  ["结果是有限数", (impl) => assert.ok(Number.isFinite(impl(1000, 10)))],
  ["正常输入不抛异常", (impl) => assert.doesNotThrow(() => impl(1000, 10))],
];

function runSuite(suite, impl) {
  const failed = [];
  for (const [name, fn] of suite) {
    try { fn(impl); } catch (_e) { failed.push(name); }
  }
  return { total: suite.length, passed: suite.length - failed.length, failed };
}

const behaviorOnFixed = runSuite(behaviorSuite, fixed);
const behaviorOnBuggy = runSuite(behaviorSuite, buggy);
const shallowOnBuggy = runSuite(shallowSuite, buggy);

console.log("falsification_demo · 证伪性 / 数量≠质量");
console.log("=".repeat(60));
console.log(`行为测试 on 正确实现 : ${behaviorOnFixed.passed}/${behaviorOnFixed.total} passed  (期望全绿)`);
console.log(`行为测试 on 缺陷实现 : ${behaviorOnBuggy.passed}/${behaviorOnBuggy.total} passed  (期望有失败)`);
if (behaviorOnBuggy.failed.length) {
  for (const n of behaviorOnBuggy.failed) console.log(`   ✗ 抓住缺陷: ${n}`);
}
console.log(`浅测   on 缺陷实现 : ${shallowOnBuggy.passed}/${shallowOnBuggy.total} passed  (期望全绿=什么都没抓)`);
console.log("=".repeat(60));

let ok = true;
function expect(label, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
}
expect("行为测试在正确实现上全绿", behaviorOnFixed.failed.length === 0);
expect("行为测试在缺陷实现上至少 1 条失败（缺陷被抓住）", behaviorOnBuggy.failed.length >= 1);
expect("浅测在缺陷实现上仍全绿（数量/浅测抓不住 bug）", shallowOnBuggy.failed.length === 0);

console.log("=".repeat(60));
if (ok) {
  console.log("RESULT: OK — 证伪性成立：好测试能红，浅测再多也不红。");
  process.exit(0);
} else {
  console.error("RESULT: FAIL — 证伪性示例未成立。");
  process.exit(1);
}
