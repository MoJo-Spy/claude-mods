import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, [] as Limit[])
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
// True once the engine has measured the session: an account with no limits
// (an API key) then shows nothing rather than a waiting message.
const measured = atom({ plugin: 'usage-band', key: 'measured' } as const, false)
// Whether the session's folder is a git repository: the Push button shows only then.
const isRepo = atom({ plugin: 'usage-band', key: 'isRepo' } as const, false)

// ---------- push button ----------

// Hands the job to Claude rather than running a bare git push: it commits what is
// uncommitted with a real message, pushes, and asks before anything risky.
const PUSH_PROMPT =
  'Commit all my current changes with a clear commit message and push them to GitHub. ' +
  'If there is nothing to commit, just push. Tell me in one line what you pushed.'

async function checkRepo($: EngineInterface) {
  try {
    const r = await $.process.run(['git', 'rev-parse', '--is-inside-work-tree'])
    await update($, isRepo, () => r.exitCode === 0 && r.stdout.trim() === 'true')
  } catch {
    await update($, isRepo, () => false) // no git installed
  }
}

async function pushToGitHub($: EngineInterface) {
  await $.prompt.submit({ text: PUSH_PROMPT, asUser: true })
}

// ---------- new chat button ----------

// A mod can't open a Desktop chat itself, so the button presses the app's own
// shortcut for you: Ctrl+N on Windows (a one-line script that starts in a blink,
// unlike PowerShell), Cmd+N on macOS. The click just put Claude in front.
const SEND_CMD_N = 'tell application "System Events" to keystroke "n" using command down'

async function pressNewChat($: EngineInterface) {
  try {
    await $.process.run(['wscript.exe', '//B', '//Nologo', `${$.plugin.root}/scripts/new-chat.vbs`])
  } catch {
    await $.process.run(['osascript', '-e', SEND_CMD_N]).catch(() => undefined)
  }
}

type Window = { label: string; short: string; ms: number }
const WINDOWS: Record<string, Window> = {
  five_hour: { label: '5-hour', short: '5H', ms: 5 * 3600_000 },
  seven_day: { label: 'Weekly', short: 'WK', ms: 7 * 86400_000 },
  // Team / Enterprise / gateway accounts: no fixed window, so no pace marker
  spend_limit: { label: 'Spend', short: 'SP', ms: 0 },
}
const windowOf = (kind: string): Window =>
  WINDOWS[kind] ?? { label: kind.replace(/_/g, ' '), short: kind.slice(0, 2).toUpperCase(), ms: 0 }

type Row = {
  kind: string
  label: string
  short: string
  pct: number
  /** 0..1 of the window already elapsed, when the reset time is known */
  elapsed?: number
  /** where usage lands at reset if the current rate holds */
  projected?: number
  resetIn: string
  /** just the countdown, for the compact layout */
  resetShort: string
  level: 'ok' | 'warn' | 'hot'
}

