#!/usr/bin/env node
/**
 * test_host.mjs — zero-dependency behavior test for the Host half (index.js).
 *
 * No DSH, no Electron: it stubs the Host services `apply()` injects and drives
 * the event handlers + activation scan with fake Agents/Sessions. Covers the
 * "keep Agent Teams aligned with the preset WITHOUT clobbering the user" rule:
 *
 *   Behavior matrix (the core bug fix):
 *     S1 non-team A (manual ON)  -> team -> non-team B : Team stays ON throughout
 *     S2 non-team A (OFF)        -> team -> non-team B : ON in team, OFF again after
 *     S3 non-team A (ON)         -> non-team B         : stays ON
 *     S4 non-team A (OFF)        -> non-team B         : stays OFF
 *     S5 team                    -> team               : stays ON
 *
 *   Retained / supporting assertions:
 *     - agent/created (startup/clear) with a team preset on a root enables Team;
 *     - a non-team create, a resume/compact source, or a subagent never enables;
 *     - entering a team preset enables it after a deferred tick;
 *     - a manual team/mode change is NOT auto-reverted (manual toggling stays free);
 *     - the activation scan enables a team preset on open BLANK sessions and never
 *       disables a non-team session's manual state, and never touches a non-blank
 *       session or a subagent;
 *     - `config.teamPresets` overrides the default team-preset list (enter an
 *       overridden team preset -> ON; leave it -> restore the non-team preference);
 *     - unknown history falls back to leaving the switch as-is;
 *     - a throwing setEnabled is contained and cannot reject creation/selection.
 *
 * Exit 0 = all pass, 1 = a failure. Invoked by verify.py when node is present.
 */
import assert from 'node:assert/strict'

const mod = await import(new URL('../index.js', import.meta.url).href)
const SQUAD = 'bmad-squad-lead'
const DEPS = ['agentTeams', 'agents', 'agentPresets', 'subagents', 'sessionProjections']

assert.equal(mod.name, 'dsh-agent-teams', 'host module exports the bundle name')
assert.deepEqual(mod.TEAM_PRESETS, [SQUAD], 'default team-preset list is the squad dispatcher')
assert.equal(typeof mod.apply, 'function', 'apply() is exported')

/** Build one fake Agent whose session id mirrors its agent id. */
function makeAgent(id, { origin, throws = false, rootOf, blank = true } = {}) {
  const session = { id, header: origin === undefined ? {} : { origin }, __blank: blank }
  return { id, session, __throws: throws, __rootOf: rootOf, __blank: blank }
}

/** Install apply() against a fake context; return captured handlers, call log, state. */
function setup({
  agentsById = {}, presetBySessionId = {}, teamState = {}, scanAgents = [], config,
} = {}) {
  const calls = []
  const handlers = {}
  const state = { ...teamState }
  const scope = {
    agentTeams: {
      isEnabled: (agent) => state[agent.id] === true,
      setEnabled: async (agent, enabled) => {
        if (agent.__throws) throw new Error('setEnabled exploded')
        const current = state[agent.id] === true
        if (current === enabled) return
        state[agent.id] = enabled
        calls.push({ id: agent.id, enabled })
      },
    },
    agents: {
      get: (id) => agentsById[id],
      list: () => scanAgents,
    },
    agentPresets: { presetForSession: (session) => presetBySessionId[session.id] ?? null },
    subagents: { rootOf: (agent) => (agent.__rootOf ? agent.__rootOf : agent) },
    sessionProjections: {
      snapshot: (session) => ({ asOfSeq: 0, values: { sessionListMetadata: { blank: session.__blank !== false, lastPromptAt: null } } }),
    },
    on: (name, fn) => { handlers[name] = fn; return () => {} },
  }
  const ctx = {
    inject: (deps, cb) => {
      assert.deepEqual(deps, DEPS, 'apply() injects exactly the Host services it needs')
      assert.equal(typeof cb, 'function')
      cb(scope)
    },
  }
  mod.apply(ctx, config)
  assert.equal(typeof handlers['agent/created'], 'function', 'registered agent/created')
  assert.equal(typeof handlers['agent-preset/selected'], 'function', 'registered agent-preset/selected')
  return { calls, handlers, presetBySessionId, state }
}

/** Let deferred (setTimeout) and async work settle. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 5))
  await Promise.resolve()
  await Promise.resolve()
}

/** Establish a Session's starting preset by firing its creation event. */
async function created(handlers, agent, preset, presetBySessionId, source = 'startup') {
  presetBySessionId[agent.session.id] = preset
  await handlers['agent/created']({ agent, source })
}

