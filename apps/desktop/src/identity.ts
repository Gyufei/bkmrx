declare const entityIdBrand: unique symbol;

export type EntityId<Entity extends string> = string & {
  readonly [entityIdBrand]: Entity;
};

export type BookmarkId = EntityId<'Bookmark'>;
export type BookmarkTagId = EntityId<'BookmarkTag'>;
export type TodoId = EntityId<'Todo'>;
export type TodoTagId = EntityId<'TodoTag'>;
export type RssFeedId = EntityId<'RssFeed'>;
export type RssEntryId = EntityId<'RssEntry'>;
export type NavigationCategoryId = EntityId<'NavigationCategory'>;
export type NavigationPlacementId = EntityId<'NavigationPlacement'>;
