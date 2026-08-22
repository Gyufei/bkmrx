import { Bookmark, Info, Languages, NotebookPen, Rss, Settings2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

export type SettingsTab = 'general' | 'bookmark' | 'note' | 'rss' | 'services' | 'about';

interface SettingsTabsProps {
  dirtyTabs: Partial<Record<SettingsTab, boolean>>;
}

const tabs = [
  { value: 'general', label: '通用', icon: Settings2 },
  { value: 'bookmark', label: '书签', icon: Bookmark },
  { value: 'note', label: '笔记', icon: NotebookPen },
  { value: 'rss', label: 'RSS', icon: Rss },
  { value: 'services', label: '服务', icon: Languages },
  { value: 'about', label: '关于', icon: Info },
] satisfies Array<{ value: SettingsTab; label: string; icon: typeof Settings2 }>;

export default function SettingsTabs({ dirtyTabs }: SettingsTabsProps) {
  return (
    <div className="w-full flex h-fit pt-2 items-center justify-center bg-background/95 px-4 backdrop-blur">
      <TabsList variant="line" aria-label="设置分类" className="h-auto! min-w-max gap-1 p-0!">
        {tabs.map(({ value, label, icon: Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="h-auto! min-w-20 flex-col gap-0.5 rounded-xl px-4 py-1.5 after:inset-x-4! after:bottom-0! after:h-0.5 after:bg-primary data-active:bg-muted data-active:after:opacity-100"
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="relative">
              {label}
              {dirtyTabs[value] && (
                <Badge
                  aria-hidden="true"
                  title={`${label}有未保存的更改`}
                  className="absolute -top-0.5 -right-2.5 size-1.5 rounded-full p-0"
                />
              )}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
