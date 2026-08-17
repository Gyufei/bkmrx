import { useCallback, useEffect, useRef, useState } from 'react';

import { sharedNoteSaveQueue } from './note-save';
import { readNoteContentApi } from './notes.api';

export interface NoteDocumentDependencies {
  read(path: string): Promise<string>;
  save(path: string, content: string): Promise<void>;
  pending(path: string): Promise<void>;
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
  generation: number;
}

interface PathSaveWatermark {
  latestSubmittedGeneration: number;
  latestSubmittedPromise: Promise<void> | null;
  unsettledSubmissions: number;
  pendingReads: number;
}

const productionDefaults: NoteDocumentDependencies = {
  read: readNoteContentApi,
  save: (path, content) => sharedNoteSaveQueue.enqueue(path, content),
  pending: (path) => sharedNoteSaveQueue.pending(path),
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
  const currentSessionIdRef = useRef(0);
  const contentRef = useRef('');
  const currentSessionEditedRef = useRef(false);
  const currentVersionRef = useRef(0);
  const latestSubmittedVersionRef = useRef(0);
  const latestSubmittedPromiseRef = useRef<Promise<void> | null>(null);
  const latestSavedVersionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(false);
  const saveFailureRef = useRef<CapturedSaveFailure | null>(null);
  const retryPromiseRef = useRef<{
    failure: CapturedSaveFailure;
    promise: Promise<void>;
  } | null>(null);
  const pathSaveWatermarksRef = useRef(new Map<string, PathSaveWatermark>());
  const [content, setContentState] = useState('');
  const [loadState, setLoadState] = useState<NoteDocumentSession['loadState']>('loading');
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saveState, setSaveState] = useState<NoteDocumentSession['saveState']>('idle');
  const [saveError, setSaveError] = useState<NoteSaveFailure | null>(null);
  const [dirty, setDirty] = useState(false);

  const getPathSaveWatermark = useCallback((path: string) => {
    const current = pathSaveWatermarksRef.current.get(path);
    if (current) return current;

    const created: PathSaveWatermark = {
      latestSubmittedGeneration: 0,
      latestSubmittedPromise: null,
      unsettledSubmissions: 0,
      pendingReads: 0,
    };
    pathSaveWatermarksRef.current.set(path, created);
    return created;
  }, []);

  const releasePathSaveWatermark = useCallback((path: string, watermark: PathSaveWatermark) => {
    if (
      watermark.unsettledSubmissions === 0 &&
      watermark.pendingReads === 0 &&
      saveFailureRef.current?.path !== path &&
      retryPromiseRef.current?.failure.path !== path &&
      pathSaveWatermarksRef.current.get(path) === watermark
    ) {
      pathSaveWatermarksRef.current.delete(path);
    }
  }, []);

  const isCurrentSnapshot = useCallback(
    (path: string, sessionId: number, version: number) =>
      currentPathRef.current === path &&
      currentSessionIdRef.current === sessionId &&
      currentVersionRef.current === version,
    [],
  );

  const isCurrentSession = useCallback(
    (path: string, sessionId: number) =>
      currentPathRef.current === path && currentSessionIdRef.current === sessionId,
    [],
  );

  const submitSave = useCallback(
    (path: string, contentToSave: string, sessionId: number, version: number) => {
      const isCurrent = isCurrentSnapshot(path, sessionId, version);
      const watermark = getPathSaveWatermark(path);
      const generation = watermark.latestSubmittedGeneration + 1;
      watermark.latestSubmittedGeneration = generation;
      watermark.unsettledSubmissions += 1;
      if (isCurrent) {
        latestSubmittedVersionRef.current = version;
        if (mountedRef.current) setSaveState('saving');
      }

      let write: Promise<void>;
      try {
        write = dependencyRef.current.save(path, contentToSave);
      } catch (error) {
        write = Promise.reject(error);
      }

      const submitted = write.then(
        () => {
          if (isCurrentSession(path, sessionId)) {
            latestSavedVersionRef.current = Math.max(latestSavedVersionRef.current, version);
          }
          if (mountedRef.current && isCurrentSnapshot(path, sessionId, version)) {
            setDirty(false);
            setSaveState('saved');
          }
          if (
            saveFailureRef.current?.path === path &&
            saveFailureRef.current.generation <= generation
          ) {
            saveFailureRef.current = null;
            if (mountedRef.current) setSaveError(null);
          }
        },
        (reason) => {
          const failure: CapturedSaveFailure = {
            path,
            content: contentToSave,
            error: reason instanceof Error ? reason : new Error(String(reason)),
            sessionId,
            version,
            generation,
          };
          if (!mountedRef.current) {
            console.error('Note save failed after unmount', {
              path,
              version,
              error: failure.error,
            });
            throw failure.error;
          }
          const isSuperseded = watermark.latestSubmittedGeneration > generation;
          if (!isSuperseded) {
            const replacedFailure = saveFailureRef.current;
            saveFailureRef.current = failure;
            setSaveError({ path, content: contentToSave, error: failure.error });
            if (isCurrentSnapshot(path, sessionId, version)) {
              setSaveState('error');
            }
            if (replacedFailure && replacedFailure.path !== path) {
              const replacedWatermark = pathSaveWatermarksRef.current.get(replacedFailure.path);
              if (replacedWatermark) {
                releasePathSaveWatermark(replacedFailure.path, replacedWatermark);
              }
            }
          }
          throw failure.error;
        },
      );
      watermark.latestSubmittedPromise = submitted;
      if (isCurrent) {
        latestSubmittedPromiseRef.current = submitted;
      }
      const settleSubmission = () => {
        watermark.unsettledSubmissions -= 1;
        releasePathSaveWatermark(path, watermark);
      };
      void submitted.then(settleSubmission, settleSubmission);
      return submitted;
    },
    [getPathSaveWatermark, isCurrentSession, isCurrentSnapshot, releasePathSaveWatermark],
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
    const watermark = getPathSaveWatermark(path);
    watermark.pendingReads += 1;
    currentSessionEditedRef.current = false;
    setLoadState('loading');
    setLoadError(null);

    try {
      await dependencyRef.current.pending(path);
      if (
        !mountedRef.current ||
        currentPathRef.current !== path ||
        currentSessionIdRef.current !== sessionId
      ) {
        return;
      }

      const rawContent = await dependencyRef.current.read(path);
      if (
        !mountedRef.current ||
        currentPathRef.current !== path ||
        currentSessionIdRef.current !== sessionId
      ) {
        return;
      }

      const next = stripFrontmatter(rawContent);
      contentRef.current = next;
      currentSessionEditedRef.current = false;
      currentVersionRef.current = 0;
      latestSubmittedVersionRef.current = 0;
      latestSubmittedPromiseRef.current = null;
      latestSavedVersionRef.current = 0;
      setContentState(next);
      setDirty(false);
      setLoadState('ready');
    } catch (error) {
      if (
        !mountedRef.current ||
        currentPathRef.current !== path ||
        currentSessionIdRef.current !== sessionId
      ) {
        return;
      }
      setLoadError(error instanceof Error ? error : new Error(String(error)));
      setLoadState('error');
    } finally {
      watermark.pendingReads -= 1;
      releasePathSaveWatermark(path, watermark);
    }
  }, [getPathSaveWatermark, releasePathSaveWatermark]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
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

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }
      void flushCurrentSnapshot(filePath, currentSessionIdRef.current).catch(() => undefined);
    };
  }, [filePath, flushCurrentSnapshot, readCurrent]);

  const setContent = useCallback(
    (next: string) => {
      contentRef.current = next;
      currentSessionEditedRef.current = true;
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
        void submitSave(path, next, sessionId, version).catch(() => undefined);
      }, dependencyRef.current.debounceMs);
    },
    [submitSave],
  );

  const flush = useCallback(async () => {
    const path = currentPathRef.current;
    const sessionId = currentSessionIdRef.current;

    while (isCurrentSession(path, sessionId)) {
      const version = currentVersionRef.current;
      await flushCurrentSnapshot(path, sessionId);
      if (!isCurrentSession(path, sessionId) || currentVersionRef.current === version) return;
    }
  }, [flushCurrentSnapshot, isCurrentSession]);

  const retrySave = useCallback(() => {
    const failure = saveFailureRef.current;
    if (!failure) return Promise.resolve();

    const activeRetry = retryPromiseRef.current;
    if (
      activeRetry &&
      activeRetry.failure.path === failure.path &&
      activeRetry.failure.content === failure.content &&
      activeRetry.failure.sessionId === failure.sessionId &&
      activeRetry.failure.version === failure.version &&
      activeRetry.failure.generation === failure.generation
    ) {
      return activeRetry.promise;
    }

    const watermark = pathSaveWatermarksRef.current.get(failure.path);
    const retry =
      watermark && failure.generation < watermark.latestSubmittedGeneration
        ? (watermark.latestSubmittedPromise ?? Promise.resolve())
        : currentPathRef.current === failure.path &&
            (currentSessionIdRef.current === failure.sessionId || currentSessionEditedRef.current)
          ? submitSave(
              failure.path,
              contentRef.current,
              currentSessionIdRef.current,
              currentVersionRef.current,
            )
          : submitSave(failure.path, failure.content, failure.sessionId, failure.version);
    retryPromiseRef.current = { failure, promise: retry };
    const settleRetry = () => {
      if (retryPromiseRef.current?.promise !== retry) return;

      retryPromiseRef.current = null;
      const currentWatermark = pathSaveWatermarksRef.current.get(failure.path);
      if (currentWatermark) releasePathSaveWatermark(failure.path, currentWatermark);
    };
    void retry.then(settleRetry, settleRetry);
    return retry;
  }, [releasePathSaveWatermark, submitSave]);

  const dismissSaveError = useCallback(() => {
    const failure = saveFailureRef.current;
    if (failure && isCurrentSnapshot(failure.path, failure.sessionId, failure.version)) {
      latestSubmittedVersionRef.current = Math.min(
        latestSubmittedVersionRef.current,
        failure.version - 1,
      );
      latestSubmittedPromiseRef.current = null;
      setSaveState('idle');
    }
    saveFailureRef.current = null;
    setSaveError(null);
    if (failure) {
      const watermark = pathSaveWatermarksRef.current.get(failure.path);
      if (watermark) releasePathSaveWatermark(failure.path, watermark);
    }
  }, [isCurrentSnapshot, releasePathSaveWatermark]);

  const isCurrentDocument = currentPathRef.current === filePath;

  return {
    content: isCurrentDocument ? content : '',
    loadState: isCurrentDocument ? loadState : 'loading',
    loadError: isCurrentDocument ? loadError : null,
    saveState: isCurrentDocument ? saveState : 'idle',
    saveError,
    dirty: isCurrentDocument ? dirty : false,
    setContent,
    retryRead: readCurrent,
    flush,
    retrySave,
    dismissSaveError,
  };
}
