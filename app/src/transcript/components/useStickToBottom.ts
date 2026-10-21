import { useCallback, useEffect, useRef, useState } from "react";

const NEAR_BOTTOM_PX = 40;

/**
 * Follows new content while the user is at the bottom; stops once they scroll up.
 * `follow`: a turn is streaming. `resetKey`: changes on a new turn or thread, which jumps back down.
 */
export function useStickToBottom(follow: boolean, resetKey: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [away, setAway] = useState(false);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    setAway(!atBottom.current);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (follow && atBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [follow]);

  const toBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = true;
    setAway(false);
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(toBottom, [resetKey, toBottom]);

  // The last content can land in the same frame as the turn's end: follow once more.
  useEffect(() => {
    if (!follow && atBottom.current) toBottom();
  }, [follow, toBottom]);

  return { scrollRef, contentRef, onScroll, away, toBottom };
}
