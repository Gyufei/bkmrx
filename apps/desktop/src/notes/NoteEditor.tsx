import { useCallback, useEffect, useRef, useState } from "react";
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
  const filePathRef = useRef(filePath);
  const latestContentRef = useRef<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSavedFlash, setShowSavedFlash] = useState(false);
  const [loading, setLoading] = useState(true);

  onSaveRef.current = onSave;
  filePathRef.current = filePath;

  const save = useCallback(async (path: string, content: string) => {
   try {
     await onSaveRef.current(path, content);
     setSaveError(null);
   } catch (e) {
     setSaveError(String(e));
   }
  }, []);

  // Cmd+S / Ctrl+S — flush pending content immediately
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const content = latestContentRef.current;
        if (!content) return;
        save(filePathRef.current, content).then(() => {
          setShowSavedFlash(true);
          setTimeout(() => setShowSavedFlash(false), 1200);
        });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [save]);

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
          latestContentRef.current = md;
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            save(filePath, md);
          }, 400);
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
      <div className="shrink-0 h-6 flex items-center justify-end gap-2 px-6 text-[11px] text-text-secondary dark:text-text-dark-secondary border-t border-border/50 dark:border-border-dark/50">
        {saveError ? (
          <span className="text-danger dark:text-danger-dark flex items-center gap-1" title={saveError}>
            <span className="w-1.5 h-1.5 rounded-full bg-danger dark:bg-danger-dark" />
            保存失败
          </span>
        ) : showSavedFlash ? (
          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600 dark:bg-green-400" />
            已保存
          </span>
        ) : null}
      </div>
    </div>
  );
}
