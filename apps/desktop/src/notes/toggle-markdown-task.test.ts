import { describe, expect, it } from 'vitest';
import { toggleMarkdownTaskAtLine } from './toggle-markdown-task';

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

  it.each([0, 3, Number.NaN])('ignores invalid source line %s', (line) => {
    expect(toggleMarkdownTaskAtLine('- [ ] task', line)).toBe('- [ ] task');
  });

  it('ignores ordinary bracket text and malformed task lines', () => {
    expect(toggleMarkdownTaskAtLine('paragraph [ ] text', 1)).toBe('paragraph [ ] text');
    expect(toggleMarkdownTaskAtLine('- [maybe] task', 1)).toBe('- [maybe] task');
  });
});
