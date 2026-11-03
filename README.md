# Streaming Agent Console

[![CI](https://github.com/Nicola-Rizzi/streaming-agent-console/actions/workflows/ci.yml/badge.svg)](https://github.com/Nicola-Rizzi/streaming-agent-console/actions/workflows/ci.yml)

A chat interface for an AI assistant that shows its work. While it answers, you can see what it's thinking, which tools it uses, which specialists it hands work to, and the charts and files it produces, all as they arrive.

It's built for the moments when things go wrong, and always tells you clearly what happened.

![A turn streaming: grouped actions, a nested specialist, a question answered, then Done](docs/demo.gif)

There's no real assistant behind it: a small mock backend replays recorded conversations. The companies, people and numbers in them are made up.

## What it does

- **Streams answers as they're written**, without half-finished formatting flickering on screen.
- **Puts the answer first.** The work behind it is smaller and grey, grouped in one box, with the details a click away. Specialists nest under the step that called them.
- **Asks you questions** with a small form when it needs your input, and locks the message box until you answer.
- **Copes with the unexpected.** Content it doesn't recognise shows a short note instead of breaking the page.
- **Works with a keyboard and a screen reader.** Colour only ever means a state, and always comes with a symbol and a word.

## How an answer can end

| What happens | What you see |
|---|---|
| The assistant finishes | **Done**, and how long it took |
| You press Stop | **Stopped**, keeping everything that arrived |
| An error, then the assistant carries on | The error, in place, and the answer continues |
| An error, then the stream ends | **Failed** |
| The connection drops | **Interrupted**, with a Resume button |
| 15 seconds of total silence | **Reconnecting**, up to 4 times, then Interrupted |

## Try it

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

Pick a conversation on the left and send a message. The app lives in `app/`, the backend in `server/`, and the conversations it replays in `fixtures/`.

| Command | What it does |
|---|---|
| `npm test` | 66 unit tests, in a few seconds |
| `npm run test:e2e` | 10 end-to-end tests in a real browser, including an accessibility check (about 90 seconds) |
| `npm run demo:gif` | Records the GIF above again, from the real app |

GitHub runs the type check, the formatting check and both test suites on every push.

## How it works

```
 mock backend ──stream──▶ session ──▶ decode ──▶ reducer ──▶ selectors ──▶ screen
                             ▲                                                │
                             └──────── send, Stop, Resume, answers ◀──────────┘
```

- **`session.ts`** looks after the connection: one stream at a time, Stop, noticing silence, and resuming.
- **`decode.ts`** turns what arrives into typed messages.
- **`reducer.ts`** keeps every message once, in a flat list. Messages arrive in pieces and then complete; the complete version always wins, so replaying a conversation never shows anything twice.
- **`selectors.ts`** builds what you see from that list, so the screen always matches the data.

None of this depends on React, so most of it is tested as plain functions.

## Known limits

- A stopped answer only shows as stopped until you leave the conversation, because the history doesn't record stops.
- Charts show a labelled placeholder instead of a real chart.
- Resuming replays the whole conversation; the backend could send only what was missed.
- Very long conversations would benefit from rendering only what's on screen.
- A failed answer can't be retried with one click yet.
