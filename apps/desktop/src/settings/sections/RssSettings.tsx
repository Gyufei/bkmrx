import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { AppSettings } from '@/lib/invoke';

import { SettingsQueryApiKey, updateSettingsApi } from '../settings.api';
import { errorMessage } from '../settings.utils';

interface RssSettingsProps {
  settings?: AppSettings;
  onDirtyChange: (dirty: boolean) => void;
}

export default function RssSettings({ settings, onDirtyChange }: RssSettingsProps) {
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [showAccessKey, setShowAccessKey] = useState(false);
  const updateMutation = useMutation({
    mutationFn: updateSettingsApi,
    onSuccess: async () => {
      setEditing(false);
      setShowAccessKey(false);
      onDirtyChange(false);
      await queryClient.invalidateQueries({ queryKey: [SettingsQueryApiKey.SETTINGS] });
    },
  });

  useEffect(() => {
    if (editing) return;
    setBaseUrl(settings?.rss.rsshub_base_url ?? '');
    setAccessKey(settings?.rss.rsshub_access_key ?? '');
  }, [editing, settings]);

  function updateDirty(nextBaseUrl: string, nextAccessKey: string) {
    onDirtyChange(
      nextBaseUrl !== (settings?.rss.rsshub_base_url ?? '') ||
        nextAccessKey !== (settings?.rss.rsshub_access_key ?? ''),
    );
  }

  function cancelEdit() {
    updateMutation.reset();
    setBaseUrl(settings?.rss.rsshub_base_url ?? '');
    setAccessKey(settings?.rss.rsshub_access_key ?? '');
    setShowAccessKey(false);
    setEditing(false);
    onDirtyChange(false);
  }

  function saveRssSettings() {
    if (!settings || updateMutation.isPending) return;
    updateMutation.mutate({
      ...settings,
      rss: {
        ...settings.rss,
        rsshub_base_url: baseUrl.trim().replace(/\/+$/, '') || null,
        rsshub_access_key: accessKey.trim() || null,
      },
    });
  }

  return (
    <section aria-labelledby="rss-settings-title" className="flex flex-col gap-6">
      <div>
        <h1 id="rss-settings-title" className="text-xl font-semibold">
          RSS
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">配置 RSSHub 服务和访问凭据。</p>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>RSSHub</CardTitle>
          {!editing && (
            <Button
              size="sm"
              variant="outline"
              aria-label="编辑 RSS 设置"
              disabled={!settings}
              onClick={() => {
                updateMutation.reset();
                setEditing(true);
              }}
            >
              编辑
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveRssSettings();
              }}
            >
              <Field>
                <FieldLabel htmlFor="rsshub-base-url">RSSHub 服务地址</FieldLabel>
                <Input
                  id="rsshub-base-url"
                  type="url"
                  value={baseUrl}
                  onChange={(event) => {
                    setBaseUrl(event.target.value);
                    updateDirty(event.target.value, accessKey);
                  }}
                  placeholder="https://rss.example.com"
                  disabled={updateMutation.isPending}
                />
                <p className="text-xs text-muted-foreground">
                  配置后，rsshub.app 的订阅会自动通过该服务请求；留空则直接访问原地址。
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="rsshub-access-key">Access Key（可选）</FieldLabel>
                <div className="relative">
                  <Input
                    id="rsshub-access-key"
                    type={showAccessKey ? 'text' : 'password'}
                    value={accessKey}
                    onChange={(event) => {
                      setAccessKey(event.target.value);
                      updateDirty(baseUrl, event.target.value);
                    }}
                    autoComplete="off"
                    disabled={updateMutation.isPending}
                    className="pr-10"
                  />
                  <div className="absolute inset-y-0 right-1 flex items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={showAccessKey ? '隐藏 Access Key' : '显示 Access Key'}
                      onClick={() => setShowAccessKey((visible) => !visible)}
                      disabled={updateMutation.isPending}
                    >
                      {showAccessKey ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </div>
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={!settings || updateMutation.isPending}>
                  {updateMutation.isPending && <Spinner data-icon="inline-start" />}
                  {updateMutation.isPending ? '保存中...' : '保存 RSS 设置'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={updateMutation.isPending}
                  onClick={cancelEdit}
                >
                  取消
                </Button>
              </div>
              {updateMutation.isError && (
                <Alert variant="destructive" className="py-1.5 text-xs">
                  <AlertDescription>
                    保存失败：{errorMessage(updateMutation.error)}
                  </AlertDescription>
                </Alert>
              )}
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs text-muted-foreground">RSSHub 服务地址</p>
                <p className="mt-1 break-all text-sm">{baseUrl || '未设置（直接访问原地址）'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Access Key</p>
                <p className="mt-1 text-sm">{accessKey ? '**********' : '未设置'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
