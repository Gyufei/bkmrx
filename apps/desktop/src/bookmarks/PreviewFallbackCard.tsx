import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { PreviewFallbackReason } from '@/types';

interface PreviewFallbackCardProps {
  reason: PreviewFallbackReason | 'unexpected_error';
  message: string;
  host: string;
  onOpenExternal: () => void;
  onRetry?: () => void;
}

const titles: Record<PreviewFallbackCardProps['reason'], string> = {
  embedding_denied: '此网站不允许应用内预览',
  timeout: '网页加载超时',
  dns_failure: '网页暂时无法连接',
  connection_failure: '网页暂时无法连接',
  http_error: '网页返回错误',
  unsupported_protocol: '此地址不能在应用内预览',
  unsupported_provider_url: '暂不支持此类页面预览',
  provider_rate_limited: 'GitHub 信息请求过于频繁',
  provider_not_found: '未找到 GitHub 仓库',
  provider_error: '暂时无法获取 GitHub 信息',
  unsafe_target: '此地址不能在应用内预览',
  unexpected_error: '预览准备失败',
};

const retryable = new Set<PreviewFallbackCardProps['reason']>([
  'timeout',
  'dns_failure',
  'connection_failure',
  'http_error',
  'provider_rate_limited',
  'provider_error',
  'unexpected_error',
]);

export default function PreviewFallbackCard({
  reason,
  message,
  host,
  onOpenExternal,
  onRetry,
}: PreviewFallbackCardProps) {
  return (
    <div className="px-5 pt-6 sm:px-12 sm:pt-12">
      <section
        role="alert"
        className="grid min-h-32 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-4 rounded-xl border border-border bg-muted/30 p-5 shadow-sm sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]"
      >
        <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <AlertTriangle aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold">{titles[reason]}</h3>
          <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{message}</p>
          <p className="mt-2 text-xs text-muted-foreground">{host}</p>
        </div>
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:justify-end">
          {onRetry && retryable.has(reason) && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw data-icon="inline-start" />
              重试
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onOpenExternal}>
            <ExternalLink data-icon="inline-start" />
            在浏览器中打开
          </Button>
        </div>
      </section>
    </div>
  );
}
