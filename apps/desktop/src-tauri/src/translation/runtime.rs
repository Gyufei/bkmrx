use std::sync::Arc;

use arc_swap::ArcSwapOption;

use crate::providers::ProviderId;

use super::TranslationProvider;

#[derive(Clone)]
pub struct ActiveTranslationProvider {
    pub id: ProviderId,
    pub provider: Arc<dyn TranslationProvider>,
}

pub struct TranslationRoute {
    pub primary: ActiveTranslationProvider,
    pub fallbacks: Vec<ActiveTranslationProvider>,
}

#[derive(Default)]
pub struct TranslationRuntime {
    route: ArcSwapOption<TranslationRoute>,
}

impl TranslationRuntime {
    pub fn current(&self) -> Option<Arc<TranslationRoute>> {
        self.route.load_full()
    }

    pub fn publish(&self, route: TranslationRoute) {
        self.route.store(Some(Arc::new(route)));
    }

    pub fn disable(&self) {
        self.route.store(None);
    }
}
