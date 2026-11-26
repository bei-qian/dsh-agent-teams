#!/usr/bin/env node
// check_skill_descriptions.mjs — 仓库级 trigger 契约的确定性校验。
//
// 零依赖（仅 Node 内置模块）、离线、确定性：不联网、不调用任何模型、不新增第三方依赖。
// 校验内容：
//   1) 覆盖：evals/trigger/fixture.json 的 skill 集合 == 仓库 skill 集合（playbooks/* + capabilities/* = 20）。
//   2) 长度：每个 skill 的 frontmatter description ≤ 1024 字符。
//   3) 触发短语：7 个目标 playbook 的 description 必须含识别触发标记（正则集见 TRIGGER_PATTERNS）。
//      capability 的触发信息校验落在其 whenToUse + metadata.triggers（不改 capability description）。
//   4) 负例存在：每条 fixture 必须同时含 should_trigger 与 near-miss should_not_trigger。
//   5) shadows/ 6 占位以 exempt:true 标注、注明原因，不计入必需 skill 集。
// 全部通过 → 打印摘要 exit 0；任一违规 → 打印缺项 exit 1。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 7 个目标 playbook（description 必须补「何时用 / Use when…」触发语）
const TARGET_PLAYBOOKS = [
  'bmad-architecture', 'bmad-build', 'bmad-prd', 'bmad-research',
  'bmad-test-strategy', 'bmad-tickets', 'bmad-ux',
]

// 识别触发短语正则集（命中任一即视为合格）。dev 可扩充，但只增不改语义。
const TRIGGER_PATTERNS = [
  /Use when/i,            // Use when…
  /当[^。\n]{0,40}时/,     // 当……时
  /何时用/,                // 何时用
  /适用/,                  // 适用…
  /使用场景/,              // 使用场景
  /when to use/i,          // When to use
  /should be used when/i,  // should be used when…
]

const MAX_LEN = 1024
const FIXTURE_PATH = path.join(ROOT, 'evals', 'trigger', 'fixture.json')
const SHADOWS_PATH = path.join(ROOT, 'shadows', 'targets.json')

const errors = []
const fail = (msg) => errors.push(msg)

function listSkillDirs(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort()
}

function readFrontmatter(file) {
  const txt = fs.readFileSync(file, 'utf8')
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  return m ? m[1] : ''
}

// 顶层键（description / whenToUse）：行首 `key:` 到行尾
function topField(fm, key) {
  const m = fm.match(new RegExp('^' + key + ':\\s*(.*)$', 'm'))
  return m ? m[1].trim() : null
}

// metadata 块内的 inline 数组 `triggers: [a, b]`（排除 negative_triggers，因其前缀不是纯空白）
function metaTriggers(fm) {
  const m = fm.match(/^[ \t]+triggers:\s*\[([^\]]*)\]/m)
  if (!m) return null
  return m[1].split(',').map((s) => s.trim()).filter(Boolean)
}

const len = (s) => [...s].length

// ---- 发现仓库 skill 集 ----
const playbooks = listSkillDirs(path.join(ROOT, 'playbooks'))
const capabilities = listSkillDirs(path.join(ROOT, 'capabilities'))
const pbSet = new Set(playbooks)
const capSet = new Set(capabilities)
const repoSkills = new Set([...playbooks, ...capabilities])

// ---- 读取 fixture ----
let fixture
try {
  fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
} catch (e) {
  console.error('✗ 无法读取/解析 evals/trigger/fixture.json：' + e.message)
  process.exit(1)
}
const entries = Array.isArray(fixture.skills) ? fixture.skills : []
const exempt = Array.isArray(fixture.exempt) ? fixture.exempt : []

// ---- 1. 覆盖集合相等 ----
const fixtureIds = new Set(entries.map((e) => e.id))
const missing = [...repoSkills].filter((id) => !fixtureIds.has(id)).sort()
const extra = [...fixtureIds].filter((id) => !repoSkills.has(id)).sort()
if (missing.length) fail(`fixture 覆盖缺口（缺 skill 条目）：${missing.join(', ')}`)
if (extra.length) fail(`fixture 含仓库不存在的 skill 条目：${extra.join(', ')}`)

