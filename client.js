// Browser half of the dsh-agent-teams bundle.
//
// The BMad squad registers 1 dispatcher + 7 member presets. DSH has no
// declarative way to hide a single preset, so the picker (new-session chip and
// Settings → Agent presets) lists all 8. Everyday use only needs the dispatcher;
// members are meant to be reached through the dispatcher's delegate_* tools.
//
// This module wraps `ctx.remote.agentPresets.list()` on the Client and drops the
// 7 known member presets, keeping the dispatcher and every other preset
// (including any future non-member `bmad-*` preset). Only the Client-facing
// roster is filtered — the Host registry still declares all 8 presets, so
// `delegate_*` (agentPreset: bmad-analyst … bmad-tea) keeps resolving.
//
// Safety: today the roster shape is `{ ok, value: { presets: [...] } }` and
// `list` is a configurable own accessor installed by the remote namespace
// service. If any of that changes, the wrapper warns once and returns the
// original result unchanged rather than breaking the picker; the wrap is
// skipped outright when `list` is not a configurable own property or the
// context offers no `ctx.effect` to restore it on unload.
window.__ModuleLoader__.load({
  id: 'dsh-agent-teams',
  factory() {
    // The 7 internal members, by registry id (= each preset's config.id).
    // An explicit set (not a `bmad-` prefix): a future non-member `bmad-*`
    // preset is never hidden by accident, and a renamed dispatcher is never
    // lost from the picker.
    const MEMBER_IDS = new Set([
      'bmad-analyst', 'bmad-pm', 'bmad-po', 'bmad-ux',
      'bmad-architect', 'bmad-dev', 'bmad-tea',
    ])
    const LEAD_ID = 'bmad-squad-lead'
    const WRAPPED = Symbol.for('dsh-agent-teams.agentPresets.list.wrapped')
    let warnedShape = false
    const warnShape = (result) => {
      if (warnedShape) return
      warnedShape = true
      // eslint-disable-next-line no-console
      console.warn('[dsh-agent-teams] unexpected agentPresets/list shape; picker filter inactive', result)
    }

    return {
      inject: ['remote.agentPresets'],
      apply(ctx) {
        let ns
        try {
          ns = typeof ctx.get === 'function' ? ctx.get('remote.agentPresets') : undefined
          if (!ns) ns = ctx['remote.agentPresets']
        } catch {
          ns = undefined
        }
        if (!ns || typeof ns.list !== 'function') return
        // Need a disposer to restore on unload, and never install an
        // unrestorable wrapper.
        if (typeof ctx.effect !== 'function') return
        // Idempotency: a second apply (HMR / re-enable) must not nest wrappers.
        if (ns[WRAPPED] === true) return

        // Only wrap a plain configurable own property. Frozen instances or a
        // prototype/`non-configurable` method are left untouched.
        const descriptor = Object.getOwnPropertyDescriptor(ns, 'list')
        if (!descriptor || descriptor.configurable !== true) return

        const original = ns.list
        const filteredList = async (...args) => {
          const result = await original.apply(ns, args)
          try {
            if (result && result.ok && result.value && Array.isArray(result.value.presets)) {
              const all = result.value.presets
              let presets = all.filter((preset) => !(preset && MEMBER_IDS.has(preset.id)))
              if (presets.length !== all.length) {
                // Keep a default entry resolvable: if the hidden set held the
                // only default, promote the dispatcher.
                if (!presets.some((p) => p && p.isDefault)) {
                  presets = presets.map((p) =>
                    p && p.id === LEAD_ID ? { ...p, isDefault: true } : p)
                }
                return { ...result, value: { ...result.value, presets } }
              }
            } else if (result && result.ok === true) {
              warnShape(result)
            }
          } catch {
            /* Malformed roster shape: return the original result unchanged. */
          }
          return result
        }

        try {
          Object.defineProperty(ns, 'list', {
            configurable: true,
            enumerable: descriptor.enumerable !== false,
            writable: true,
            value: filteredList,
          })
        } catch {
          return
        }
        try {
          Object.defineProperty(ns, WRAPPED, { value: true, configurable: true })
        } catch {
          /* marker is best-effort; the descriptor check still guards restore */
        }

        ctx.effect(() => () => {
          try {
            const now = Object.getOwnPropertyDescriptor(ns, 'list')
            // Restore only if our wrapper is still the installed value — the
            // framework may already have torn the accessor down (Reflect.delete).
            if (now && now.value === filteredList) {
              Object.defineProperty(ns, 'list', descriptor)
            }
          } catch {
            /* best-effort restore on unload */
          }
          try {
            delete ns[WRAPPED]
          } catch {
            /* noop */
          }
        })
      },
    }
  },
})
