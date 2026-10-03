# my-claude-mods

Personal Claude Code mods, packaged as a plugin marketplace.

| Mod | What it does |
| --- | --- |
| `usage-band` | A compact widget on the right of the band above the prompt: your 5-hour and weekly usage limits, a tick for how far through each window you are, and the time until reset. Turns amber/red when you're close or on pace to go over. Works on Pro/Max, Team/Enterprise spend limits, and stays hidden on API-key accounts. |

## Requirements

Claude Code **v2.1.287 or later** (mods are built in from that version). Check with `claude --version`; update with `npm install -g @anthropic-ai/claude-code@latest`. The Claude Desktop app's Code tab updates itself.

## Install (once per account / computer)

```bash
claude plugin marketplace add <your-github-user>/claude-mods
claude plugin install usage-band@my-claude-mods
```

Or inside a session: `/plugin marketplace add <your-github-user>/claude-mods`, then `/plugin install usage-band@my-claude-mods`.
If a session is already open, run `/reload-plugins`.

The repo can stay private: Claude Code uses your existing git / GitHub credentials to fetch it (for example run `gh auth login` once on each computer).

## Update

Bump `version` in `plugins/<mod>/.claude-plugin/plugin.json`, push, then on each machine:

```bash
claude plugin marketplace update my-claude-mods
claude plugin update usage-band@my-claude-mods
```

## Add another mod

Put it in `plugins/<name>/` and add an entry to `.claude-plugin/marketplace.json`.
