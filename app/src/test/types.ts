import type { StreamFrame } from "../api/types";

/** One queued turn of a fixture. Frames after a `: kill` never reach the client, so they are left out. */
export type FixtureTurn = {
  frames: StreamFrame[];
  killed: boolean;
};

/** A recorded thread: history before the first `: turn`, then one entry per queued turn. */
export type Fixture = {
  name: string;
  manual: boolean;
  history: StreamFrame[];
  turns: FixtureTurn[];
};
