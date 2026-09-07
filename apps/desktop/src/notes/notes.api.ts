import {
  invokeScanNotes,
  invokeOpenNoteDocument,
  invokeSaveNoteDocument,
  invokeRenameNoteDocument,
  invokeDeleteNoteDocument,
  invokeCreateNoteFile,
  invokeDeleteNoteFolder,
} from '../lib/invoke';
import type {
  NotesWorkspaceListing,
  OpenedNoteDocument,
  RenamedNoteDocument,
  SavedNoteDocument,
} from '../types';

export const NotesQueryApiKey = {
  NOTES: 'notes',
};

export async function scanNotesDirectoryApi(): Promise<NotesWorkspaceListing> {
  return await invokeScanNotes();
}

export async function openNoteDocumentApi(
  revision: number,
  relativePath: string,
): Promise<OpenedNoteDocument> {
  return await invokeOpenNoteDocument(revision, relativePath);
}

export async function saveNoteDocumentApi(
  receipt: string,
  content: string,
): Promise<SavedNoteDocument> {
  return await invokeSaveNoteDocument(receipt, content);
}

export async function renameNoteDocumentApi(
  receipt: string,
  name: string,
  pendingContent?: string,
): Promise<RenamedNoteDocument> {
  return await invokeRenameNoteDocument(receipt, name, pendingContent);
}

export async function deleteNoteDocumentApi(receipt: string): Promise<void> {
  await invokeDeleteNoteDocument(receipt);
}

export async function createNoteApi({
  revision,
  directory,
  name,
}: {
  revision: number;
  directory: string;
  name: string;
}): Promise<string> {
  return await invokeCreateNoteFile(revision, directory, name);
}

export async function deleteNoteFileApi(revision: number, relativePath: string): Promise<void> {
  const opened = await openNoteDocumentApi(revision, relativePath);
  await deleteNoteDocumentApi(opened.receipt);
}

export async function deleteNoteFolderApi(revision: number, relativePath: string): Promise<void> {
  await invokeDeleteNoteFolder(revision, relativePath);
}

export async function renameNoteFileApi({
  revision,
  relativePath,
  name,
}: {
  revision: number;
  relativePath: string;
  name: string;
}): Promise<string> {
  const opened = await openNoteDocumentApi(revision, relativePath);
  return (await renameNoteDocumentApi(opened.receipt, name)).relative_path;
}
