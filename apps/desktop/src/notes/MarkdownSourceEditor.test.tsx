// @vitest-environment jsdom

import { EditorState } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const editorHarness = vi.hoisted(() => {
  const destroy = vi.fn();
  return {
    destroy,
    view: {
      destroy,
      state: undefined as unknown,
      scrollDOM: { scrollTop: 0 },
      focus: vi.fn(),
      dispatch: vi.fn(),
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
  const EditorView = vi.fn((config: { state: EditorState }) => {
    editorHarness.configs.push(config);
    editorHarness.view.state = config.state;
    editorHarness.updateListener = config.state.facet(original.EditorView.updateListener)[0];
    return editorHarness.view;
  });
  Object.assign(EditorView, {
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
    editorHarness.view.scrollDOM.scrollTop = 0;
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
      editorHarness.updateListener?.({
        docChanged: true,
        state: { doc: { toString: () => '# Updated' } },
      } as ViewUpdate);
    });

    expect(onChange).toHaveBeenCalledWith('# Updated');
  });

  it('synchronizes a changed external value without recreating the view', () => {
    const { rerender } = render(
      <MarkdownSourceEditor
        value="# Initial"
        initialSnapshot={null}
        onChange={vi.fn()}
        onSnapshot={vi.fn()}
      />,
    );

    rerender(
      <MarkdownSourceEditor
        value="# External"
        initialSnapshot={null}
        onChange={vi.fn()}
        onSnapshot={vi.fn()}
      />,
    );

    expect(editorHarness.configs).toHaveLength(1);
    expect(editorHarness.view.dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: '# Initial'.length, insert: '# External' },
    });
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
