import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Suggestion } from '../types'

const suggestions = atom({ plugin: 'next-steps', key: 'suggestions' } as const, [] as Suggestion[])
// What the person last asked, so the suggestions follow from it.
const lastPrompt = atom({ plugin: 'next-steps', key: 'lastPrompt' } as const, '')
// True while the suggestions for the last reply are being written.
const loading = atom({ plugin: 'next-steps', key: 'loading' } as const, false)
// Which suggestions are ticked, by index; Send sends them together.
const selected = atom({ plugin: 'next-steps', key: 'selected' } as const, [] as number[])
// Claude's last answer, kept so Send can write the prompt with full context.
const lastAnswer = atom({ plugin: 'next-steps', key: 'lastAnswer' } as const, '')
// True while Send is writing the prompt.
const composing = atom({ plugin: 'next-steps', key: 'composing' } as const, false)

// Writes the message Send submits: a real, specific request built from the ticked
// steps and the conversation, not a one-line restatement of the label.
const COMPOSE_SYSTEM =
  "You write the next message a user sends to an AI coding assistant. You are given the user's " +
  "last request, the assistant's last answer, and one or more next steps the user picked. Write " +
  'that message as the user, in the first person, ready to send. For each step: say exactly what to ' +
  'do, name the specific files, functions, commands, URLs or values from the conversation it ' +
  'involves, give any constraints or context the assistant needs, and say what done looks like. ' +
  'With several steps, number them in the order given and say to finish each before the next. ' +
  'Be concrete and concise: no greetings, no filler, no restating the whole conversation. Output ' +
  'only the message.'

const MAX = 6

const SYSTEM =
  'You suggest what a user might ask a coding assistant to do next. Reply with only a JSON array ' +
  `of up to ${MAX} objects, each {"label": string, "prompt": string}. ` +
  '"label" is the button text: imperative, at most 10 words, specific to this conversation. ' +
  '"prompt" is what gets sent to the assistant when the user picks it: a clear, complete request ' +
  'in 2 to 4 sentences, written as the user, naming the relevant files, features or goals from the ' +
  'conversation and saying what "done" looks like. Make the suggestions distinct from each other. ' +
  'If nothing useful follows, reply [].'

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) + '…' : s)
const words = (s: string, max: number) => s.split(/\s+/).slice(0, max).join(' ')

function parseList(text: string): Suggestion[] {
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    const list = JSON.parse(m[0])
    if (!Array.isArray(list)) return []
    return list
      .filter(x => x && typeof x.label === 'string' && x.label.trim() !== '')
      .map(x => {
        const label = words(x.label.trim(), 10)
        const prompt = typeof x.prompt === 'string' && x.prompt.trim() !== '' ? x.prompt.trim() : label
        return { label, prompt }
      })
      .slice(0, MAX)
  } catch {
    return []
  }
}

async function suggest($: EngineInterface, answer: string) {
  const asked = await read($, lastPrompt)
  await update($, lastAnswer, () => answer)
  await update($, loading, () => true)
  const r = await $.model.complete({
    model: 'haiku',
    system: SYSTEM,
    prompt: `User asked:\n${clip(asked, 3000)}\n\nAssistant replied:\n${clip(answer, 6000)}\n\nNext steps (JSON array):`,
    maxTokens: 1500,
    timeoutMs: 20000,
  })
  await update($, suggestions, () => (r.isAnswered ? parseList(r.text) : []))
  await update($, selected, () => [])
  await update($, loading, () => false)
}

async function toggle($: EngineInterface, i: number) {
  await update($, selected, l => (l.includes(i) ? l.filter(x => x !== i) : [...l, i].sort((a, b) => a - b)))
}

// Sends the ticked steps as one well-written prompt, composed by Sonnet with the
// conversation as context; falls back to Haiku's quick drafts if that fails.
async function sendSelected($: EngineInterface) {
  const list = await read($, suggestions)
  const picked = (await read($, selected)).map(i => list[i]).filter(Boolean)
  if (picked.length === 0 || (await read($, composing))) return
  let text =
    picked.length === 1
      ? picked[0].prompt
      : 'Please do the following, in this order:\n\n' +
        picked.map((s, i) => `${i + 1}. ${s.label}\n${s.prompt}`).join('\n\n')
  await update($, composing, () => true)
  try {
    const steps = picked.map((s, i) => `${i + 1}. ${s.label}: ${s.prompt}`).join('\n')
    const r = await $.model.complete({
      model: 'sonnet',
      system: COMPOSE_SYSTEM,
      prompt:
        `User's last request:\n${clip(await read($, lastPrompt), 6000)}\n\n` +
        `Assistant's last answer:\n${clip(await read($, lastAnswer), 16000)}\n\n` +
        `Next steps the user picked, in order:\n${steps}\n\nThe message:`,
      maxTokens: 1200,
      timeoutMs: 30000,
    })
    if (r.isAnswered && r.text.trim()) text = r.text.trim()
  } catch {
    // keep the draft
  }
  await update($, composing, () => false)
  await update($, suggestions, () => [])
  await update($, selected, () => [])
  await $.prompt.submit({ text, asUser: true })
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    // A new request makes the old suggestions stale.
    if (!e.turnId) {
      await update($, lastPrompt, () => e.text)
      await update($, suggestions, () => [])
      await update($, selected, () => [])
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && e.reason === 'answer' && e.answer.trim()) {
      void suggest($, e.answer).catch(() => update($, loading, () => false))
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const inner = await next(e)
    if (e.props.hasSurvey) return inner
    // Skip anything saved in an older format (plain strings) before a reload.
    const list = (await read($, suggestions)).filter(x => x && typeof x === 'object' && x.label)
    const picked = await read($, selected)
    const isComposing = await read($, composing)
    const { Box, Text, Button } = $.ui.resolve(e)

    if (e.props.isWorking || list.length === 0) {
      // Placeholder, so the spot never looks broken or empty.
      const hint = e.props.isWorking
        ? 'Next steps appear when Claude finishes'
        : (await read($, loading))
          ? 'Finding next steps…'
          : 'No next steps yet'
      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text dimColor>{hint}</Text>
          <Box flexGrow={1}>{inner}</Box>
        </Box>
      )
    }

    const item = (s: Suggestion, i: number) => (
      <Button
        key={`n${i}`}
        label={`${picked.includes(i) ? '☑' : '☐'}  ${s.label}`}
        dimColor={!picked.includes(i)}
        onPress={() => toggle($, i)}
      />
    )
    // Two columns, filled down then across: 1-3 left, 4-6 right.
    const half = Math.ceil(list.length / 2)
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Box flexDirection="column" alignItems="flex-start" gap={1}>
          <Box flexDirection="row" alignItems="flex-start" gap={1}>
            <Box flexDirection="column" alignItems="flex-start" gap={1}>
              {list.slice(0, half).map((s, i) => item(s, i))}
            </Box>
            <Box flexDirection="column" alignItems="flex-start" gap={1}>
              {list.slice(half).map((s, i) => item(s, i + half))}
            </Box>
          </Box>
          {isComposing ? (
            <Text dimColor>Writing prompt…</Text>
          ) : picked.length > 0 ? (
            <Button
              key="send"
              label={picked.length === 1 ? 'Send' : `Send ${picked.length}`}
              variant="primary"
              onPress={() => sendSelected($)}
            />
          ) : (
            <Text dimColor>Tick one or more, then Send</Text>
          )}
        </Box>
        <Box flexGrow={1}>{inner}</Box>
      </Box>
    )
  })
}
