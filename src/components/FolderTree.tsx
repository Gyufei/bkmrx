import { useState, useCallback } from "react";

export interface FolderNode {
  path: string;
  name: string;
  isExpanded: boolean;
  children: FolderNode[];
}

interface Props {
  tree: FolderNode[];
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
}

function FolderTreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  onToggle,
}: {
  node: FolderNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  onToggle: (path: string) => void;
}) {
  const isSelected = selectedPath === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          onSelect(node.path);
          if (hasChildren) onToggle(node.path);
        }}
        className={`w-full flex items-center gap-1 px-2 py-1 text-sm rounded-md transition-colors text-left ${
          isSelected
            ? "bg-accent/15 text-accent dark:bg-accent-dark/15 dark:text-accent-dark"
            : "text-text-secondary dark:text-text-dark-secondary hover:bg-accent-bg/50 dark:hover:bg-accent-dark-bg/50 hover:text-text-primary dark:hover:text-text-dark-primary"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 transition-transform ${node.isExpanded ? "rotate-90" : ""}`}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={node.isExpanded ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 opacity-60"
        >
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && node.isExpanded && (
        <div>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderTree({ tree, selectedPath, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Expand first level by default
    const init = new Set<string>();
    for (const folder of tree) {
      init.add(folder.path);
    }
    return init;
  });

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const treeWithExpanded = tree.map((node) => ({
    ...node,
    isExpanded: expanded.has(node.path),
    children: setExpandedRecursive(node.children, expanded),
  }));

  return (
    <div className="flex-1 overflow-y-auto thin-scrollbar py-1">
      {treeWithExpanded.length === 0 ? (
        <div className="px-3 py-4 text-xs text-text-secondary dark:text-text-dark-secondary">
          无文件夹
        </div>
      ) : (
        treeWithExpanded.map((node) => (
          <FolderTreeItem
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={(p) => onSelect(p)}
            onToggle={handleToggle}
          />
        ))
      )}
    </div>
  );
}

function setExpandedRecursive(
  nodes: FolderNode[],
  expanded: Set<string>,
): FolderNode[] {
  return nodes.map((node) => ({
    ...node,
    isExpanded: expanded.has(node.path),
    children: setExpandedRecursive(node.children, expanded),
  }));
}
