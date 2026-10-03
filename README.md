# Claude Code Mods: Usage Limits Tracker & Prompt Queue

**See your Claude Code 5-hour and weekly usage limits at all times**, queue up prompts while Claude works, and open a new chat or push to GitHub in one click. Two free, open-source [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview) for the **Claude Desktop app** (Code tab) and the **Claude Code terminal**.

![Claude Code usage limits mod: 5-hour and weekly usage percentage with reset countdown above the prompt](docs/usage-band.png)

Install in 30 seconds:

```bash
claude plugin marketplace add pawandeepdhall/claude-mods
claude plugin install usage-band@my-claude-mods
claude plugin install prompt-queue@my-claude-mods
```

---

## usage-band: always-visible Claude usage limits

Stop guessing how close you are to your Claude limit or running `/usage` again and again. `usage-band` pins a small widget above the prompt that shows:

- **5-hour limit**: percentage used and a countdown to when it resets (↻ 2h 55m)
- **Weekly limit**: percentage used and the days and hours until it resets (↻ 4d 0h)
- **Early warning**: the percentage turns amber when you are close, and red when you are near the limit or on pace to hit it before it resets
- **＋ New chat** button: opens a brand-new chat in one click (presses Ctrl+N / Cmd+N for you)
- **↑ Push** button (git projects only): asks Claude to commit your changes and push them to GitHub

It updates on its own, works on Pro and Max plans, shows Team and Enterprise spend limits, and hides itself on API-key accounts, where there are no limits to show. It follows your light or dark theme.

## prompt-queue: queue prompts while Claude Code works

Think of the next thing to ask while Claude is still busy? Type it. Instead of interrupting the running task, it waits in an **Up next** list on the left of the band and **runs automatically** when the current task finishes, one after another.

- **↑** on an item: stop the current task and send that prompt now
- **✕** on an item: remove it; **Clear** empties the list
- Pauses safely if you stop Claude (Esc) or a task fails, with a **Resume** button
- Start a prompt with `now:` to skip the queue

## Requirements

Claude Code **v2.1.287 or later** (mods are built in from that version). The Claude Desktop app updates itself. In a terminal, check with `claude --version` and update with:

```bash
npm install -g @anthropic-ai/claude-code@latest
```

## Install

Run these once per computer (no GitHub account needed):

```bash
claude plugin marketplace add pawandeepdhall/claude-mods
claude plugin install usage-band@my-claude-mods
claude plugin install prompt-queue@my-claude-mods
```

Or inside a Claude Code session: `/plugin marketplace add pawandeepdhall/claude-mods`, then `/plugin install usage-band@my-claude-mods`. In a session that was already open, run `/reload-plugins`.

## Update

```bash
claude plugin marketplace update my-claude-mods
claude plugin update usage-band@my-claude-mods
claude plugin update prompt-queue@my-claude-mods
```

## What these mods can access

Mods run with your permissions, so here is exactly what each one does. Check it yourself with `claude plugin validate ./plugins/<mod>`.

- **usage-band** reads your session's usage figures (`$.session.usage`), checks whether the folder is a git repo (`git rev-parse`), runs a one-line script that presses Ctrl+N when you click **＋**, and submits a commit-and-push request to Claude when you click **↑**. Nothing is sent anywhere else.
- **prompt-queue** holds prompts you type while Claude is working and submits them, in order, when the task ends. Nothing is sent anywhere else.

## FAQ

**How do I see my Claude Code usage limit?** Install `usage-band`. Your 5-hour and weekly usage show above the prompt in every session.

**When does my Claude 5-hour limit reset?** `usage-band` shows a live countdown (↻) next to each limit.

**Can I queue messages in Claude Code?** Yes. With `prompt-queue`, anything you type while Claude is working waits its turn and runs automatically.

**Does it work in the Claude Desktop app?** Yes. Both mods work in the Desktop app's Code tab and in the terminal.

## Contributing

Ideas and pull requests are welcome. Each mod is a folder under `plugins/`; add a new one and list it in `.claude-plugin/marketplace.json`.

Keywords: Claude Code mod, Claude Code plugin, Claude usage tracker, Claude usage limit, 5-hour limit, weekly limit, rate limit monitor, Claude Desktop, prompt queue, message queue, Anthropic Claude.
