/**
 * Host half of the dsh-olympus bundle.
 *
 * The bundle is primarily a configuration bundle: its patch inserts the Olympus Squad
 * agent presets (see cordis.patch.yml). It also declares a browser half
 * (`dsh.client` + `./client`), whose job is to keep the preset picker tidy.
 *
 * This Host entry has a second job: keep the built-in Agent Teams switch aligned
 * with the running preset *without* clobbering a choice the user made by hand.
 * The rule (see SETUP.md / CHANGELOG.md):
 *   1. Switching between two NON-team presets leaves the switch untouched — a
 *      Team the user turned on by hand in a normal preset stays on.
 *   2. ENTERING a "team preset" (default: the squad dispatcher `squad-lead`)
 *      forces Team on. The value the switch had before is first remembered as the
 *      Session's "non-team preference".
 *   3. LEAVING a team preset for a non-team preset restores that remembered
 *      non-team preference (off stays off, on stays on).
 *
 * Why this matters: Team mode is stored per Session (a `team/mode` event) and
 * DSH never touches it when the preset changes. An earlier version reset it to
 * the new preset's default on every switch — that wrongly disabled a Team the
 * user had enabled by hand and forced it off on the way back to a normal preset.
 * We now remember the previous preset per Session (the `agent-preset/selected`
 * event only carries the *new* preset, and `presetForSession` may already report
 * the new value at that point) and only act on real transitions.
 *
 * The plugin stays config-first: this is the only Host code, and it never
 * implements squad behavior — it just flips the existing per-session switch.
 */

export const name = 'dsh-olympus'

/**
 * Presets whose root Sessions should run with Agent Teams on. Edit this list
 * (or pass `config.teamPresets` on the Loader row) to add another squad preset
 * without touching the logic below.
 */
export const TEAM_PRESETS = ['squad-lead']

/**
 * Agent lifecycle sources whose Team selection is not yet user-owned, so
 * auto-enabling is safe. `resume`/`compact` are deliberately excluded: a
 * resumed Session keeps whatever Team selection it already logged.
 */
const AUTO_SOURCES = new Set(['startup', 'clear'])

/**
 * Whether an Agent is a top-level Session that can own a Team.
 * @param agent - candidate Agent from an event payload or the live registry.
 * @param subagents - the `subagents` service used to resolve the tree root.
 * @returns true only for a live root Session (never a delegated member).
 */
function isRootAgent(agent, subagents) {
  if (!agent || !agent.session || !agent.session.header) return false
  if (agent.session.header.origin === 'subagent') return false
  try {
    return subagents.rootOf(agent) === agent
  } catch {
    return false
  }
}

/**
 * Resolve the preset a live Agent actually runs. Prefer the log-recorded value
 * (`presetForSession`), because the header only records the creation-time preset
 * and a blank Session may have been switched since. Fall back to the header.
 * @param agent - live root Agent.
 * @param agentPresets - the `agentPresets` service.
 * @returns the effective preset id, or null when unknown.
 */
function presetOf(agent, agentPresets) {
  try {
    const recorded = agentPresets.presetForSession(agent.session)
    if (recorded) return recorded
  } catch {
    /* fall through to the header */
  }
  const header = agent.session && agent.session.header
  return header && header.agentPreset ? header.agentPreset : null
}

/**
 * Whether a Session has not started a turn yet, using the list-metadata
 * projection. Unknown sessions are treated as non-blank so activation
 * reconciliation never touches a Session it cannot classify.
 * @param session - live Session to classify.
 * @param sessionProjections - the `sessionProjections` service.
 * @returns true only when the projection affirmatively reports blank.
 */
function isBlankSession(session, sessionProjections) {
  try {
    const snapshot = sessionProjections.snapshot(session, ['sessionListMetadata'])
    const meta = snapshot && snapshot.values && snapshot.values.sessionListMetadata
    return Boolean(meta && meta.blank === true)
  } catch {
    return false
  }
}

/**
 * Set Team mode on or off for one root Agent. The `setEnabled` service call is
 * itself idempotent (it appends only when the value actually changes), so this
 * always calls it and lets the service decide — no client-side short-circuit
 * that could disagree with the authoritative projection.
 * @param agentTeams - the `agentTeams` service.
 * @param agent - exact root Agent to align.
 * @param enabled - desired Team selection.
 * @returns fulfillment after a needed selection flushes.
 */
function alignTeam(agentTeams, agent, enabled) {
  return agentTeams.setEnabled(agent, enabled)
}

/**
 * Read the current Team selection for one Agent.
 * @param agentTeams - the `agentTeams` service.
 * @param agent - root Agent to read.
 * @returns the boolean selection, or null when the service cannot tell us.
 */
function readEnabled(agentTeams, agent) {
  try {
    const value = agentTeams.isEnabled(agent)
    return typeof value === 'boolean' ? value : null
  } catch {
    return null
  }
}

/**
 * Stable per-Session key used to remember presets/preferences across events.
 * @param agent - a live Agent.
 * @returns the Session id, or null when the payload has no usable id.
 */
function sessionKey(agent) {
  return (agent && agent.session && agent.session.id) || (agent && agent.id) || null
}

/**
 * Register the preset-alignment hooks. Wrapped in `ctx.inject` so the badge row
 * stays a no-op (and stays discoverable by `@deepseek-ai/dsh-client-modules` for
 * its `dsh.client` half) even before the Host services it needs are ready.
 * @param ctx - the Host plugin context the bundle row is mounted on.
 * @param config - Loader row config; `teamPresets` overrides {@link TEAM_PRESETS}.
 */
