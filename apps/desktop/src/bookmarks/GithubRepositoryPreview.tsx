import { Code2, ExternalLink, GitFork, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { GithubRepositoryPreview as GithubRepositoryPreviewData } from '@/types';

interface GithubRepositoryPreviewProps {
  repository: GithubRepositoryPreviewData;
  onOpenExternal: () => void;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

export default function GithubRepositoryPreview({
  repository,
  onOpenExternal,
}: GithubRepositoryPreviewProps) {
  return (
    <div className="px-5 pt-6 sm:px-12 sm:pt-12">
      <article className="grid min-h-32 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-4 rounded-xl border border-border bg-muted/30 p-5 shadow-sm sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]">
        {repository.owner_avatar_url ? (
          <img
            src={repository.owner_avatar_url}
            alt={`${repository.owner} 头像`}
            className="size-11 rounded-full bg-muted object-cover"
          />
        ) : (
          <div className="flex size-11 items-center justify-center rounded-full bg-foreground text-background">
            <Code2 aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{repository.full_name}</h3>
          {repository.description && (
            <p className="mt-1 truncate text-sm text-muted-foreground">{repository.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {repository.primary_language && <span>{repository.primary_language}</span>}
            <span className="inline-flex items-center gap-1">
              <Star aria-hidden="true" />
              {repository.stars}
            </span>
            <span className="inline-flex items-center gap-1">
              <GitFork aria-hidden="true" />
              {repository.forks}
            </span>
            <span>更新于 {formatUpdatedAt(repository.updated_at)}</span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="col-span-2 sm:col-span-1"
          onClick={onOpenExternal}
        >
          <ExternalLink data-icon="inline-start" />
          查看 GitHub
        </Button>
      </article>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        GitHub 不允许应用内网页预览，已展示仓库摘要
      </p>
    </div>
  );
}
