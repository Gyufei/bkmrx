use futures_util::future::BoxFuture;

use crate::providers::ProviderId;

use super::{Translation, TranslationError, TranslationRequest};

pub trait TranslationProvider: Send + Sync {
    fn id(&self) -> &ProviderId;

    fn translate<'a>(
        &'a self,
        request: &'a TranslationRequest,
    ) -> BoxFuture<'a, Result<Translation, TranslationError>>;
}
