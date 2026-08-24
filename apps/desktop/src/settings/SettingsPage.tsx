import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Tabs, TabsContent } from '@/components/ui/tabs';

import AboutSettings from './sections/AboutSettings';
import BookmarkSettings from './sections/BookmarkSettings';
import GeneralSettings from './sections/GeneralSettings';
import NoteSettings from './sections/NoteSettings';
import RssSettings from './sections/RssSettings';
import ServicesSettings from './sections/ServicesSettings';
import { getSettingsApi, SettingsQueryApiKey } from './settings.api';
import SettingsTabs, { type SettingsTab } from './SettingsTabs';

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [dirtyTabs, setDirtyTabs] = useState<Partial<Record<SettingsTab, boolean>>>({});
  const { data: settings } = useQuery({
    queryKey: [SettingsQueryApiKey.SETTINGS],
    queryFn: getSettingsApi,
  });

  function setTabDirty(tab: SettingsTab, dirty: boolean) {
    setDirtyTabs((current) => ({ ...current, [tab]: dirty }));
  }

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
            <GeneralSettings />
          </TabsContent>
          <TabsContent value="bookmark" keepMounted className="data-inactive:hidden">
            <BookmarkSettings
              settings={settings}
              onDirtyChange={(dirty) => setTabDirty('bookmark', dirty)}
            />
          </TabsContent>
          <TabsContent value="note" keepMounted className="data-inactive:hidden">
            <NoteSettings
              settings={settings}
              onDirtyChange={(dirty) => setTabDirty('note', dirty)}
            />
          </TabsContent>
          <TabsContent value="rss" keepMounted className="data-inactive:hidden">
            <RssSettings settings={settings} onDirtyChange={(dirty) => setTabDirty('rss', dirty)} />
          </TabsContent>
          <TabsContent value="services" keepMounted className="data-inactive:hidden">
            <ServicesSettings
              settings={settings}
              onDirtyChange={(dirty) => setTabDirty('services', dirty)}
            />
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
