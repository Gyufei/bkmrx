import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';

export interface MarkdownEditorSnapshot {
  anchor: number;
  head: number;
  scrollTop: number;
}

export interface MarkdownSourceEditorProps {
  value: string;
  initialSnapshot: MarkdownEditorSnapshot | null;
  onChange(value: string): void;
  onSnapshot(snapshot: MarkdownEditorSnapshot): void;
  onReady?(): void;
}

function editorTheme(dark: boolean) {
  return EditorView.theme({}, { dark });
}

export default function MarkdownSourceEditor({
  value,
  initialSnapshot,
  onChange,
  onSnapshot,
  onReady,
}: MarkdownSourceEditorProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSnapshotRef = useRef(onSnapshot);
  const onReadyRef = useRef(onReady);

  onChangeRef.current = onChange;
  onSnapshotRef.current = onSnapshot;
  onReadyRef.current = onReady;

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const theme = new Compartment();
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        selection: initialSnapshot
          ? { anchor: initialSnapshot.anchor, head: initialSnapshot.head }
          : undefined,
        extensions: [
          markdown(),
          history(),
          lineNumbers(),
          highlightActiveLine(),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          theme.of(editorTheme(media.matches)),
        ],
      }),
      parent,
    });
    viewRef.current = view;

    if (initialSnapshot) view.scrollDOM.scrollTop = initialSnapshot.scrollTop;

    const updateTheme = () => {
      view.dispatch({ effects: theme.reconfigure(editorTheme(media.matches)) });
    };
    media.addEventListener('change', updateTheme);

    view.focus();
    onReadyRef.current?.();

    return () => {
      media.removeEventListener('change', updateTheme);
      const { anchor, head } = view.state.selection.main;
      onSnapshotRef.current({ anchor, head, scrollTop: view.scrollDOM.scrollTop });
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="markdown-source-editor" />;
}
