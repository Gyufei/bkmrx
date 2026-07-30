const TASK_MARKER = /^(\s*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\])/;

export function toggleMarkdownTaskAtLine(content: string, sourceLine: number): string {
  if (!Number.isInteger(sourceLine) || sourceLine < 1) return content;

  const lines = content.split(/(\r?\n)/);
  const textIndex = (sourceLine - 1) * 2;
  const line = lines[textIndex];
  if (line === undefined || !TASK_MARKER.test(line)) return content;

  lines[textIndex] = line.replace(
    TASK_MARKER,
    (_, before: string, state: string, after: string) =>
      `${before}${state === ' ' ? 'x' : ' '}${after}`,
  );
  return lines.join('');
}
