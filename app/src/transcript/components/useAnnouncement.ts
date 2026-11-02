import { useEffect, useRef, useState } from "react";

import { strings } from "../../strings";
import type { TranscriptView } from "../types";

/**
 * What to tell a screen reader when a live turn ends. The streaming text itself isn't
 * announced: it would be read out token by token.
 */
export function useAnnouncement(view: TranscriptView): string {
  const status = view.turns.at(-1)?.status;
  const previous = useRef(status);
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });

  useEffect(() => {
    if (previous.current === "streaming" && status && status !== "streaming") {
      const text = view.pendingQuestion ? strings.turn.announce.question : strings.turn.announce[status];
      setAnnouncement((last) => ({ text, count: last.count + 1 }));
    }
    previous.current = status;
  }, [status, view.pendingQuestion]);

  // The same words twice in a row aren't re-read, so every other one ends in a non-breaking space.
  return announcement.text + (announcement.count % 2 ? " " : "");
}
