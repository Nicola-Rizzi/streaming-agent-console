export type TextMessageType = "assistant" | "thinking";

type ActionKind = "agent" | "library" | "tool";

const actionProfiles: Record<ActionKind, { fallback: [number, number]; limits: [number, number] }> = {
  agent: { fallback: [9000, 15000], limits: [6000, 18000] },
  library: { fallback: [2000, 5000], limits: [1200, 8000] },
  tool: { fallback: [3000, 7000], limits: [1800, 12000] },
};

export function actionDelayMs(
  settled: Record<string, unknown>,
  running: Record<string, unknown> | undefined,
  random: () => number,
): number {
  const kind = actionKind(settled.kind ?? running?.kind);
  const profile = actionProfiles[kind];
  const recorded = recordedDurationMs(settled, running);
  if (recorded !== undefined) {
    return clamp(recorded, ...profile.limits);
  }
  const [minimum, maximum] = profile.fallback;
  return minimum + random() * (maximum - minimum);
}

export function initialTextDelayMs(type: TextMessageType, random: () => number): number {
  return type === "thinking" ? 300 + random() * 700 : 180 + random() * 420;
}

export function textChunkDelayMs(type: TextMessageType, previousChunk: string, random: () => number): number {
  const base = type === "thinking" ? 34 + random() * 56 : 22 + random() * 48;
  if (/\n\s*\n\s*$/.test(previousChunk)) {
    return base + 450;
  }
  if (/\n\s*$/.test(previousChunk)) {
    return base + 280;
  }
  if (/[.!?]["')\]]*\s*$/.test(previousChunk)) {
    return base + 140;
  }
  if (/[,;:]["')\]]*\s*$/.test(previousChunk)) {
    return base + 70;
  }
  return base;
}

function actionKind(value: unknown): ActionKind {
  return value === "agent" || value === "library" ? value : "tool";
}

function recordedDurationMs(
  settled: Record<string, unknown>,
  running: Record<string, unknown> | undefined,
): number | undefined {
  const startedAt = timestamp(settled.started_at) ?? timestamp(running?.started_at);
  const endedAt = timestamp(settled.ended_at) ?? timestamp(running?.ended_at);
  if (startedAt === undefined || endedAt === undefined || endedAt <= startedAt) {
    return undefined;
  }
  return endedAt - startedAt;
}

function timestamp(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
