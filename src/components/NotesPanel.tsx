import { useState, useEffect, useCallback, useMemo } from "react";
import { tagColor } from "../utils/tagColor";
import FolderTree, { type FolderNode } from "./FolderTree";
import NoteEditor from "./NoteEditor";
import type { NoteFile } from "../types";

interface Props {
  notesDir: string;
  scanDir: (dir: string) => Promise<NoteFile[]>;
  readFile: (path: string) => Promise<string>;
  saveFile: (path: string, content: string) => Promise<void>;
  createFile: (dir: string, name: string) => Promise<string>;
  notes: NoteFile[];
  loading: boolean;
  error: string | null;
}


function formatTime(unix: number): string {
  const d = new Date(unix * 1000);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return "今天";
  if (diff < 172800000) return "昨天";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function buildFolderTree(notes: NoteFile[]): FolderNode[] {
  const rootMap = new Map<string, FolderNode>();

  for (const note of notes) {
    const parts = note.relative_path.split("/");
    if (parts.length <= 1) continue;

    let currentPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      if (!rootMap.has(currentPath)) {
        const node: FolderNode = {
          path: currentPath,
          name: parts[i],
          isExpanded: false,
          children: [],
        };
        rootMap.set(currentPath, node);
        if (parentPath) {
          const parent = rootMap.get(parentPath);
          if (parent && !parent.children.find((c) => c.path === currentPath)) {
            parent.children.push(node);
          }
        }
      }
    }
  }

  for (const node of rootMap.values()) {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
  }

  return Array.from(rootMap.values()).filter((n) => !n.path.includes("/"));
}

export default function NotesPanel({
  notesDir, scanDir, readFile, saveFile, createFile, notes, loading, error,
}: Props) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileError, setNewFileError] = useState<string | null>(null);

  useEffect(() => {
    scanDir(notesDir).catch(() => {});
  }, [notesDir, scanDir]);

  const folderTree = useMemo(() => buildFolderTree(notes), [notes]);

  const filteredNotes = useMemo(() => {
    let result = notes;
    if (selectedFolder) {
      result = result.filter((n) => n.relative_path.startsWith(selectedFolder + "/"));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [notes, selectedFolder, searchQuery]);

  const handleSelectFile = useCallback(async (note: NoteFile) => {
    setSelectedFilePath(note.path);
  }, []);

  const handleCreate = useCallback(async () => {
    const name = newFileName.trim();
    if (!name) {
      setNewFileError("请输入文件名");
      return;
    }
    setNewFileError(null);
    try {
      const filePath = await createFile(notesDir, name);
      const updatedNotes = await scanDir(notesDir);
      setShowNewModal(false);
      setNewFileName("");
      const newNote = updatedNotes.find((n) => n.path === filePath);
      if (newNote) handleSelectFile(newNote);
    } catch (e) {
      setNewFileError(String(e));
    }
  }, [newFileName, notesDir, createFile, scanDir, handleSelectFile]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-border dark:border-border-dark">
        <div className="text-xs text-text-secondary dark:text-text-dark-secondary">
          共 {notes.length} 篇笔记
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-4 py-2 text-sm text-danger dark:text-danger-dark bg-danger/10">
          {error}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: folder tree */}
        <div className="w-48 shrink-0 border-r border-border dark:border-border-dark flex flex-col">
          <div className="shrink-0 px-3 pt-3 pb-2">
            <span className="text-xs font-semibold text-text-secondary dark:text-text-dark-secondary uppercase tracking-wider">
              文件夹
            </span>
          </div>
          <FolderTree
            tree={folderTree}
            selectedPath={selectedFolder}
            onSelect={(path) => {
              setSelectedFolder(path);
              setSelectedFilePath(null);
            }}
          />
        </div>

        {/* MIDDLE: file list */}
        <div className="w-56 shrink-0 border-r border-border dark:border-border-dark flex flex-col">
          <div className="shrink-0 px-3 pt-3 pb-2">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索笔记..."
                className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text-primary dark:text-text-dark-primary placeholder:text-text-secondary dark:placeholder:text-text-dark-secondary outline-none focus:border-accent dark:focus:border-accent-dark transition-colors"
              />
              <button
                onClick={() => {
                  setNewFileName("");
                  setNewFileError(null);
                  setShowNewModal(true);
                }}
                className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-text-secondary dark:text-text-dark-secondary hover:text-text-primary dark:hover:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg transition-colors"
                title="新建笔记"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14"/><path d="M12 5v14"/>
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto thin-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-text-secondary dark:text-text-dark-secondary">
                <div className="w-4 h-4 mr-2 border-2 border-accent dark:border-accent-dark border-t-transparent rounded-full animate-spin" />
                扫描中...
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-secondary dark:text-text-dark-secondary">
                无匹配笔记
              </div>
            ) : (
              <div className="space-y-0.5 px-2 pb-2">
                {filteredNotes.map((note) => (
                  <button
                    key={note.path}
                    onClick={() => handleSelectFile(note)}
                    className={`w-full text-left px-2.5 py-2 rounded-md transition-colors ${
                      selectedFilePath === note.path
                        ? "bg-accent/15 dark:bg-accent-dark/15"
                        : "hover:bg-accent-bg/50 dark:hover:bg-accent-dark-bg/50"
                    }`}
                  >
                    <div className="text-sm font-medium text-text-primary dark:text-text-dark-primary truncate">
                      {note.title}
                    </div>
                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {note.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-block px-1.5 py-0.5 text-[10px] rounded-sm leading-none"
                            style={tagColor(tag)}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-text-secondary dark:text-text-dark-secondary mt-1">
                      {formatTime(note.modified)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: note content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFilePath ? (
            <NoteEditor
              filePath={selectedFilePath}
              readFile={readFile}
              onSave={saveFile}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-text-secondary dark:text-text-dark-secondary">
              选择左侧笔记查看内容
            </div>
          )}
        </div>
      </div>

      {/* New note modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowNewModal(false)}>
          <div
            className="w-80 rounded-xl bg-surface-card dark:bg-surface-dark-card shadow-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text-primary dark:text-text-dark-primary mb-3">
              新建笔记
            </h3>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => { setNewFileName(e.target.value); setNewFileError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="输入文件名（无需 .md）"
              className="w-full h-9 px-3 text-sm rounded-input border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text-primary dark:text-text-dark-primary placeholder:text-text-secondary dark:placeholder:text-text-dark-secondary outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
              autoFocus
            />
            {newFileError && (
              <div className="mt-1.5 text-xs text-danger dark:text-danger-dark">
                {newFileError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-3 h-8 text-xs font-medium rounded-btn border border-border dark:border-border-dark text-text-primary dark:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                className="px-3 h-8 text-xs font-medium rounded-btn bg-accent text-white hover:opacity-90 transition-opacity"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
