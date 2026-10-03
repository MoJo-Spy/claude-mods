export type QueuedPrompt = { id: number; text: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-queue': { items: QueuedPrompt[]; paused: boolean; nextId: number; turnId: string }
  }
}
