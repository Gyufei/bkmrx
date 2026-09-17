use std::{
    path::PathBuf,
    time::{Duration, SystemTime},
};

use crate::{error::AppResult, fsutil::write_atomically};

pub(super) struct CachedYear {
    pub bytes: Vec<u8>,
    pub is_fresh: bool,
}

pub(super) struct RawYearCache {
    directory: PathBuf,
    freshness: Duration,
}

impl RawYearCache {
    pub fn new(directory: PathBuf, freshness: Duration) -> Self {
        Self {
            directory,
            freshness,
        }
    }

    pub fn read(&self, year: i32) -> Option<CachedYear> {
        let path = self.path(year);
        let bytes = std::fs::read(&path).ok()?;
        let is_fresh = std::fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| SystemTime::now().duration_since(modified).ok())
            .is_some_and(|age| age <= self.freshness);
        Some(CachedYear { bytes, is_fresh })
    }

    pub fn write(&self, year: i32, bytes: &[u8]) -> AppResult<()> {
        write_atomically(&self.path(year), bytes)
    }

    fn path(&self, year: i32) -> PathBuf {
        self.directory.join(format!("{year}.json"))
    }
}
