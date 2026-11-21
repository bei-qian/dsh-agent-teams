#!/usr/bin/env node
/**
 * squad_validate.mjs — deterministic validator for the zero-dependency BMad squad.
 *
 * Pure Node, no external deps (DSH ships Node). It checks the fixed `bmad-output/`
 * layout + `index.md` ticket contract so a pure-skill (no _bmad/Python) squad still
 * has a hard determinism gate. Exit 0 = OK, 1 = problems.
 *
 * Usage:
 *   node scripts/squad_validate.mjs [dir]        (default: ./bmad-output)
 *   node scripts/squad_validate.mjs --help
 *
 * Contract it enforces (see playbooks/squad-protocol/SKILL.md):
 *   bmad-output/
 *     initiative.md                    # required; has a title/goal
 *     index.md                         # required; ticket table = source of truth
 *     <phase artifacts>: prd.md, architecture.md, design.md, experience.md, research/...
 *     epics/epic-*.md, stories/story-*.md   # referenced by index.md
 *   index.md table columns (in order): id | type | title | status | file
 *   type ∈ {epic, story, task}; status ∈ {todo, in_progress, in_review, done, blocked}
 *   every `file` must exist (relative to bmad-output/)
 *   a `story`/`task` marked `done` should contain 验收标准 / 实现 / 验证 sections (warning)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';

const TYPES = new Set(['epic', 'story', 'task']);
const STATUSES = new Set(['todo', 'in_progress', 'in_review', 'done', 'blocked']);
const DONE_SECTIONS = ['验收标准', '实现', '验证'];
const ROW = /^\s*\|\s*([^|]+?)\s*\|\s*(epic|story|task)\s*\|\s*([^|]*?)\s*\|\s*([a-z_]+)\s*\|\s*([^|]+?)\s*\|\s*$/;

function read(p) {
  return readFileSync(p, 'utf8');
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(read(new URL(import.meta.url)).split('\n').slice(1, 24).join('\n'));
    return;
  }
  const dir = resolve(args[0] || 'bmad-output');
  const errors = [];
  const warns = [];

  if (!existsSync(dir)) {
    console.error(`SQUAD VALIDATE: FAIL\n  ✗ missing output directory: ${dir}`);
    process.exit(1);
  }

  // initiative.md
  const initPath = join(dir, 'initiative.md');
  if (!existsSync(initPath)) {
    errors.push('missing initiative.md');
  } else {
    const t = read(initPath);
    if (!/^#\s+\S/m.test(t) && !/(目标|Goal)[:：]\s*\S/i.test(t)) {
      errors.push('initiative.md lacks a title (# ...) or a 目标/Goal line');
    }
  }

  // index.md
  const idxPath = join(dir, 'index.md');
  const tickets = [];
  if (!existsSync(idxPath)) {
    errors.push('missing index.md (ticket source of truth)');
  } else {
    for (const line of read(idxPath).split(/\r?\n/)) {
      const m = line.match(ROW);
      if (m) tickets.push({ id: m[1], type: m[2], title: m[3], status: m[4], file: m[5] });
    }
    if (tickets.length === 0) warns.push('index.md has no ticket rows yet');
    const ids = new Set();
    for (const t of tickets) {
      if (ids.has(t.id)) errors.push(`duplicate ticket id: ${t.id}`);
      ids.add(t.id);
      if (!TYPES.has(t.type)) errors.push(`ticket ${t.id}: invalid type '${t.type}'`);
      if (!STATUSES.has(t.status)) errors.push(`ticket ${t.id}: invalid status '${t.status}'`);
      const fp = isAbsolute(t.file) ? t.file : join(dir, t.file);
      if (!existsSync(fp)) {
        errors.push(`ticket ${t.id}: file not found: ${t.file}`);
        continue;
      }
      if ((t.type === 'story' || t.type === 'task') && t.status === 'done') {
        const body = read(fp);
        const missing = DONE_SECTIONS.filter((s) => !body.includes(s));
        if (missing.length) warns.push(`ticket ${t.id} done but missing sections: ${missing.join(' / ')}`);
      }
    }
  }

  if (warns.length) warns.forEach((w) => console.warn('  ! ' + w));
  if (errors.length) {
    console.error('SQUAD VALIDATE: FAIL');
    errors.forEach((e) => console.error('  ✗ ' + e));
    process.exit(1);
  }
  console.log(`SQUAD VALIDATE: OK (${tickets.length} tickets, dir=${dir})`);
}

main();