// --- agent/created ---------------------------------------------------------
{
  const { calls, handlers, presetBySessionId } = setup()
  presetBySessionId['s-start'] = SQUAD
  await handlers['agent/created']({ agent: makeAgent('s-start'), source: 'startup' })
  assert.deepEqual(calls, [{ id: 's-start', enabled: true }], 'startup squad session enables Team')
}
{
  const { calls, handlers, presetBySessionId } = setup()
  presetBySessionId['s-clear'] = SQUAD
  await handlers['agent/created']({ agent: makeAgent('s-clear'), source: 'clear' })
  assert.deepEqual(calls, [{ id: 's-clear', enabled: true }], 'cleared squad session enables Team')
}
{
  const { calls, handlers, presetBySessionId } = setup()
  presetBySessionId['s-std'] = 'standard'
  await handlers['agent/created']({ agent: makeAgent('s-std'), source: 'startup' })
  assert.equal(calls.length, 0, 'non-team preset never enables Team')
}
{
  const { calls, handlers, presetBySessionId } = setup()
  presetBySessionId['s-resume'] = SQUAD
  await handlers['agent/created']({ agent: makeAgent('s-resume'), source: 'resume' })
  assert.equal(calls.length, 0, 'resume preserves the logged Team selection')
}
{
  const { calls, handlers, presetBySessionId } = setup()
  presetBySessionId['s-compact'] = SQUAD
  await handlers['agent/created']({ agent: makeAgent('s-compact'), source: 'compact' })
  assert.equal(calls.length, 0, 'compact preserves the logged Team selection')
}
{
  const { calls, handlers, presetBySessionId } = setup()
  presetBySessionId['s-child'] = SQUAD
  await handlers['agent/created']({ agent: makeAgent('s-child', { origin: 'subagent' }), source: 'startup' })
  assert.equal(calls.length, 0, 'a delegated subagent never enables Team')
}
{
  const { handlers, presetBySessionId } = setup()
  presetBySessionId['s-boom'] = SQUAD
  await handlers['agent/created']({ agent: makeAgent('s-boom', { throws: true }), source: 'startup' })
  // No throw escapes: agent creation must never be broken by the auto-enable.
}

// --- behavior matrix S1–S5 (the core bug fix) -----------------------------
{
  // S1: non-team A (manual ON) -> team -> non-team B : Team stays ON throughout.
  const agent = makeAgent('s1')
  const presetBySessionId = {}
  const { calls, handlers, state } = setup({
    agentsById: { s1: agent }, presetBySessionId, teamState: { s1: true },
  })
  await created(handlers, agent, 'standard', presetBySessionId) // non-team, manual ON
  assert.equal(calls.length, 0, 'S1: non-team create leaves the manual-on switch alone')
  handlers['agent-preset/selected']('s1', SQUAD)
  await settle()
  assert.equal(state.s1, true, 'S1: entering the team preset keeps Team on')
  handlers['agent-preset/selected']('s1', 'minimal')
  await settle()
  assert.equal(state.s1, true, 'S1: leaving to another non-team preset stays on')
  assert.ok(calls.every((c) => c.enabled === true), 'S1: Team was never turned off')
}
{
  // S2: non-team A (OFF) -> team -> non-team B : ON in team, OFF again after.
  const agent = makeAgent('s2')
  const presetBySessionId = {}
  const { calls, handlers, state } = setup({ agentsById: { s2: agent }, presetBySessionId })
  await created(handlers, agent, 'standard', presetBySessionId) // non-team, OFF
  handlers['agent-preset/selected']('s2', SQUAD)
  await settle()
  assert.equal(state.s2, true, 'S2: team preset turns Team on')
  handlers['agent-preset/selected']('s2', 'minimal')
  await settle()
  assert.equal(state.s2, false, 'S2: leaving the team preset restores OFF')
  assert.deepEqual(calls, [
    { id: 's2', enabled: true },
    { id: 's2', enabled: false },
  ], 'S2: OFF -> team ON -> back to non-team OFF')
}
{
  // S3: non-team A (ON) -> non-team B : stays ON.
  const agent = makeAgent('s3')
  const presetBySessionId = {}
  const { calls, handlers, state } = setup({
    agentsById: { s3: agent }, presetBySessionId, teamState: { s3: true },
  })
  await created(handlers, agent, 'standard', presetBySessionId)
  handlers['agent-preset/selected']('s3', 'minimal')
  await settle()
  assert.equal(state.s3, true, 'S3: non-team -> non-team keeps Team on')
  assert.equal(calls.length, 0, 'S3: no setEnabled calls for non-team -> non-team')
}
{
  // S4: non-team A (OFF) -> non-team B : stays OFF.
  const agent = makeAgent('s4')
  const presetBySessionId = {}
  const { calls, handlers, state } = setup({ agentsById: { s4: agent }, presetBySessionId })
  await created(handlers, agent, 'standard', presetBySessionId)
  handlers['agent-preset/selected']('s4', 'minimal')
  await settle()
  assert.equal(state.s4 === true, false, 'S4: non-team -> non-team keeps Team off')
  assert.equal(calls.length, 0, 'S4: no setEnabled calls for non-team -> non-team')
}
{
  // S5: team -> team : stays ON.
  const agent = makeAgent('s5')
  const presetBySessionId = {}
  const { calls, handlers, state } = setup({
    agentsById: { s5: agent }, presetBySessionId, config: { teamPresets: [SQUAD, 'bmad-squad-alt'] },
  })
  await created(handlers, agent, SQUAD, presetBySessionId) // new team-preset session -> ON
  assert.equal(state.s5, true, 'S5: new team-preset session enables Team')
  handlers['agent-preset/selected']('s5', 'bmad-squad-alt')
  await settle()
  assert.equal(state.s5, true, 'S5: team -> team stays on')
  assert.deepEqual(calls, [{ id: 's5', enabled: true }], 'S5: team -> team does not toggle again')
}

