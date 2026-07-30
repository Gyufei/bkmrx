# Markdown Task Checkbox Style Design

## Goal

Improve the readability and alignment of task-list checkboxes in rendered Markdown without replacing the browser-native control.

## Current Behavior

`react-markdown` with `remark-gfm` renders task markers as disabled native checkbox inputs. The Markdown viewer and Typography styles do not currently define checkbox dimensions or color, so the browser default produces a checkbox that is small relative to the document text.

## Selected Design

- Scope the rule to checkbox inputs inside `.markdown-viewer .task-list-item`.
- Set both width and height to `1rem` (16px).
- Set `accent-color` to `var(--primary)` so checked tasks follow the application theme in light and dark modes.
- Adjust the checkbox's vertical position and surrounding margin so it aligns with the first line of task text.
- Preserve native appearance, disabled semantics, and existing Markdown rendering.

## Alternatives Considered

1. Use an 18px native checkbox. This is more prominent but visually heavy in compact or nested task lists.
2. Fully custom-render the checkbox. This offers more visual control but adds unnecessary CSS and platform-specific behavior for a read-only document view.

## Scope

- Modify only the Markdown-viewer section of `apps/desktop/src/App.css`.
- Add focused CSS-contract assertions to `apps/desktop/src/notes/MarkdownViewer.test.tsx`.
- Do not change `MarkdownViewer.tsx`, task-list markup, ordinary lists, edit mode, or reusable form controls.

## Verification

- A focused test first fails because no task-checkbox style exists.
- The CSS contract verifies the 16px dimensions, primary accent color, and alignment properties.
- Existing Markdown rendering tests continue to verify checked, unchecked, and disabled task inputs.
- The complete desktop test suite and production build pass.
