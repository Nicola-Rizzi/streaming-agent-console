# Streaming Agent Console

A chat interface for a streaming AI assistant, with a mock backend that replays recorded conversations over SSE.

## Layout

```
app/      React 19 + TypeScript + Tailwind: the thread list, the composer,
          the SSE client and the transcript.
server/   The mock assistant service. Serves the fixtures over SSE.
          It has its own README.
fixtures/ Conversation streams the service replays. All companies, people
          and data in them are fictional.
```

## Run it

Node 20.19+ or 22+ (there is an `.nvmrc`). Two terminals:

```sh
cd server && npm install && npm start     # http://localhost:8787
cd app && npm install && npm run dev      # http://localhost:5173 (proxies /api to the service)
```

Open the app, pick a thread, send a message. `welcome` is the smallest thread.

## Notes

- `app/src/api/client.ts` reads the SSE stream into raw frames (`StreamFrame`).
- `app/src/api/types.ts` has the v2 wire types. The legacy protocol is described in `PROTOCOL_V1.md`.
- `npm test` runs `vitest` in either package.
