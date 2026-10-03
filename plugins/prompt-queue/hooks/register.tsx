import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { QueuedPrompt } from '../types'

const items = atom({ plugin: 'prompt-queue', key: 'items' } as const, [] as QueuedPrompt[])
// Set when a turn was stopped or failed: the queue waits for Resume.
const paused = atom({ plugin: 'prompt-queue', key: 'paused' } as const, false)
const nextId = atom({ plugin: 'prompt-queue', key: 'nextId' } as const, 1)
// The main loop's running turn, '' when idle: what Send now stops.
const turnId = atom({ plugin: 'prompt-queue', key: 'turnId' } as const, '')

// Start a prompt with this to send it into the running turn right away.
const NOW_PREFIX = /^now[:\s]\s*/i
// Prompts the person wrote, as opposed to notifications, peers or plugins.
const PERSON = new Set(['composer', 'bridge', 'sdk'])

// True while Send now is stopping the running turn, so that stop neither
// pauses the queue nor starts the next item in line.
let sendingNow = false

const preview = (text: string, max = 48) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

// Takes the first queued prompt off and submits it as its own turn.
async function runNext($: EngineInterface) {
  const queue = await read($, items)
  if (queue.length === 0) return
  const [first, ...rest] = queue
  await update($, items, () => rest)
  await $.prompt.submit({ text: first.text, asUser: true })
}

// Sends one queued prompt now: stops the running task first, if there is one.
async function sendNow($: EngineInterface, id: number) {
  const pick = (await read($, items)).find(p => p.id === id)
  if (!pick) return
  await update($, items, q => q.filter(p => p.id !== id))
  await update($, paused, () => false)
  const running = await read($, turnId)
  if (running) {
    sendingNow = true
    try {
      await $.turn.abort({ turnId: running })
    } catch {
      sendingNow = false // the turn had already ended
    }
  }
  await $.prompt.submit({ text: pick.text, asUser: true })
}

export const register: Register = on => {
  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    await update($, turnId, () => result.turnId)
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    // Only hold prompts the person typed over a running turn; leave anything
    // with images alone, since a plugin can't resubmit attachments.
    if (!e.turnId || !PERSON.has(e.origin.kind) || e.attachments?.length) return next(e)
    if (NOW_PREFIX.test(e.text)) return next({ ...e, text: e.text.replace(NOW_PREFIX, '') })

    const id = await read($, nextId)
    await update($, nextId, n => n + 1)
    await update($, items, q => [...q, { id, text: e.text }])
    // Answering without next holds the prompt quietly: it never reaches Claude.
    return { text: e.text }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result // a subagent's turn, not the main loop
    await update($, turnId, () => '')
    if (sendingNow) {
      sendingNow = false // Send now already submitted its prompt
    } else if (e.reason === 'answer') {
      if (!(await read($, paused))) await runNext($)
    } else if ((await read($, items)).length > 0) {
      // Stopped by you, or an error: don't keep firing prompts into it.
      await update($, paused, () => true)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const inner = await next(e)
    if (e.props.hasSurvey) return inner
    const queue = await read($, items)
    const { Box, Text, Button } = $.ui.resolve(e)

    if (queue.length === 0) {
      // Placeholder, so you can see the queue is loaded and listening.
      return (
        <Box flexDirection="row" gap={2}>
          <Text dimColor>
            {e.props.isWorking ? "Up next · empty: type now and it waits here" : "Up next · empty"}
          </Text>
          <Box flexGrow={1}>{inner}</Box>
        </Box>
      )
    }
    const isPaused = await read($, paused)
    const shown = queue.slice(0, 4)

    return (
      <Box flexDirection="row" alignItems="flex-start" gap={2}>
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Text dimColor>{isPaused ? 'Queue paused' : `Up next · ${queue.length}`}</Text>
            {isPaused ? (
              <Button
                key="resume"
                label="Resume"
                dimColor
                onPress={async () => {
                  await update($, paused, () => false)
                  if (!(await read($, turnId))) await runNext($)
                }}
              />
            ) : null}
            <Button key="clear" label="Clear" dimColor onPress={() => update($, items, () => [])} />
          </Box>
          {shown.map((p, i) => (
            <Box key={`q${p.id}`} flexDirection="row" gap={1}>
              <Text dimColor>{i + 1}.</Text>
              <Text wrap="truncate-end">{preview(p.text)}</Text>
              <Button key={`s${p.id}`} label="↑" plain dimColor onPress={() => sendNow($, p.id)} />
              <Button
                key={`x${p.id}`}
                label="✕"
                plain
                dimColor
                onPress={() => update($, items, q => q.filter(x => x.id !== p.id))}
              />
            </Box>
          ))}
          {queue.length > shown.length ? <Text dimColor>+{queue.length - shown.length} more</Text> : null}
        </Box>
        <Box flexGrow={1}>{inner}</Box>
      </Box>
    )
  })
}
