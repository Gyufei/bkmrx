.bail on
.timeout 10000

PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE TEMP TABLE tag_map (
    source TEXT PRIMARY KEY,
    target TEXT NOT NULL
);

INSERT INTO tag_map(source, target) VALUES
    ('tool', '工具'),
    ('library', '代码库'),
    ('blog', '博客'),
    ('reference', '参考资料'),
    ('tutorial', '教程'),
    ('component-library', '组件库'),
    ('documentation', '文档'),
    ('document', '文档'),
    ('plugin', '插件'),
    ('animation', '动画'),
    ('web', 'Web'),
    ('open-source', '开源'),
    ('template', '模板'),
    ('security', '安全'),
    ('playground', '演练场'),
    ('ui-kit', 'UI 套件'),
    ('blockchain', '区块链'),
    ('performance', '性能'),
    ('proxy', '代理'),
    ('image-processing', '图像处理'),
    ('image-editing', '图像处理'),
    ('article', '文章'),
    ('free', '免费'),
    ('snippet', '代码片段'),
    ('table', '表格'),
    ('automation', '自动化'),
    ('form', '表单'),
    ('framework', '框架'),
    ('guide', '指南'),
    ('resource', '资源'),
    ('online', '在线'),
    ('testing', '测试'),
    ('design', '设计'),
    ('editor', '编辑器'),
    ('code-editor', '编辑器'),
    ('component', '组件'),
    ('ui-component', '组件'),
    ('platform', '平台'),
    ('chart', '图表'),
    ('collection', '合集'),
    ('browser', '浏览器'),
    ('cheatsheet', '速查表'),
    ('book', '书籍'),
    ('cross-platform', '跨平台'),
    ('smart-contracts', '智能合约'),
    ('configuration', '配置'),
    ('image-generation', '图像生成'),
    ('mobile', '移动端'),
    ('code-generation', '代码生成'),
    ('low-code', '低代码'),
    ('online-tool', '在线工具'),
    ('state-management', '状态管理'),
    ('authentication', '身份认证'),
    ('frontend', '前端'),
    ('cryptocurrency', '加密货币'),
    ('crypto', '加密货币'),
    ('color', '颜色'),
    ('palette', '颜色'),
    ('aliases', 'alias'),
    ('bugs', 'bug'),
    ('course', '课程'),
    ('courses', '课程'),
    ('gpts', 'gpt'),
    ('node', 'Node.js'),
    ('nodejs', 'Node.js'),
    ('browser-extension', '浏览器扩展'),
    ('chrome-extension', '浏览器扩展'),
    ('http', 'HTTP'),
    ('https', 'HTTP'),
    ('data-structures', '数据结构'),
    ('h5', '移动 Web'),
    ('ip', 'IP'),
    ('v8', 'V8'),
    ('zk', '零知识证明'),
    ('zx', 'Google zx'),
    ('中文', '中文内容');

CREATE TEMP TABLE tag_add (
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    PRIMARY KEY (source, target)
);

INSERT INTO tag_add(source, target) VALUES
    ('frontend-book-recommendations', '前端'),
    ('frontend-book-recommendations', '书籍'),
    ('persistent-data-structures', '数据结构'),
    ('exploratory-data-analysis', '数据分析');

CREATE TEMP TABLE tag_delete (
    source TEXT PRIMARY KEY
);

INSERT INTO tag_delete(source) VALUES
    ('frontend-book-recommendations'),
    ('human-interface-guidelines'),
    ('persistent-data-structures'),
    ('exploratory-data-analysis'),
    ('du'),
    ('v3'),
    ('vh'),
    ('vm'),
    ('vw'),
    ('云程'),
    ('21st-dev'),
    ('aicodewith'),
    ('alova'),
    ('amexio'),
    ('any-router'),
    ('apeboard'),
    ('art-design-pro'),
    ('awcloud'),
    ('bnbproject'),
    ('chain-fm'),
    ('chain-insight'),
    ('chaintool'),
    ('code2ai'),
    ('codenews'),
    ('coincarp'),
    ('coinsniper'),
    ('compodoc'),
    ('crxjs'),
    ('dappbay'),
    ('dnslink'),
    ('dummy-image'),
    ('easy-table'),
    ('embark'),
    ('ethplorer'),
    ('favicon-fetcher'),
    ('favicon-generator'),
    ('flux'),
    ('gea'),
    ('gpt-pro'),
    ('gptsapi'),
    ('grid-manager'),
    ('hapigo'),
    ('imgse'),
    ('ipidea'),
    ('jigsaw'),
    ('jointjs'),
    ('leonardo-ai'),
    ('liquid-network'),
    ('lite-xl'),
    ('loon'),
    ('mafs'),
    ('magic-ui'),
    ('mesh-gradient'),
    ('meteora'),
    ('n1n-ai'),
    ('obsidian-hub'),
    ('overapi'),
    ('papanasi'),
    ('perpetual-contracts'),
    ('pinksale'),
    ('pretty-diff'),
    ('qr-code-generator'),
    ('react-bits'),
    ('react-rainbow'),
    ('revoke-cash'),
    ('rxweb'),
    ('shoelace'),
    ('slowmist'),
    ('smart-html-elements'),
    ('spl-token'),
    ('state-of-css'),
    ('themis'),
    ('trueblocks'),
    ('uiverse'),
    ('uncx'),
    ('vagmi'),
    ('whalesmarket'),
    ('xscan');

