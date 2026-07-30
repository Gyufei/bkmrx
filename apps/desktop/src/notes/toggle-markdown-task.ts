const TASK_MARKER = /^(\s*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\])(?=[ \t]+\S)/;

interface MarkdownTaskLine {
  segments: string[];
  textIndex: number;
  text: string;
}

function findMarkdownTaskLine(content: string, sourceLine: number): MarkdownTaskLine | null {
  if (!Number.isInteger(sourceLine) || sourceLine < 1) return null;

  const segments = content.split(/(\r\n|\r|\n)/);
  const textIndex = (sourceLine - 1) * 2;
  const text = segments[textIndex];
  if (text === undefined || !TASK_MARKER.test(text)) return null;

  return { segments, textIndex, text };
}

export function isMarkdownTaskAtLine(content: string, sourceLine: number): boolean {
  return findMarkdownTaskLine(content, sourceLine) !== null;
}

export function toggleMarkdownTaskAtLine(content: string, sourceLine: number): string {
  const taskLine = findMarkdownTaskLine(content, sourceLine);
  if (!taskLine) return content;

  taskLine.segments[taskLine.textIndex] = taskLine.text.replace(
    TASK_MARKER,
    (_, before: string, state: string, after: string) =>
      `${before}${state === ' ' ? 'x' : ' '}${after}`,
  );
  return taskLine.segments.join('');
}
