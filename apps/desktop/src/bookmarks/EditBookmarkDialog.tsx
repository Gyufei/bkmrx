import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import TagInput from "@/components/TagInput";
import type { Bookmark, Tag } from "../types";

interface Props {
  bookmark: Bookmark | null;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: number, title: string, tags: string[], description?: string) => Promise<void>;
  fetchTags: () => Promise<Tag[]>;
}

export default function EditBookmarkDialog({ bookmark, onOpenChange, onUpdate, fetchTags }: Props) {
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (bookmark) {
      setTitle(bookmark.title || "");
      setTags(bookmark.tags);
      setDescription(bookmark.description || "");
    }
  }, [bookmark]);

  const handleSubmit = useCallback(async () => {
    if (!bookmark) return;
    setSubmitting(true);
    try {
      await onUpdate(bookmark.id, title.trim(), tags, description.trim() || undefined);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }, [bookmark, title, tags, description, onUpdate, onOpenChange]);

  return (
    <Dialog open={bookmark !== null} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑书签</DialogTitle>
          <DialogDescription>
            修改标题、标签或描述。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-title">标题</Label>
            <Input
              id="edit-title"
              placeholder="书签标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>标签（可选）</Label>
            <TagInput value={tags} onChange={setTags} fetchTags={fetchTags} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">描述（可选）</Label>
            <Textarea
              id="edit-description"
              placeholder="添加备注或描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
