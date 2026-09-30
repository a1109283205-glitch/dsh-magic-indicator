// Browser half of dsh-magic-indicator.
//
// A passive chip in `conversation.input.left` — the composer tool row, beside
// the 识图 button that dsh-qwen-switch registers there (that one is order 10,
// this one is order 20, so the chip sits immediately to its right).
//
// The chip is a <span>, not a <button>: the user asked for something they
// never click and cannot click, so it carries no handler, no focus seat, and
// `pointer-events: none`. Its footprint is deliberately identical to the
// neighbouring button (same height, padding, border width, radius and font
// size) so the row keeps a single visual rhythm in both states.
//
// Two states, driven by polling the host half:
//
//   needing   -> solid yellow background, black text, bold
//   idle      -> transparent background, grey text
//
// Polling rather than push because the writer is the agent itself, whose only
// host-side capability is the filesystem; the host half turns that file into
// GET /dsh-magic/status and this half reads it. A failed poll keeps the last
// known state instead of flickering to idle.
//
// Hand-written in the lazy-CJS bundle protocol (window.__ModuleLoader__.load
// with a factory returning cordis-plugin exports), so there is no build step —
// the same shape dsh-qwen-switch uses.

window.__ModuleLoader__.load({
  id: 'dsh-magic-indicator',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var SLOT = 'conversation.input.left'
    var STATUS_URL = '/dsh-magic/status'
    var POLL_MS = 1500

    // Matches the neighbouring 识图 button so both chips read as one row.
    var CHIP_BASE = {
      display: 'inline-flex',
      alignItems: 'center',
      height: '24px',
      padding: '0 8px',
      marginRight: '4px',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderRadius: '6px',
      fontSize: '11px',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      boxSizing: 'border-box',
      // Passive: no click target, no text selection, no pointer cursor.
      pointerEvents: 'none',
      userSelect: 'none',
      cursor: 'default',
      transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
    }

    var NEEDING = {
      background: '#FFD400',
      color: '#000000',
      borderColor: '#000000',
      fontWeight: 600,
    }

    var IDLE = {
      background: 'transparent',
      color: '#9aa0a6',
      borderColor: 'transparent',
      fontWeight: 400,
    }

    function readState(setState) {
      return fetch(STATUS_URL, { cache: 'no-store' })
        .then(function (response) {
          return response != null && response.ok ? response.json() : null
        })
        .then(function (payload) {
          if (payload == null) return
          setState({
            active: payload.active === true,
            text: typeof payload.text === 'string' && payload.text ? payload.text : '需要魔法支援',
          })
        })
        .catch(function () {
          // Transient failure: keep whatever the chip last showed.
        })
    }

    function makeChip(react) {
      var h = react.createElement

      return function MagicIndicator(_props) {
        var stored = react.useState({ active: false, text: '需要魔法支援' })
        var state = stored[0]
        var setState = stored[1]

        react.useEffect(function () {
          var alive = true
          var push = function (next) {
            if (alive) setState(next)
          }
          readState(push)
          var id = setInterval(function () {
            readState(push)
          }, POLL_MS)
          return function () {
            alive = false
            clearInterval(id)
          }
        }, [])

        var look = state.active ? NEEDING : IDLE
        var style = Object.assign({}, CHIP_BASE, look)

        return h(
          'span',
          {
            // No onClick, no tabIndex, `pointer-events: none` in the style:
            // the chip reports, it never captures input.
            'aria-live': 'polite',
            style: style,
          },
          state.text,
        )
      }
    }

    function apply(ctx) {
      if (typeof ctx.inject !== 'function') return

      ctx.inject(['slots'], (scope) => {
        var react
        try {
          react = require('react')
        } catch (error) {
          console.error('[magic-indicator] react unavailable', error)
          return
        }
        var Chip = makeChip(react)
        scope.slots.inject(SLOT, function* () {
          yield scope.slots.register({ name: SLOT, id: 'magic-indicator', order: 20 }, Chip)
        })
      })
    }

    exports.apply = apply
    exports.inject = []
    return module.exports
  },
})
