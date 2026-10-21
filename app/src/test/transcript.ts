import type { StreamFrame } from "../api/types";
import { transcriptReducer } from "../transcript/reducer";
import type { TranscriptAction, TranscriptState } from "../transcript/types";

/** A wire frame whose data is the JSON of `payload`. */
export const f = (event: string, payload: object): StreamFrame => ({ event, data: JSON.stringify(payload) });

export const bookmark = f("final", { type: "bookmark" });
export const complete = f("complete", {});

/** The reducer action for a batch of frames. */
export const frames = (list: StreamFrame[]): TranscriptAction => ({ type: "frames", frames: list });

/** Applies the actions in order, starting from `state`. */
export const reduceAll = (state: TranscriptState, ...actions: TranscriptAction[]): TranscriptState =>
  actions.reduce(transcriptReducer, state);
