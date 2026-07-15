import type { NoteFile } from "../types";
import type { FolderNode } from "../components/FolderTree";

export function buildFolderTree(notes: NoteFile[]): FolderNode[] {
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
