PRAGMA foreign_keys = ON;

CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL
);
CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE bookmark_tags (
    bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (bookmark_id, tag_id)
);
CREATE TABLE todos (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL
);
CREATE TABLE todo_tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE todo_tag_relations (
    todo_id INTEGER NOT NULL REFERENCES todos(id),
    tag_id INTEGER NOT NULL REFERENCES todo_tags(id),
    PRIMARY KEY (todo_id, tag_id)
);
CREATE TABLE rss_feeds (
    id INTEGER PRIMARY KEY,
    feed_url TEXT NOT NULL UNIQUE
);
CREATE TABLE rss_entries (
    id INTEGER PRIMARY KEY,
    feed_id INTEGER NOT NULL REFERENCES rss_feeds(id),
    dedupe_key TEXT NOT NULL,
    UNIQUE (feed_id, dedupe_key)
);

INSERT INTO bookmarks(id, url, title) VALUES (1, 'https://example.com', 'Example');
INSERT INTO tags(id, name) VALUES (1, 'tool');
INSERT INTO bookmark_tags(bookmark_id, tag_id) VALUES (1, 1);
INSERT INTO todos(id, title) VALUES (1, 'Example todo');
INSERT INTO todo_tags(id, name) VALUES (1, 'work');
INSERT INTO todo_tag_relations(todo_id, tag_id) VALUES (1, 1);
INSERT INTO rss_feeds(id, feed_url) VALUES (1, 'https://example.com/feed.xml');
INSERT INTO rss_entries(id, feed_id, dedupe_key) VALUES (1, 1, 'entry-1');
