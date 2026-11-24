#!/usr/bin/env node
/**
 * check_presets.mjs — capability-boundary gate for the BMad squad presets.
 *
 * Zero dependencies: only node:fs / node:path (and the global `process`). It does NOT
 * read the template, does NOT call build_patch, does NOT import the verify entrypoint,
 * and never shells out to python. It parses the GENERATED bundle patch
 * (cordis.patch.yml) directly, so it is independent of how the patch is produced.
 *
 * Why: the verify entrypoint only counts presets/delegates/model-selection; it never
 * checked which preset may bash / write / applyPatch / control / subagent. Murat's two
 * mutation experiments (M-A: lead tool-fs.write false→true; M-B: give preset-bmad-analyst
 * a tool-subagent) both slipped through the old gate with exit 0. This gate closes that
 * blind spot and keeps issue-04/05/06 from silently regressing.
 *
 * Single source of truth: squad.roles.json. This file holds NO second copy of the matrix;
 * every expectation (bash/jobs/web/fs/control/subagent) is derived from that table.
 *
 * What it asserts (per preset, by slicing the generated patch into preset segments):
 *   - config.id matches `preset-<id>` (preset-bmad-foo ⇄ config.id bmad-foo)
 *   - `name: 'dsh-olympus/presets/<role>'` points at an existing presets/<role>/index.js
 *   - the minimal indentation tree is well formed: no indentation drift, no duplicate keys
 *   - leader tool-fs has write/edit/applyPatch explicitly false (M-A guard)
 *   - members mount NO tool-subagent (M-B guard); only the lead owns the delegation tool
 *   - each member mounts exactly 1 tool-subagent-control (hard assertion — issue #6 landed)
 *   - dev/tea mount tool-bash; the bash/jobs/web/control/subagent columns match the table
 *   - every preset mounts tool-fs + tool-fs-search
 *   - skill-filesystem customSkillDirs == [playbooks, capabilities] for every preset
 *
 * `--strict` / `--allow-known-gaps` are still accepted for CLI compatibility, but they no
 * longer change behaviour: since issue #6 the "each member mounts exactly 1
 * tool-subagent-control" rule is a HARD assertion in the default run (a missing member
 * control row fails with exit 1 and names the preset).
 *
 * Exit 0 = OK, 1 = problems.
 *
 * Usage:
 *   node scripts/check_presets.mjs
 *   node scripts/check_presets.mjs --strict
 */
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// paths (no node:url — compute root from the invoked script path)
// ---------------------------------------------------------------------------
const SCRIPT_DIR = path.dirname(process.argv[1])
const ROOT = path.resolve(SCRIPT_DIR, '..')
const PATCH_PATH = path.join(ROOT, 'cordis.patch.yml')
const ROLES_PATH = path.join(ROOT, 'squad.roles.json')
const PRESETS_DIR = path.join(ROOT, 'presets')

const ARGV = process.argv.slice(2)
// --strict / --allow-known-gaps are accepted for CLI compatibility but are now no-ops:
// since issue #6 every control-row rule is a hard assertion in the default run.
const _STRICT = ARGV.includes('--strict')
const _ALLOW_KNOWN_GAPS = ARGV.includes('--allow-known-gaps')

