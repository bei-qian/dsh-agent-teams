#!/usr/bin/env node
/**
 * Validate the dsh-agent-teams bundle (zero dependencies, stdlib only).
 *
 * Checks:
 *   - cordis.patch.yml is in sync with cordis.patch.tmpl.yml + prompts/*.md
 *   - 8 agent presets with the expected ids exist
 *   - the leader's 7 delegate tools point at existing member presets
 *   - the bundled skills/ is kept on disk, not wired (the enable path is playbooks/)
 *   - the bundled skills/ actually contains the BMad skills
 *   - the 6 P0 capability modules exist under capabilities/, each SKILL.md has a
 *     complete frontmatter (name==dir/kebab, description, whenToUse, metadata.domain,
 *     metadata.priority), and every module's evals cover the 5 categories
 *   - every capabilities/*\/scripts/run_evals.mjs runs deterministically (exit 0) and
 *     the capability-router's validate_selection passes each fixture's expect.exit
 *     (so CI running verify.mjs covers all 6 modules' deterministic evals)
 *   - display metadata (locale en/zh, icon, version, bundle patch) is present
 *
 * Exit 0 = OK, 1 = problems. Runs in CI via .github/workflows/verify.yml.
 *
 * Byte-for-byte behavior port of the former verify.py: ~60 assertions in 14
 * blocks, errors collected and reported once at the end (never return on first failure).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXPECTED_PRESETS = new Set([
  'bmad-squad-lead', 'bmad-analyst', 'bmad-pm', 'bmad-po',
  'bmad-ux', 'bmad-architect', 'bmad-dev', 'bmad-tea',
])
const REQUIRED_SKILLS = ['bmad', 'bmad-agent-analyst', 'bmad-agent-pm', 'bmad-agent-dev',
  'bmad-agent-architect', 'bmad-facilitate', 'bmad-build', 'bmad-tea']

// The 6 P0 capability modules that must all be present under capabilities/ (ADR-A1).
const REQUIRED_CAPABILITIES = [
  'capability-router',
  'cap-task-coordination',
  'cap-debugging-systematic',
  'cap-code-review',
  'cap-security-baseline',
  'cap-testing-strategy',
]
// Modules that must ship a deterministic run_evals.mjs (router uses validate_selection).
const REQUIRED_RUN_EVAL_MODULES = new Set([
  'cap-debugging-systematic', 'cap-code-review', 'cap-task-coordination',
  'cap-security-baseline', 'cap-testing-strategy',
])
// The 5 fixture categories every eval-bearing module must cover (ARCH §7.2).
const REQUIRED_EVAL_CATEGORIES = ['normal', 'boundary', 'ambiguous', 'negative-trigger', 'regression']
// Fixture filename/kind token -> canonical category. Most modules tag fixtures with an
// explicit `category` field; cap-task-coordination instead encodes the category via its
// filename token + `kind` (see its evals/README.md). Map both to one canonical set so the
// coverage gate enforces all five categories uniformly without editing module fixtures.
const CATEGORY_ALIASES = {
  normal: 'normal',
  boundary: 'boundary',
  ambiguous: 'ambiguous',
  negative: 'negative-trigger',
  'negative-trigger': 'negative-trigger',
  regression: 'regression',
  review: 'regression', // cap-task-coordination kind "review" is its regression case
}

const errors = []

// ---- small stdlib helpers ---------------------------------------------------
const read = (p) => fs.readFileSync(p, 'utf-8')
const exists = (p) => {
  try { fs.accessSync(p); return true } catch { return false }
}
const isDir = (p) => {
  try { return fs.statSync(p).isDirectory() } catch { return false }
}
const listDir = (p) => (isDir(p) ? fs.readdirSync(p) : [])
const join = (...parts) => path.join(...parts)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Python str.strip("\"'") for scalar YAML values.
const stripQuotes = (s) => s.trim().replace(/^["']+|["']+$/g, '')
const pyRepr = (v) => (typeof v === 'string' ? `'${v}'` : 'None')
const pyList = (arr) => `[${arr.map((x) => `'${x}'`).join(', ')}]`

function check(cond, msg) {
  if (!cond) errors.push(msg)
}

// Render a spawnSync result's termination cause, distinguishing signal kill from exit.
function fmtExit(r) {
  return r.status === null ? `killed by signal ${r.signal}` : `exit ${r.status}`
}
// Python `(r.stdout or r.stderr)` tail, used inside failure messages.
function tail(r, n) {
  const s = r.stdout || r.stderr || ''
  return s.trim().slice(-n)
}

function frontmatterText(skillMd) {
  // Return the leading YAML frontmatter body (between the --- fences), or null.
  let text
  try { text = read(skillMd) } catch { return null }
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end === -1) return null
  return text.slice(3, end)
}

function frontmatterField(fm, key) {
  // Return a scalar top-level `key: value` from the frontmatter, or null.
  const m = new RegExp(`^${escapeRe(key)}:\\s*(.+)$`, 'm').exec(fm)
  return m ? stripQuotes(m[1]) : null
}

function metadataFields(fm) {
  // Return the nested `metadata:` mapping (only scalar values) from the frontmatter.
  const out = {}
  let inMeta = false
  for (const line of fm.split(/\r?\n/)) {
    if (/^metadata:\s*$/.test(line)) { inMeta = true; continue }
    if (!inMeta) continue
    if (line.trim() === '') continue
    if (!/^\s/.test(line)) break // dedented out of the metadata block
    const m = /^\s+([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (m) out[m[1]] = stripQuotes(m[2])
  }
  return out
}

function walkMarkdown(dir) {
  const out = []
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    for (const name of fs.readdirSync(d)) {
      const fp = join(d, name)
      const st = fs.statSync(fp)
      if (st.isDirectory()) stack.push(fp)
      else if (name.endsWith('.md')) out.push(fp)
    }
  }
  return out
}

// ---- main -------------------------------------------------------------------
function main() {
  // 1. generated patch in sync with sources
  const d = fs.mkdtempSync(join(os.tmpdir(), 'dsh-verify-'))
  try {
    const out = join(d, 'cordis.patch.yml')
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build_patch.mjs'), '--out', out],
      { encoding: 'utf-8' })
    if (r.status !== 0) {
      const buildOut = (r.stderr || r.stdout || '').trim()
      errors.push('build_patch.mjs failed: ' + (buildOut || fmtExit(r)))
    } else {
      const committed = read(join(ROOT, 'cordis.patch.yml'))
      check(committed === read(out), 'cordis.patch.yml is out of date — run: node scripts/build_patch.mjs')
    }
  } finally {
    fs.rmSync(d, { recursive: true, force: true })
  }

  const patch = read(join(ROOT, 'cordis.patch.yml'))

  // 2. presets
  const presetRows = [...patch.matchAll(/- id: preset-(bmad-[a-z-]+)/g)].map((m) => m[1])
  check(presetRows.length === 8, `expected 8 preset rows, found ${presetRows.length}`)
  const ids = new Set([...patch.matchAll(/^ {8}id: (bmad-[a-z-]+)$/gm)].map((m) => m[1]))
  const missingPresets = [...EXPECTED_PRESETS].filter((p) => !ids.has(p)).sort()
  check(missingPresets.length === 0, `missing preset ids: ${pyList(missingPresets)}`)

  // 3. delegation wiring
  const delegates = [...patch.matchAll(/agentPreset: (bmad-[a-z-]+)/g)].map((m) => m[1])
  check(delegates.length === 7, `expected 7 delegate tools, found ${delegates.length}`)
  for (const ap of delegates) {
    check(ids.has(ap), `delegate agentPreset '${ap}' has no matching preset id`)
  }

  // 3b. per-member model selection: every delegate_* tool exposes optional
  //     provider/model/reasoning_effort (modelSelection), and exactly one instance
  //     per scope registers list_subagent_models (modelDiscovery).
  const nModelSelection = [...patch.matchAll(/^\s+modelSelection: true$/gm)].length
  check(nModelSelection === 7,
    `expected 7 delegate tools with modelSelection: true, found ${nModelSelection}`)
  const nModelDiscovery = [...patch.matchAll(/^\s+modelDiscovery: true$/gm)].length
  check(nModelDiscovery === 1,
    `expected exactly 1 modelDiscovery: true (one per scope), found ${nModelDiscovery}`)

  // 4. playbook wiring + bundled skills content (full BMad kept on disk, not wired)
  const nCustomSkillDirs = (patch.match(/customSkillDirs/g) || []).length
  check(nCustomSkillDirs === 8, `expected 8 customSkillDirs rows, found ${nCustomSkillDirs}`)
  const nPlaybookDirs = patch.split("'playbooks')").length - 1
  check(nPlaybookDirs === 8, `expected 8 skill dirs pointing at playbooks, found ${nPlaybookDirs}`)
  const playbooks = join(ROOT, 'playbooks')
  const pb = listDir(playbooks).filter((n) => isDir(join(playbooks, n)) && exists(join(playbooks, n, 'SKILL.md')))
  check(pb.length >= 8, `expected >=8 playbook skills, found ${pb.length}`)
  for (const need of ['bmad-squad-protocol', 'bmad-research', 'bmad-prd', 'bmad-tickets',
    'bmad-ux', 'bmad-architecture', 'bmad-build', 'bmad-test-strategy']) {
    check(exists(join(playbooks, need, 'SKILL.md')), `missing playbook: ${need}`)
  }
  // 4b. bmad-project-context playbook (AGENTS.md capability) present + stays zero-dependency
  const pc = join(playbooks, 'bmad-project-context')
  check(exists(join(pc, 'SKILL.md')), 'missing playbooks/bmad-project-context/SKILL.md')
  check(exists(join(pc, 'references', 'best-practices.md')),
    'missing playbooks/bmad-project-context/references/best-practices.md')
  check(exists(join(pc, 'references', 'template.md')),
    'missing playbooks/bmad-project-context/references/template.md')
  if (exists(join(pc, 'SKILL.md'))) {
    const pcText = read(join(pc, 'SKILL.md'))
    check(!pcText.includes('uv run') && !pcText.includes('_bmad'),
      "playbooks/bmad-project-context/SKILL.md must stay zero-dependency (no 'uv run' or '_bmad')")
  }
  // 4c. modern-web-guidance playbook present, guides/ non-empty, zero-dependency markdown-only.
  const mwg = join(playbooks, 'modern-web-guidance')
  check(exists(join(mwg, 'SKILL.md')), 'missing playbooks/modern-web-guidance/SKILL.md')
  const mwgGuides = join(mwg, 'guides')
  const mwgGuideFiles = isDir(mwgGuides) ? walkMarkdown(mwgGuides) : []
  check(mwgGuideFiles.length > 0,
    'playbooks/modern-web-guidance/guides is empty (expected markdown guides)')
  if (exists(join(mwg, 'SKILL.md'))) {
    const mwgText = read(join(mwg, 'SKILL.md'))
    check(!mwgText.includes('uv run') && !mwgText.includes('_bmad'),
      "playbooks/modern-web-guidance/SKILL.md must stay zero-dependency (no 'uv run' or '_bmad')")
  }
  // 4d. independent capabilities/ second skill root (ADR-A1 option B, Gate 2 decision):
  //     every preset also wires <pkg>/capabilities; each capabilities/*/SKILL.md has a
  //     frontmatter name == its dir name and kebab. Playbooks assertions above stay unchanged.
  const nCapabilityDirs = patch.split("'capabilities')").length - 1
  check(nCapabilityDirs === 8, `expected 8 skill dirs pointing at capabilities, found ${nCapabilityDirs}`)
  const capabilities = join(ROOT, 'capabilities')
  check(isDir(capabilities), 'missing capabilities/ root directory')
  const capSkills = listDir(capabilities)
    .filter((n) => isDir(join(capabilities, n)) && exists(join(capabilities, n, 'SKILL.md')))
  const capNames = new Set(capSkills)
  for (const need of REQUIRED_CAPABILITIES) {
    check(capNames.has(need), `missing P0 capability module: capabilities/${need}/SKILL.md`)
  }
  check(capSkills.length >= 6, `expected >=6 capability skills (6 P0), found ${capSkills.length}`)
  for (const cdir of capSkills) {
    const fm = frontmatterText(join(capabilities, cdir, 'SKILL.md'))
    const nm = fm !== null ? frontmatterField(fm, 'name') : null
    check(nm !== null, `capabilities/${cdir}/SKILL.md missing frontmatter name`)
    check(nm === cdir,
      `capabilities/${cdir}/SKILL.md frontmatter name ${pyRepr(nm)} != dir name ${pyRepr(cdir)}`)
    check(Boolean(nm) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nm || ''),
      `capabilities/${cdir}/SKILL.md name ${pyRepr(nm)} is not kebab-case`)
    const desc = fm !== null ? frontmatterField(fm, 'description') : null
    check(Boolean(desc && desc.trim()),
      `capabilities/${cdir}/SKILL.md frontmatter missing/empty description ` +
      '(skill would be untriggerable in the catalog)')
    const when = fm !== null ? frontmatterField(fm, 'whenToUse') : null
    check(Boolean(when && when.trim()),
      `capabilities/${cdir}/SKILL.md frontmatter missing/empty whenToUse`)
    const meta = fm !== null ? metadataFields(fm) : {}
    check(Boolean((meta.domain || '').trim()),
      `capabilities/${cdir}/SKILL.md frontmatter missing metadata.domain`)
    check(Boolean((meta.priority || '').trim()),
      `capabilities/${cdir}/SKILL.md frontmatter missing metadata.priority`)
  }

  // 4e. deterministic module evals: run every capabilities/*/scripts/run_evals.mjs so a
  //     green verify.mjs in CI covers ALL capability modules (not just the router).
  const hasNode = spawnSync('node', ['-v'], { encoding: 'utf-8' }).status === 0
  check(hasNode, 'node is required to run capability module evals (deterministic layer)')
  const ranEvalModules = []
  if (isDir(capabilities) && hasNode) {
    const evalModules = listDir(capabilities)
      .filter((n) => isDir(join(capabilities, n)) && exists(join(capabilities, n, 'scripts', 'run_evals.mjs')))
      .sort()
    const missingRunner = [...REQUIRED_RUN_EVAL_MODULES].filter((m) => !evalModules.includes(m)).sort()
    check(missingRunner.length === 0,
      `missing scripts/run_evals.mjs in capability modules: ${pyList(missingRunner)}`)
    for (const mod of evalModules) {
      const script = join(capabilities, mod, 'scripts', 'run_evals.mjs')
      const rv = spawnSync(process.execPath, [script], { cwd: join(capabilities, mod), encoding: 'utf-8' })
      if (rv.status === 0) {
        ranEvalModules.push(mod)
        console.log(`  [eval-ok] ${mod}/run_evals.mjs (exit 0)`)
      } else {
        check(false, `${mod}/scripts/run_evals.mjs failed ${fmtExit(rv)}: ${tail(rv, 400)}`)
      }
    }
  }

  // 4f. capability-router reference module present (SKILL/references/scripts/SOURCE + evals)
  const router = join(capabilities, 'capability-router')
  for (const rel of ['SKILL.md', 'references/capability-index.yaml', 'references/routing-rules.md',
    'scripts/validate_selection.mjs', 'SOURCE.md']) {
    check(exists(join(router, rel)), `missing capabilities/capability-router/${rel}`)
  }
  //     zero-dependency validator: run it on every eval fixture; exit must match expect.exit
  const vsel = join(router, 'scripts', 'validate_selection.mjs')
  const routerEvalsDir = join(router, 'evals')
  let routerFixtureCount = 0
  if (exists(vsel) && hasNode) {
    const fixtures = listDir(routerEvalsDir).filter((n) => n.endsWith('.json')).sort()
    routerFixtureCount = fixtures.length
    check(fixtures.length >= 5,
      `expected >=5 capability-router eval fixtures, found ${fixtures.length}`)
    for (const fx of fixtures) {
      const fxPath = join(routerEvalsDir, fx)
      let exp
      try { exp = (JSON.parse(read(fxPath)).expect || {}).exit } catch { exp = undefined }
      const rv = spawnSync(process.execPath, [vsel, fxPath], { encoding: 'utf-8' })
      if (typeof exp === 'number') {
        check(rv.status !== null && (rv.status === 0) === (exp === 0),
          `validate_selection on ${fx} ${fmtExit(rv)} != expect.exit ${exp}: ${tail(rv, 300)}`)
      } else {
        check(rv.status === 0 || rv.status === 1,
          `validate_selection on ${fx} crashed ${fmtExit(rv)}: ${(rv.stderr || rv.stdout || '').trim().slice(-300)}`)
      }
    }
    console.log(`  [router] validate_selection × ${routerFixtureCount} fixtures (expect.exit asserted)`)
  }

  // 4g. fixture category coverage: every module with an evals/ dir must cover all 5
  //     categories. Category is read from each fixture's `category` field; when absent
  //     (cap-task-coordination encodes it via filename/kind), resolve via CATEGORY_ALIASES.
  if (isDir(capabilities)) {
    for (const cdir of listDir(capabilities).filter((n) => isDir(join(capabilities, n))).sort()) {
      const evd = join(capabilities, cdir, 'evals')
      if (!isDir(evd)) continue
      const fixtures = listDir(evd).filter((n) => n.endsWith('.json')).sort()
      if (fixtures.length === 0) continue
      const seenCats = new Set()
      for (const fx of fixtures) {
        let doc
        try { doc = JSON.parse(read(join(evd, fx))) } catch { continue }
        let cat = doc.category
        if (!REQUIRED_EVAL_CATEGORIES.includes(cat)) {
          const hay = (fx.replace(/\.json$/, '') + ' ' + String(doc.kind || '')).toLowerCase()
          const toks = new Set(hay.split(/[^a-z]+/))
          cat = null
          for (const t of toks) {
            if (t in CATEGORY_ALIASES) { cat = CATEGORY_ALIASES[t]; break }
          }
        }
        if (REQUIRED_EVAL_CATEGORIES.includes(cat)) seenCats.add(cat)
      }
      const missingCats = REQUIRED_EVAL_CATEGORIES.filter((c) => !seenCats.has(c))
      check(fixtures.length >= 5, `capabilities/${cdir}/evals has ${fixtures.length} fixtures (<5)`)
      check(missingCats.length === 0,
        `capabilities/${cdir}/evals missing category coverage: ${pyList(missingCats)} ` +
        `(saw ${pyList([...seenCats].sort())})`)
    }
  }
  const skills = join(ROOT, 'skills')
  const skillDirs = listDir(skills)
    .filter((n) => isDir(join(skills, n)) && exists(join(skills, n, 'SKILL.md')))
  check(skillDirs.length >= 38, `expected >=38 bundled skills, found ${skillDirs.length}`)
  for (const need of REQUIRED_SKILLS) {
    check(exists(join(skills, need, 'SKILL.md')), `missing bundled skill: ${need}`)
  }

  // 5. display metadata
  for (const loc of ['en', 'zh']) {
    const p = join(ROOT, 'locale', `${loc}.json`)
    check(exists(p), `missing locale/${loc}.json`)
    if (exists(p)) {
      try {
        const meta = JSON.parse(read(p)).meta || {}
        check(Boolean(meta.title) && Boolean(meta.description),
          `locale/${loc}.json missing meta.title/description`)
      } catch (e) {
        errors.push(`locale/${loc}.json invalid JSON: ${e.message}`)
      }
    }
  }
  check(exists(join(ROOT, 'icon.svg')), 'missing icon.svg')
  const pkg = JSON.parse(read(join(ROOT, 'package.json')))
  check(pkg.version === '0.1.1', `unexpected version ${pkg.version} (expected 0.1.1)`)
  check(Boolean(pkg && pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch),
    'package.json missing dsh.bundle.patch')

  // 7. per-row plugin list identity: each preset mounts its own thin module + locale so
  //    DSH's Plugins list shows the role name/description instead of the shared
  //    "@deepseek-ai/dsh-agent-preset" text.
  const expectedRows = {
    'bmad-squad-lead': ['squad-lead', 'BMad 小队 · 调度', 'BMad squad · Lead'],
    'bmad-analyst': ['analyst', '〔内部成员〕BMad · Mary 业务分析师', '[Internal] BMad · Mary (Analyst)'],
    'bmad-pm': ['pm', '〔内部成员〕BMad · John 产品经理', '[Internal] BMad · John (PM)'],
    'bmad-po': ['po', '〔内部成员〕BMad · Sofia 产品负责人', '[Internal] BMad · Sofia (PO)'],
    'bmad-ux': ['ux', '〔内部成员〕BMad · Sally UX 设计师', '[Internal] BMad · Sally (UX)'],
    'bmad-architect': ['architect', '〔内部成员〕BMad · Winston 架构师', '[Internal] BMad · Winston (Architect)'],
    'bmad-dev': ['dev', '〔内部成员〕BMad · Amelia 开发者', '[Internal] BMad · Amelia (Dev)'],
    'bmad-tea': ['tea', '〔内部成员〕BMad · Murat 测试架构师', '[Internal] BMad · Murat (Test)'],
  }
  const pkgExports = pkg.exports || {}
  const seenTitles = { en: new Set(), zh: new Set() }
  for (const [preset, [role, zhTitle, enTitle]] of Object.entries(expectedRows)) {
    const expectedTitle = { zh: zhTitle, en: enTitle }
    const moduleName = `dsh-agent-teams/rows/${role}`
    check(patch.includes(`- id: preset-${preset}\n      name: '${moduleName}'`),
      `preset-${preset} should mount ${moduleName}`)
    const idx = join(ROOT, 'rows', role, 'index.js')
    check(exists(idx), `missing rows/${role}/index.js`)
    if (exists(idx)) {
      check(read(idx).includes('export { default }'),
        `rows/${role}/index.js should re-export the preset module`)
    }
    check(`./rows/${role}` in pkgExports, `package.json exports missing ./rows/${role}`)
    check(`./rows/${role}/locale/*.json` in pkgExports,
      `package.json exports missing ./rows/${role}/locale/*.json`)
    check(`./rows/${role}/icon` in pkgExports, `package.json exports missing ./rows/${role}/icon`)
    for (const loc of ['en', 'zh']) {
      const lp = join(ROOT, 'rows', role, 'locale', `${loc}.json`)
      check(exists(lp), `missing rows/${role}/locale/${loc}.json`)
      if (!exists(lp)) continue
      let meta
      try { meta = JSON.parse(read(lp)).meta || {} } catch (e) {
        errors.push(`rows/${role}/locale/${loc}.json invalid JSON: ${e.message}`)
        continue
      }
      const title = meta.title
      check(title === expectedTitle[loc],
        `rows/${role}/locale/${loc}.json title ${pyRepr(title)} != expected ${pyRepr(expectedTitle[loc])}`)
      check(Boolean((meta.description || '').trim()),
        `rows/${role}/locale/${loc}.json missing meta.description`)
      if (title) seenTitles[loc].add(title)
    }
  }
  const nRows = Object.keys(expectedRows).length
  for (const loc of ['en', 'zh']) {
    check(seenTitles[loc].size === nRows,
      `per-row ${loc} titles are not all distinct (${seenTitles[loc].size}/${nRows})`)
  }
  check('@deepseek-ai/dsh-agent-preset' in (pkg.peerDependencies || {}),
    'package.json should declare @deepseek-ai/dsh-agent-preset as a peer dependency')
  check(((pkg.peerDependenciesMeta || {})['@deepseek-ai/dsh-agent-preset'] || {}).optional !== true,
    '@deepseek-ai/dsh-agent-preset must not be an optional peer (rows hard-import it)')

  // 8. client half (picker filter): the only mechanism that hides member presets is
  //    client.js, discovered via the bare-package host row + dsh.client + exports.
  check(patch.includes("- id: agent-teams\n      name: 'dsh-agent-teams'"),
    "cordis patch missing the bare 'agent-teams' host row that loads client.js")
  check(pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web',
    "package.json missing dsh.client with platform 'web'")
  check('.' in pkgExports, "package.json exports missing '.'")
  check('./client' in pkgExports, "package.json exports missing './client'")
  const files = pkg.files || []
  for (const need of ['client.js', 'index.js']) {
    check(files.includes(need), `package.json files missing ${need}`)
    check(exists(join(ROOT, need)) && fs.statSync(join(ROOT, need)).size > 0,
      `${need} missing or empty`)
  }
  //    The Host half also auto-enables Agent Teams for the squad-lead preset;
  //    assert its syntax and its zero-dependency behavior test too.
  check(read(join(ROOT, 'index.js')).includes('apply'),
    'index.js should export the auto-enable hook (apply)')
  if (hasNode) {
    const r = spawnSync(process.execPath, ['--check', join(ROOT, 'client.js')], { encoding: 'utf-8' })
    check(r.status === 0, 'client.js failed node --check: ' + (r.stderr || r.stdout || '').trim())
    const t = spawnSync(process.execPath, [join(ROOT, 'scripts', 'test_client.mjs')], { encoding: 'utf-8' })
    check(t.status === 0, 'client.js behavior test failed: ' + (t.stderr || t.stdout || '').trim())
    const hr = spawnSync(process.execPath, ['--check', join(ROOT, 'index.js')], { encoding: 'utf-8' })
    check(hr.status === 0, 'index.js failed node --check: ' + (hr.stderr || hr.stdout || '').trim())
    const ht = spawnSync(process.execPath, [join(ROOT, 'scripts', 'test_host.mjs')], { encoding: 'utf-8' })
    check(ht.status === 0, 'index.js behavior test failed: ' + (ht.stderr || ht.stdout || '').trim())
  }

  // 9. zero-dependency squad kit (R1): validator + protocol playbook, and validator runs clean on the example
  const validator = join(ROOT, 'scripts', 'squad_validate.mjs')
  check(exists(validator), 'missing scripts/squad_validate.mjs')
  check(exists(join(ROOT, 'playbooks', 'bmad-squad-protocol', 'SKILL.md')),
    'missing playbooks/bmad-squad-protocol/SKILL.md')
  if (exists(validator) && hasNode) {
    const rr = spawnSync(process.execPath, [validator, join(ROOT, 'examples', 'bmad-output')],
      { encoding: 'utf-8' })
    check(rr.status === 0, 'squad_validate failed on examples/bmad-output: ' + (rr.stderr || rr.stdout || '').trim())
  }

  if (errors.length) {
    console.log('VERIFY FAILED:')
    for (const e of errors) console.log('  -', e)
    process.exit(1)
  }
  console.log(`VERIFY OK: ${presetRows.length} presets, ${delegates.length} delegates, ${skillDirs.length} bundled skills`)
  console.log(`  deterministic capability evals: run_evals × ${ranEvalModules.length} modules `
    + `${pyList([...ranEvalModules].sort())}; router validate_selection × ${routerFixtureCount} fixtures`)
}

main()
