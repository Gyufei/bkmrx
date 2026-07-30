import { describe, expect, it } from 'vitest';
import { isMarkdownTaskAtLine, toggleMarkdownTaskAtLine } from './toggle-markdown-task';

describe('toggleMarkdownTaskAtLine', () => {
  it.each([
    ['- [ ] pending', '- [x] pending'],
    ['- [x] done', '- [ ] done'],
    ['  * [X] nested', '  * [ ] nested'],
    ['3.  [ ] ordered', '3.  [x] ordered'],
  ])('toggles only the GFM marker in %s', (input, expected) => {
    expect(toggleMarkdownTaskAtLine(input, 1)).toBe(expected);
  });

  it('targets duplicate labels by one-based source line and preserves CRLF', () => {
    const content = '- [ ] same\r\n- [ ] same\r\n';
    expect(toggleMarkdownTaskAtLine(content, 2)).toBe('- [ ] same\r\n- [x] same\r\n');
  });

  it('targets one-based source lines and preserves lone-CR separators', () => {
    const content = '- [ ] first\r- [ ] second\r- [ ] third';
    expect(toggleMarkdownTaskAtLine(content, 2)).toBe('- [ ] first\r- [x] second\r- [ ] third');
  });

  it.each([0, 3, Number.NaN])('ignores invalid source line %s', (line) => {
    expect(toggleMarkdownTaskAtLine('- [ ] task', line)).toBe('- [ ] task');
  });

  it('ignores ordinary bracket text and malformed task lines', () => {
    expect(toggleMarkdownTaskAtLine('paragraph [ ] text', 1)).toBe('paragraph [ ] text');
    expect(toggleMarkdownTaskAtLine('- [maybe] task', 1)).toBe('- [maybe] task');
  });

  it.each(['- [ ]task', '- [ ]', '- [ ]   ', '- [ ]\vtask'])(
    'ignores a task marker without horizontal whitespace and non-whitespace content: %j',
    (content) => {
      expect(toggleMarkdownTaskAtLine(content, 1)).toBe(content);
    },
  );

  it.each([
    ['- [ ] task', 1, true],
    ['intro\r- [x] task', 2, true],
    ['- [ ]\n  continuation text', 1, false],
    ['> - [ ] quoted task', 1, false],
  ] as const)(
    'recognizes only a transformable same-line task in %j at source line %i',
    (content, sourceLine, expected) => {
      expect(isMarkdownTaskAtLine(content, sourceLine)).toBe(expected);
    },
  );
});
