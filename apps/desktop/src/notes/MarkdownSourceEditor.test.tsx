// @vitest-environment jsdom

import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const editorHarness = vi.hoisted(() => {
  const destroy = vi.fn();
  return {
    destroy,
    scrollTop: 0,
    view: {
      destroy,
      state: undefined as unknown,
      scrollDOM: null as unknown as HTMLElement,
      focus: vi.fn(),
      dispatch: vi.fn((spec: TransactionSpec) => {
        const transaction = (editorHarness.view.state as EditorState).update(spec);
        editorHarness.view.state = transaction.state;
        editorHarness.updateListener?.({
          docChanged: transaction.docChanged,
          state: transaction.state,
          transactions: [transaction],
        } as unknown as ViewUpdate);
      }),
    },
    configs: [] as Array<{ state: EditorState }>,
    updateListener: null as ((update: ViewUpdate) => void) | null,
  };
});

const mediaHarness = vi.hoisted(() => {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const query = {
    matches: false,
    addEventListener: vi.fn((_event: string, next: (event: MediaQueryListEvent) => void) => {
      listener = next;
    }),
    removeEventListener: vi.fn(),
  };
  return {
    query,
    emitChange: () => listener?.({ matches: query.matches } as MediaQueryListEvent),
  };
});

vi.mock('@codemirror/view', async (importOriginal) => {
  const original = await importOriginal<typeof import('@codemirror/view')>();
  const EditorView = vi.fn((config: { state: EditorState; parent: HTMLElement }) => {
    const scrollDOM = document.createElement('div');
    Object.defineProperty(scrollDOM, 'scrollTop', {
      configurable: true,
      get: () => (scrollDOM.isConnected ? editorHarness.scrollTop : 0),
      set: (value: number) => {
        editorHarness.scrollTop = value;
      },
    });
    config.parent.append(scrollDOM);

    editorHarness.configs.push(config);
    editorHarness.view.state = config.state;
    editorHarness.view.scrollDOM = scrollDOM;
    editorHarness.updateListener = config.state.facet(original.EditorView.updateListener)[0];
    return editorHarness.view;
  });
  Object.assign(EditorView, {
    contentAttributes: original.EditorView.contentAttributes,
    lineWrapping: original.EditorView.lineWrapping,
    theme: original.EditorView.theme,
    updateListener: original.EditorView.updateListener,
  });
  return { ...original, EditorView };
});

import MarkdownSourceEditor from './MarkdownSourceEditor';

describe('MarkdownSourceEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorHarness.configs.length = 0;
    editorHarness.updateListener = null;
    editorHarness.scrollTop = 0;
    mediaHarness.query.matches = false;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaHarness.query),
    );
  });

  it('creates and destroys one EditorView', () => {
    const { unmount } = render(
      <MarkdownSourceEditor
        value="# Initial"
        initialSnapshot={null}
        onChange={vi.fn()}
        onSnapshot={vi.fn()}
      />,
    );

    unmount();
    expect(editorHarness.destroy).toHaveBeenCalledTimes(1);
  });

  it('initializes the document from value', () => {
    render(
      <MarkdownSourceEditor
        value="# Initial"
        initialSnapshot={null}
        onChange={vi.fn()}
        onSnapshot={vi.fn()}
      />,
    );

    expect((editorHarness.view.state as EditorState).doc.toString()).toBe('# Initial');
  });

  it('visually wraps long source lines', () => {
    const value = 'https://example.com/' + 'segment/'.repeat(40);
    const onChange = vi.fn();
    render(
      <MarkdownSourceEditor
        value={value}
        initialSnapshot={null}
        onChange={onChange}
        onSnapshot={vi.fn()}
      />,
    );

    const contentAttributes = (editorHarness.view.state as EditorState).facet(
      EditorView.contentAttributes,
    );
    expect(contentAttributes).toContainEqual(expect.objectContaining({ class: 'cm-lineWrapping' }));
    expect((editorHarness.view.state as EditorState).doc.toString()).toBe(value);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports user document changes', () => {
    const onChange = vi.fn();
    render(
      <MarkdownSourceEditor
        value="# Initial"
        initialSnapshot={null}
        onChange={onChange}
        onSnapshot={vi.fn()}
      />,
    );

    act(() => {
      editorHarness.view.dispatch({
        changes: { from: 0, to: '# Initial'.length, insert: '# Updated' },
      });
    });

    expect(onChange).toHaveBeenCalledWith('# Updated');
  });

  it('synchronizes a changed external value without recreating the view', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MarkdownSourceEditor
        value="# Initial"
        initialSnapshot={null}
        onChange={onChange}
        onSnapshot={vi.fn()}
      />,
    );

    rerender(
      <MarkdownSourceEditor
        value="# External"
        initialSnapshot={null}
        onChange={onChange}
        onSnapshot={vi.fn()}
      />,
    );

    expect(editorHarness.configs).toHaveLength(1);
    expect(editorHarness.view.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { from: 0, to: '# Initial'.length, insert: '# External' },
      }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports the latest selection and scroll position on cleanup', () => {
    const onSnapshot = vi.fn();
    const { unmount } = render(
      <MarkdownSourceEditor
        value="# Initial"
        initialSnapshot={{ anchor: 2, head: 4, scrollTop: 96 }}
        onChange={vi.fn()}
        onSnapshot={onSnapshot}
      />,
    );

    unmount();

    expect(onSnapshot).toHaveBeenCalledWith({ anchor: 2, head: 4, scrollTop: 96 });
  });

  it('focuses and signals readiness after construction', () => {
    const onReady = vi.fn();
    render(
      <MarkdownSourceEditor
        value="# Initial"
        initialSnapshot={null}
        onChange={vi.fn()}
        onSnapshot={vi.fn()}
        onReady={onReady}
      />,
    );

    expect(editorHarness.view.focus).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('reconfigures its theme when the color scheme changes', () => {
    render(
      <MarkdownSourceEditor
        value="# Initial"
        initialSnapshot={null}
        onChange={vi.fn()}
        onSnapshot={vi.fn()}
      />,
    );

    mediaHarness.query.matches = true;
    act(() => mediaHarness.emitChange());

    expect(editorHarness.configs).toHaveLength(1);
    expect(editorHarness.view.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ effects: expect.anything() }),
    );
  });
});
