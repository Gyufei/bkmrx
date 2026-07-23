import { invokeScanNotes, invokeReadNoteFile, invokeWriteNoteFile, invokeCreateNoteFile, invokeDeleteNote, invokeRenameNote } from '../lib/invoke';
import type { NoteFile } from '../types';

export const NotesQueryApiKey = {
  NOTES: 'notes',
};

export async function scanNotesDirectoryApi(dir: string): Promise<NoteFile[]> {
  return await invokeScanNotes(dir);
}

export async function readNoteContentApi(path: string): Promise<string> {
  return await invokeReadNoteFile(path);
}

export async function writeNoteContentApi({ path, content }: { path: string; content: string }): Promise<void> {
  await invokeWriteNoteFile(path, content);
}

export async function createNoteApi({ dir, name }: { dir: string; name: string }): Promise<string> {
  return await invokeCreateNoteFile(dir, name);
}

export async function deleteNoteFileApi(path: string): Promise<void> {
  await invokeDeleteNote(path);
}

export async function renameNoteFileApi({ oldPath, newPath }: { oldPath: string; newPath: string }): Promise<void> {
  await invokeRenameNote(oldPath, newPath);
}