const fmtDuration = (ms: number) => {
  const mins = Math.max(0, Math.round(ms / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

const toRow = (l: Limit, at: number): Row => {
  const w = windowOf(l.kind)
  const pct = l.percentUsed
  let elapsed: number | undefined
  let projected: number | undefined
  let resetIn = ''
  let resetShort = ''
  const resetMs = l.resetsAt ? Date.parse(l.resetsAt) - at : NaN
  if (resetMs > 0) {
    resetShort = fmtDuration(resetMs)
    resetIn = `resets in ${resetShort}`
    if (w.ms > 0) {
      elapsed = Math.min(1, Math.max(0, 1 - resetMs / w.ms))
      if (elapsed > 0.05) projected = Math.round(pct / elapsed)
    }
  } else if (l.resetsAt) {
    resetIn = 'resetting now'
    resetShort = 'now'
  }
  const level =
    pct >= 90 || (projected ?? 0) >= 100 ? 'hot' : pct >= 70 || (projected ?? 0) >= 85 ? 'warn' : 'ok'
  return { kind: l.kind, label: w.label, short: w.short, pct, elapsed, projected, resetIn, resetShort, level }
}

const paceText = (r: Row) =>
  r.projected === undefined ? '' : r.projected >= 100 ? 'on pace for 100%+' : `on pace for ~${r.projected}%`

// ---------- desktop: SVG card ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Compact: one row per window, stacked. Set in the app's own UI font with
// tabular figures, so it matches the band's text; 12px everywhere around it.
const SEP_GAP = 12
const CONTENT_W = 116
const SVG_W = SEP_GAP + CONTENT_W + SEP_GAP
const ROW_H = 17
const svgHeight = (n: number) => n * ROW_H

const svgCard = (rows: Row[]) => {
  const PCT_END = 54
  const cells = rows
    .map((r, i) => {
      const base = i * ROW_H + 13
      return `
  <text class="label" x="0" y="${base}">${esc(r.short)}</text>
  <text class="pct ${r.level}" x="${PCT_END}" y="${base}" text-anchor="end">${Math.round(r.pct)}<tspan class="unit">%</tspan></text>
  <text class="meta" x="${CONTENT_W}" y="${base}" text-anchor="end">${r.resetShort ? '↻ ' + esc(r.resetShort) : ''}</text>`
    })
    .join('')
  const H = svgHeight(rows.length)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${H}" width="${SVG_W}" height="${H}">
  <style>
    svg { --fg:#3d3d3a; --muted:#8a8985; --track:rgba(0,0,0,.12); --warn:#b7791f; --hot:#c4483e;
          font-family: system-ui, "Segoe UI", -apple-system, sans-serif; font-variant-numeric: tabular-nums; }
    @media (prefers-color-scheme: dark) {
      svg { --fg:#d4d3cf; --muted:#8f8e8a; --track:rgba(255,255,255,.14); --warn:#e0a84a; --hot:#e8766c; }
    }
    text { fill:var(--muted); }
    .label { font-size:10px; font-weight:600; letter-spacing:.08em; }
    .pct { font-size:12.5px; font-weight:600; fill:var(--fg); }
    .unit { font-size:10px; font-weight:500; }
    .pct.warn { fill:var(--warn); } .pct.hot { fill:var(--hot); }
    .meta { font-size:11px; }
    .sep { stroke:var(--track); stroke-width:1; }
  </style>
  <line class="sep" x1="0.5" x2="0.5" y1="1" y2="${H - 1}"/>
  <line class="sep" x1="${SVG_W - 0.5}" x2="${SVG_W - 0.5}" y1="1" y2="${H - 1}"/>
  <g transform="translate(${SEP_GAP},0)">${cells}</g>
</svg>`
}

// ---------- terminal: plain text ----------

const COLORS = { ok: 'green', warn: 'yellow', hot: 'red' } as const


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    void checkRepo($)
    const t = await $.clock.now()
    await update($, now, () => t)
    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits.map(l => ({ ...l })))
    // Tick once a minute so the countdowns and pace marker stay current.
    $.clock.every(60_000, () => {
      void $.clock.now().then(t => update($, now, () => t))
    })
    return result
  })

  on('session.measure', async ($, e, next) => {
    // In the background, so Claude Code never waits on the widget.
    void update($, measured, () => true)
    if (e.changed.includes('rateLimits')) void update($, limits, () => e.rateLimits.map(l => ({ ...l })))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Whatever else draws in the band (another mod) stays, on the left.
    const inner = await next(e)
    if (e.props.hasSurvey) return inner

    const els = $.ui.resolve(e) as Record<string, any>
    const { Box, Text, Button } = els
    const [repo, savedNow, saved, wasMeasured] = await Promise.all([
      read($, isRepo),
      read($, now),
      read($, limits),
      read($, measured),
    ])
    const pushButton = repo ? (
      <Button key="push" label="↑" variant="primary" onPress={() => pushToGitHub($)} />
    ) : null
    const newChatButton = (
      // The app draws its own buttons; "primary" is its accent (Claude orange) style.
      <Button key="new-chat" label="+" variant="primary" onPress={() => pressNewChat($)} />
    )
    const at = savedNow || (await $.clock.now())
    const rows = saved.map(l => toRow(l, at))

    if (rows.length === 0) {
      // No limits on this account (e.g. an API key): stay out of the way.
      if (wasMeasured) {
        return (
          <Box flexDirection="row" alignItems="center" gap={1} flexGrow={1}>
            <Box flexGrow={1}>{inner}</Box>
            {pushButton}
          {newChatButton}
          </Box>
        )
      }
      return (
        <Box flexDirection="row" alignItems="center" gap={1} flexGrow={1}>
          <Box flexGrow={1}>{inner}</Box>
          <Text dimColor>usage: waiting for first reply</Text>
          {pushButton}
          {newChatButton}
        </Box>
      )
    }

    if (e.surface === 'desktop' && els.Svg) {
      const Svg = els.Svg
      const alt = rows
        .map(r => [`${r.label} ${r.pct}% used`, r.resetIn, paceText(r)].filter(Boolean).join(', '))
        .join('; ')
      return (
        <Box flexDirection="row" alignItems="center" gap={1} flexGrow={1}>
          {/* left side: other mods in the band */}
          <Box flexGrow={1}>{inner}</Box>
          <Svg source={svgCard(rows)} alt={alt} width={SVG_W} height={svgHeight(rows.length)} />
          {pushButton}
          {newChatButton}
        </Box>
      )
    }

    return (
      <Box flexDirection="row" gap={3} flexGrow={1}>
        <Box flexGrow={1}>{inner}</Box>
        {rows.map(r => (
          <Box key={r.kind} flexDirection="row">
            <Text dimColor>{r.short} </Text>
            <Text color={r.level === 'ok' ? undefined : COLORS[r.level]}>{Math.round(r.pct)}%</Text>
            <Text dimColor> {r.resetShort}</Text>
          </Box>
        ))}
        <Text dimColor>│</Text>
        {pushButton}
          {newChatButton}
      </Box>
    )
  })
}
