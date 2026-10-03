export type Suggestion = string

declare module 'claude-code' {
  interface PluginState {
    'next-steps': { suggestions: Suggestion[]; lastPrompt: string; loading: boolean }
  }
}