// ---------------------------------------------------------------------------
// Minimal indentation-tree parser for the YAML subset used by cordis.patch.yml.
//
// It intentionally does NOT implement full YAML. It builds a tree of map / seq / scalar
// nodes driven purely by indentation, which is exactly what is needed to:
//   * detect indentation drift (a line whose column does not match its expected block),
//   * detect duplicate keys inside one mapping,
//   * slice the file into preset segments and walk their plugin rows.
//
// Supported: block mappings (`key: value` / `key:`), block sequences (`- item`,
// `- key: value`), block scalars (`key: |` / `key: >`, consumed by indentation so the
// persona markdown never leaks into the structure), and `#` comment lines.
// Scalars (including `!!js ...`, quoted strings, flow `{}`/`[]`) are kept verbatim.
// ---------------------------------------------------------------------------
function parseIndentTree(text) {
  const lines = text.split(/\r?\n/)
  const errors = []
  const pos = { i: 0 }

  const leadingSpaces = (s) => {
    let n = 0
    while (n < s.length && s[n] === ' ') n++
    return n
  }
  const isBlank = (s) => s.trim() === ''
  const isComment = (s) => s.trimStart().startsWith('#')
  const indentAt = (i) => leadingSpaces(lines[i])
  const contentAt = (i) => lines[i].slice(leadingSpaces(lines[i]))

  const MAP_ENTRY = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/

  function skipIgnorable() {
    while (pos.i < lines.length) {
      const l = lines[pos.i]
      if (isBlank(l) || isComment(l)) { pos.i++; continue }
      break
    }
  }

  function parseScalar(raw) {
    let v = raw.trim()
    if (v.length >= 2) {
      const a = v[0], b = v[v.length - 1]
      if ((a === "'" && b === "'") || (a === '"' && b === '"')) v = v.slice(1, -1)
    }
    return v
  }

  function resolveValue(entry, rest, entryIndent) {
    // block scalar: `key: |` or `key: >` (optionally with chomping/indent indicators)
    if (/^[|>][+-]?\d*$/.test(rest.trim())) {
      const marker = rest.trim()
      const block = []
      while (pos.i < lines.length) {
        const raw = lines[pos.i]
        if (raw.trim() === '') { block.push(''); pos.i++; continue }
        if (indentAt(pos.i) > entryIndent) { block.push(raw); pos.i++; continue }
        break
      }
      entry.value = { kind: 'block', marker, lines: block }
      return
    }
    if (rest.trim() === '') {
      skipIgnorable()
      if (pos.i < lines.length && indentAt(pos.i) > entryIndent) {
        entry.value = parseBlock(indentAt(pos.i))
      } else {
        entry.value = null
      }
      return
    }
    entry.value = parseScalar(rest)
  }

  function addMapEntry(node, keySet, txt, entryIndent, lineNo) {
    const m = MAP_ENTRY.exec(txt)
    if (!m) {
      errors.push(`structure error: line ${lineNo} is not a "key: value" entry (${JSON.stringify(txt.slice(0, 40))})`)
      return
    }
    const key = m[1]
    const rest = m[2] === undefined ? '' : m[2]
    if (keySet.has(key)) errors.push(`duplicate key '${key}' in one mapping near line ${lineNo}`)
    keySet.add(key)
    const entry = { key, value: null, line: lineNo }
    node.entries.push(entry)
    resolveValue(entry, rest, entryIndent)
  }

  function parseMapEntriesInto(node, keySet, indent) {
    while (true) {
      skipIgnorable()
      if (pos.i >= lines.length) break
      const ind = indentAt(pos.i)
      if (ind < indent) break
      const c = contentAt(pos.i)
      if (ind > indent) {
        errors.push(`indentation error: line ${pos.i + 1} indented ${ind} spaces, expected ${indent} in mapping`)
        pos.i++
        continue
      }
      if (c === '-' || c.startsWith('- ')) {
        errors.push(`indentation/structure error: line ${pos.i + 1} is a sequence item where a mapping entry was expected at indent ${indent}`)
        break
      }
      const lineNo = pos.i + 1
      pos.i++
      addMapEntry(node, keySet, c, indent, lineNo)
    }
  }

  function parseMap(indent) {
    const node = { kind: 'map', entries: [] }
    parseMapEntriesInto(node, new Set(), indent)
    return node
  }

  function parseSeq(indent) {
    const node = { kind: 'seq', items: [] }
    while (true) {
      skipIgnorable()
      if (pos.i >= lines.length) break
      const ind = indentAt(pos.i)
      if (ind < indent) break
      const c = contentAt(pos.i)
      if (ind > indent) {
        errors.push(`indentation error: line ${pos.i + 1} indented ${ind} spaces, expected ${indent} in sequence`)
        pos.i++
        continue
      }
      if (!(c === '-' || c.startsWith('- '))) {
        errors.push(`indentation/structure error: line ${pos.i + 1} expected a "- " sequence item at indent ${indent}`)
        break
      }
      const lineNo = pos.i + 1
      pos.i++
      const after = c === '-' ? '' : c.slice(2)
      if (after.trim() === '') {
        skipIgnorable()
        if (pos.i < lines.length && indentAt(pos.i) > indent) {
          node.items.push(parseBlock(indentAt(pos.i)))
        } else {
          node.items.push(null)
        }
      } else if (MAP_ENTRY.test(after)) {
        // compact mapping that begins on the same line as the dash: `- key: value`
        const mapIndent = ind + 2
        const map = { kind: 'map', entries: [] }
        const keySet = new Set()
        addMapEntry(map, keySet, after, mapIndent, lineNo)
        parseMapEntriesInto(map, keySet, mapIndent)
        node.items.push(map)
      } else {
        node.items.push(parseScalar(after))
      }
    }
    return node
  }

  function parseBlock(indent) {
    const c = contentAt(pos.i)
    if (c === '-' || c.startsWith('- ')) return parseSeq(indent)
    return parseMap(indent)
  }

  skipIgnorable()
  let root = null
  if (pos.i < lines.length) root = parseBlock(indentAt(pos.i))
  return { root, errors }
}

