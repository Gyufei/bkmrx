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

interface Props {
  settings?: AppSettings;
  onDirtyChange: (dirty: boolean) => void;
}

export default function RssHubServicePanel({ settings, onDirtyChange }: Props) {
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [showAccessKey, setShowAccessKey] = useState(false);
  const mutation = useMutation({
    mutationFn: (nextSettings: AppSettings) => updateSettingsApi(nextSettings),
    onSuccess: async () => {
      setEditing(false);
      setShowAccessKey(false);
      onDirtyChange(false);
      await queryClient.invalidateQueries({ queryKey: [SettingsQueryApiKey.SETTINGS] });
    },
  });

  useEffect(() => {
    if (editing) return;
    setBaseUrl(settings?.services.rsshub.base_url ?? '');
    setAccessKey(settings?.services.rsshub.access_key ?? '');
  }, [editing, settings]);

  const updateDirty = (nextUrl: string, nextKey: string) =>
    onDirtyChange(
      nextUrl !== (settings?.services.rsshub.base_url ?? '') ||
        nextKey !== (settings?.services.rsshub.access_key ?? ''),
    );

  const cancel = () => {
    mutation.reset();
    setBaseUrl(settings?.services.rsshub.base_url ?? '');
    setAccessKey(settings?.services.rsshub.access_key ?? '');
    setShowAccessKey(false);
    setEditing(false);
    onDirtyChange(false);
  };

  const save = () => {
    if (!settings || mutation.isPending) return;
    mutation.mutate({
      ...settings,
      services: {
        ...settings.services,
        rsshub: {
          base_url: baseUrl.trim().replace(/\/+$/, '') || null,
          access_key: accessKey.trim() || null,
        },
      },
    });
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">RSSHub</h2>
          <p className="mt-1 text-sm text-muted-foreground">配置自托管服务地址和访问凭据。</p>
        </div>
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            aria-label="编辑 RSSHub 服务"
            disabled={!settings}
            onClick={() => {
              mutation.reset();
              setEditing(true);
            }}
          >
            编辑
          </Button>
        )}
      </div>
      {editing ? (
        <form
          className="flex max-w-md flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
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
              disabled={mutation.isPending}
            />
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
                disabled={mutation.isPending}
                className="pr-10"
              />
              <div className="absolute inset-y-0 right-1 flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showAccessKey ? '隐藏 Access Key' : '显示 Access Key'}
                  onClick={() => setShowAccessKey((visible) => !visible)}
                  disabled={mutation.isPending}
                >
                  {showAccessKey ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={!settings || mutation.isPending}>
              {mutation.isPending && <Spinner data-icon="inline-start" />}
              {mutation.isPending ? '保存中...' : '保存 RSSHub 设置'}
            </Button>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={cancel}>
              取消
            </Button>
          </div>
          {mutation.isError && (
            <Alert variant="destructive" className="py-1.5 text-xs">
              <AlertDescription>保存失败：{errorMessage(mutation.error)}</AlertDescription>
            </Alert>
          )}
        </form>
      ) : (
        <div className="flex max-w-md flex-col gap-4">
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
    </div>
  );
}
