import { Settings2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

export default function GeneralSettings() {
  return (
    <section aria-labelledby="general-settings-title" className="flex flex-col gap-6">
      <div>
        <h1 id="general-settings-title" className="text-xl font-semibold">
          通用
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">管理应用级的基础偏好。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>通用设置</CardTitle>
        </CardHeader>
        <CardContent>
          <Empty className="min-h-44">
            <EmptyMedia>
              <Settings2 className="size-8" aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>暂无通用设置</EmptyTitle>
            <EmptyDescription>后续新增的应用级设置会集中显示在这里。</EmptyDescription>
          </Empty>
        </CardContent>
      </Card>
    </section>
  );
}