export function apply(ctx, config = {}) {
  const configured = config && Array.isArray(config.teamPresets) && config.teamPresets.length > 0
    ? config.teamPresets
    : TEAM_PRESETS
  const teamPresets = new Set(configured.map(String))
  const wantsTeam = preset => teamPresets.has(preset)

  ctx.inject(['agentTeams', 'agents', 'agentPresets', 'subagents', 'sessionProjections'], (scope) => {
    const { agentTeams, agents, agentPresets, subagents, sessionProjections } = scope

    // Per-session memory, so a preset switch can be classified as an
    // enter/leave/neutral move even though the selection event only carries the
    // new preset:
    //   - lastPreset: the last preset we saw this Session on (updated on creation
    //     and on every selection), i.e. the "previous preset" for the next move.
    //   - nonTeamPref: the Team value the user had while in a non-team preset,
    //     captured on the way *into* a team preset and restored on the way out.
    const lastPreset = new Map()
    const nonTeamPref = new Map()

    // 1) A brand-new root Session created already carrying a team preset — the
    //    dispatcher is the deployment default, or the hero chip staged it at
    //    create time. Remember its preset, and (for a team preset) its initial
    //    non-team state before forcing Team on. Non-team creates are left alone:
    //    they start Team-off and their manual state is never touched.
    scope.on('agent/created', async ({ agent, source } = {}) => {
      try {
        if (!isRootAgent(agent, subagents)) return
        const key = sessionKey(agent)
        const preset = presetOf(agent, agentPresets)
        if (key && preset) lastPreset.set(key, preset)
        if (!AUTO_SOURCES.has(source)) return
        if (!wantsTeam(preset)) return
        // A brand-new team-preset Session has no user Team choice yet: its
        // non-team preference is OFF by definition, so remember that even if the
        // service cannot report the current value yet.
        const before = readEnabled(agentTeams, agent)
        if (key) nonTeamPref.set(key, before === null ? false : before)
        await alignTeam(agentTeams, agent, true)
      } catch {
        /* Never let an auto-enable failure break Agent creation. */
      }
    })

    // 2) The user switched the root Session's preset. Act only on real moves:
    //      team preset        -> force on (remember the non-team value we came from);
    //      team -> non-team    -> restore the remembered non-team preference;
    //      non-team -> non-team-> leave the switch exactly as it is.
    //    `presetForSession` may already report the new preset here, so the
    //    previous preset comes from our own `lastPreset` map. This fires from
    //    inside the Session's own append, so defer the follow-up append:
    //    Session.append refuses reentrancy while one is being published.
    scope.on('agent-preset/selected', (sessionId, agentPreset) => {
      const hadPrevious = lastPreset.has(sessionId)
      const previous = hadPrevious ? lastPreset.get(sessionId) : undefined
      // Record the new preset synchronously so two rapid switches keep their
      // ordering (the second sees the first as its "previous").
      lastPreset.set(sessionId, agentPreset)
      setTimeout(() => {
        try {
          const agent = agents.get(sessionId)
          if (!isRootAgent(agent, subagents)) return
          if (wantsTeam(agentPreset)) {
            // Entering (or staying on) a team preset. Only capture the non-team
            // preference when truly coming from a non-team preset or an unknown
            // previous — a team -> team move must not overwrite it.
            if (!hadPrevious || !wantsTeam(previous)) {
              const before = readEnabled(agentTeams, agent)
              if (before !== null) nonTeamPref.set(sessionId, before)
            }
            void alignTeam(agentTeams, agent, true).catch(() => {})
            return
          }
          // New preset is non-team. Only act when we are leaving a team preset;
          // restore the remembered non-team preference. Unknown history falls
          // back to leaving the switch as-is (never flip a value we have no
          // preference for), and non-team -> non-team stays untouched.
          if (hadPrevious && wantsTeam(previous) && nonTeamPref.has(sessionId)) {
            void alignTeam(agentTeams, agent, nonTeamPref.get(sessionId)).catch(() => {})
          }
        } catch {
          /* Ignore a Session that went away before the deferred update. */
        }
      }, 0)
    })

    // 3) When this plugin turns on, give already-open BLANK root Sessions their
    //    team-preset default (enable) even though no creation/selection event
    //    will fire. Also learn every live root Session's preset so a later switch
    //    has a known "previous" even if we missed its creation event. Deliberately
    //    one-directional: a non-team Session's manual Team state is left alone, so
    //    plugin (re)activation never silently flips a switch the user set by hand.
    //    Deferred so it runs after activation.
    queueMicrotask(() => {
      let live
      try {
        live = agents.list()
      } catch {
        return
      }
      for (const agent of live) {
        try {
          if (!isRootAgent(agent, subagents)) continue
          const key = sessionKey(agent)
          const preset = presetOf(agent, agentPresets)
          if (key && preset) lastPreset.set(key, preset)
          if (!wantsTeam(preset)) continue
          if (!isBlankSession(agent.session, sessionProjections)) continue
          // A blank team-preset Session has no user Team choice yet; treat its
          // non-team preference as OFF even if the current value is unreadable.
          const before = readEnabled(agentTeams, agent)
          if (key) nonTeamPref.set(key, before === null ? false : before)
          void alignTeam(agentTeams, agent, true).catch(() => {})
        } catch {
          /* Skip any Session we cannot inspect safely. */
        }
      }
    })
  })
}
