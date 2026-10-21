// Hides an unclosed ** or ` while text streams. An unclosed fence already renders as code.
export function stabilize(text: string): string {
  const parts = text.split("```");
  // Even count: the text ends inside an open fence.
  if (parts.length % 2 === 0) return text;
  let tail = parts.pop()!;
  for (const marker of ["**", "`"]) {
    if (tail.split(marker).length % 2 === 0) {
      const at = tail.lastIndexOf(marker);
      tail = tail.slice(0, at) + tail.slice(at + marker.length);
    }
  }
  return [...parts, tail].join("```");
}
