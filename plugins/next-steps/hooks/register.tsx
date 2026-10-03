import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const suggestions = atom({ plugin: 'next-steps', key: 'suggestions' } as const, [] as string[])
// What the person last asked, so the suggestions follow from it.
const lastPrompt = atom({ plugin: 'next-steps', key: 'lastPrompt' } as const, '')

const SYSTEM =
  'You suggest what a user might ask a coding assistant next. Reply with only a JSON array of ' +
  'up to 3 strings. Each is a next-step request written as the user would type it, imperative, ' +
  'at most 7 words, specific to the conversation. No numbering, no quotes inside, no extra text. ' +
  'If nothing useful follows, reply [].'

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) + '…' : s)

function parseList(text: string): string[] {
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    const list = JSON.parse(m[0])
    return Array.isArray(list)
      ? list.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim()).slice(0, 3)
      : []
  } catch {
    return []
  }
}

async function suggest($: EngineInterface, answer: string) {
  const asked = await read($, lastPrompt)
  const r = await $.model.complete({
    model: 'haiku',
    system: SYSTEM,
    prompt: `User asked:\n${clip(asked, 2000)}\n\nAssistant replied:\n${clip(answer, 4000)}\n\nNext steps (JSON array):`,
    maxTokens: 200,
    timeoutMs: 15000,
  })
  await update($, suggestions, () => (r.isAnswered ? parseList(r.text) : []))
}

async function send($: EngineInterface, text: string) {
  await update($, suggestions, () => [])
  await $.prompt.submit({ text, asUser: true })
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    // A new request makes the old suggestions stale.
    if (!e.turnId) {
      await update($, lastPrompt, () => e.text)
      await update($, suggestions, () => [])
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && e.reason === 'answer' && e.answer.trim()) {
      void suggest($, e.answer).catch(() => undefined)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const inner = await next(e)
    if (e.props.hasSurvey || e.props.isWorking) return inner
    const list = await read($, suggestions)
    if (list.length === 0) return inner

    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text dimColor>Next:</Text>
        {list.map((s, i) => (
          <Button key={`n${i}`} label={s} dimColor onPress={() => send($, s)} />
        ))}
        <Box flexGrow={1}>{inner}</Box>
      </Box>
    )
  })
}
