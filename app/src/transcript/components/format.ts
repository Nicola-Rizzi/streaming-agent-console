import { strings } from "../../strings";

const { format } = strings;

export function formatBytes(size: number): string {
  if (size < 1024) return format.bytes(size);
  if (size < 1024 * 1024) return format.kilobytes((size / 1024).toFixed(1));
  return format.megabytes((size / 1024 / 1024).toFixed(1));
}

export function formatDuration(startedAt?: string, endedAt?: string): string | null {
  if (!startedAt || !endedAt) return null;
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms < 60_000 ? format.seconds((ms / 1000).toFixed(1)) : format.minutes(Math.round(ms / 60_000));
}
