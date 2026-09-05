import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { AppSettings, SettingsSnapshot } from '@/lib/invoke';
import { SettingsQueryApiKey, updateSettingsApi } from '../settings.api';
import { errorMessage } from '../settings.utils';

interface Props {
  snapshot?: SettingsSnapshot;
  onDirtyChange: (dirty: boolean) => void;
}

export default function NiuTransServicePanel({ snapshot, onDirtyChange }: Props) {
  const queryClient = useQueryClient();
  const settings = snapshot?.settings;
  const [appId, setAppId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const mutation = useMutation({
    mutationFn: (nextSettings: AppSettings) => {
      if (!snapshot) throw new Error('设置尚未加载');
      return updateSettingsApi(snapshot.revision, nextSettings);
    },
    onSuccess: (next) => {
      queryClient.setQueryData([SettingsQueryApiKey.SETTINGS], next);
      setEditing(false);
      setShowApiKey(false);
      onDirtyChange(false);
    },
  });

  useEffect(() => {
    if (editing) return;
    setAppId(settings?.providers.niutrans.app_id ?? '');
    setApiKey(settings?.providers.niutrans.api_key ?? '');
  }, [editing, settings]);

  const updateDirty = (nextId: string, nextKey: string) =>
    onDirtyChange(
      nextId !== (settings?.providers.niutrans.app_id ?? '') ||
        nextKey !== (settings?.providers.niutrans.api_key ?? ''),
    );
  const cancel = () => {
    mutation.reset();
    setAppId(settings?.providers.niutrans.app_id ?? '');
    setApiKey(settings?.providers.niutrans.api_key ?? '');
    setShowApiKey(false);
    setEditing(false);
    onDirtyChange(false);
  };
  const save = () => {
    if (!settings || mutation.isPending) return;
    mutation.mutate({
      ...settings,
      providers: {
        ...settings.providers,
        niutrans: { app_id: appId.trim() || null, api_key: apiKey.trim() || null },
      },
    });
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">小牛翻译</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            保存 App ID 和 API Key 后，可将该服务设为当前翻译供应商。
          </p>
        </div>
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            aria-label="编辑小牛翻译服务"
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
            <FieldLabel htmlFor="niutrans-app-id">App ID</FieldLabel>
            <Input
              id="niutrans-app-id"
              value={appId}
              onChange={(event) => {
                setAppId(event.target.value);
                updateDirty(event.target.value, apiKey);
              }}
              autoComplete="off"
              disabled={mutation.isPending}
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
                disabled={mutation.isPending}
                placeholder="输入小牛翻译 API Key"
                className="pr-10"
              />
              <div className="absolute inset-y-0 right-1 flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                  onClick={() => setShowApiKey((visible) => !visible)}
                  disabled={mutation.isPending}
                >
                  {showApiKey ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={!settings || mutation.isPending}>
              {mutation.isPending && <Spinner data-icon="inline-start" />}
              {mutation.isPending ? '保存中...' : '保存服务设置'}
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
            <p className="text-xs text-muted-foreground">App ID</p>
            <p className="mt-1 break-all text-sm">{appId || '未设置'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">API Key</p>
            <p className="mt-1 text-sm">{apiKey ? '**********' : '未设置'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
