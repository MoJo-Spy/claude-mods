import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, [] as Limit[])
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
// True once the engine has measured the session: an account with no limits
// (an API key) then shows nothing rather than a waiting message.
const measured = atom({ plugin: 'usage-band', key: 'measured' } as const, false)

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

// Compact: one hairline row per window, stacked, about a quarter of the band.
const SVG_W = 228
const ROW_H = 15
const svgHeight = (n: number) => n * ROW_H

const svgCard = (rows: Row[]) => {
  const BAR_X = 22
  const BAR_END = 124
  const PCT_END = 158
  const cells = rows
    .map((r, i) => {
      const base = i * ROW_H + 11
      const mid = base - 3.5
      const used = BAR_X + Math.max(0, Math.min(1, r.pct / 100)) * (BAR_END - BAR_X)
      const tickX = r.elapsed === undefined ? undefined : (BAR_X + r.elapsed * (BAR_END - BAR_X)).toFixed(1)
      return `
  <text class="label" x="0" y="${base}">${esc(r.short)}</text>
  <line class="track" x1="${BAR_X}" x2="${BAR_END}" y1="${mid}" y2="${mid}"/>
  <line class="used ${r.level}" x1="${BAR_X}" x2="${used.toFixed(1)}" y1="${mid}" y2="${mid}"/>
  ${tickX === undefined ? '' : `<line class="tick" x1="${tickX}" x2="${tickX}" y1="${mid - 3.5}" y2="${mid + 3.5}"/>`}
  <text class="pct ${r.level}" x="${PCT_END}" y="${base}" text-anchor="end">${Math.round(r.pct)}%</text>
  <text class="meta" x="${SVG_W}" y="${base}" text-anchor="end">${esc(r.resetShort)}</text>`
    })
    .join('')
  const H = svgHeight(rows.length)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${H}" width="${SVG_W}" height="${H}">
  <style>
    svg { --fg:#3d3d3a; --muted:#8a8985; --track:rgba(0,0,0,.14); --warn:#b7791f; --hot:#c4483e;
          font-family: ui-monospace, "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace; }
    @media (prefers-color-scheme: dark) {
      svg { --fg:#d4d3cf; --muted:#8f8e8a; --track:rgba(255,255,255,.16); --warn:#e0a84a; --hot:#e8766c; }
    }
    text { font-size:10px; fill:var(--muted); }
    .label { letter-spacing:.04em; }
    .pct { fill:var(--fg); }
    .pct.warn { fill:var(--warn); } .pct.hot { fill:var(--hot); }
    line { stroke-linecap:round; }
    .track { stroke:var(--track); stroke-width:1; }
    .used { stroke:var(--fg); stroke-width:1.75; opacity:.75; }
    .used.warn { stroke:var(--warn); opacity:1; } .used.hot { stroke:var(--hot); opacity:1; }
    .tick { stroke:var(--fg); stroke-width:1.25; opacity:.65; }
  </style>${cells}
</svg>`
}

// ---------- terminal: text bars ----------

const COLORS = { ok: 'green', warn: 'yellow', hot: 'red' } as const

const textBar = (r: Row, width = 10) => {
  const filled = Math.round(Math.max(0, Math.min(1, r.pct / 100)) * width)
  const paceAt = r.elapsed === undefined ? -1 : Math.min(width - 1, Math.floor(r.elapsed * width))
  let s = ''
  for (let i = 0; i < width; i++) s += i === paceAt ? '┃' : i < filled ? '━' : '─'
  return s
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
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
    await update($, measured, () => true)
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits.map(l => ({ ...l })))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const els = $.ui.resolve(e) as Record<string, any>
    const { Box, Text } = els
    const at = (await read($, now)) || (await $.clock.now())
    const rows = (await read($, limits)).map(l => toRow(l, at))

    if (rows.length === 0) {
      // No limits on this account (e.g. an API key): stay out of the way.
      if (await read($, measured)) return next(e)
      return (
        <Box flexDirection="row" justifyContent="flex-end">
          <Text dimColor>usage: waiting for first reply</Text>
        </Box>
      )
    }

    if (e.surface === 'desktop' && els.Svg) {
      const Svg = els.Svg
      const alt = rows
        .map(r => [`${r.label} ${r.pct}% used`, r.resetIn, paceText(r)].filter(Boolean).join(', '))
        .join('; ')
      return (
        <Box flexDirection="row" alignItems="center">
          {/* left side kept free for more widgets */}
          <Box flexGrow={1} />
          <Svg source={svgCard(rows)} alt={alt} width={SVG_W} height={svgHeight(rows.length)} />
        </Box>
      )
    }

    return (
      <Box flexDirection="row" gap={3} justifyContent="flex-end">
        {rows.map(r => (
          <Box key={r.kind} flexDirection="row">
            <Text dimColor>{r.short} </Text>
            <Text color={r.level === 'ok' ? undefined : COLORS[r.level]} dimColor={r.level === 'ok'}>
              {textBar(r)}
            </Text>
            <Text color={r.level === 'ok' ? undefined : COLORS[r.level]}> {Math.round(r.pct)}%</Text>
            <Text dimColor> {r.resetShort}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
