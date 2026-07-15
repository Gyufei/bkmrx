import { useEffect, useState, useCallback } from "react";
import { Filter, Copy } from "lucide-react";
import { Button } from "./ui/button";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "./ui/context-menu";
import { tagColor } from "../utils/tagColor";
import type { Tag } from "../types";
interface Props {
  fetchTags: () => Promise<Tag[]>;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}
export default function TagPanel({ fetchTags, selectedTags, onTagsChange }: Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    fetchTags().then((result) => {
      setTags(result.sort((a, b) => b.count - a.count));
      setLoading(false);
    });
  }, [fetchTags]);
  const toggleTag = useCallback((name: string) => {
    onTagsChange(
      selectedTags.includes(name)
        ? selectedTags.filter((t) => t !== name)
        : [...selectedTags, name]
    );
  }, [selectedTags, onTagsChange]);
  const clearAll = useCallback(() => {
    onTagsChange([]);
  }, [onTagsChange]);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm font-semibold text-text-primary dark:text-text-dark-primary">标签筛选</span>
        {tags.length > 0 && (
          <div className="flex gap-1 text-xs justify-end">
            <Button variant="ghost" className="p-0 h-auto text-xs text-text-secondary dark:text-text-dark-secondary" onClick={clearAll}>清除</Button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto pr-1 thin-scrollbar">
        {loading ? (
          <div className="text-sm text-text-secondary dark:text-text-dark-secondary py-4 text-center">加载中...</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const selected = selectedTags.includes(tag.name);
              return (
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      key={tag.name}
                      onClick={() => toggleTag(tag.name)}
                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-chip cursor-pointer transition-all ${
                        selected
                          ? ""
                          : "bg-border dark:bg-border-dark text-text-secondary dark:text-text-dark-secondary hover:opacity-80"
                      }`}
                      style={selected ? tagColor(tag.name) : undefined}
                    >
                      <span>{tag.name}</span>
                      <span className={selected ? "opacity-60" : "opacity-40"}>{tag.count}</span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => onTagsChange([tag.name])}>
                      <Filter className="h-4 w-4" />
                      <span>以此标签筛选</span>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => { navigator.clipboard.writeText(tag.name).catch(() => {}); }}>
                      <Copy className="h-4 w-4" />
                      <span>复制标签名</span>
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
