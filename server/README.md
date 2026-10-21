# Mock assistant service

Replays recorded conversation fixtures over SSE at a production-like cadence: token-level chunks, thinking pauses, slow actions, and keep-alive comments during gaps. A full turn can take a while because real agent work does too.

## Running

```sh
npm install
npm start                 # http://localhost:8787
```

| Env var | Default | Effect |
|---|---|---|
| `PORT` | `8787` | Listen port |
| `FIXTURES_DIR` | `../fixtures` | Directory of fixtures + `threads.json` |
| `MOCK_SPEED` | `1` | Divides every delay. `MOCK_SPEED=20 npm start` streams ~20× faster — handy while developing. Check behaviour at `1`: several behaviours only show at real speed. Keep-alive comments scale with it, so a silence carries the same number of them whatever speed you run at. |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/threads?cursor=` | Thread list, paged |
| `GET` | `/api/threads/:id/messages?cursor=` | Settled history, paged backward from newest |
| `POST` | `/api/threads/:id/turns` | Send a message; streams the next recorded turn (SSE) |
| `GET` | `/api/threads/:id/resume` | Replay history, bookmark, then any turn in flight (SSE) |
| `POST` | `/api/threads/:id/cancel` | Cancel the turn in flight |
| `POST` | `/api/reset` | Re-queue every recorded turn, so you can replay one without restarting. Turn numbering restarts too. |

Every stream's first frame announces its protocol version. v1 threads (see `PROTOCOL_V1.md` at the repo root) are served in the legacy format on both the stream and the messages endpoint.

For v1, message sequence numbers are stable within a thread across live delivery,
replay and paged reads. New turns continue the sequence; `/api/reset` clears it
alongside the thread data.

## Fixtures

`threads.json` indexes the fixture files. Several are deliberately hostile: stalls, dropped sockets, malformed frames.

**The service is stateful.** Each `POST /turns` consumes one recorded turn from that thread's queue; when the queue runs out you get a placeholder reply. `POST /api/reset` re-queues everything.

`welcome` is the smallest thread. The rest range from short edge cases to long multi-turn conversations.

A fixture is raw SSE text with `:` comment directives for the replay engine:

| Directive | Effect |
|---|---|
| `: turn` | Starts a queued turn — each `POST /turns` streams the next one, whatever text was sent |
| `: pause <ms>` | Silence at this point (keep-alive comments continue) |
| `: delay <ms>` | Manual-mode inter-frame delay |
| `: stall <ms>` | Go quiet with the keep-alives switched off — the socket stays open and says nothing |
| `: kill` | Drop the socket mid-stream (playback continues server-side) |
| `: mode manual` | Replay frames verbatim instead of auto-chunking settled messages |

In the default auto mode, fixtures store *settled* frames and the engine synthesizes the streaming experience (chunked deltas, running→settled tool calls, then the `final` supersede).

Auto pacing follows the work being replayed. Text has a short first-token delay and pauses at punctuation. Actions use their recorded timestamps when available, within these usability limits:

| Action kind | Delay range |
|---|---|
| `library` | 1.2–8 seconds |
| `tool` or unknown | 1.8–12 seconds |
| `agent` | 6–18 seconds |

When timestamps are missing, seeded fallbacks keep the same relative order: library work is usually shortest, tools take longer, and sub-agents take longest. Overlapping actions share elapsed time instead of adding their full durations together. `MOCK_SPEED` divides all automatic and explicit delays. Manual fixtures retain their exact frame order and delays.

## Simplifications

Two places where this mock is simpler than a real backend:

- History is reconstructed from the frames a turn emitted, including partial streaming text a stopped turn never settled, and errors on the channel they arrived on. After a `: kill` that includes frames the client never received — which is what lets a resume finish the story. A real backend would persist as it generates rather than rebuilding after the fact.
- A dropped client gets no help: `/resume` replays the whole thread from zero. There is no cursor or partial resume.
