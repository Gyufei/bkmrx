import { useState, useCallback } from "react";
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
import type { Tag } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (url: string, title: string, tags: string[], description?: string) => Promise<void>;
  fetchTags: () => Promise<Tag[]>;
}

export default function AddBookmarkDialog({ open, onOpenChange, onAdd, fetchTags }: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      await onAdd(url.trim(), title.trim(), tags, description.trim() || undefined);
      setUrl("");
      setTitle("");
      setTags([]);
      setDescription("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }, [url, title, tags, description, onAdd, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加书签</DialogTitle>
          <DialogDescription>
            输入书签信息，添加后自动同步到 bkmr 数据库。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">标题（可选）</Label>
            <Input
              id="title"
              placeholder="书签标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>标签（可选）</Label>
            <TagInput value={tags} onChange={setTags} fetchTags={fetchTags} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">描述（可选）</Label>
            <Textarea
              id="description"
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
          <Button onClick={handleSubmit} disabled={!url.trim() || submitting}>
            {submitting ? "添加中..." : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
