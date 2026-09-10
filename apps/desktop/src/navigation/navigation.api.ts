import { QueryClient } from '@tanstack/react-query';
import {
  invokeCreateNavigationCategory,
  invokeDeleteNavigationCategory,
  invokeListNavigationSections,
  invokeAddNavigationBookmarks,
  invokeRemoveNavigationBookmark,
  invokeUpdateNavigationCategory,
} from '@/lib/invoke';

export const NAVIGATION_SECTIONS_KEY = ['navigation-sections'] as const;
export const listNavigationSectionsApi = invokeListNavigationSections;
export const createNavigationCategoryApi = invokeCreateNavigationCategory;
export const updateNavigationCategoryApi = invokeUpdateNavigationCategory;
export const deleteNavigationCategoryApi = invokeDeleteNavigationCategory;
export const addNavigationBookmarksApi = invokeAddNavigationBookmarks;
export const removeNavigationBookmarkApi = invokeRemoveNavigationBookmark;
export const invalidateNavigationSections = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: NAVIGATION_SECTIONS_KEY });
