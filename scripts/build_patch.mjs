#!/usr/bin/env node
/**
 * Generate cordis.patch.yml from cordis.patch.tmpl.yml + prompts/*.md.
 *
 * Why a build step: persona text is stored as editable Markdown in prompts/*.md,
 * but a preset's `persona.prefix` must be a YAML block scalar in cordis.patch.yml.
 * This script inlines each prompt at the exact indentation of its @@PROMPT:<name>@@
 * marker, so the emitted YAML is always well-formed and prompts stay editable.
 *
 * Byte-for-byte port of the former build_patch.py (zero dependencies).
 *
 * Usage:
 *   node scripts/build_patch.mjs
 *   node scripts/build_patch.mjs --out /tmp/check.yml   # used by scripts/verify.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROMPTS = path.join(ROOT, 'prompts')
const TMPL = path.join(ROOT, 'cordis.patch.tmpl.yml')
const DEFAULT_OUT = path.join(ROOT, 'cordis.patch.yml')

const MARKER = /^(\s*)@@PROMPT:([A-Za-z0-9_-]+)@@\s*$/

function loadPrompts() {
  const prompts = new Map()
  const names = fs.readdirSync(PROMPTS).filter((n) => n.endsWith('.md')).sort()
  for (const name of names) {
    const full = path.join(PROMPTS, name)
    prompts.set(path.basename(name, '.md'), fs.readFileSync(full, 'utf-8').replace(/^\n+|\n+$/g, ''))
  }
  return prompts
}

function build(out) {
  const prompts = loadPrompts()
  const lines = []
  for (const line of fs.readFileSync(TMPL, 'utf-8').split('\n')) {
    const m = MARKER.exec(line)
    if (!m) {
      lines.push(line)
      continue
    }
    const indent = m[1]
    const name = m[2]
    if (!prompts.has(name)) {
      console.error(`build_patch: no prompt file prompts/${name}.md`)
      process.exit(1)
    }
    for (const promptLine of prompts.get(name).split('\n')) {
      lines.push(promptLine.trim() === '' ? '' : indent + promptLine)
    }
  }
  fs.writeFileSync(out, lines.join('\n') + '\n', 'utf-8')
  console.log(`build_patch: wrote ${out} (${lines.length} lines, ${prompts.size} prompts)`)
  return lines.length
}

function main() {
  const argv = process.argv.slice(2)
  let out = DEFAULT_OUT
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      out = argv[i + 1]
      i++
    }
  }
  build(out)
}

main()
