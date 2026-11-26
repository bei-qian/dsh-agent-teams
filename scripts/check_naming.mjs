#!/usr/bin/env node
/**
 * check_naming.mjs — 命名门禁（issue-12 / 0.2.0 身份改名）。零依赖，stdlib only。
 *
 * 为什么需要：包名 / preset id / 预设卡片标题是「产品身份层」。上游
 * `BMAD-METHOD/TRADEMARK.md:5-16` 把 BMad（含 bmad/BMAD 全大小写）列为
 * BMad Code, LLC 的商标，并明确 MIT 只覆盖代码、不覆盖品牌。能力矩阵门
 * （check_presets.mjs）与生成物一致性门（verify.mjs）都不看字面品牌，改名只能
 * 靠人肉 review 兜住 —— 本门把它变成确定性断言，并让两条负路径稳定变红：
 *   ① 把某 preset id 改回 `bmad-pm` → exit 1
 *   ② 把某 locale 标题写回 `BMAD …`   → exit 1
 *
 * 断言（白名单只作用于「描述」类文本；标题零容忍）：
 *   1) package.json#name === 'dsh-olympus' 且不含 bmad 字样；
 *   2) cordis.patch.yml 的 8 条 `- id: preset-<id>` 与 8 条 8 空格缩进的 `id: <id>`
 *      均不含 bmad；且全文不含 `preset-bmad-` / `id: bmad-`；
 *   3) locale/*.json 与 presets/*\/locale/*.json 的 meta.title 不含 bmad（**零白名单**）；
 *   4) 上述文件的 meta.description 不含 bmad（白名单见 ALLOWED_TOKENS：这些是本次
 *      明确不动的「路径 / skill id 契约」）。
 *
 * 另含「命名元变量」门禁（issue-29）：persona/*.md、bmad-squad-protocol/SKILL.md、
 * cordis.patch.yml 不得出现反引号包围的 `[a-z]+-n` 占位字面量，且 Roster 表须有 7 个
 * 成员行、每行第三列含 `-1` 示例。
 *
 * 明确不做：不校验花名与 id 的对应关系（那是 scripts/verify.mjs 的 expectedRows
 * 精确等值断言）；不扫描其它 playbooks/ 与 skills/ 正文（范围外，见 issue 遗留清单）。
 * 不检查生成物是否最新（verify.mjs 第 1 段负责）。
 *
 * Exit 0 = OK, 1 = 命中禁止字样 / 包名漂移 / 必备文件读不到。
 * 由 scripts/verify.mjs 第 13 段内联执行（CI 唯一入口仍是 verify.mjs）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = path.join(ROOT, 'package.json')
const PATCH = path.join(ROOT, 'cordis.patch.yml')

const EXPECTED_PKG_NAME = 'dsh-olympus'
const BANNED_TOKEN = 'bmad' // 小写比较，覆盖 BMad / bmad / BMAD
// 「本次明确不动的契约」：允许出现在提示/描述文本里的路径与 skill id 前缀。
const ALLOWED_TOKENS = ['bmad-output', 'bmad-squad-protocol', 'playbooks/bmad-', 'skills/bmad-', 'bmad-agent-' ]

const errors = []
const fail = (msg) => errors.push(msg)
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf-8'))
const isDir = (p) => { try { return fs.statSync(p).isDirectory() } catch { return false } }

function excerpt(text, index) {
  const from = Math.max(0, index - 24)
  return JSON.stringify(text.slice(from, index + 24))
}

/** 命中禁止字样则记录错误；allow 里的子串先从文本里抹掉再比对。 */
function assertClean(label, text, { allow = [] } = {}) {
  let t = String(text == null ? '' : text)
  for (const token of allow) t = t.split(token).join('')
  const i = t.toLowerCase().indexOf(BANNED_TOKEN)
  if (i !== -1) fail(`${label}: 出现禁止字样（上下文 ${excerpt(t, i)}）`)
}

// ---- 1) package name --------------------------------------------------------
let pkg
try {
  pkg = readJson(PKG)
} catch (e) {
  fail(`cannot read/parse package.json: ${e.message}`)
}
if (pkg) {
  if (pkg.name !== EXPECTED_PKG_NAME) {
    fail(`package.json#name is ${JSON.stringify(pkg.name)}, expected ${JSON.stringify(EXPECTED_PKG_NAME)}`)
  }
  assertClean('package.json#name', pkg.name)
}

// ---- 2) preset ids in the generated bundle patch ----------------------------
let patch = ''
try {
  patch = fs.readFileSync(PATCH, 'utf-8')
} catch (e) {
  fail(`cannot read cordis.patch.yml: ${e.message}`)
}
if (patch) {
  const rowIds = [...patch.matchAll(/^\s*- id: preset-([A-Za-z0-9_-]+)\s*$/gm)].map((m) => m[1])
  const configIds = [...patch.matchAll(/^ {8}id: ([A-Za-z0-9_-]+)\s*$/gm)].map((m) => m[1])
  if (rowIds.length !== 8) fail(`expected 8 preset rows (preset-*), found ${rowIds.length}: [${rowIds.join(', ')}]`)
  if (configIds.length !== 8) fail(`expected 8 config ids at indent 8, found ${configIds.length}: [${configIds.join(', ')}]`)
  for (const id of [...rowIds, ...configIds]) assertClean(`preset id ${JSON.stringify(id)}`, id)
  if (patch.includes('preset-bmad-')) fail('cordis.patch.yml 仍含 "preset-bmad-"（旧 preset 行 id）')
  if (/^ {8}id: bmad-/m.test(patch)) fail('cordis.patch.yml 仍含 "id: bmad-"（旧 config id）')
}

