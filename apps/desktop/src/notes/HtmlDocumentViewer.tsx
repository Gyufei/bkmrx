import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import EmbeddedDocumentFrame from '@/embedded-documents/EmbeddedDocumentFrame';
import { openExternalNoteFileApi, openHtmlDocumentApi } from './notes.api';

interface HtmlDocumentViewerProps {
  filePath: string;
  revision: number;
}

type LoadState = { status: 'loading' } | { status: 'ready'; content: string } | { status: 'error' };

function basename(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

export default function HtmlDocumentViewer({ filePath, revision }: HtmlDocumentViewerProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let current = true;
    setLoadState({ status: 'loading' });
    openHtmlDocumentApi(revision, filePath).then(
      ({ content }) => current && setLoadState({ status: 'ready', content }),
      () => current && setLoadState({ status: 'error' }),
    );
    return () => {
      current = false;
    };
  }, [filePath, revision, reloadVersion]);

  const openWithSystem = useCallback(async () => {
    try {
      await openExternalNoteFileApi(revision, filePath);
    } catch {
      toast.add({ type: 'error', title: '无法打开文件', description: filePath });
    }
  }, [filePath, revision]);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-9 shrink-0 items-center gap-1 px-3">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {basename(filePath)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="刷新 HTML 文档"
          title="刷新 HTML 文档"
          onClick={() => setReloadVersion((version) => version + 1)}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="系统打开"
          title="系统打开"
          onClick={() => void openWithSystem()}
        >
          <ExternalLink aria-hidden="true" />
        </Button>
      </header>
      <Separator />
      <div className="min-h-0 flex-1">
        {loadState.status === 'loading' ? (
          <div
            role="status"
            className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner />
            加载文档...
          </div>
        ) : loadState.status === 'error' ? (
          <div className="flex h-full items-center justify-center p-4">
            <Alert
              variant="destructive"
              className="flex max-w-md flex-col items-center gap-3 text-center"
            >
              <AlertTitle>HTML 文档加载失败</AlertTitle>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReloadVersion((version) => version + 1)}
                >
                  重试
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={openWithSystem}>
                  系统打开
                </Button>
              </div>
            </Alert>
          </div>
        ) : (
          <EmbeddedDocumentFrame
            key={`${filePath}-${reloadVersion}`}
            title={`查看：${basename(filePath)}`}
            source={{ kind: 'trusted-html', html: loadState.content }}
            className="size-full border-0 bg-background"
            onRuntimeError={(error) => {
              toast.add({
                type: 'error',
                title:
                  error.kind === 'external-navigation-failed'
                    ? '无法打开链接'
                    : 'HTML 文档显示失败',
                description:
                  error.kind === 'external-navigation-failed' ? error.url : basename(filePath),
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
