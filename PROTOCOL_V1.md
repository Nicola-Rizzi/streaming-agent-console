# Protocol v1 (legacy)

Older threads replay in protocol v1. A stream announces its version in its first frame:

```
event: protocol
data: {"version": 1}
```

v1 predates reasoning, sub-agents, and interactive commands, so it carries less information than v2.

## Frames

Every content frame uses `event: message`. There are no channels, no scopes, and no bookmark.

`seq` identifies a message within a thread. New messages receive increasing sequence
numbers; chunks and updates to an existing message retain its number. Numbers may
have gaps. The same message keeps its `seq` across live turns, replay and REST reads.
Starting a subsequent turn or reconnecting does not restart the sequence. Different
threads have independent sequences; the development `/api/reset` endpoint resets
the thread's data and sequence together.

| Payload | Shape |
|---|---|
| User message | `{"kind": "user", "seq": n, "body": "…", "at": "<ISO timestamp>"}` |
| Bot text (delta) | `{"kind": "bot", "seq": n, "append": "…"}` — append-only; concatenate in arrival order |
| Bot text (end) | `{"kind": "bot", "seq": n, "done": true}` — optionally carries `body` with the full text |
| Tool call | `{"kind": "tool", "seq": n, "name": "…", "status": "running"}` then a second frame with `"status": "ok" \| "error"` and optional `attachments` |

`attachments` carries artifacts inline (same chart/table/file shapes as v2) — there is no delivery/reference split.

## Lifecycle

- `event: done` with `data: {}` — the turn (or replay) is over.
- `event: fail` with `data: {"message": "…"}` — the turn failed.
- A v1 replay has no bookmark: history and live tail are not delimited.

## REST

`GET /api/threads/:id/messages` returns whatever the thread speaks *now*. A
thread still on v1 returns v1 payloads (`kind`/`seq`/`body`). A thread that has
migrated returns v2 — even though `/resume` replays its older history in v1, and
even though the thread list still reports it as `protocol: 1`. The list reports
where a thread started; only the stream tells you where it is.
