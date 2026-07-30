# View-mode task checkbox toggle

## Goal

Allow a rendered GFM task checkbox to be toggled directly in note view mode without
turning view mode into a general-purpose editor or changing the existing view/edit
mode transition.

## Interaction boundary

- Only checkboxes produced by GFM task-list items are interactive in view mode.
- Clicking a checkbox toggles exactly one source marker between unchecked and checked.
- The note remains in view mode before, during, and after the operation.
- Text, headings, ordinary list items, and non-task bracket text remain read-only.
- The rendered note updates immediately through the existing document session.

## Source targeting

`MarkdownViewer` will render task list items with a custom component. The component
will use the list item's Markdown AST source position to report its one-based source
line to the parent.

The parent applies a small pure transformation to the current Markdown content:

1. Resolve the reported source line.
2. Verify that the line begins, after optional indentation, with a supported unordered
   or ordered list marker followed by a GFM task marker.
3. Replace only the marker's state character: a space becomes `x`; `x` or `X` becomes
   a space.
4. Preserve indentation, list marker, spacing, task text, and newline style.
5. Return no change when the position is absent or the source line does not match.

Source position is the identity. Task text and global checkbox order are not used,
so duplicate labels and nested tasks remain unambiguous.

## Data and save flow

`MarkdownViewer` exposes `onToggleTask(sourceLine)`. `NoteEditor`, which owns the
single `useNoteDocument` session, transforms `session.content` and passes the result
to `session.setContent`.

This reuses the existing optimistic state update, dirty tracking, 400 ms debounce,
serialized save queue, path/version guards, file-switch flush, and retry behavior.
No second save path or hidden editor instance is introduced.

If persistence fails, the existing save-error banner remains the source of truth and
offers retry or dismiss. The optimistic checkbox state is not automatically reverted:
reverting could overwrite a newer toggle, while the session already retains the dirty
content required for retry.

## Accessibility and styling

The rendered native checkbox is enabled only when a toggle callback and valid source
position are available. It retains native keyboard and screen-reader behavior. Existing
size, alignment, and accent-color styling remains in place; the interactive cursor may
be added without changing the surrounding task-list presentation.

## Tests

Tests will be written before production changes and will cover:

- unchecked and checked task markers toggle in view mode;
- uppercase `X`, indentation, ordered markers, and nested tasks;
- duplicate task labels target the clicked source line;
- ordinary bracket text and malformed/stale positions do not change content;
- the viewer exposes enabled task checkboxes and reports the correct source line;
- `NoteEditor` stays in view mode and sends the transformed content through the
  existing session save flow;
- rapid toggles compose against current session content;
- existing save failure and file-switch behavior continues to pass.

## Non-goals

- Editing task text or adding/removing tasks in view mode.
- Making other Markdown elements editable.
- Building a generic command framework.
- Changing view/edit shortcuts, scroll restoration, or editor snapshots.
- Adding a separate backend command or persistence mechanism.
