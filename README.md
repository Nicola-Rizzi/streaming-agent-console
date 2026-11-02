# Streaming Agent Console

A chat interface for an AI assistant that works in the open. While it answers, you see what it's thinking, which tools it calls, which specialists it hands work to, and the charts and files it produces, all as they stream in.

It's built to keep working when things go wrong: a turn that's stopped, fails, goes quiet or loses its connection always ends in a clear state.

![A turn streaming: grouped actions, a nested specialist, a question answered, then Done](docs/demo.gif)

The app runs against a mock backend (`server/`) that replays recorded conversations (`fixtures/`), so no real assistant is needed. All companies, people and numbers in those conversations are invented.

## What it does

- **Streams answers as they're written**, with markdown that doesn't flicker half-formed.
- **Shows the work, quietly.** Reasoning and tool calls are smaller and grey, grouped into one box per run of work, with details one click away.
- **Nests sub-agents** under the step that called them, at any depth.
- **Asks you questions.** When the assistant needs input, it shows a small form (options, multi-select, free text) and waits.
- **Handles failure honestly.** Stop, errors, dropped connections and silent stalls each have their own state, and a dropped turn can be resumed.
- **Degrades gracefully.** Unknown content shows a short note in place instead of breaking the page.
- **Works with a keyboard and a screen reader.** Turn endings and questions are announced, focus moves to a question when one arrives, and the main screens pass an automated WCAG 2.1 AA check.

## Quick start

You need Node 22.

```sh
git clone https://github.com/Nicola-Rizzi/streaming-agent-console.git
cd streaming-agent-console

# terminal 1: the mock backend
cd server && npm install && npm start     # http://localhost:8787

# terminal 2: the app, from the repository root
npm install
npm run dev                               # http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (60, about a second) |
| `npm run test:e2e` | Browser tests (10, about 90 seconds; downloads Chromium the first time) |
| `npm run demo:gif` | Re-records `docs/demo.gif` from the real app |

## How it works

```
 mock backend ──SSE──▶ session ──▶ decode ──▶ reducer ──▶ selectors ──▶ React
                          ▲                                               │
                          └──────────── send, Stop, Resume, answers ◀─────┘
```

- **`session.ts`** owns the connection: one stream at a time, Stop, detecting a stalled stream, and resuming.
- **`decode.ts`** turns raw frames into typed events. It never throws: a malformed frame or an unknown message type becomes a short note in place, and keep-alives and unknown events are skipped.
- **`reducer.ts`** stores every message once, in a flat list.
- **`selectors.ts`** builds the tree you see (turns, groups, nested sub-agents) from that list on every render, so the view can't drift out of sync with the data.

None of these know about React, so most behaviour is tested as plain functions.

A few details that matter:

- A message usually arrives twice: in pieces while it streams, then as one final version. The final version always wins, so replaying a thread never duplicates anything.
- Reopening a thread rebuilds it in the background and swaps it in when it's ready, so nothing flickers.
- Only the part of the screen that changed is redrawn while text streams.

## How a turn can end

| What happens | What you see |
|---|---|
| The assistant finishes | **Done**, with how long it took |
| You press Stop | **Stopped**, and everything that arrived stays |
| An error, then the assistant carries on | The error in place, and the turn continues |
| An error, then the stream closes | **Failed** |
| The connection drops | **Interrupted**, with a Resume button |
| Total silence for 15 seconds | **Reconnecting**, up to 4 times, then Interrupted |

## Design choices

- The answer comes first and reads at full contrast; the work behind it is there but out of the way.
- Colour only ever means state (ok, warning, error), and every state also has a symbol and a word.
- One activity line per turn says what the assistant is doing and for how long. The browser tab says "Working…" or "Question for you" if you've switched away.
- Scrolling follows new content while you're at the bottom. Scroll up to read and it stays put; a button brings you back.
- While a question is waiting, the message box is locked and says why.

## Tests

- **Unit tests** cover each rule on its own (decoding, streaming text, sub-agents, every way a turn ends), the connection logic with fake timers, and the main components.
- **Browser tests** run the real app against the mock backend: a full turn with a question, Stop, a dropped connection, errors, a silent stall, markdown, unknown content, an old-format thread and scrolling. They fail on any unexpected console error, and one runs [axe](https://github.com/dequelabs/axe-core) against WCAG 2.1 AA with every section expanded.

## Limitations and next steps

- A stopped turn only shows as stopped until you leave the thread, because the history doesn't record stops.
- Very long threads would benefit from virtualised rendering.
- Charts show a labelled placeholder; real charts would need a charting library, loaded on demand.
- Resuming replays the whole thread. A resume cursor on the backend would send only what was missed.
- A failed turn has no retry button yet.
