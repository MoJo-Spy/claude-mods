# my-claude-mods

Personal Claude Code mods, packaged as a plugin marketplace.

| Mod | What it does |
| --- | --- |
| `usage-band` | A compact widget on the right of the band above the prompt: your 5-hour and weekly usage as a percentage plus the time until each resets (↻). Turns amber/red when you are close or on pace to go over. Shows Team/Enterprise spend limits, and hides itself on API-key accounts. A **+** button at the far right opens a new chat (it presses Ctrl+N / Cmd+N for you), and in git projects an **↑** button before it asks Claude to commit and push your changes. |
| `prompt-queue` | Type more requests while Claude is working: each one waits quietly in an "Up next" list on the left of the band (it never reaches Claude early) and runs automatically when the current task finishes. Each item has ↑ (stop the current task and send this now) and ✕ (remove); Clear empties the list. If you stop Claude (Esc) or a task errors, the queue pauses until you press Resume. Start a prompt with `now:` to skip the queue. Works in the terminal and the Desktop app. |

## Requirements

Claude Code **v2.1.287 or later** (mods are built in from that version). Check with `claude --version`; update with `npm install -g @anthropic-ai/claude-code@latest`. The Claude Desktop app's Code tab updates itself.

## Install (once per account / computer)

```bash
claude plugin marketplace add pawandeepdhall/claude-mods
claude plugin install usage-band@my-claude-mods
claude plugin install prompt-queue@my-claude-mods
```

Or inside a session: `/plugin marketplace add pawandeepdhall/claude-mods`, then `/plugin install usage-band@my-claude-mods`.
If a session is already open, run `/reload-plugins`.

The repo is public, so no GitHub login is needed to install.

## Update

Bump `version` in `plugins/<mod>/.claude-plugin/plugin.json`, push, then on each machine:

```bash
claude plugin marketplace update my-claude-mods
claude plugin update usage-band@my-claude-mods
```

## Add another mod

Put it in `plugins/<name>/` and add an entry to `.claude-plugin/marketplace.json`.
