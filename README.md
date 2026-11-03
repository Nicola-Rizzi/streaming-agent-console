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

What doesn't work, or works only partly, and why.

**Because the backend is a mock**

- **What you type isn't read.** Each message plays the next recorded answer for that conversation, whatever you wrote. There's no real assistant to answer it.
- **Answers run out.** Once a conversation's recorded answers are used up, you get a placeholder reply. Restart the backend, or call `POST /api/reset`, to play them again.
- **You can't start a new conversation.** The backend serves a fixed list, so when a conversation is full the app can only say so.
- **Resuming replays the whole conversation.** The backend has no way to send only what was missed, so after a dropped connection everything is streamed again. The app hides this, but it costs time on long conversations.

**In the app**

- **A stopped answer shows as stopped only until you leave the conversation.** The history doesn't record stops, so after reopening it reads as done or interrupted.
- **Charts are placeholders.** They show their title and series, not the chart itself. A charting library like Plotly adds about 3 MB to the app, too much for a secondary part of the answer.
- **Older-format conversations aren't displayed.** They open with a notice and their lifecycle is handled, but their content isn't rendered.
- **Answers to the assistant's questions are sent as plain text**, one line per question, because the backend only accepts text.
- **A failed answer can't be retried.** You have to send the message again yourself.

## Improvements

In order of value:

1. **Retry a failed answer** with one click, resending the same message.
2. **Real charts**, with the library loaded only when a chart appears, so the app stays light.
3. **A resume cursor** on the backend (`Last-Event-ID`), so a dropped connection resumes from where it stopped instead of from the start.
4. **Remember stops** in the history, so a stopped answer still says so after reopening.
5. **Render only what's on screen** for very long conversations. Around 350 messages works fine today, so this only matters beyond that.
6. **A live demo**, running the backend's replay in the browser, so the app can be tried without installing anything.
