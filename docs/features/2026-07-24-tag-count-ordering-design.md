# Tag Count Ordering Design

## Goal

Return tags with the most associated bookmarks first.

## Design

Keep sorting in the SQLite repository query that already aggregates bookmark
counts. Order by `count(bt.bookmark_id) DESC`, then by `t.name ASC` so tags with
equal counts have deterministic ordering consistent with the current
name-based order.

No API shape, service, command, or frontend changes are required.

## Testing

Add a repository integration test with tags having different bookmark counts
and a count tie. Verify that:

1. Larger counts appear first.
2. Equal counts are ordered by tag name ascending.

Run the focused repository test, then the complete backend test suite.
