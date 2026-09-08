import type { OpenedNoteDocument, RenamedNoteDocument, SavedNoteDocument } from '../types';

export interface DocumentSessionIO {
  open(revision: number, path: string): Promise<OpenedNoteDocument>;
  save(receipt: string, content: string): Promise<SavedNoteDocument>;
  rename(receipt: string, name: string, pendingContent?: string): Promise<RenamedNoteDocument>;
  delete(receipt: string): Promise<void>;
}

export interface NoteSaveFailure {
  path: string;
  content: string;
  error: Error;
}

export interface DocumentSessionSnapshot {
  content: string;
  loadState: 'loading' | 'ready' | 'error';
  loadError: Error | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveError: NoteSaveFailure | null;
  dirty: boolean;
}

interface DocumentSessionOptions {
  revision: number;
  path: string;
  io: DocumentSessionIO;
  debounceMs?: number;
}

const INITIAL_SNAPSHOT: DocumentSessionSnapshot = {
  content: '',
  loadState: 'loading',
  loadError: null,
  saveState: 'idle',
  saveError: null,
  dirty: false,
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

interface MarkdownDocument {
  preservedPrefix: string;
  body: string;
}

function splitMarkdownDocument(content: string): MarkdownDocument {
  const openingOffset = content.startsWith('\uFEFF') ? 1 : 0;
  const openingEnd = content.indexOf('\n', openingOffset);
  if (openingEnd < 0 || content.slice(openingOffset, openingEnd).replace(/\r$/, '') !== '---') {
    return { preservedPrefix: '', body: content };
  }

  let cursor = openingEnd + 1;
  while (cursor <= content.length) {
    const nextLineBreak = content.indexOf('\n', cursor);
    const lineEnd = nextLineBreak < 0 ? content.length : nextLineBreak;
    const line = content.slice(cursor, lineEnd).replace(/\r$/, '');
    if (line === '---') {
      let prefixEnd = nextLineBreak < 0 ? content.length : nextLineBreak + 1;
      while (prefixEnd < content.length) {
        const blankLineBreak = content.indexOf('\n', prefixEnd);
        if (blankLineBreak < 0 || !/^[\t ]*\r?$/.test(content.slice(prefixEnd, blankLineBreak)))
          break;
        prefixEnd = blankLineBreak + 1;
      }
      return {
        preservedPrefix: content.slice(0, prefixEnd),
        body: content.slice(prefixEnd),
      };
    }
    if (nextLineBreak < 0) break;
    cursor = nextLineBreak + 1;
  }

  return { preservedPrefix: '', body: content };
}

export class DocumentSession {
  private readonly revision: number;
  private readonly path: string;
  private readonly io: DocumentSessionIO;
  private readonly debounceMs: number;
  private readonly listeners = new Set<() => void>();
  private snapshot = INITIAL_SNAPSHOT;
  private receipt: string | null = null;
  private preservedPrefix = '';
  private currentRevision = 0;
  private savedRevision = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveLoopPromise: Promise<void> | null = null;
  private openPromise: Promise<void> | null = null;
  private retired = false;

  constructor({ revision, path, io, debounceMs = 400 }: DocumentSessionOptions) {
    this.revision = revision;
    this.path = path;
    this.io = io;
    this.debounceMs = debounceMs;
  }

  getSnapshot = (): DocumentSessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  open(): Promise<void> {
    if (this.openPromise) return this.openPromise;
    this.publish({ loadState: 'loading', loadError: null });
    this.openPromise = this.io.open(this.revision, this.path).then(
      (opened) => {
        const document = splitMarkdownDocument(opened.content);
        this.receipt = opened.receipt;
        this.preservedPrefix = document.preservedPrefix;
        this.currentRevision = 0;
        this.savedRevision = 0;
        this.publish({
          content: document.body,
          loadState: 'ready',
          loadError: null,
          dirty: false,
        });
      },
      (error) => {
        this.openPromise = null;
        const loadError = asError(error);
        this.publish({ loadState: 'error', loadError });
        throw loadError;
      },
    );
    return this.openPromise;
  }

  edit(content: string): void {
    if (this.retired) return;
    this.currentRevision += 1;
    this.publish({
      content,
      dirty: true,
      saveState: this.saveLoopPromise ? 'saving' : 'idle',
    });
    this.scheduleAutosave();
  }

  async flush(): Promise<void> {
    this.clearSaveTimer();
    if (this.retired || !this.snapshot.dirty) {
      await (this.saveLoopPromise ?? Promise.resolve());
      return;
    }
    await this.ensureSaveLoop();
  }

  retryRead(): Promise<void> {
    this.openPromise = null;
    return this.open();
  }

  retrySave(): Promise<void> {
    if (!this.snapshot.saveError) return this.saveLoopPromise ?? Promise.resolve();
    this.publish({ saveError: null, saveState: 'idle' });
    return this.flush();
  }

  dismissSaveError(): void {
    if (!this.snapshot.saveError) return;
    this.publish({ saveError: null, saveState: 'idle' });
  }

  async rename(name: string): Promise<string> {
    this.clearSaveTimer();
    await this.waitForSaveLoop();
    const receipt = this.requireReceipt();
    try {
      const renamed = await this.io.rename(
        receipt,
        name,
        this.snapshot.dirty ? this.serialize(this.snapshot.content) : undefined,
      );
      this.receipt = renamed.receipt;
      this.retired = true;
      return renamed.relative_path;
    } catch (error) {
      this.scheduleAutosave();
      throw error;
    }
  }

  async delete(): Promise<void> {
    this.clearSaveTimer();
    await this.waitForSaveLoop();
    try {
      await this.io.delete(this.requireReceipt());
      this.retired = true;
    } catch (error) {
      this.scheduleAutosave();
      throw error;
    }
  }

  dispose(): void {
    this.clearSaveTimer();
    if (this.retired || !this.snapshot.dirty) return;
    void this.flush().catch((error) => {
      console.error('Note save failed after unmount', {
        path: this.path,
        error: asError(error),
      });
    });
  }

  private publish(next: Partial<DocumentSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }

  private scheduleAutosave(): void {
    if (this.retired || !this.snapshot.dirty) return;
    this.clearSaveTimer();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.ensureSaveLoop().catch(() => undefined);
    }, this.debounceMs);
  }

  private clearSaveTimer(): void {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private ensureSaveLoop(): Promise<void> {
    if (this.saveLoopPromise) return this.saveLoopPromise;
    const loop = this.runSaveLoop();
    this.saveLoopPromise = loop;
    void loop.then(
      () => {
        if (this.saveLoopPromise === loop) this.saveLoopPromise = null;
      },
      () => {
        if (this.saveLoopPromise === loop) this.saveLoopPromise = null;
      },
    );
    return loop;
  }

  private async runSaveLoop(): Promise<void> {
    while (!this.retired && this.savedRevision < this.currentRevision) {
      const revision = this.currentRevision;
      const content = this.snapshot.content;
      this.publish({ saveState: 'saving' });
      try {
        const saved = await this.io.save(this.requireReceipt(), this.serialize(content));
        this.receipt = saved.receipt;
        this.savedRevision = revision;
        const dirty = this.savedRevision < this.currentRevision;
        this.publish({
          dirty,
          saveError: null,
          saveState: dirty ? 'saving' : 'saved',
        });
      } catch (error) {
        const saveError = { path: this.path, content, error: asError(error) };
        this.publish({ dirty: true, saveError, saveState: 'error' });
        throw saveError.error;
      }
    }
  }

  private async waitForSaveLoop(): Promise<void> {
    await this.saveLoopPromise?.catch(() => undefined);
  }

  private requireReceipt(): string {
    if (!this.receipt) throw new Error('Note document has not been opened');
    return this.receipt;
  }

  private serialize(body: string): string {
    return `${this.preservedPrefix}${body}`;
  }
}
