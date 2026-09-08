import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  deleteNoteDocumentApi,
  openNoteDocumentApi,
  renameNoteDocumentApi,
  saveNoteDocumentApi,
} from './notes.api';
import { DocumentSession, type DocumentSessionIO, type NoteSaveFailure } from './document-session';

export type { NoteSaveFailure } from './document-session';

export interface NoteDocumentCommands {
  flush(): Promise<void>;
  rename(name: string): Promise<string>;
  delete(): Promise<void>;
}

export interface NoteDocumentSession extends NoteDocumentCommands {
  content: string;
  loadState: 'loading' | 'ready' | 'error';
  loadError: Error | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveError: NoteSaveFailure | null;
  dirty: boolean;
  setContent(next: string): void;
  retryRead(): Promise<void>;
  retrySave(): Promise<void>;
  dismissSaveError(): void;
}

const documentSessionIO: DocumentSessionIO = {
  open: openNoteDocumentApi,
  save: saveNoteDocumentApi,
  rename: renameNoteDocumentApi,
  delete: deleteNoteDocumentApi,
};

export function useNoteDocument(filePath: string, revision = 1): NoteDocumentSession {
  const session = useMemo(
    () => new DocumentSession({ revision, path: filePath, io: documentSessionIO }),
    [filePath, revision],
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const actions = useMemo(
    () => ({
      setContent: (content: string) => session.edit(content),
      retryRead: () => session.retryRead(),
      flush: () => session.flush(),
      retrySave: () => session.retrySave(),
      dismissSaveError: () => session.dismissSaveError(),
      rename: (name: string) => session.rename(name),
      delete: () => session.delete(),
    }),
    [session],
  );

  useEffect(() => {
    void session.open().catch(() => undefined);
    return () => session.dispose();
  }, [session]);

  return { ...snapshot, ...actions };
}
