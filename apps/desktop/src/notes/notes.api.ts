import {
  invokeScanNotes,
  invokeReadNoteFile,
  invokeWriteNoteFile,
  invokeCreateNoteFile,
  invokeDeleteNote,
  invokeDeleteNoteFolder,
  invokeRenameNote,
} from '../lib/invoke';
import type { NotesWorkspaceListing } from '../types';

export const NotesQueryApiKey = {
  NOTES: 'notes',
};

export async function scanNotesDirectoryApi(): Promise<NotesWorkspaceListing> {
  return await invokeScanNotes();
}

export async function readNoteContentApi(revision: number, relativePath: string): Promise<string> {
  return await invokeReadNoteFile(revision, relativePath);
}

export async function writeNoteContentApi({
  revision,
  relativePath,
  content,
}: {
  revision: number;
  relativePath: string;
  content: string;
}): Promise<void> {
  await invokeWriteNoteFile(revision, relativePath, content);
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
  await invokeDeleteNote(revision, relativePath);
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
  return await invokeRenameNote(revision, relativePath, name);
}
