import { open, save } from '@tauri-apps/plugin-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { useState } from 'react';

import { BkQueryApiKey } from '@/bookmarks/bookmarks.api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPathForDisplay, joinDirectoryAndFilename } from '@/lib/path';
import type { ImportPreview } from '@/types';

import {
  applyBookmarkImportApi,
  exportBookmarksApi,
  previewBookmarkImportApi,
} from './settings.api';

interface BookmarkTransferCardProps {
  backupDirectory: string;
}

export default function BookmarkTransferCard({ backupDirectory }: BookmarkTransferCardProps) {
  const queryClient = useQueryClient();
  const [importCandidate, setImportCandidate] = useState<{
    path: string;
    preview: ImportPreview;
  } | null>(null);
  const exportMutation = useMutation({ mutationFn: (path: string) => exportBookmarksApi(path) });
  const previewMutation = useMutation({
    mutationFn: (path: string) => previewBookmarkImportApi(path),
    onSuccess: (preview, path) => setImportCandidate({ path, preview }),
  });
  const applyMutation = useMutation({
    mutationFn: (input: { path: string; fileHash: string }) => applyBookmarkImportApi(input),
    onSuccess: () => {
      setImportCandidate(null);
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.BOOKMARKS] });
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
    },
  });

  async function chooseExportPath() {
    const selected = await save({
      defaultPath: exportDefaultPath(backupDirectory),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (selected) exportMutation.mutate(selected);
  }

  async function chooseImportPath() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (typeof selected === 'string') {
      applyMutation.reset();
      setImportCandidate(null);
      previewMutation.mutate(selected);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>书签导入与导出</CardTitle>
        </CardHeader>
        <CardFooter className="gap-2">
          <Button variant="outline" onClick={chooseExportPath} disabled={exportMutation.isPending}>
            {exportMutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ArrowUpFromLine data-icon="inline-start" />
            )}
            {exportMutation.isPending ? '导出中...' : '导出 JSON'}
          </Button>
          <Button
            variant="outline"
            onClick={chooseImportPath}
            disabled={previewMutation.isPending || applyMutation.isPending}
          >
            {previewMutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ArrowDownToLine data-icon="inline-start" />
            )}
            {previewMutation.isPending ? '预检中...' : '导入 JSON'}
          </Button>
        </CardFooter>
        <CardContent className="flex flex-col gap-2">
          {exportMutation.data && (
            <p className="break-all text-xs text-muted-foreground">
              已导出：{formatPathForDisplay(exportMutation.data)}
            </p>
          )}
          {applyMutation.isSuccess && (
            <p className="text-xs text-muted-foreground">导入完成，书签与标签已刷新。</p>
          )}
          {[exportMutation.error, previewMutation.error].filter(Boolean).map((error, index) => (
            <Alert key={index} variant="destructive" className="py-1.5 text-xs">
              <AlertDescription>{errorMessage(error)}</AlertDescription>
            </Alert>
          ))}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(importCandidate)}
        onOpenChange={(open) => !open && !applyMutation.isPending && setImportCandidate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认导入书签？</AlertDialogTitle>
            <AlertDialogDescription>
              {importCandidate && (
                <>
                  预检通过，共 {importCandidate.preview.total} 条；新增{' '}
                  {importCandidate.preview.create_count}，更新{' '}
                  {importCandidate.preview.update_count}，跳过 {importCandidate.preview.skip_count}
                  。
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              render={<Button variant="outline" />}
              disabled={applyMutation.isPending}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={applyMutation.isPending}
              onClick={() => {
                if (!importCandidate) return;
                applyMutation.mutate({
                  path: importCandidate.path,
                  fileHash: importCandidate.preview.file_hash,
                });
              }}
            >
              {applyMutation.isPending && <Spinner data-icon="inline-start" />}
              {applyMutation.isPending ? '导入中...' : '确认导入'}
            </AlertDialogAction>
          </AlertDialogFooter>
          {applyMutation.isError && (
            <Alert variant="destructive" className="py-1.5 text-xs">
              <AlertDescription>{errorMessage(applyMutation.error)}</AlertDescription>
            </Alert>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function exportDefaultPath(backupDirectory: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const filename = `bookmarks-${stamp}.json`;
  return joinDirectoryAndFilename(backupDirectory, filename);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return '操作失败';
}
