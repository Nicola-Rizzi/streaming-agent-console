# Mock assistant service

A stand-in for a real AI assistant. It replays recorded conversations over a stream (SSE) at a realistic pace: text arrives a few words at a time, the assistant pauses to think, tools take a while, and keep-alive pings fill the silences. A full answer can take a minute, because real agent work does too.

## Running it

```sh
npm install
npm start                 # http://localhost:8787
```

| Setting | Default | What it does |
|---|---|---|
| `PORT` | `8787` | The port to listen on |
| `FIXTURES_DIR` | `../fixtures` | Where the recorded conversations and `threads.json` are |
| `MOCK_SPEED` | `1` | Speeds everything up. `MOCK_SPEED=20 npm start` is about 20 times faster, which is handy while developing. Check things at normal speed too: some behaviour only shows up there. |

## Endpoints

| Request | What it does |
|---|---|
| `GET /api/threads` | The list of conversations, a page at a time |
| `GET /api/threads/:id/messages` | A conversation's finished messages, newest page first |
| `POST /api/threads/:id/turns` | Sends a message and streams the next recorded answer |
| `GET /api/threads/:id/resume` | Streams the whole conversation again, then any answer still in progress |
| `POST /api/threads/:id/cancel` | Stops the answer in progress |
| `POST /api/reset` | Puts every recorded answer back in the queue, so you can replay without restarting |

Every stream starts by saying which protocol version it uses. Older conversations use version 1, described in [`PROTOCOL_V1.md`](../PROTOCOL_V1.md).

## The recorded conversations

`threads.json` lists them. `welcome` is the smallest; the others range from short edge cases to long conversations, and some are deliberately difficult: silences, dropped connections, broken messages.

**The service remembers where you are.** Each message you send plays the next recorded answer for that conversation. When there are none left, you get a placeholder reply. `POST /api/reset` starts everything over.

Each file is a raw stream with a few extra lines starting with `:` that tell the service what to do:

| Line | What it does |
|---|---|
| `: turn` | Starts the next recorded answer. Each message you send plays one, whatever you wrote |
| `: pause <ms>` | A silence, with keep-alive pings still coming |
| `: stall <ms>` | A silence with no pings at all: the connection stays open and says nothing |
| `: kill` | Drops the connection mid-answer |
| `: delay <ms>` | The gap between messages, in manual mode |
| `: mode manual` | Plays the file exactly as written instead of breaking messages into pieces |

Normally the files store each message once, finished, and the service breaks it into pieces to imitate streaming. Actions take roughly as long as they did when recorded, within these limits:

| Kind of action | How long it takes |
|---|---|
| Library work | 1.2 to 8 seconds |
| Tools | 1.8 to 12 seconds |
| Specialists (sub-agents) | 6 to 18 seconds |

## Where it's simpler than a real backend

- The history of an answer is rebuilt from what was streamed, including text from a stopped answer and messages sent after a dropped connection. That's what lets a resume finish the story. A real backend would save as it goes.
- Resuming replays the whole conversation from the start. There's no way to pick up exactly where you left off.
