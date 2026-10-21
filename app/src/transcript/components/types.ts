/** Only for turns streamed in this view; history has no timing. */
export type Timing = {
  startedAt: number | null;
  seconds: number | null;
};

export type Answer = {
  picked: string[];
  other: string;
};
