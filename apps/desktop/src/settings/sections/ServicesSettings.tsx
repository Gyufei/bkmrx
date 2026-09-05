import { useEffect, useState } from 'react';
import { Rss } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SettingsSnapshot } from '@/lib/invoke';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import NiuTransServicePanel from '../service-panels/NiuTransServicePanel';
import RssHubServicePanel from '../service-panels/RssHubServicePanel';
import { activateProviderApi, deactivateProviderApi, SettingsQueryApiKey } from '../settings.api';
import { errorMessage } from '../settings.utils';

interface ServicesSettingsProps {
  snapshot?: SettingsSnapshot;
  onDirtyChange: (dirty: boolean) => void;
}

type ServiceId = 'rsshub' | 'niutrans';

export default function ServicesSettings({ snapshot, onDirtyChange }: ServicesSettingsProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ServiceId>('rsshub');
  const [dirty, setDirty] = useState<Record<ServiceId, boolean>>({
    rsshub: false,
    niutrans: false,
  });
  const settings = snapshot?.settings;
  const niutrans = snapshot?.providers.find((provider) => provider.descriptor.id === 'niutrans');
  const niutransIsPrimary = niutrans?.activation === 'primary';
  const activation = useMutation({
    mutationFn: (primaryProvider: string | null) => {
      if (!snapshot) throw new Error('设置尚未加载');
      return primaryProvider
        ? activateProviderApi(snapshot.revision, 'translation', primaryProvider)
        : deactivateProviderApi(snapshot.revision, 'translation');
    },
    onSuccess: (next) => {
      queryClient.setQueryData([SettingsQueryApiKey.SETTINGS], next);
    },
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
                {niutransIsPrimary
                  ? '正在使用'
                  : niutrans?.configured
                    ? '已配置，未启用'
                    : '未配置'}
              </span>
            </span>
          </button>
        </aside>
        <div className="p-5 sm:p-6">
          <div className={selected === 'rsshub' ? undefined : 'hidden'}>
            <RssHubServicePanel
              snapshot={snapshot}
              onDirtyChange={(next) => setDirty((current) => ({ ...current, rsshub: next }))}
            />
          </div>
          <div className={selected === 'niutrans' ? undefined : 'hidden'}>
            <div className="mb-5 flex items-center gap-2 border-b pb-5">
              {niutransIsPrimary ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={activation.isPending}
                  onClick={() => activation.mutate(null)}
                >
                  停用翻译
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={!niutrans?.configured || activation.isPending}
                  onClick={() => activation.mutate('niutrans')}
                >
                  启用小牛翻译
                </Button>
              )}
              {!niutrans?.configured && (
                <span className="text-xs text-muted-foreground">请先保存完整凭据</span>
              )}
              {activation.isError && (
                <span className="text-xs text-destructive">
                  切换失败：{errorMessage(activation.error)}
                </span>
              )}
            </div>
            <NiuTransServicePanel
              snapshot={snapshot}
              onDirtyChange={(next) => setDirty((current) => ({ ...current, niutrans: next }))}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
