import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SystemInfo } from '@/lib/invoke';

interface SystemInfoCardProps {
  info?: SystemInfo;
  onCopy: (value: string) => Promise<void>;
}

export default function SystemInfoCard({ info, onCopy }: SystemInfoCardProps) {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const rows = info
    ? [
        ['App Data', info.app_data_dir],
        ['SQLite 数据库', info.sqlite_db_path],
        ['Schema 版本', String(info.schema_version)],
        ['搜索后端', info.search_backend],
        ['App 版本', info.app_version],
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>系统信息</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {info ? (
          rows.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="break-all text-xs text-foreground">{value}</span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="shrink-0"
                  onClick={async () => {
                    try {
                      await onCopy(value);
                      setCopyError(false);
                      setCopiedLabel(label);
                    } catch {
                      setCopiedLabel(null);
                      setCopyError(true);
                    }
                  }}
                  title="复制"
                  aria-label={`复制${label}`}
                >
                  {copiedLabel === label ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            加载中...
          </div>
        )}
        {copiedLabel && (
          <p role="status" className="text-xs text-muted-foreground">
            已复制{copiedLabel}
          </p>
        )}
        {copyError && <p className="text-xs text-destructive">复制失败，请手动复制。</p>}
      </CardContent>
    </Card>
  );
}
