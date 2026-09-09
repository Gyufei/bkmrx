import { describe, expectTypeOf, it } from 'vitest';
import type {
  BookmarkId,
  BookmarkTagId,
  NavigationCategoryId,
  NavigationPlacementId,
  RssEntryId,
  RssFeedId,
  TodoId,
  TodoTagId,
} from './identity';

describe('entity IDs', () => {
  it('keeps identities distinct at compile time', () => {
    expectTypeOf<BookmarkId>().not.toEqualTypeOf<BookmarkTagId>();
    expectTypeOf<TodoId>().not.toEqualTypeOf<TodoTagId>();
    expectTypeOf<RssFeedId>().not.toEqualTypeOf<RssEntryId>();
    expectTypeOf<NavigationCategoryId>().not.toEqualTypeOf<NavigationPlacementId>();
  });
});
