#!/usr/bin/env node
/**
 * check_pack.mjs — product-view pack ledger (GitHub issue #5 / internal 03b). Zero deps.
 *
 * Why: every other gate asserts against the *repo* view. The consequence chain this
 * guards is the *product* view — if `package.json` `files` drops a runtime resource,
 * install still "succeeds" but the mounted skill roots go empty and the squad silently
 * degrades (tool-skill returns nothing, no error). So this script runs
 *   npm pack --dry-run --json --ignore-scripts --cache <tmpdir>
 * and asserts on what would ACTUALLY ship.
 *
 * Two assertion directions only (no second allow-list):
 *   1) product  ⊇  required set   (required set is DERIVED, never handwritten)
 *   2) product  ∩  {node_modules, .git}  =  ∅
 * Extra `files` entries (examples/scripts/docs) are NOT red. `skills/` presence is only
 * checked for consistency with `files` (both present or both absent pass — its keep/drop
 * is issue #8, not decided here).
 *
 * The required set is derived from single sources (never from `files`, which would be
 * proving itself):
 *   - cordis.patch.yml  skill-filesystem customSkillDirs join(..., 'X')  → playbooks, capabilities
 *   - package.json exports each value's first path segment + dsh.bundle.patch
 *                                         → index.js, client.js, rows, locale, icon.svg, cordis.patch.yml (…)
 *   - prompts/  (build source dir) — included only when it exists on disk
 *
 * Exit codes:
 *   0 = product satisfies both directions
 *   1 = a required item is missing, a forbidden path is present/declared, or skills drift
 *   2 = SKIP — npm unavailable or npm pack failed for environmental reasons (NEVER a silent 0)
 *
 * Only stdlib: node:child_process / node:fs / node:path / node:os / node:process.
 * Wired into scripts/verify.mjs (the sole CI entry); SKIP=2 is surfaced as a failure there.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(decodeURIComponent(new URL('.', import.meta.url).pathname), '..')
const FORBIDDEN = ['node_modules', '.git']

const errors = []
const notes = []

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function isDir(p) {
  try { return fs.statSync(p).isDirectory() } catch { return false }
}
const topSegment = (entry) => entry.replace(/^\.\//, '').split('/')[0]

// ---- derive the required set from single sources (no handwritten 2nd list) ----------
function deriveRequired() {
  const pkg = readJson(path.join(ROOT, 'package.json'))
  const required = new Set()

  // (1) exports.* value first path segment → index.js, client.js, rows, locale, icon.svg, package.json
  for (const value of Object.values(pkg.exports || {})) {
    if (typeof value !== 'string') continue // ignore conditional/nested export objects
    const first = topSegment(value)
    if (first) required.add(first)
  }

  // (2) dsh.bundle.patch → cordis.patch.yml
  const patchRef = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch
  if (typeof patchRef === 'string' && patchRef.trim()) {
    const first = topSegment(patchRef)
    if (first) required.add(first)
  }

  // (3) cordis.patch.yml skill-filesystem customSkillDirs: the two join(..., 'X') tail args
  //     → playbooks, capabilities. (Only customSkillDirs lines use `.join(`.)
  const patch = fs.readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf-8')
  for (const line of patch.split(/\r?\n/)) {
    if (!line.includes('.join(')) continue
    const quoted = [...line.matchAll(/'([^']*)'/g)].map((m) => m[1])
    if (quoted.length) required.add(quoted[quoted.length - 1]) // last join argument
  }

  // (4) prompts/ — the build_patch source dir; include in the required set only if it exists
  if (isDir(path.join(ROOT, 'prompts'))) required.add('prompts')

  return { pkg, required }
}

// ---- run npm pack in a throwaway cache dir; return {doc} or {skip:reason} -----------
function runPack() {
  // A temp --cache avoids the root-owned ~/.npm EPERM seen on this host (issue #5 坑①).
  // --ignore-scripts is the self-recursion backstop once #7 lands a prepack that boots
  // this same gate (坑②).
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-check-pack-'))
  try {
    const args = ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', cacheDir]
    const r = spawnSync('npm', args, { cwd: ROOT, encoding: 'utf-8' })
    if (r.error) {
      return { skip: `npm not available (${r.error.code || r.error.message})` }
    }
    if (r.status !== 0) {
      const detail = (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ')
      return { skip: `npm pack failed (${r.status === null ? 'signal ' + r.signal : 'exit ' + r.status}): ${detail}` }
    }
    let parsed
    try {
      parsed = JSON.parse(r.stdout)
    } catch {
      return { skip: 'npm pack --json produced unparsable output' }
    }
    const doc = Array.isArray(parsed) ? parsed[0] : parsed
    if (!doc || !Array.isArray(doc.files)) {
      return { skip: 'npm pack --json output missing files[]' }
    }
    return { doc }
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true })
  }
}

function main() {
  let derived
  try {
    derived = deriveRequired()
  } catch (e) {
    // A derivation failure means we cannot evaluate the product view honestly.
    console.log(`SKIP: could not derive required set: ${e.message}`)
    process.exit(2)
  }
  const { pkg, required } = derived

  const packed = runPack()
  if (packed.skip) {
    console.log(`SKIP: ${packed.skip}`)
    process.exit(2)
  }

  const { doc } = packed
  const files = doc.files.map((f) => f.path)
  const present = (top) => files.some((p) => p === top || p.startsWith(top + '/'))
  const countUnder = (top) => files.filter((p) => p === top || p.startsWith(top + '/')).length

  console.log('CHECK PACK: product view (npm pack --dry-run)')
  console.log(`  summary: files=${files.length} tarball=${doc.size}B unpacked=${doc.unpackedSize}B filename=${doc.filename}`)

  // ---- direction 1: product ⊇ required (derived) ------------------------------------
  const sortedReq = [...required].sort()
  console.log(`  required set (${sortedReq.length} items, derived):`)
  for (const item of sortedReq) {
    const ok = present(item)
    console.log(`    [${ok ? 'ok' : 'MISSING'}] ${item} (${ok ? countUnder(item) : 0} files)`)
    if (!ok) errors.push(`missing required item in packed product: '${item}'`)
  }

  // ---- direction 2: product ∩ forbidden = ∅ -----------------------------------------
  // (a) anything actually shipped carrying a forbidden path segment
  const shippedForbidden = new Set()
  for (const p of files) {
    for (const seg of p.split('/')) {
      if (FORBIDDEN.includes(seg)) shippedForbidden.add(seg)
    }
  }
  for (const seg of [...shippedForbidden].sort()) {
    errors.push(`forbidden path segment '${seg}' shipped in packed product`)
  }
  // (b) a forbidden top-level path DECLARED in package.json `files`. npm hard-ignores
  //     node_modules/.git before they reach the product, so without this a declared-but-
  //     filtered entry would silently slip through; declaring it is still a packaging bug.
  const declaredFiles = Array.isArray(pkg.files) ? pkg.files : []
  for (const entry of declaredFiles) {
    if (typeof entry !== 'string') continue
    const top = topSegment(entry)
    if (FORBIDDEN.includes(top)) {
      errors.push(`forbidden top-level path declared in package.json files: '${entry}' (must never be published)`)
    }
  }

  // ---- skills consistency only (issue #8 decides keep/drop, not this gate) -----------
  const skillsDeclared = declaredFiles.some((e) => typeof e === 'string' && topSegment(e) === 'skills')
  const skillsShipped = present('skills')
  if (skillsDeclared !== skillsShipped) {
    errors.push(`skills consistency drift: declared in files=${skillsDeclared} but shipped=${skillsShipped} `
      + '(issue #8 not yet decided; must be both present or both absent)')
  } else if (skillsShipped) {
    notes.push(`skills: present in files and shipped (${countUnder('skills')} files) — consistent`)
  } else {
    notes.push('skills: absent from both files and product — allowed')
  }

  if (errors.length) {
    console.log('CHECK PACK: FAIL')
    for (const e of errors) console.log('  - ' + e)
    for (const n of notes) console.log('  · ' + n)
    process.exit(1)
  }

  for (const n of notes) console.log('  · ' + n)
  console.log(`CHECK PACK: OK (${sortedReq.length} required items present; product ∩ {${FORBIDDEN.join(', ')}} = ∅)`)
}

main()
