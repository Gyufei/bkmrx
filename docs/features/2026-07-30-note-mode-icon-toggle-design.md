# Note Mode Icon Toggle Design

## Goal

Replace the note editor header's text mode toggle with a compact icon button while preserving the existing click and Cmd/Ctrl+E behavior.

## Considered Approaches

1. Show the target action as the icon. In view mode, show an edit icon; in edit mode, show a book icon. This is the selected approach because it communicates what clicking will do.
2. Show the current mode as the icon. This makes state visible but makes the click action less obvious.
3. Show separate book and edit buttons. This is more explicit but adds unnecessary header controls for a binary toggle.

## Interaction Design

- View mode shows a Lucide edit icon. Clicking it enters edit mode.
- Edit mode shows a Lucide book icon. Clicking it returns to rendered view.
- The control remains a ghost icon button in the existing header position.
- Its accessible name and tooltip describe the target action:
  - View mode: `编辑（⌘ + E）`
  - Edit mode: `查看（⌘ + E）`
- Existing disabled behavior during editor loading and save-before-view transitions remains unchanged.
- The existing Cmd/Ctrl+E keyboard handler remains unchanged. On non-macOS platforms, the displayed shortcut continues to use the existing platform-specific label.

## Implementation Scope

- Update `apps/desktop/src/notes/NoteEditor.tsx` to render Lucide icons instead of visible text.
- Use the button's native tooltip via `title`, because the project has no shared tooltip component and this change does not justify adding one.
- Keep an accessible label so screen-reader and role-based interactions remain descriptive.
- Update only the mode-toggle assertions in `NoteEditor.test.tsx`.

## Verification

- A test first verifies that view mode renders an icon-only edit action with the shortcut tooltip.
- A test verifies that entering edit mode changes the control to an icon-only view action with the shortcut tooltip.
- Existing click, keyboard, disabled-state, save, and file-switch tests continue to pass.
- Run the focused note editor test file and the desktop TypeScript check.
