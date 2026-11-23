#!/usr/bin/env node
/**
 * check_gate_cmd.mjs — reference-integrity gate (GitHub issue #11 · 09a). Zero deps.
 *
 * Pins exactly two things — nothing more:
 *   1) The ONE phase-gate command every squad member copies verbatim from the
 *      protocol (`playbooks/bmad-squad-protocol/SKILL.md`) is still valid:
 *        - scripts/squad_validate.mjs exists;
 *        - the protocol body still contains the full relative path
 *          `../../scripts/squad_validate.mjs` (the exact substring, so a scattered
 *          `scripts/squad_validate.mjs` mention in prose cannot mask a rewrite);
 *        - that validator is executable (`--help` exits 0).
 *   2) One pure set comparison: the `id` set parsed line-by-line from
 *      capabilities/capability-router/references/capability-index.yaml equals the
 *      frontmatter `name` set of every capabilities/<module>/SKILL.md.
 *
 * Deliberately does NOT extract arbitrary Markdown paths, resolve relative links,
 * or keep a placeholder/exclusion table (`<dir>`, `{project-root}`, `{{...}}`, `…`,
 * URLs, `uv run`, ...). That is issue #11 · 09b and is out of scope here — the gate
 * matches one constant and does one set comparison, so it has no false positives.
 *
 * One script, one entry, one exit code. Exit 0 = OK, exit 1 = drift / set mismatch.
 * CI covers it via scripts/verify.mjs (node scripts/verify.mjs is the sole CI entry).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REL = '../../scripts/squad_validate.mjs';
const VALIDATOR = join(ROOT, 'scripts/squad_validate.mjs');
const PROTOCOL = join(ROOT, 'playbooks/bmad-squad-protocol/SKILL.md');
const CAPABILITIES = join(ROOT, 'capabilities');
const INDEX = join(CAPABILITIES, 'capability-router/references/capability-index.yaml');

const errors = [];

// ---- assertion group 1: pin the copied phase-gate command --------------------
if (!existsSync(VALIDATOR)) errors.push(`missing ${REL}`);

let protocolText = '';
if (!existsSync(PROTOCOL)) {
  errors.push(`missing protocol ${PROTOCOL}`);
} else {
  protocolText = readFileSync(PROTOCOL, 'utf8');
  if (!protocolText.includes(REL)) {
    errors.push(`protocol no longer contains ${REL} (gate command drifted)`);
  }
}

if (errors.length === 0 && spawnSync(process.execPath, [VALIDATOR, '--help']).status !== 0) {
  errors.push(`${REL} --help exited non-zero`);
}

// ---- assertion group 2: capability-index set equality ------------------------
// Only `^  - id:` lines from the index and the first `---` block's `^name:` from
// each SKILL.md are read. No YAML library, no generic YAML validation.
const indexIds = new Set();
if (!existsSync(INDEX)) {
  errors.push(`missing ${INDEX}`);
} else {
  for (const line of readFileSync(INDEX, 'utf8').split(/\r?\n/)) {
    if (/^  - id:/.test(line)) indexIds.add(line.slice('  - id:'.length).trim());
  }
}

function frontmatterName(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const fm = text.slice(3, end);
  const m = /^name:\s*(.+)$/m.exec(fm);
  return m ? m[1].trim().replace(/^["']+|["']+$/g, '') : null;
}

const skillNames = new Set();
for (const name of (existsSync(CAPABILITIES) ? readdirSync(CAPABILITIES) : [])) {
  let isDir = false;
  try { isDir = statSync(join(CAPABILITIES, name)).isDirectory() } catch { isDir = false }
  if (!isDir) continue;
  const skill = join(CAPABILITIES, name, 'SKILL.md');
  if (!existsSync(skill)) continue;
  const nm = frontmatterName(readFileSync(skill, 'utf8'));
  if (nm) skillNames.add(nm);
}

// A capability dir/SKILL.md whose name is not registered in the index.
const missingInIndex = [...skillNames].filter((n) => !indexIds.has(n)).sort();
// An index id with no matching capabilities/*/SKILL.md (registration gone stale).
const staleInIndex = [...indexIds].filter((n) => !skillNames.has(n)).sort();

if (errors.length || missingInIndex.length || staleInIndex.length) {
  const lines = [...errors];
  if (missingInIndex.length) {
    lines.push(`missingInIndex (capabilities/*/SKILL.md name not registered in capability-index.yaml): ${missingInIndex.join(', ')}`);
  }
  if (staleInIndex.length) {
    lines.push(`staleInIndex (capability-index.yaml id has no capabilities/*/SKILL.md): ${staleInIndex.join(', ')}`);
  }
  console.error('CHECK GATE CMD: FAIL');
  for (const l of lines) console.error('  ✗ ' + l);
  process.exit(1);
}

console.log(`CHECK GATE CMD: OK (gate cmd ${REL} pinned; capability-index ${indexIds.size} ids == ${skillNames.size} SKILL.md names)`);