// ---- 2. 每条 fixture：type 一致 + should / near-miss 负例齐全 ----
for (const e of entries) {
  const expectedType = pbSet.has(e.id) ? 'playbook' : capSet.has(e.id) ? 'capability' : null
  if (expectedType && e.type !== expectedType) {
    fail(`fixture[${e.id}] type=${JSON.stringify(e.type)} 与仓库类型 ${expectedType} 不一致`)
  }
  if (!Array.isArray(e.should_trigger) || e.should_trigger.length === 0) {
    fail(`fixture[${e.id}] 缺 should_trigger（应命中查询）`)
  }
  if (!Array.isArray(e.should_not_trigger) || e.should_not_trigger.length === 0) {
    fail(`fixture[${e.id}] 缺 near-miss should_not_trigger（负例）`)
  }
}

// ---- 3. playbook：description 长度 + 目标 playbook 触发短语 ----
for (const name of playbooks) {
  const file = path.join(ROOT, 'playbooks', name, 'SKILL.md')
  const desc = topField(readFrontmatter(file), 'description')
  if (!desc) {
    fail(`playbooks/${name}/SKILL.md frontmatter 缺 description`)
    continue
  }
  if (len(desc) > MAX_LEN) {
    fail(`playbooks/${name}/SKILL.md description 超长：${len(desc)} > ${MAX_LEN}`)
  }
  if (TARGET_PLAYBOOKS.includes(name)) {
    const hit = TRIGGER_PATTERNS.some((re) => re.test(desc))
    if (!hit) fail(`目标 playbook ${name} 的 description 缺识别触发短语（Use when / 当…时 / 何时用 / 适用 等）`)
  }
}

// ---- 4. capability：description 长度 + whenToUse + metadata.triggers（不改 description）----
for (const name of capabilities) {
  const file = path.join(ROOT, 'capabilities', name, 'SKILL.md')
  const fm = readFrontmatter(file)
  const desc = topField(fm, 'description')
  if (!desc) fail(`capabilities/${name}/SKILL.md frontmatter 缺 description`)
  else if (len(desc) > MAX_LEN) fail(`capabilities/${name}/SKILL.md description 超长：${len(desc)} > ${MAX_LEN}`)
  const when = topField(fm, 'whenToUse')
  if (!when) fail(`capabilities/${name}/SKILL.md frontmatter 缺 whenToUse`)
  const triggers = metaTriggers(fm)
  if (!triggers || triggers.length === 0) fail(`capabilities/${name}/SKILL.md 缺 metadata.triggers（非空数组）`)
}

// ---- 5. shadows 6 占位 exempt，不计入必需集 ----
let shadowNames = []
try {
  const t = JSON.parse(fs.readFileSync(SHADOWS_PATH, 'utf8'))
  shadowNames = (t.targets || []).map((x) => x.name)
} catch (e) {
  fail(`无法读取 shadows/targets.json：${e.message}`)
}
if (shadowNames.length !== 6) fail(`shadows/targets.json 占位应为 6，实际 ${shadowNames.length}`)
const exemptIds = new Set(exempt.map((x) => x.id))
for (const n of shadowNames) {
  if (!exemptIds.has(n)) fail(`shadows 占位 ${n} 未在 fixture exempt 中标注`)
}
for (const x of exempt) {
  if (x.exempt !== true) fail(`exempt 项 ${x.id} 缺 exempt:true`)
  if (!x.exempt_reason || !String(x.exempt_reason).trim()) fail(`exempt 项 ${x.id} 缺 exempt_reason`)
  if (repoSkills.has(x.id)) fail(`exempt 项 ${x.id} 不应属于必需 skill 集（覆盖集合应为 20）`)
}

// ---- 汇总 ----
if (errors.length) {
  console.error(`✗ trigger 契约校验失败：${errors.length} 项`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

console.log('✓ trigger 契约校验通过（离线 · 确定性 · 零依赖）')
console.log(`  覆盖：${repoSkills.size} skill（${playbooks.length} playbook + ${capabilities.length} capability），fixture 集合相等`)
console.log(`  目标 playbook 触发短语：${TARGET_PLAYBOOKS.length}/${TARGET_PLAYBOOKS.length} 齐全（Use when / 当…时 / 何时用 / 适用 等）`)
console.log(`  长度：全部 description ≤ ${MAX_LEN} 字符`)
console.log(`  负例：${entries.length}/${entries.length} 条 fixture 均含 should_trigger + near-miss should_not_trigger`)
console.log(`  shadows exempt：${exempt.length}（exempt:true，非 skill（issue-28 占位），不计入必需集）`)
process.exit(0)
