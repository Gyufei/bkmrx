// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { RssEntry } from '@/types';
import { rssEntryToBookmarkValues } from './rss-bookmark';

const entry: RssEntry = {
  id: 1,
  feed_id: 2,
  feed_title: 'Feed',
  title: '  Article title  ',
  link: '  https://example.com/post  ',
  author: null,
  content_html: '<p>Full body must not be used</p>',
  summary: '<p>Hello&nbsp;<strong>世界</strong></p>\n<p>Emoji 🎉</p>',
  published_at: null,
  fetched_at: 1,
  is_read: false,
};

describe('rssEntryToBookmarkValues', () => {
  it('maps the article link, title, plain-text summary, and no tags', () => {
    expect(rssEntryToBookmarkValues(entry)).toEqual({
      url: 'https://example.com/post',
      title: '  Article title  ',
      tags: [],
      description: 'Hello 世界 Emoji 🎉',
    });
  });

  it('leaves description empty instead of falling back to full content', () => {
    expect(rssEntryToBookmarkValues({ ...entry, summary: ' <br> ' }).description).toBe('');
  });

  it('does not mutate the RSS entry', () => {
    const original = structuredClone(entry);
    rssEntryToBookmarkValues(entry);
    expect(entry).toEqual(original);
  });
});