// ---- 3) + 4) locale cards: titles zero-tolerance, descriptions allowlisted --
const localeTargets = [path.join(ROOT, 'locale')]
const presetsDir = path.join(ROOT, 'presets')
if (isDir(presetsDir)) {
  for (const name of fs.readdirSync(presetsDir).sort()) {
    const d = path.join(presetsDir, name, 'locale')
    if (isDir(d)) localeTargets.push(d)
  }
}

let localeFiles = 0
for (const dir of localeTargets) {
  for (const loc of ['en', 'zh']) {
    const fp = path.join(dir, `${loc}.json`)
    let meta
    try {
      meta = (readJson(fp) || {}).meta || {}
    } catch (e) {
      if (fs.existsSync(fp)) fail(`cannot parse ${path.relative(ROOT, fp)}: ${e.message}`)
      continue
    }
    if (!fs.existsSync(fp)) continue
    localeFiles += 1
    const rel = path.relative(ROOT, fp)
    if (typeof meta.title !== 'string' || !meta.title.trim()) {
      fail(`${rel}: missing meta.title`)
    } else {
      assertClean(`${rel} title`, meta.title)
    }
    if (typeof meta.description !== 'string' || !meta.description.trim()) {
      fail(`${rel}: missing meta.description`)
    } else {
      assertClean(`${rel} description`, meta.description, { allow: ALLOWED_TOKENS })
    }
  }
}
if (localeFiles !== 18) fail(`expected 18 locale cards (locale/*2 + presets/*2*8), parsed ${localeFiles}`)

// ---- 5) 命名元变量：禁止把 `-n` 占位当字面量（issue #29） ------------------
// 根因：Roster / 命名前缀表把序号元变量写成反引号字面量（如 `argus-n`），模型
// 照抄导致委派传 name="argus-n"。把它变成确定性门禁：
//   ① 扫描 persona/*.md、SKILL.md、cordis.patch.yml，命中反引号包围的
//      `[a-z]+-n` 字面量即 fail；
//   ② 正向断言 SKILL.md Roster 表 7 个成员行、每行第三列含 `-1` 示例。
const META_VAR_NAME_SRC = '`[a-z]+-n`'

function scanMetaVarLiteral(label, text) {
  const re = new RegExp(META_VAR_NAME_SRC, 'g')
  const hits = [...String(text == null ? '' : text).matchAll(re)].map((m) => m[0])
  if (hits.length) {
    fail(`${label}: 含命名元变量字面量 ${hits.join(', ')}（应写具体数字，如 \`apollo-1\`）`)
  }
}

// 5a) persona/*.md
const personaDir = path.join(ROOT, 'persona')
if (isDir(personaDir)) {
  for (const name of fs.readdirSync(personaDir).sort()) {
    if (!name.endsWith('.md')) continue
    const fp = path.join(personaDir, name)
    scanMetaVarLiteral(path.relative(ROOT, fp), fs.readFileSync(fp, 'utf-8'))
  }
} else {
  fail('persona/ 目录不存在，无法执行命名元变量门禁')
}

// 5b) SKILL.md（含正向断言：Roster 表 7 个成员行、第三列含 -1 示例）
const PROTO_SKILL = path.join(ROOT, 'playbooks', 'bmad-squad-protocol', 'SKILL.md')
let proto = ''
try {
  proto = fs.readFileSync(PROTO_SKILL, 'utf-8')
  scanMetaVarLiteral(path.relative(ROOT, PROTO_SKILL), proto)
} catch (e) {
  fail(`cannot read ${path.relative(ROOT, PROTO_SKILL)}: ${e.message}`)
}
if (proto) {
  const start = proto.indexOf('Roster 角色前缀')
  const end = proto.indexOf('**命名规则**', start === -1 ? 0 : start)
  if (start === -1 || end === -1) {
    fail('SKILL.md: 找不到「Roster 角色前缀」表或「命名规则」分隔，无法执行正向断言')
  } else {
    const rows = proto
      .slice(start, end)
      .split('\n')
      .filter((l) => /^\|.*\|$/.test(l.trim()))
      .map((l) => l.trim().slice(1, -1).split('|').map((c) => c.trim()))
    const memberRows = rows
      .slice(2) // 跳过表头 + 分隔行
      .filter((c) => c.length === 3 && c[2] && c[2] !== '（自身，不代为命名）')
    if (memberRows.length !== 7) {
      fail(`SKILL.md Roster: 期望 7 个成员行（第三列显示名含 -1 示例），实际 ${memberRows.length} 行`)
    }
    for (const c of memberRows) {
      if (!c[2].includes('-1')) {
        fail(`SKILL.md Roster 行 ${JSON.stringify(c[0])} 第三列 ${JSON.stringify(c[2])} 缺 -1 示例`)
      }
    }
  }
}

// 5c) cordis.patch.yml
if (patch) scanMetaVarLiteral('cordis.patch.yml', patch)

// ---- report ----------------------------------------------------------------
if (errors.length) {
  console.log('CHECK-NAMING FAILED:')
  for (const e of errors) console.log('  -', e)
  process.exit(1)
}
console.log(`CHECK-NAMING OK: pkg=${EXPECTED_PKG_NAME}, 8 preset ids, ${localeFiles} locale cards clean`)
