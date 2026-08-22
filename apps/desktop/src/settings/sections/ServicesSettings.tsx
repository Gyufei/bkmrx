import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { AppSettings } from '@/lib/invoke';

import { SettingsQueryApiKey, updateSettingsApi } from '../settings.api';
import { errorMessage } from '../settings.utils';

interface ServicesSettingsProps {
  settings?: AppSettings;
  onDirtyChange: (dirty: boolean) => void;
}

export default function ServicesSettings({ settings, onDirtyChange }: ServicesSettingsProps) {
  const queryClient = useQueryClient();
  const [appId, setAppId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const updateMutation = useMutation({
    mutationFn: updateSettingsApi,
    onSuccess: async () => {
      setShowApiKey(false);
      onDirtyChange(false);
      await queryClient.invalidateQueries({ queryKey: [SettingsQueryApiKey.SETTINGS] });
    },
  });

  useEffect(() => {
    setAppId(settings?.services.niutrans.app_id ?? '');
    setApiKey(settings?.services.niutrans.api_key ?? '');
  }, [settings]);

  function updateDirty(nextAppId: string, nextApiKey: string) {
    onDirtyChange(
      nextAppId !== (settings?.services.niutrans.app_id ?? '') ||
        nextApiKey !== (settings?.services.niutrans.api_key ?? ''),
    );
  }

  function resetForm() {
    updateMutation.reset();
    setAppId(settings?.services.niutrans.app_id ?? '');
    setApiKey(settings?.services.niutrans.api_key ?? '');
    setShowApiKey(false);
    onDirtyChange(false);
  }

  function saveService() {
    if (!settings || updateMutation.isPending) return;
    updateMutation.mutate({
      ...settings,
      services: {
        ...settings.services,
        niutrans: {
          app_id: appId.trim() || null,
          api_key: apiKey.trim() || null,
        },
      },
    });
  }

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
          <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">翻译服务</p>
          <button
            type="button"
            aria-current="page"
            className="flex w-full items-center gap-3 rounded-lg bg-accent px-3 py-2.5 text-left text-sm font-medium"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              牛
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">小牛翻译</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {appId && apiKey ? '已配置' : '未配置'}
              </span>
            </span>
          </button>
        </aside>
        <div className="p-5 sm:p-6">
          <div className="mb-6">
            <h2 className="font-semibold">小牛翻译</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              配置 App ID 和 API Key 后，网页描述翻译会立即使用该服务。
            </p>
          </div>
          <form
            className="flex max-w-md flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              saveService();
            }}
          >
            <Field>
              <FieldLabel htmlFor="niutrans-app-id">App ID</FieldLabel>
              <Input
                id="niutrans-app-id"
                value={appId}
                onChange={(event) => {
                  setAppId(event.target.value);
                  updateDirty(event.target.value, apiKey);
                }}
                autoComplete="off"
                disabled={!settings || updateMutation.isPending}
                placeholder="输入小牛翻译 App ID"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="niutrans-api-key">API Key</FieldLabel>
              <div className="relative">
                <Input
                  id="niutrans-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    updateDirty(appId, event.target.value);
                  }}
                  autoComplete="off"
                  disabled={!settings || updateMutation.isPending}
                  placeholder="输入小牛翻译 API Key"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                  onClick={() => setShowApiKey((visible) => !visible)}
                  disabled={!settings || updateMutation.isPending}
                >
                  {showApiKey ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                凭据保存在本机应用数据目录的设置文件中。
              </p>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={!settings || updateMutation.isPending}>
                {updateMutation.isPending && <Spinner data-icon="inline-start" />}
                {updateMutation.isPending ? '保存中...' : '保存服务设置'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!settings || updateMutation.isPending}
                onClick={resetForm}
              >
                重置
              </Button>
            </div>
            {updateMutation.isError && (
              <Alert variant="destructive" className="py-1.5 text-xs">
                <AlertDescription>保存失败：{errorMessage(updateMutation.error)}</AlertDescription>
              </Alert>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
