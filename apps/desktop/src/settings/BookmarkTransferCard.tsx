import { open, save } from '@tauri-apps/plugin-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

import { BkQueryApiKey } from '@/bookmarks/bookmarks.api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatPathForDisplay, joinDirectoryAndFilename } from '@/lib/path';
import { NAVIGATION_SECTIONS_KEY } from '@/navigation/navigation.api';
import {
  bookmarkInitializationStatusApi,
  exportBookmarksApi,
  initializeBookmarksApi,
} from './settings.api';

interface BookmarkTransferCardProps {
  backupDirectory: string;
}

const INITIALIZATION_STATUS_KEY = ['bookmark-initialization-status'] as const;

export default function BookmarkTransferCard({ backupDirectory }: BookmarkTransferCardProps) {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: INITIALIZATION_STATUS_KEY,
    queryFn: bookmarkInitializationStatusApi,
  });
  const exportMutation = useMutation({ mutationFn: exportBookmarksApi });
  const initializeMutation = useMutation({
    mutationFn: initializeBookmarksApi,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.BOOKMARKS] });
      void queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
      void queryClient.invalidateQueries({ queryKey: NAVIGATION_SECTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: INITIALIZATION_STATUS_KEY });
    },
  });

  async function chooseExportPath() {
    const selected = await save({
      defaultPath: exportDefaultPath(backupDirectory),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (selected) exportMutation.mutate(selected);
  }

  async function chooseInitializationPath() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (typeof selected === 'string') initializeMutation.mutate(selected);
  }

  const initializationDisabled =
    status.isLoading ||
    status.isError ||
    !status.data?.can_initialize ||
    initializeMutation.isPending;
  return (
    <Card>
      <CardHeader>
        <CardTitle>书签数据集</CardTitle>
      </CardHeader>
      <CardFooter className="gap-2">
        <Button variant="outline" onClick={chooseExportPath} disabled={exportMutation.isPending}>
          {exportMutation.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <ArrowUpFromLine data-icon="inline-start" />
          )}
          {exportMutation.isPending ? '导出中...' : '导出数据集'}
        </Button>
        <Button
          variant="outline"
          onClick={chooseInitializationPath}
          disabled={initializationDisabled}
        >
          {initializeMutation.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <ArrowDownToLine data-icon="inline-start" />
          )}
          {initializeMutation.isPending ? '初始化中...' : '初始化书签'}
        </Button>
      </CardFooter>
      <CardContent className="flex flex-col gap-2">
        {status.data && !status.data.can_initialize && (
          <p className="text-xs text-muted-foreground">仅当书签和导航分类都为空时才能初始化。</p>
        )}
        {exportMutation.data && (
          <p className="break-all text-xs text-muted-foreground">
            已导出：{formatPathForDisplay(exportMutation.data)}
          </p>
        )}
        {initializeMutation.data && (
          <p className="text-xs text-muted-foreground">
            初始化完成：恢复 {initializeMutation.data.bookmark_count} 条书签、
            {initializeMutation.data.navigation_category_count} 个导航分类。
          </p>
        )}
        {[status.error, exportMutation.error, initializeMutation.error]
          .filter(Boolean)
          .map((error, index) => (
            <Alert key={index} variant="destructive" className="py-1.5 text-xs">
              <AlertDescription>{errorMessage(error)}</AlertDescription>
            </Alert>
          ))}
      </CardContent>
    </Card>
  );
}

function exportDefaultPath(backupDirectory: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  return joinDirectoryAndFilename(backupDirectory, `bookmarks-${stamp}.json`);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return '操作失败';
}
