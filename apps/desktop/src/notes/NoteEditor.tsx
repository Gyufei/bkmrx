import { useEffect, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import { LanguageDescription } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { vue } from "@codemirror/lang-vue";
import { markdown as cmMarkdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import "@milkdown/crepe/theme/common/style.css";
import '@milkdown/crepe/theme/nord.css'

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
        features: {
          [Crepe.Feature.Latex]: false,
          [Crepe.Feature.ImageBlock]: false,
        },
        featureConfigs: {
          [Crepe.Feature.CodeMirror]: {
            languages: [
              LanguageDescription.of({
                name: "JavaScript",
                alias: ["js", "javascript", "ecmascript"],
                extensions: ["js", "mjs", "cjs", "jsx"],
                load() { return Promise.resolve(javascript()); },
              }),
              LanguageDescription.of({
                name: "TypeScript",
                alias: ["ts", "typescript"],
                extensions: ["ts", "tsx", "mts"],
                load() { return Promise.resolve(javascript({ typescript: true })); },
              }),
              LanguageDescription.of({
                name: "C",
                alias: ["c", "c++", "cpp", "cc"],
                extensions: ["c", "h", "cpp", "cc", "hpp"],
                load() { return Promise.resolve(cpp()); },
              }),
              LanguageDescription.of({
                name: "Rust",
                alias: ["rs", "rust"],
                extensions: ["rs"],
                load() { return Promise.resolve(rust()); },
              }),
              LanguageDescription.of({
                name: "Vue",
                alias: ["vue"],
                extensions: ["vue"],
                load() { return Promise.resolve(vue()); },
              }),
              LanguageDescription.of({
                name: "Markdown",
                alias: ["md", "markdown"],
                extensions: ["md", "markdown"],
                load() { return Promise.resolve(cmMarkdown()); },
              }),
              LanguageDescription.of({
                name: "CSS",
                alias: ["css", "pcss"],
                extensions: ["css", "scss"],
                load() { return Promise.resolve(css()); },
              }),
              LanguageDescription.of({
                name: "JSON",
                alias: ["json", "jsonc"],
                extensions: ["json", "jsonc"],
                load() { return Promise.resolve(json()); },
              }),
              LanguageDescription.of({
                name: "HTML",
                alias: ["html", "htm", "xhtml"],
                extensions: ["html", "htm", "xhtml"],
                load() { return Promise.resolve(html()); },
              }),
              LanguageDescription.of({
                name: "Python",
                alias: ["py", "python"],
                extensions: ["py"],
                load() { return Promise.resolve(python()); },
              }),
              LanguageDescription.of({
                name: "SQL",
                alias: ["sql"],
                extensions: ["sql"],
                load() { return Promise.resolve(sql()); },
              }),
            ],
          },
        },
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
              .catch(() => { });
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
