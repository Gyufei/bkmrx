import { NoteSaveQueue } from './note-save-queue';
import { writeNoteContentApi } from './notes.api';

export const sharedNoteSaveQueue = new NoteSaveQueue((key, content) => {
  const separator = key.indexOf(':');
  return writeNoteContentApi({
    revision: Number(key.slice(0, separator)),
    relativePath: key.slice(separator + 1),
    content,
  });
});

export function noteSaveKey(revision: number, relativePath: string) {
  return `${revision}:${relativePath}`;
}
