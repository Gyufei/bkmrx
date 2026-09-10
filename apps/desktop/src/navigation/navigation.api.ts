import { QueryClient } from '@tanstack/react-query';
import {
  invokeCreateNavigationCategory,
  invokeDeleteNavigationCategory,
  invokeListNavigationCategories,
  invokeAddNavigationBookmarks,
  invokeRemoveNavigationBookmark,
  invokeUpdateNavigationCategory,
} from '@/lib/invoke';

export const NAVIGATION_CATEGORIES_KEY = ['navigation-categories'] as const;
export const listNavigationCategoriesApi = invokeListNavigationCategories;
export const createNavigationCategoryApi = invokeCreateNavigationCategory;
export const updateNavigationCategoryApi = invokeUpdateNavigationCategory;
export const deleteNavigationCategoryApi = invokeDeleteNavigationCategory;
export const addNavigationBookmarksApi = invokeAddNavigationBookmarks;
export const removeNavigationBookmarkApi = invokeRemoveNavigationBookmark;
export const invalidateNavigationCategories = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: NAVIGATION_CATEGORIES_KEY });
