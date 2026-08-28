import { useQuery } from '@tanstack/react-query';

import { getSystemInfoApi, SettingsQueryApiKey } from '../settings.api';
import SystemInfoCard from '../SystemInfoCard';

interface AboutSettingsProps {
  active: boolean;
}

export default function AboutSettings({ active }: AboutSettingsProps) {
  const { data: systemInfo } = useQuery({
    queryKey: [SettingsQueryApiKey.SYSTEM_INFO],
    queryFn: getSystemInfoApi,
    enabled: active,
  });

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <section aria-labelledby="about-settings-title" className="flex flex-col gap-6">
      <div>
        <h1 id="about-settings-title" className="text-xl font-semibold">
          关于
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">查看当前应用版本。</p>
      </div>
      <SystemInfoCard info={systemInfo} onCopy={copy} />
    </section>
  );
}
