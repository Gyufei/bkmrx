import { useEffect, useRef } from 'react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord.css';
import { MilkdownCreapConfig } from './config';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NotesQueryApiKey, readNoteContentApi, writeNoteContentApi } from './notes.api';

interface Props {
  filePath: string;
}

function stripFrontmatter(content: string): string {
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) return content.slice(end + 3).trimStart();
  }
  return content;
}

export default function NoteEditor({ filePath }: Props) {
  const queryClient = useQueryClient();

  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const filePathRef = useRef(filePath);
  const latestContentRef = useRef<string>('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  filePathRef.current = filePath;

  const { mutate: save, error: saveError, isSuccess: isSaveSuccess, isPending: isSaving } = useMutation({
    mutationFn: writeNoteContentApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NotesQueryApiKey.NOTES] });
    },
  })

  const { data: readContent, mutate: read, error: readError, isPending: isReading } = useMutation({
    mutationFn: readNoteContentApi,
    onSuccess: () => {
    },
  })


  // Cmd+S / Ctrl+S — flush pending content immediately
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const content = latestContentRef.current;
        if (!content) return;

        save({
          path: filePathRef.current,
          content,
        })
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [save]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    async function initLoad() {
      cancelled = false;
      await read(filePathRef.current);
      // Load file content first, then create Crepe editor
      if (cancelled) return;

      const markdown = stripFrontmatter(readContent || '');

      const crepe = new Crepe({
        root: container,
        defaultValue: markdown,
        ...MilkdownCreapConfig,
      });

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, md) => {
          latestContentRef.current = md;
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            save({
              path: filePathRef.current,
              content: md,
            });
          }, 400);
        });
      });

      if (!cancelled) {
        crepe.create().then(() => {
          if (!cancelled) {
            crepeRef.current = crepe;
          }
        });
      }
    }

    initLoad();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const c = crepeRef.current;
      if (c) {
        c.destroy();
        crepeRef.current = null;
      }
    };
  }, [filePath]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#1a1a2e] relative">
      {isReading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white dark:bg-[#1a1a2e] text-sm text-muted-foreground">
          <div className="w-4 h-4 mr-2 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          加载编辑器...
        </div>
        ) : readError ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white dark:bg-[#1a1a2e] text-sm text-destructive">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
            加载失败
          </div>
        ) : null
      }
      <div ref={containerRef} className="flex-1 overflow-y-auto thin-scrollbar" />
      <div className="shrink-0 h-6 flex items-center justify-end gap-2 px-6 text-[11px] text-muted-foreground border-t border-border/50">
        {saveError ? (
          <span className="text-destructive flex items-center gap-1" title={saveError.message}>
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
            保存失败: {saveError.message}
          </span>
        ) : isSaving ? (
          <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-600 dark:bg-yellow-400" />
            保存中...
          </span>
        ) : isSaveSuccess ? (
          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600 dark:bg-green-400" />
            已保存
          </span>
        ) : null}
      </div>
    </div>
  );
}
