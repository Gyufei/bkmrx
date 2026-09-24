import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

import AboutSettings from './sections/AboutSettings';
import GeneralSettings from './sections/GeneralSettings';
import ServicesSettings from './sections/ServicesSettings';
import { getSettingsApi, SettingsQueryApiKey } from './settings.api';
import SettingsTabs, { type SettingsTab } from './SettingsTabs';

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [dirtyTabs, setDirtyTabs] = useState<Partial<Record<SettingsTab, boolean>>>({});
  const settings = useQuery({
    queryKey: [SettingsQueryApiKey.SETTINGS],
    queryFn: getSettingsApi,
  });
  const snapshot = settings.data;

  const setTabDirty = useCallback((tab: SettingsTab, dirty: boolean) => {
    setDirtyTabs((current) => ({ ...current, [tab]: dirty }));
  }, []);

  const setGeneralDirty = useCallback(
    (dirty: boolean) => setTabDirty('general', dirty),
    [setTabDirty],
  );
  const setServicesDirty = useCallback(
    (dirty: boolean) => setTabDirty('services', dirty),
    [setTabDirty],
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as SettingsTab)}
      className="min-h-0 flex-1 gap-0 overflow-hidden"
    >
      <SettingsTabs dirtyTabs={dirtyTabs} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        {settings.isLoading ? (
          <div
            role="status"
            className="flex min-h-96 items-center justify-center gap-2 text-muted-foreground"
          >
            <Spinner />
            <span>正在加载设置…</span>
          </div>
        ) : settings.isError ? (
          <div className="flex min-h-96 items-center justify-center p-6">
            <Alert variant="destructive" className="max-w-md text-center">
              <AlertTitle>设置加载失败</AlertTitle>
            </Alert>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-6 py-8">
            <TabsContent value="general" keepMounted className="data-inactive:hidden">
              <GeneralSettings snapshot={snapshot} onDirtyChange={setGeneralDirty} />
            </TabsContent>
            <TabsContent value="services" keepMounted className="data-inactive:hidden">
              <ServicesSettings snapshot={snapshot} onDirtyChange={setServicesDirty} />
            </TabsContent>
            <TabsContent value="about" keepMounted className="data-inactive:hidden">
              <AboutSettings active={activeTab === 'about'} />
            </TabsContent>
          </div>
        )}
      </div>
    </Tabs>
  );
}

export default SettingsPage;
