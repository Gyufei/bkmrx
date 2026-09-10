use serde::{Deserialize, Serialize};

use crate::identity::{BookmarkId, NavigationCategoryId, NavigationPlacementId};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NavigationBookmark {
    pub placement_id: NavigationPlacementId,
    pub id: BookmarkId,
    pub title: String,
    pub url: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NavigationCategory {
    pub id: NavigationCategoryId,
    pub name: String,
    pub order: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub bookmarks: Vec<NavigationBookmark>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CreateNavigationCategory {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateNavigationCategory {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AddNavigationBookmarks {
    pub bookmark_ids: Vec<BookmarkId>,
}
