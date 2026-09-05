import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Tabs, TabsContent } from '@/components/ui/tabs';

import AboutSettings from './sections/AboutSettings';
import GeneralSettings from './sections/GeneralSettings';
import ServicesSettings from './sections/ServicesSettings';
import { getSettingsApi, SettingsQueryApiKey } from './settings.api';
import SettingsTabs, { type SettingsTab } from './SettingsTabs';

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [dirtyTabs, setDirtyTabs] = useState<Partial<Record<SettingsTab, boolean>>>({});
  const { data: snapshot } = useQuery({
    queryKey: [SettingsQueryApiKey.SETTINGS],
    queryFn: getSettingsApi,
  });

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
      <div className="min-h-0 flex-1 overflow-y-auto">
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
      </div>
    </Tabs>
  );
}

export default SettingsPage;
