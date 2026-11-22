#!/usr/bin/env node
/**
 * security_invariants_demo.mjs — 零依赖、确定性的安全约束演示（无墙钟、无外部依赖）
 *
 * 演示并断言 5 类可确定性验证的安全约束（见 references/auth-and-input.md §4）：
 *   1. 账号不可区分 / 防枚举（存在-密码错 vs 不存在 → 响应不可区分）
 *   2. fail-fast 失败路径一致（两失败分支的 KDF 调用计数相等，用计数器而非耗时）
 *   3. 配置与输入边界（缺失/临界/越界/合法两端）
 *   4. 启动期不变量（缺关键前置即 fail-fast）
 *   5. 跨租户隔离（拒绝跨租户读、且不泄露存在性）
 *
 * 全部通过 → exit 0；任一断言失败 → 打印 FAIL 并 exit 1。
 */
import assert from "node:assert/strict";

let passed = 0;
const results = [];
function check(name, fn) {
  try {
    fn();
    passed++;
    results.push(`PASS  ${name}`);
  } catch (e) {
    results.push(`FAIL  ${name}\n      ${e.message}`);
  }
}

// ---- 内存桩：认证服务（KDF 调用计数用计数器，不用耗时） ----
const users = new Map([
  ["alice", { tenant: "A", hash: "hash:alice:s3cr3t" }], // 预计算口令哈希（桩）
]);
const DUMMY_HASH = "hash:dummy:constant"; // 不存在用户也走一次 KDF，保证恒定路径

function makeAuth() {
  const stats = { kdfCalls: 0 };
  // 桩 KDF：记录调用次数并返回确定性字符串（真实实现应为 argon2/bcrypt）
  function kdf(secret) {
    stats.kdfCalls++;
    return `hash:${secret}`;
  }
  // 登录：无论用户是否存在，都执行恰好一次 KDF，返回结构完全一致的失败响应
  function login(username, password) {
    const u = users.get(username);
    const computed = kdf(password); // 恒定路径：先算，不因用户不存在而提前 return
    const ok = Boolean(u) && computed === u.hash;
    if (!ok) {
      // 泛化失败：不同失败原因返回同一结构（不泄露账号是否存在）
      return { status: 401, body: { code: "invalid_credentials" } };
    }
    return { status: 200, body: { ok: true } };
  }
  return { login, stats };
}

function makeConfig() {
  // 配置边界校验：分页 size 合法区间 [1, MAX]
  const MAX = 100;
  function parsePageSize(v) {
    if (v === undefined || v === null || v === "") return { ok: false, reason: "missing" };
    const n = Number(v);
    if (!Number.isInteger(n)) return { ok: false, reason: "not_integer" };
    if (n < 1) return { ok: false, reason: "below_min" };
    if (n > MAX) return { ok: false, reason: "above_max" };
    return { ok: true, value: n };
  }
  return { parsePageSize, MAX };
}

function makeServer() {
  // 启动期不变量：必需密钥/连接缺失 → 立即失败，绝不带病启动
  function start(config) {
    const required = ["dbUrl", "sessionSecret"];
    for (const k of required) {
      if (!config || !config[k]) {
        throw new Error(`startup invariant violated: missing ${k}`);
      }
    }
    return { listening: true };
  }
  return { start };
}

// 资源数据（含租户归属）
const items = new Map([
  ["item-a", { tenant: "A", data: "A-secret" }],
  ["item-b", { tenant: "B", data: "B-secret" }],
]);
// 跨租户读：以「会话租户」为准，拒绝非本租户，且不区分「存在但非本租户」与「不存在」
function readItem(sessionTenant, itemId) {
  const it = items.get(itemId);
  if (!it || it.tenant !== sessionTenant) {
    return { status: 404, body: null }; // 统一 404，不泄露 B 是否存在
  }
  return { status: 200, body: it.data };
}

// ---- 断言 ----
check("I/S · 账号不可区分：存在(密码错) 与 不存在 响应字节一致", () => {
  const a = makeAuth();
  const r1 = a.login("alice", "wrong-password");
  const r2 = a.login("nobody", "whatever");
  assert.equal(JSON.stringify(r1), JSON.stringify(r2), "两失败分支响应不可区分");
  assert.equal(r1.status, 401);
});

check("I · fail-fast 一致：两失败分支 KDF 调用计数相等（非耗时）", () => {
  const a = makeAuth();
  a.stats.kdfCalls = 0;
  a.login("alice", "wrong");
  const afterExisting = a.stats.kdfCalls;
  a.stats.kdfCalls = 0;
  a.login("nobody", "whatever");
  const afterMissing = a.stats.kdfCalls;
  assert.equal(afterExisting, afterMissing, `计算量不一致: ${afterExisting} != ${afterMissing}`);
  assert.equal(afterMissing, 1, "每次登录恰好一次 KDF（防止早退侧信道）");
});

check("T · 配置与输入边界：缺失/越界拒绝，合法两端接受", () => {
  const c = makeConfig();
  assert.equal(c.parsePageSize(undefined).ok, false, "缺失应拒绝");
  assert.equal(c.parsePageSize(0).ok, false, "below_min 应拒绝");
  assert.equal(c.parsePageSize(c.MAX + 1).ok, false, "above_max 应拒绝");
  assert.equal(c.parsePageSize(1).ok, true, "合法下界应接受");
  assert.equal(c.parsePageSize(c.MAX).ok, true, "合法上界应接受");
  // 拒绝时不回显敏感内部结构
  assert.equal(c.parsePageSize(0).reason, "below_min");
});

check("E · 启动期不变量：缺关键前置即 fail-fast", () => {
  const s = makeServer();
  assert.throws(() => s.start({ dbUrl: "x" }), /missing sessionSecret/, "缺 sessionSecret 应启动失败");
  assert.throws(() => s.start({}), /missing dbUrl/, "空配置应启动失败");
  const ok = s.start({ dbUrl: "x", sessionSecret: "y" });
  assert.equal(ok.listening, true, "前置齐备才监听");
});

check("E · 跨租户隔离：拒绝跨租户读且不泄露存在性", () => {
  assert.equal(readItem("A", "item-a").status, 200, "本租户应可读");
  const cross = readItem("A", "item-b");
  const nonexist = readItem("A", "item-does-not-exist");
  assert.equal(cross.status, 404, "跨租户应拒绝");
  assert.equal(JSON.stringify(cross), JSON.stringify(nonexist), "不得区分『他人资源』与『不存在』");
});

// ---- 汇总 ----
console.log("security_invariants_demo · 确定性安全约束验证");
console.log("=".repeat(56));
for (const r of results) console.log(r);
console.log("=".repeat(56));
const total = results.length;
console.log(`${passed}/${total} checks passed`);
if (passed !== total) {
  console.error("RESULT: FAIL");
  process.exit(1);
}
console.log("RESULT: OK（5 类安全约束均有确定性断言，含负路径；无墙钟、无外部依赖）");
process.exit(0);
