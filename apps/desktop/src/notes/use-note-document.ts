import { useCallback, useEffect, useRef, useState } from 'react';

import { sharedNoteSaveQueue } from './note-save';
import { readNoteContentApi } from './notes.api';

export interface NoteDocumentDependencies {
  read(path: string): Promise<string>;
  save(path: string, content: string): Promise<void>;
  debounceMs: number;
}

export interface NoteSaveFailure {
  path: string;
  content: string;
  error: Error;
}

export interface NoteDocumentSession {
  content: string;
  loadState: 'loading' | 'ready' | 'error';
  loadError: Error | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveError: NoteSaveFailure | null;
  dirty: boolean;
  setContent(next: string): void;
  retryRead(): Promise<void>;
  flush(): Promise<void>;
  retrySave(): Promise<void>;
  dismissSaveError(): void;
}

interface CapturedSaveFailure extends NoteSaveFailure {
  sessionId: number;
  version: number;
}

const productionDefaults: NoteDocumentDependencies = {
  read: readNoteContentApi,
  save: (path, content) => sharedNoteSaveQueue.enqueue(path, content),
  debounceMs: 400,
};

export function stripFrontmatter(content: string): string {
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) return content.slice(end + 3).trimStart();
  }
  return content;
}

export function useNoteDocument(
  filePath: string,
  dependencies?: Partial<NoteDocumentDependencies>,
): NoteDocumentSession {
  const dependencyRef = useRef<NoteDocumentDependencies>(productionDefaults);
  dependencyRef.current = { ...productionDefaults, ...dependencies };
  const currentPathRef = useRef(filePath);
  const renderedPathRef = useRef(filePath);
  renderedPathRef.current = filePath;
  const currentSessionIdRef = useRef(0);
  const contentRef = useRef('');
  const currentVersionRef = useRef(0);
  const latestSubmittedVersionRef = useRef(0);
  const latestSubmittedPromiseRef = useRef<Promise<void> | null>(null);
  const latestSavedVersionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const saveFailureRef = useRef<CapturedSaveFailure | null>(null);
  const [content, setContentState] = useState('');
  const [loadState, setLoadState] = useState<NoteDocumentSession['loadState']>('loading');
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saveState, setSaveState] = useState<NoteDocumentSession['saveState']>('idle');
  const [saveError, setSaveError] = useState<NoteSaveFailure | null>(null);
  const [dirty, setDirty] = useState(false);

  const isCurrentSnapshot = useCallback(
    (path: string, sessionId: number, version: number) =>
      currentPathRef.current === path &&
      currentSessionIdRef.current === sessionId &&
      currentVersionRef.current === version,
    [],
  );

  const submitSave = useCallback(
    (path: string, contentToSave: string, sessionId: number, version: number) => {
      const isCurrent = isCurrentSnapshot(path, sessionId, version);
      if (isCurrent) {
        latestSubmittedVersionRef.current = version;
        setSaveState('saving');
      }

      let write: Promise<void>;
      try {
        write = dependencyRef.current.save(path, contentToSave);
      } catch (error) {
        write = Promise.reject(error);
      }

      const submitted = write.then(
        () => {
          if (isCurrentSnapshot(path, sessionId, version)) {
            latestSavedVersionRef.current = version;
            setDirty(false);
            setSaveState('saved');
          }
          if (
            saveFailureRef.current?.path === path &&
            saveFailureRef.current.content === contentToSave &&
            saveFailureRef.current.sessionId === sessionId &&
            saveFailureRef.current.version === version
          ) {
            saveFailureRef.current = null;
            setSaveError(null);
          }
        },
        (reason) => {
          const failure: CapturedSaveFailure = {
            path,
            content: contentToSave,
            error: reason instanceof Error ? reason : new Error(String(reason)),
            sessionId,
            version,
          };
          saveFailureRef.current = failure;
          setSaveError({ path, content: contentToSave, error: failure.error });
          if (isCurrentSnapshot(path, sessionId, version)) {
            setSaveState('error');
          }
        },
      );
      if (isCurrent) {
        latestSubmittedPromiseRef.current = submitted;
      }
      return submitted;
    },
    [isCurrentSnapshot],
  );

  const flushCurrentSnapshot = useCallback(
    (path: string, sessionId: number) => {
      if (currentPathRef.current !== path || currentSessionIdRef.current !== sessionId) {
        return Promise.resolve();
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }

      const version = currentVersionRef.current;
      if (version > latestSubmittedVersionRef.current) {
        return submitSave(path, contentRef.current, sessionId, version);
      }
      return latestSubmittedPromiseRef.current ?? Promise.resolve();
    },
    [submitSave],
  );

  const readCurrent = useCallback(async () => {
    const path = currentPathRef.current;
    const sessionId = ++currentSessionIdRef.current;
    setLoadState('loading');
    setLoadError(null);

    try {
      const rawContent = await dependencyRef.current.read(path);
      if (currentPathRef.current !== path || currentSessionIdRef.current !== sessionId) return;

      const next = stripFrontmatter(rawContent);
      contentRef.current = next;
      currentVersionRef.current = 0;
      latestSubmittedVersionRef.current = 0;
      latestSubmittedPromiseRef.current = null;
      latestSavedVersionRef.current = 0;
      setContentState(next);
      setDirty(false);
      setLoadState('ready');
    } catch (error) {
      if (currentPathRef.current !== path || currentSessionIdRef.current !== sessionId) return;
      setLoadError(error instanceof Error ? error : new Error(String(error)));
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    currentPathRef.current = filePath;
    contentRef.current = '';
    currentVersionRef.current = 0;
    latestSubmittedVersionRef.current = 0;
    latestSubmittedPromiseRef.current = null;
    latestSavedVersionRef.current = 0;
    setContentState('');
    setDirty(false);
    setSaveState('idle');
    void readCurrent();
    const sessionId = currentSessionIdRef.current;

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }
      if (renderedPathRef.current !== filePath) {
        void flushCurrentSnapshot(filePath, sessionId);
      }
    };
  }, [filePath, flushCurrentSnapshot, readCurrent]);

  const setContent = useCallback(
    (next: string) => {
      contentRef.current = next;
      currentVersionRef.current += 1;
      setContentState(next);
      setDirty(currentVersionRef.current !== latestSavedVersionRef.current);
      setSaveState('idle');

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const path = currentPathRef.current;
      const sessionId = currentSessionIdRef.current;
      const version = currentVersionRef.current;
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = undefined;
        void submitSave(path, next, sessionId, version);
      }, dependencyRef.current.debounceMs);
    },
    [submitSave],
  );

  const flush = useCallback(async () => {
    await flushCurrentSnapshot(currentPathRef.current, currentSessionIdRef.current);
  }, [flushCurrentSnapshot]);

  const retrySave = useCallback(async () => {
    const failure = saveFailureRef.current;
    if (!failure) return;

    await submitSave(failure.path, failure.content, failure.sessionId, failure.version);
  }, [submitSave]);

  const dismissSaveError = useCallback(() => {
    setSaveError(null);
  }, []);

  return {
    content,
    loadState,
    loadError,
    saveState,
    saveError,
    dirty,
    setContent,
    retryRead: readCurrent,
    flush,
    retrySave,
    dismissSaveError,
  };
}
