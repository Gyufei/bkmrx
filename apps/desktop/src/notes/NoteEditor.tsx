import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Pencil } from 'lucide-react';
import { useHotkeys } from '@tanstack/react-hotkeys';

import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Empty, EmptyTitle } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

import type { MarkdownEditorSnapshot } from './MarkdownSourceEditor';
import MarkdownViewer from './MarkdownViewer';
import { toggleMarkdownTaskAtLine } from './toggle-markdown-task';
import { useNoteDocument } from './use-note-document';

const MarkdownSourceEditor = lazy(() => import('./MarkdownSourceEditor'));

interface Props {
  filePath: string;
}

type Mode = 'view' | 'edit';

interface ModeState {
  filePath: string;
  value: Mode;
}

interface ViewPosition {
  filePath: string;
  scrollTop: number;
}

interface EditorPosition {
  filePath: string;
  snapshot: MarkdownEditorSnapshot | null;
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function modeShortcutLabel(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    ? '⌘E'
    : 'Ctrl E';
}

export default function NoteEditor({ filePath }: Props) {
  const session = useNoteDocument(filePath);
  const [modeState, setModeState] = useState<ModeState>({ filePath, value: 'view' });
  const modeRef = useRef<Mode>('view');
  const filePathRef = useRef(filePath);
  const loadStateRef = useRef(session.loadState);
  const dirtyRef = useRef(session.dirty);
  const flushRef = useRef(session.flush);
  const contentRef = useRef(session.content);
  const transitionPendingRef = useRef(false);
  const transitionTokenRef = useRef(0);
  const [editorReady, setEditorReady] = useState(false);
  const editorReadyRef = useRef(false);
  const [modeTransitionPending, setModeTransitionPending] = useState(false);
  const [showSavedStatus, setShowSavedStatus] = useState(false);
  const previousSaveStateRef = useRef(session.saveState);
  const [viewPosition, setViewPosition] = useState<ViewPosition>({
    filePath,
    scrollTop: 0,
  });
  const [editorPosition, setEditorPosition] = useState<EditorPosition>({
    filePath,
    snapshot: null,
  });

  const mode = modeState.filePath === filePath ? modeState.value : 'view';
  const viewScrollTop = viewPosition.filePath === filePath ? viewPosition.scrollTop : 0;
  const editorSnapshot = editorPosition.filePath === filePath ? editorPosition.snapshot : null;
  const shortcutLabel = modeShortcutLabel();
  const shortcutHint = shortcutLabel === '⌘E' ? '⌘ + E' : 'Ctrl + E';
  const modeToggleLabel = `${mode === 'view' ? '编辑' : '查看'}（${shortcutHint}）`;

  useLayoutEffect(() => {
    if (filePathRef.current !== filePath) {
      transitionTokenRef.current += 1;
      transitionPendingRef.current = false;
    }

    filePathRef.current = filePath;
    loadStateRef.current = session.loadState;
    dirtyRef.current = session.dirty;
    flushRef.current = session.flush;
    contentRef.current = session.content;
    modeRef.current = mode;
  }, [filePath, mode, session.content, session.dirty, session.flush, session.loadState]);

  useEffect(() => {
    modeRef.current = 'view';
    transitionPendingRef.current = false;
    editorReadyRef.current = false;
    setModeState({ filePath, value: 'view' });
    setEditorReady(false);
    setModeTransitionPending(false);
    setViewPosition({ filePath, scrollTop: 0 });
    setEditorPosition({ filePath, snapshot: null });
  }, [filePath]);

  useEffect(() => {
    const previousSaveState = previousSaveStateRef.current;
    previousSaveStateRef.current = session.saveState;

    if (mode !== 'edit' || session.saveState !== 'saved') {
      setShowSavedStatus(false);
      return;
    }
    if (previousSaveState === 'saved') return;

    setShowSavedStatus(true);
    const timer = window.setTimeout(() => setShowSavedStatus(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [mode, session.saveState]);

  const toggleMode = useCallback(async () => {
    if (transitionPendingRef.current) return;
    if (modeRef.current === 'edit' && !editorReadyRef.current) return;

    if (modeRef.current === 'view') {
      const activePath = filePathRef.current;
      modeRef.current = 'edit';
      editorReadyRef.current = false;
      setEditorReady(false);
      setModeState({ filePath: activePath, value: 'edit' });
      return;
    }

    if (!dirtyRef.current) {
      const activePath = filePathRef.current;
      modeRef.current = 'view';
      setModeState({ filePath: activePath, value: 'view' });
      return;
    }

    const transitionPath = filePathRef.current;
    const transitionToken = ++transitionTokenRef.current;
    transitionPendingRef.current = true;
    setModeTransitionPending(true);
    try {
      await flushRef.current();
      if (
        filePathRef.current === transitionPath &&
        transitionTokenRef.current === transitionToken
      ) {
        modeRef.current = 'view';
        setModeState({ filePath: transitionPath, value: 'view' });
      }
    } catch {
      // Keep the source editor open so the user can retry without losing content.
    } finally {
      if (
        filePathRef.current === transitionPath &&
        transitionTokenRef.current === transitionToken
      ) {
        transitionPendingRef.current = false;
        setModeTransitionPending(false);
      }
    }
  }, []);

  const canToggleMode =
    session.loadState === 'ready' && !modeTransitionPending && (mode === 'view' || editorReady);

  useHotkeys([
    {
      hotkey: 'Mod+E',
      callback: () => void toggleMode(),
      options: {
        enabled: canToggleMode,
        meta: { name: '切换笔记模式', description: '切换笔记的查看与编辑模式' },
      },
    },
    {
      hotkey: 'Mod+S',
      callback: () => void flushRef.current().catch(() => undefined),
      options: {
        enabled: mode === 'edit',
        meta: { name: '保存笔记', description: '立即保存当前笔记' },
      },
    },
  ]);

  const handleViewScroll = useCallback(
    (scrollTop: number) => setViewPosition({ filePath, scrollTop }),
    [filePath],
  );

  const handleToggleTask = useCallback(
    (sourceLine: number) => {
      const next = toggleMarkdownTaskAtLine(contentRef.current, sourceLine);
      if (next === contentRef.current) return;

      contentRef.current = next;
      session.setContent(next);
    },
    [session.setContent],
  );

  const handleEditorSnapshot = useCallback(
    (snapshot: MarkdownEditorSnapshot) => setEditorPosition({ filePath, snapshot }),
    [filePath],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-9 shrink-0 items-center gap-2 px-3">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {basename(filePath)}
        </span>
        {mode === 'edit' && session.saveState === 'saving' ? (
          <span role="status" className="text-xs text-muted-foreground">
            保存中...
          </span>
        ) : showSavedStatus ? (
          <span role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
            已保存
          </span>
        ) : null}
        {session.loadState === 'ready' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={modeToggleLabel}
            title={modeToggleLabel}
            disabled={modeTransitionPending || (mode === 'edit' && !editorReady)}
            onClick={() => void toggleMode()}
          >
            {mode === 'view' ? <Pencil aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
          </Button>
        ) : null}
      </header>
      <Separator />

      <div className="min-h-0 flex-1">
        {session.loadState === 'loading' ? (
          <div
            role="status"
            className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner />
            加载笔记...
          </div>
        ) : session.loadState === 'error' ? (
          <Empty className="h-full">
            <EmptyTitle className="text-sm text-destructive">加载失败</EmptyTitle>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => void session.retryRead()}
            >
              重试
            </Button>
          </Empty>
        ) : mode === 'view' ? (
          <MarkdownViewer
            content={session.content}
            initialScrollTop={viewScrollTop}
            onScrollTopChange={handleViewScroll}
            onToggleTask={handleToggleTask}
          />
        ) : (
          <Suspense
            fallback={
              <div
                role="status"
                className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
              >
                <Spinner />
                加载编辑器...
              </div>
            }
          >
            <MarkdownSourceEditor
              value={session.content}
              initialSnapshot={editorSnapshot}
              onChange={session.setContent}
              onSnapshot={handleEditorSnapshot}
              onReady={() => {
                editorReadyRef.current = true;
                setEditorReady(true);
              }}
            />
          </Suspense>
        )}
      </div>

      {session.saveError ? (
        <Alert
          variant="destructive"
          className="flex shrink-0 items-center gap-2 rounded-none border-x-0 border-b-0 px-3 py-1 text-xs"
        >
          <span className="min-w-0 flex-1 truncate">
            {basename(session.saveError.path)} 保存失败
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void session.retrySave().catch(() => undefined)}
          >
            重试
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={session.dismissSaveError}>
            忽略
          </Button>
        </Alert>
      ) : null}
    </div>
  );
}