// --- agent-preset/selected: supporting cases ------------------------------
{
  // A brand-new team-preset Session remembers OFF as its non-team preference,
  // so switching it to a non-team preset turns Team back off.
  const agent = makeAgent('new-team')
  const presetBySessionId = {}
  const { calls, handlers, state } = setup({ agentsById: { 'new-team': agent }, presetBySessionId })
  await created(handlers, agent, SQUAD, presetBySessionId) // team create -> ON
  handlers['agent-preset/selected']('new-team', 'standard')
  await settle()
  assert.equal(state['new-team'], false, 'a new team session leaving to a non-team preset restores OFF')
  assert.deepEqual(calls, [
    { id: 'new-team', enabled: true },
    { id: 'new-team', enabled: false },
  ], 'a new team session remembers OFF as its non-team preference')
}
{
  const agent = makeAgent('sel-squad')
  const { calls, handlers } = setup({ agentsById: { 'sel-squad': agent } })
  handlers['agent-preset/selected']('sel-squad', SQUAD)
  await settle()
  assert.deepEqual(calls, [{ id: 'sel-squad', enabled: true }], 'selecting a team preset enables Team')
}
{
  // Unknown history (no creation observed) + a non-team selection: the safe
  // default is to leave the switch exactly as it is (never flip blindly).
  const agent = makeAgent('sel-unknown')
  const { calls, handlers, state } = setup({
    agentsById: { 'sel-unknown': agent }, teamState: { 'sel-unknown': true },
  })
  handlers['agent-preset/selected']('sel-unknown', 'standard')
  await settle()
  assert.equal(calls.length, 0, 'unknown history + non-team selection leaves the switch as-is')
  assert.equal(state['sel-unknown'], true, 'unknown history keeps the current Team state')
}
{
  const agent = makeAgent('sel-std')
  const { calls, handlers } = setup({ agentsById: { 'sel-std': agent } })
  handlers['agent-preset/selected']('sel-std', 'standard')
  await settle()
  assert.equal(calls.length, 0, 'selecting a non-team preset when already off is a no-op')
}
{
  const agent = makeAgent('sel-round')
  const { calls, handlers } = setup({ agentsById: { 'sel-round': agent } })
  handlers['agent-preset/selected']('sel-round', SQUAD)
  await settle()
  handlers['agent-preset/selected']('sel-round', 'minimal')
  await settle()
  handlers['agent-preset/selected']('sel-round', SQUAD)
  await settle()
  assert.deepEqual(calls, [
    { id: 'sel-round', enabled: true },
    { id: 'sel-round', enabled: false },
    { id: 'sel-round', enabled: true },
  ], 'Team follows the preset across a team -> non-team -> team round-trip')
}
{
  const agent = makeAgent('sel-child', { origin: 'subagent' })
  const { calls, handlers } = setup({ agentsById: { 'sel-child': agent }, teamState: { 'sel-child': true } })
  handlers['agent-preset/selected']('sel-child', 'standard')
  await settle()
  assert.equal(calls.length, 0, 'a subagent selection never touches Team')
}
{
  const { calls, handlers } = setup()
  handlers['agent-preset/selected']('gone', SQUAD)
  await settle()
  assert.equal(calls.length, 0, 'a vanished session is ignored')
}
{
  const agent = makeAgent('sel-boom', { throws: true })
  const { handlers } = setup({ agentsById: { 'sel-boom': agent } })
  handlers['agent-preset/selected']('sel-boom', SQUAD)
  await settle()
  // No throw escapes: a throwing setEnabled must be contained in selection too.
}

