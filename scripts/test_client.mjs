#!/usr/bin/env node
/**
 * test_client.mjs — zero-dependency behavior test for the browser half (client.js).
 *
 * No DSH, no browser: it stubs `window.__ModuleLoader__`, evaluates client.js,
 * and drives the returned factory with a fake `remote.agentPresets` namespace.
 * Covers the picker-filter behavior the rest of the repo cannot see:
 *   - the 7 members are dropped, the dispatcher and every non-member (incl. a
 *     non-member `bmad-*` preset) are kept;
 *   - a hidden member that was the only default is replaced by the dispatcher;
 *   - a non-roster shape ({ok:false} / no presets array) is returned unchanged;
 *   - the ctx.effect disposer restores the original list exactly;
 *   - a second apply is a no-op (no nested wrapper).
 *
 * Exit 0 = all pass, 1 = a failure. Invoked by verify.mjs when node is present.
 */
import assert from 'node:assert/strict'

const MEMBERS = ['bmad-analyst', 'bmad-pm', 'bmad-po', 'bmad-ux', 'bmad-architect', 'bmad-dev', 'bmad-tea']
const LEAD = 'bmad-squad-lead'

// 1) Capture the module registration made at import time.
let captured
globalThis.window = { __ModuleLoader__: { load: (mod) => { captured = mod } } }
await import(new URL('../client.js', import.meta.url).href)
assert.ok(captured && captured.id === 'dsh-agent-teams', 'client.js registered under the expected id')
assert.equal(typeof captured.factory, 'function')

function makeNs(presets) {
  const ns = {
    list: async () => ({ ok: true, value: { presets: presets.map((p) => ({ ...p })) } }),
  }
  return ns
}

async function run(presets) {
  const ns = makeNs(presets)
  const original = ns.list
  const disposers = []
  const ctx = {
    get: (name) => (name === 'remote.agentPresets' ? ns : undefined),
    effect: (cb) => { disposers.push(cb()) },
  }
  const api = captured.factory()
  assert.deepEqual(api.inject, ['remote.agentPresets'])
  api.apply(ctx)
  return { ns, original, disposers, ctx, api }
}

// --- Case 1: members dropped; dispatcher + non-members kept (incl. non-member bmad-*)
{
  const presets = [
    { id: LEAD, isDefault: true },
    ...MEMBERS.map((id) => ({ id })),
    { id: 'acme-custom' },
    { id: 'bmad-report-builder' }, // non-member that merely shares the bmad- prefix
  ]
  const { ns } = await run(presets)
  const ids = (await ns.list()).value.presets.map((p) => p.id)
  for (const m of MEMBERS) assert.ok(!ids.includes(m), `member ${m} should be hidden`)
  assert.ok(ids.includes(LEAD), 'dispatcher kept')
  assert.ok(ids.includes('acme-custom'), 'non-BMad preset kept')
  assert.ok(ids.includes('bmad-report-builder'), 'non-member bmad-* preset kept (explicit set, not prefix)')
  assert.equal(ids.length, 3)
}

// --- Case 2: hidden member was the only default -> dispatcher becomes default
{
  const presets = [{ id: LEAD }, { id: 'bmad-dev', isDefault: true }, { id: 'acme-custom' }]
  const { ns } = await run(presets)
  const out = (await ns.list()).value.presets
  const lead = out.find((p) => p.id === LEAD)
  assert.equal(lead.isDefault, true, 'dispatcher promoted to default')
  assert.ok(!out.some((p) => p.id === 'bmad-dev'), 'default member removed')
}

// --- Case 3: unexpected shape returned unchanged
{
  const ns = makeNs([])
  const original = ns.list
  ns.list = async () => ({ ok: false, error: 'nope' }) // own configurable property
  const disposers = []
  const ctx = { get: () => ns, effect: (cb) => { disposers.push(cb()) } }
  captured.factory().apply(ctx)
  const res = await ns.list()
  assert.deepEqual(res, { ok: false, error: 'nope' }, 'non-roster shape passed through unchanged')
  // no throw, wrapper installed over a compatible shape
}

// --- Case 4: disposer restores the original exactly
{
  const { ns, original, disposers } = await run([{ id: LEAD }, { id: 'bmad-tea' }])
  assert.notEqual(ns.list, original, 'wrapped before dispose')
  for (const d of disposers) d()
  assert.equal(ns.list, original, 'list restored to the original function after dispose')
}

// --- Case 5: second apply is a no-op (idempotent, no nested wrapper)
{
  const ns = makeNs([{ id: LEAD }, { id: 'bmad-pm' }])
  const disposers = []
  const ctx = { get: () => ns, effect: (cb) => { disposers.push(cb()) } }
  const api = captured.factory()
  api.apply(ctx)
  const afterFirst = ns.list
  api.apply(ctx)
  assert.equal(ns.list, afterFirst, 'second apply did not re-wrap')
  const ids = (await ns.list()).value.presets.map((p) => p.id)
  assert.deepEqual(ids, [LEAD], 'still filters correctly after double apply')
}

console.log('client.js behavior test OK (5 cases)')