// ---------------------------------------------------------------------------
// tree helpers
// ---------------------------------------------------------------------------
function mapGet(node, key) {
  if (!node || node.kind !== 'map') return undefined
  for (const e of node.entries) if (e.key === key) return e.value
  return undefined
}
function isMap(v) { return Boolean(v) && typeof v === 'object' && v.kind === 'map' }
function isSeq(v) { return Boolean(v) && typeof v === 'object' && v.kind === 'seq' }

// Flatten a plugins sequence into a flat list of { id, name, config }, recursing into
// group rows whose config is itself a sequence of plugin rows (delegation/shell/compaction).
function flattenPlugins(seq) {
  const out = []
  if (!isSeq(seq)) return out
  for (const item of seq.items) {
    if (!isMap(item)) continue
    const id = mapGet(item, 'id')
    const name = mapGet(item, 'name')
    const config = mapGet(item, 'config')
    out.push({ id, name, config })
    if (isSeq(config)) out.push(...flattenPlugins(config))
  }
  return out
}

function countByName(plugins, wanted) {
  return plugins.filter((p) => p.name === wanted).length
}
function findByName(plugins, wanted) {
  return plugins.find((p) => p.name === wanted)
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  let raw
  try {
    raw = fs.readFileSync(PATCH_PATH, 'utf-8')
  } catch (e) {
    console.error(`CHECK-PRESETS FAILED: cannot read ${PATCH_PATH}: ${e.message}`)
    process.exit(1)
  }

  let roles
  try {
    roles = JSON.parse(fs.readFileSync(ROLES_PATH, 'utf-8'))
  } catch (e) {
    console.error(`CHECK-PRESETS FAILED: cannot read/parse ${ROLES_PATH}: ${e.message}`)
    process.exit(1)
  }
  const table = (roles && roles.presets) || {}

  const { root, errors } = parseIndentTree(raw)
  const hardErrors = [...errors]
  const check = (cond, msg) => { if (!cond) hardErrors.push(msg) }

  // Locate the `insert:` sequence and the preset rows within it.
  let insertSeq = null
  if (isSeq(root)) {
    for (const item of root.items) {
      if (isMap(item) && mapGet(item, 'insert') !== undefined) {
        insertSeq = mapGet(item, 'insert')
        break
      }
    }
  }
  check(isSeq(insertSeq), 'could not locate the top-level `insert:` sequence in cordis.patch.yml')

  const presetRows = []
  if (isSeq(insertSeq)) {
    for (const item of insertSeq.items) {
      if (!isMap(item)) continue
      const id = mapGet(item, 'id')
      if (typeof id === 'string' && id.startsWith('preset-')) presetRows.push({ id, node: item })
    }
  }

  const expectedIds = Object.keys(table)
  const foundIds = presetRows.map((r) => r.id)
  check(presetRows.length === expectedIds.length,
    `expected ${expectedIds.length} preset rows, found ${presetRows.length}: [${foundIds.join(', ')}]`)

  const foundSet = new Set(foundIds)
  for (const want of expectedIds) {
    check(foundSet.has(`preset-${want}`), `missing preset row: preset-${want}`)
  }
  for (const id of foundIds) {
    const bare = id.replace(/^preset-/, '')
    check(bare in table, `preset-${bare} is not described in squad.roles.json`)
  }

  // ---- per-preset checks -------------------------------------------------
  for (const { id: presetRowId, node } of presetRows) {
    const bare = presetRowId.replace(/^preset-/, '')
    const spec = table[bare]
    if (!spec) continue // already reported as "not described"
    const label = `[${presetRowId}]`

    // structural: config.id must match preset-<id>
    const config = mapGet(node, 'config')
    check(isMap(config), `${label} missing config block`)
    const configId = isMap(config) ? mapGet(config, 'id') : undefined
    check(configId === bare,
      `${label} config.id ${JSON.stringify(configId)} must equal ${JSON.stringify(bare)}`)

    // structural: preset `name` must point at an existing presets/* module
    const moduleName = mapGet(node, 'name')
    const m = typeof moduleName === 'string' ? /dsh-olympus\/presets\/([^/'"]+)/.exec(moduleName) : null
    check(Boolean(m), `${label} name ${JSON.stringify(moduleName)} is not 'dsh-olympus/presets/<role>'`)
    if (m) {
      const idx = path.join(PRESETS_DIR, m[1], 'index.js')
      check(fs.existsSync(idx), `${label} points at presets/${m[1]} but ${path.relative(ROOT, idx)} does not exist`)
    }

    const plugins = isMap(config) ? flattenPlugins(mapGet(config, 'plugins')) : []

    // tool-fs + tool-fs-search must be present on every preset
    check(Boolean(findByName(plugins, '@deepseek-ai/dsh-tool-fs')),
      `${label} missing tool-fs (@deepseek-ai/dsh-tool-fs)`)
    check(Boolean(findByName(plugins, '@deepseek-ai/dsh-tool-fs-search')),
      `${label} missing tool-fs-search (@deepseek-ai/dsh-tool-fs-search)`)

    // tool-fs explicit keys (leader three-key false; dev applyPatch false; others inherit)
    const fsPlugin = findByName(plugins, '@deepseek-ai/dsh-tool-fs')
    const fsConfig = fsPlugin && isMap(fsPlugin.config) ? fsPlugin.config : null
    for (const key of ['write', 'edit', 'applyPatch']) {
      const want = spec.fs ? spec.fs[key] : null
      if (want === null || want === undefined) continue // not pinned here
      const got = fsConfig ? mapGet(fsConfig, key) : undefined
      check(got === String(want),
        `${label} tool-fs.${key}: expected explicit ${want}, found ${got === undefined ? '(absent)' : JSON.stringify(got)}`)
    }

    // boolean capability columns derived from the single-source table
    const subagentCount = countByName(plugins, '@deepseek-ai/dsh-tool-subagent')
    const controlCount = countByName(plugins, '@deepseek-ai/dsh-tool-subagent-control')
    const bashCount = countByName(plugins, '@deepseek-ai/dsh-tool-bash')
    const jobsCount = countByName(plugins, '@deepseek-ai/dsh-tool-jobs')
    const webCount = countByName(plugins, '@deepseek-ai/dsh-tool-web')

    const expectPresence = (col, count, name) => {
      if (spec[col] === true) {
        check(count >= 1, `${label} expected ${col} (${name}) but found none`)
      } else if (spec[col] === false) {
        check(count === 0, `${label} must NOT mount ${col} (${name}), found ${count}`)
      }
    }
    expectPresence('bash', bashCount, '@deepseek-ai/dsh-tool-bash')
    expectPresence('jobs', jobsCount, '@deepseek-ai/dsh-tool-jobs')
    expectPresence('web', webCount, '@deepseek-ai/dsh-tool-web')

    // subagent: lead true (owns delegation), members false (M-B guard)
    if (spec.subagent === true) {
      check(subagentCount >= 1, `${label} expected tool-subagent (delegation) but found none`)
    } else {
      check(subagentCount === 0,
        `${label} must NOT mount tool-subagent (@deepseek-ai/dsh-tool-subagent), found ${subagentCount}`)
    }

    // control: exactly 1 when expected (hard assertion — issue #6 landed, no KNOWN-GAP).
    if (spec.control === true) {
      check(controlCount === 1, `${label} expected exactly 1 tool-subagent-control row, found ${controlCount}`)
    } else if (spec.control === false) {
      check(controlCount === 0, `${label} must NOT mount tool-subagent-control, found ${controlCount}`)
    }

    // customSkillDirs must be exactly [playbooks, capabilities]
    const skill = findByName(plugins, '@deepseek-ai/dsh-skill-filesystem')
    check(Boolean(skill), `${label} missing skill-filesystem plugin`)
    if (skill && isMap(skill.config)) {
      const dirsSeq = mapGet(skill.config, 'customSkillDirs')
      const entries = isSeq(dirsSeq) ? dirsSeq.items : []
      check(entries.length === 2, `${label} customSkillDirs must have exactly 2 entries, found ${entries.length}`)
      const s0 = String(entries[0] || '')
      const s1 = String(entries[1] || '')
      check(s0.includes("'playbooks')"), `${label} customSkillDirs[0] must reference 'playbooks'`)
      check(s1.includes("'capabilities')"), `${label} customSkillDirs[1] must reference 'capabilities'`)
    } else if (skill) {
      check(false, `${label} skill-filesystem has no config.customSkillDirs`)
    }
  }

  // Topology guard for "leader 无 tool-subagent": the lead OWNS the delegation tool (it has
  // the delegate_* rows), but it must never itself be a delegation TARGET — no tool-subagent
  // row may spawn the lead (single-level star; no recursion back to the lead).
  {
    const delegateTargets = []
    const walk = (node) => {
      if (isSeq(node)) { for (const it of node.items) walk(it); return }
      if (!isMap(node)) return
      for (const e of node.entries) {
        if (e.key === 'agentPreset' && typeof e.value === 'string') delegateTargets.push(e.value)
        walk(e.value)
      }
    }
    walk(root)
    check(!delegateTargets.includes('squad-lead'),
      "squad-lead must NOT be a tool-subagent delegation target (no tool-subagent row may spawn the lead)")
  }

  // ---- report ------------------------------------------------------------
  if (hardErrors.length) {
    console.log('CHECK-PRESETS FAILED:')
    for (const e of hardErrors) console.log('  -', e)
    process.exit(1)
  }

  const nPresets = presetRows.length
  console.log(`CHECK-PRESETS OK: ${nPresets} presets, ${expectedIds.length} truth-table rows`)
}

main()