CREATE TEMP TABLE migration_assert (
    value INTEGER NOT NULL CHECK (value = 1)
);

-- Refuse to run against a database whose source labels no longer match this plan.
INSERT INTO migration_assert
SELECT count(*) = (SELECT count(*) FROM tag_map)
FROM tags
WHERE name IN (SELECT source FROM tag_map);

INSERT INTO migration_assert
SELECT count(*) = (SELECT count(*) FROM tag_delete)
FROM tags
WHERE name IN (SELECT source FROM tag_delete);

INSERT INTO migration_assert
SELECT count(*) = (SELECT count(DISTINCT source) FROM tag_add)
FROM tags
WHERE name IN (SELECT source FROM tag_add);

INSERT OR IGNORE INTO tags(name)
SELECT DISTINCT target FROM tag_map
UNION
SELECT DISTINCT target FROM tag_add;

INSERT INTO bookmark_tags(bookmark_id, tag_id)
SELECT bt.bookmark_id, target.id
FROM tag_map mapping
JOIN tags source ON source.name = mapping.source
JOIN bookmark_tags bt ON bt.tag_id = source.id
JOIN tags target ON target.name = mapping.target
ON CONFLICT(bookmark_id, tag_id) DO NOTHING;

INSERT INTO bookmark_tags(bookmark_id, tag_id)
SELECT bt.bookmark_id, target.id
FROM tag_add addition
JOIN tags source ON source.name = addition.source
JOIN bookmark_tags bt ON bt.tag_id = source.id
JOIN tags target ON target.name = addition.target
ON CONFLICT(bookmark_id, tag_id) DO NOTHING;

DELETE FROM bookmark_tags
WHERE tag_id IN (
    SELECT id FROM tags
    WHERE name IN (
        SELECT source FROM tag_map
        UNION
        SELECT source FROM tag_delete
    )
);

DELETE FROM tags
WHERE name IN (
    SELECT source FROM tag_map
    UNION
    SELECT source FROM tag_delete
);

-- Rebuild the derived full-text index so tag text matches the new relations.
DELETE FROM bookmarks_fts;
INSERT INTO bookmarks_fts(rowid, url, title, description, tags)
SELECT b.id, b.url, b.title, b.description,
       coalesce((
           SELECT group_concat(name, ' ')
           FROM (
               SELECT t.name AS name
               FROM bookmark_tags bt
               JOIN tags t ON t.id = bt.tag_id
               WHERE bt.bookmark_id = b.id
               ORDER BY t.name
           )
       ), '')
FROM bookmarks b;

-- Transaction guards: no bookmarks lost, no bookmark becomes untagged,
-- no broken relation remains, and the FTS index still covers every bookmark.
INSERT INTO migration_assert SELECT count(*) = 2173 FROM bookmarks;
INSERT INTO migration_assert
SELECT count(*) = 0
FROM bookmarks b
WHERE NOT EXISTS (
    SELECT 1 FROM bookmark_tags bt WHERE bt.bookmark_id = b.id
);
INSERT INTO migration_assert SELECT count(*) = 0 FROM pragma_foreign_key_check;
INSERT INTO migration_assert SELECT count(*) = 2173 FROM bookmarks_fts;
INSERT INTO migration_assert
SELECT count(*) = 0
FROM tags
WHERE name IN (
    SELECT source FROM tag_map
    UNION
    SELECT source FROM tag_delete
);

COMMIT;
