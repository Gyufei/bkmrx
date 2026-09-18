import { describe, expect, it } from 'vitest';

import { colorStyleForText } from './text-color';

describe('colorStyleForText', () => {
  it('returns a stable color pair for the same text', () => {
    expect(colorStyleForText('产品评审')).toEqual(colorStyleForText('产品评审'));
    expect(colorStyleForText('产品评审')).not.toEqual(colorStyleForText('团队会议'));
  });
});
