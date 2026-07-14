import { useEffect, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";

interface Props {
  filePath: string;
  readFile: (path: string) => Promise<string>;
  onSave: (path: string, content: string) => Promise<void>;
}

function stripFrontmatter(content: string): string {
  if (content.startsWith("---")) {
    const end = content.indexOf("---", 3);
    if (end !== -1) return content.slice(end + 3).trimStart();
  }
  return content;
}

export default function NoteEditor({ filePath, readFile, onSave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onSaveRef = useRef(onSave);
  const [saveStatus, setSaveStatus] = useState<"" | "保存中..." | "已保存">("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [loading, setLoading] = useState(true);

  onSaveRef.current = onSave;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setLoading(true);

    // Load file content first, then create Crepe editor
    readFile(filePath).then((raw) => {
      if (cancelled) return;

      const markdown = stripFrontmatter(raw);

      const crepe = new Crepe({
        root: container,
        defaultValue: markdown,
      });

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, md) => {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          setSaveStatus("保存中...");
          saveTimerRef.current = setTimeout(() => {
            onSaveRef.current(filePath, md)
              .then(() => {
                setSaveStatus("已保存");
                setTimeout(() => setSaveStatus(""), 2000);
              })
              .catch(() => {});
          }, 1500);
        });
      });

      if (!cancelled) {
        crepe.create().then(() => {
          if (!cancelled) {
            crepeRef.current = crepe;
            setLoading(false);
          }
        });
      }
    });

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const c = crepeRef.current;
      if (c) {
        c.destroy();
        crepeRef.current = null;
      }
    };
  }, [filePath, readFile]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#1a1a2e] relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white dark:bg-[#1a1a2e] text-sm text-text-secondary dark:text-text-dark-secondary">
          <div className="w-4 h-4 mr-2 border-2 border-accent dark:border-accent-dark border-t-transparent rounded-full animate-spin" />
          加载编辑器...
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-y-auto thin-scrollbar" />
      <div className="shrink-0 h-6 flex items-center justify-end px-6 text-[11px] text-text-secondary dark:text-text-dark-secondary border-t border-border/50 dark:border-border-dark/50">
        {saveStatus && <span>{saveStatus}</span>}
      </div>
    </div>
  );
}