// Manual toggling within a preset is intentionally NOT policed: the plugin has
// no listener that reverts a user's own team/mode change, so a standard session
// can keep Team on until the preset itself changes.

// --- activation scan (plugin enabled mid-session) --------------------------
{
  // Blank squad session, Team off -> activation scan turns it on.
  const agent = makeAgent('open-squad')
  const { calls } = setup({ scanAgents: [agent], presetBySessionId: { 'open-squad': SQUAD } })
  await settle()
  assert.deepEqual(calls, [{ id: 'open-squad', enabled: true }], 'activation enables a blank squad session')
}
{
  // Blank non-team session with Team manually on -> activation leaves it alone
  // (manual state is not policed; only preset switches act on it).
  const agent = makeAgent('open-other')
  const { calls } = setup({ scanAgents: [agent], presetBySessionId: { 'open-other': 'standard' }, teamState: { 'open-other': true } })
  await settle()
  assert.equal(calls.length, 0, 'activation leaves a non-team session manual state alone')
}
{
  // Non-blank (already chatting) session is left alone on activation.
  const agent = makeAgent('busy', { blank: false })
  const { calls } = setup({ scanAgents: [agent], presetBySessionId: { busy: SQUAD } })
  await settle()
  assert.equal(calls.length, 0, 'activation never touches a non-blank session')
}
{
  // Subagents are skipped by the scan.
  const agent = makeAgent('scan-child', { origin: 'subagent' })
  const { calls } = setup({ scanAgents: [agent], presetBySessionId: { 'scan-child': SQUAD } })
  await settle()
  assert.equal(calls.length, 0, 'activation skips subagents')
}

// --- config.teamPresets override ------------------------------------------
{
  const agent = makeAgent('cfg-std')
  const { calls, handlers } = setup({
    agentsById: { 'cfg-std': agent }, config: { teamPresets: ['standard'] },
  })
  handlers['agent-preset/selected']('cfg-std', 'standard')
  await settle()
  assert.deepEqual(calls, [{ id: 'cfg-std', enabled: true }], 'config.teamPresets replaces the default list')
}
{
  // Override round-trip: an overridden team preset turns Team on; leaving it
  // restores the non-team preference captured on the way in.
  const agent = makeAgent('cfg-round')
  const presetBySessionId = {}
  const { calls, handlers, state } = setup({
    agentsById: { 'cfg-round': agent }, presetBySessionId, config: { teamPresets: ['standard'] },
  })
  await created(handlers, agent, 'minimal', presetBySessionId) // non-team under the override, OFF
  handlers['agent-preset/selected']('cfg-round', 'standard')
  await settle()
  assert.equal(state['cfg-round'], true, 'config: the overridden team preset enables Team')
  handlers['agent-preset/selected']('cfg-round', 'minimal')
  await settle()
  assert.equal(state['cfg-round'], false, 'config: leaving the overridden team preset restores OFF')
  assert.deepEqual(calls, [
    { id: 'cfg-round', enabled: true },
    { id: 'cfg-round', enabled: false },
  ], 'config: overridden team preset round-trip')
}
{
  // The default squad preset is now OUTSIDE the override list, i.e. a non-team
  // preset. A non-team -> non-team switch keeps the user's manual state.
  const agent = makeAgent('cfg-squad')
  const presetBySessionId = {}
  const { calls, handlers, state } = setup({
    agentsById: { 'cfg-squad': agent }, presetBySessionId, teamState: { 'cfg-squad': true },
    config: { teamPresets: ['standard'] },
  })
  await created(handlers, agent, 'minimal', presetBySessionId)
  handlers['agent-preset/selected']('cfg-squad', SQUAD)
  await settle()
  assert.equal(state['cfg-squad'], true, 'config: a preset outside the override list is treated as non-team')
  assert.equal(calls.length, 0, 'config: non-team -> non-team under the override stays untouched')
}

console.log('test_host: all assertions passed')
