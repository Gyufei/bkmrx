import type { Bookmark } from "../types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteBookmarksApi, BkQueryApiKey } from "./bookmarks.api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function DeleteBkDialog({ deleteTarget, setDeleteTarget }: { deleteTarget: Bookmark | null, setDeleteTarget: (bookmark: Bookmark | null) => void }) {
  const queryClient = useQueryClient();

  const { mutate: handleDelete, isPending: isDeleting, error: deleteError } = useMutation({
    mutationFn: deleteBookmarksApi,
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.BOOKMARKS] });
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
    },
  });

  return (
    <Dialog
      open={deleteTarget !== null}
      onOpenChange={(open) => {
        if (!open) setDeleteTarget(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            <div>
              确定要删除书签
              <span className="font-bold text-chart-4">
                {deleteTarget?.title || deleteTarget?.url}
              </span>
              吗？此操作不可撤销。
            </div>

            {deleteError && (
              <div className="text-destructive">
                删除失败：{deleteError.message}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={isDeleting}
            onClick={() => {
              if (deleteTarget) {
                handleDelete([deleteTarget.id]);
              }
            }}
          >
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  )
}
