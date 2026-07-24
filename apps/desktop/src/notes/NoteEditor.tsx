import { useEffect, useRef, useState } from 'react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord.css';
import { MilkdownCreapConfig } from './config';
import { useMutation } from '@tanstack/react-query';
import { readNoteContentApi, writeNoteContentApi } from './notes.api';
import { NoteSaveQueue } from './note-save-queue';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  
  // 记录当前编辑器绑定的文件路径和最新内容
  const currentPathRef = useRef(filePath);
  const latestContentRef = useRef<string>('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // 手动管理读取状态，避开 mutation 状态竞争
  const [isReading, setIsReading] = useState(true);
  const [readError, setReadError] = useState<Error | null>(null);

  const {
    mutateAsync: save,
    error: saveError,
    isSuccess: isSaveSuccess,
    isPending: isSaving,
  } = useMutation({
    mutationFn: writeNoteContentApi
  });
  const saveRef = useRef(save);
  saveRef.current = save;
  const saveQueueRef = useRef<NoteSaveQueue>();
  if (!saveQueueRef.current) {
    saveQueueRef.current = new NoteSaveQueue((path, content) =>
      saveRef.current({ path, content }),
    );
  }

  const enqueueSave = (path: string, content: string) =>
    saveQueueRef.current!.enqueue(path, content);

  // 1. 核心保存逻辑：显式绑定保存时的 targetPath 与 targetContent
  const flushSave = (targetPath: string, content: string) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    if (!content) return;

    void enqueueSave(targetPath, content).catch(() => undefined);
  };

  // 2. Cmd+S / Ctrl+S 快捷键保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        flushSave(currentPathRef.current, latestContentRef.current);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // 3. 编辑器初始化与切换监听
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isCancelled = false;
    let createdCrepeInstance: Crepe | null = null;

    // 当 filePath 变化时，更新 Ref 指向
    currentPathRef.current = filePath;
    latestContentRef.current = '';

    async function initLoad() {
      setIsReading(true);
      setReadError(null);

      try {
        // 直接调用 API 获取数据，不经过 mutation，保证当前 closure 的准确性
        const rawContent = await readNoteContentApi(filePath);
        if (isCancelled) return;

        const markdown = stripFrontmatter(rawContent || '');
        latestContentRef.current = markdown;

        // 如果容器里有上一次残存的节点，先清空
        if (container) {
          container.innerHTML = '';
        }

        const crepe = new Crepe({
          root: container,
          defaultValue: markdown,
          ...MilkdownCreapConfig,
        });

        // 绑定内容监听
        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, md) => {
            latestContentRef.current = md;

            // 闭包隔离：保存触发时，锁定当时传进来的 filePath！
            const targetPath = filePath; 

            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
              void enqueueSave(targetPath, md).catch(() => undefined);
            }, 400);
          });
        });

        // 异步创建 Milkdown 实例
        await crepe.create();

        if (isCancelled) {
          // 如果在 create 过程中用户已经切换了文件，创建完立刻销毁
          crepe.destroy();
          return;
        }

        createdCrepeInstance = crepe;
        crepeRef.current = crepe;
        setIsReading(false);
      } catch (err: any) {
        if (!isCancelled) {
          setReadError(err);
          setIsReading(false);
        }
      }
    }

    initLoad();

    // 💥 关键点：卸载/切换文件时的清理与安全保存逻辑
    return () => {
      isCancelled = true;

      // A. 如果上一个文件有还没到期的防抖保存，立刻强制冲刷保存落盘！
      const pendingContent = latestContentRef.current;
      const pathToSave = filePath; // 锁定旧文件路径
      
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
        
        if (pendingContent) {
          // 异步写入旧文件
          enqueueSave(pathToSave, pendingContent).catch((e) =>
            console.error('切换文件时自动保存旧文件失败:', e)
          );
        }
      }

      // B. 安全销毁 Crepe 实例，防止 DOM 重叠
      if (createdCrepeInstance) {
        createdCrepeInstance.destroy();
      } else if (crepeRef.current) {
        crepeRef.current.destroy();
      }
      crepeRef.current = null;
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
      ) : null}
      
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
