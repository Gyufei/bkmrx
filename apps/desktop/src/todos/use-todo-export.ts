import { useMutation, useQuery } from '@tanstack/react-query';
import { save } from '@tauri-apps/plugin-dialog';
import { toast } from '@/components/ui/toast';
import {
  formatPathForDisplay,
  joinDirectoryAndFilename,
  sanitizeFilenameSegment,
} from '@/lib/path';
import type { TodoTag } from '@/types';
import { exportTodosApi } from './todos.api';
import { getSettingsApi, SettingsQueryApiKey } from '@/settings/settings.api';

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useTodoExport(reportError: (error: unknown) => void) {
  const settings = useQuery({
    queryKey: [SettingsQueryApiKey.SETTINGS],
    queryFn: getSettingsApi,
  });
  const mutation = useMutation({
    mutationFn: ({ path, tagId }: { path: string; tagId: number }) => exportTodosApi(path, tagId),
    onError: reportError,
  });

  const exportTag = async (tag: TodoTag) => {
    if (mutation.isPending) return;
    const filename = `${todayDate()}-待办-${sanitizeFilenameSegment(tag.name)}.md`;
    const defaultPath = joinDirectoryAndFilename(
      settings.data?.settings.common.paths.todo_export_dir,
      filename,
    );
    const selected = await save({
      defaultPath,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (!selected) return;
    try {
      const saved = await mutation.mutateAsync({ path: selected, tagId: tag.id });
      toast.add({ type: 'success', title: '导出成功', description: formatPathForDisplay(saved) });
    } catch {
      // The mutation reports export failures through the shared error toast.
    }
  };

  return { exportTag };
}
