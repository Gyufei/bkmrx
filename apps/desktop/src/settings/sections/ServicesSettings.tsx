import { useEffect, useState } from 'react';
import { Rss } from 'lucide-react';
import type { AppSettings } from '@/lib/invoke';
import { cn } from '@/lib/utils';
import NiuTransServicePanel from '../service-panels/NiuTransServicePanel';
import RssHubServicePanel from '../service-panels/RssHubServicePanel';

interface ServicesSettingsProps {
  settings?: AppSettings;
  onDirtyChange: (dirty: boolean) => void;
}

type ServiceId = 'rsshub' | 'niutrans';

export default function ServicesSettings({ settings, onDirtyChange }: ServicesSettingsProps) {
  const [selected, setSelected] = useState<ServiceId>('rsshub');
  const [dirty, setDirty] = useState<Record<ServiceId, boolean>>({
    rsshub: false,
    niutrans: false,
  });

  useEffect(() => {
    onDirtyChange(dirty.rsshub || dirty.niutrans);
  }, [dirty, onDirtyChange]);

  const itemClass = (id: ServiceId) =>
    cn(
      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium',
      selected === id ? 'bg-accent' : 'hover:bg-accent/60',
    );

  return (
    <section aria-labelledby="services-settings-title" className="flex flex-col gap-6">
      <div>
        <h1 id="services-settings-title" className="text-xl font-semibold">
          服务
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">管理第三方服务及其访问凭据。</p>
      </div>
      <div className="grid min-h-96 overflow-hidden rounded-xl border bg-card sm:grid-cols-[13rem_1fr]">
        <aside className="border-b bg-muted/30 p-3 sm:border-r sm:border-b-0">
          <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">内容服务</p>
          <button
            type="button"
            aria-label="选择 RSSHub 服务"
            className={itemClass('rsshub')}
            onClick={() => setSelected('rsshub')}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-orange-500 text-white">
              <Rss className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">RSSHub</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {settings?.services.rsshub.base_url ? '已配置' : '未配置'}
              </span>
            </span>
          </button>
          <p className="px-2 pt-5 pb-2 text-xs font-medium text-muted-foreground">翻译服务</p>
          <button
            type="button"
            aria-label="选择小牛翻译服务"
            className={itemClass('niutrans')}
            onClick={() => setSelected('niutrans')}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              牛
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">小牛翻译</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {settings?.services.niutrans.app_id && settings.services.niutrans.api_key
                  ? '已配置'
                  : '未配置'}
              </span>
            </span>
          </button>
        </aside>
        <div className="p-5 sm:p-6">
          <div className={selected === 'rsshub' ? undefined : 'hidden'}>
            <RssHubServicePanel
              settings={settings}
              onDirtyChange={(next) => setDirty((current) => ({ ...current, rsshub: next }))}
            />
          </div>
          <div className={selected === 'niutrans' ? undefined : 'hidden'}>
            <NiuTransServicePanel
              settings={settings}
              onDirtyChange={(next) => setDirty((current) => ({ ...current, niutrans: next }))}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
