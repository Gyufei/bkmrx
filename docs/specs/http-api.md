# bkmrx HTTP API 文档

HTTP 服务监听地址为 `127.0.0.1:8733`，无鉴权，仅本地可用。

---

## 创建书签

```
POST /api/bookmarks
```

向 bkmr 数据库添加一条新书签。

### Request Body

```json
{
  "url": "https://example.com",
  "title": "Example Title",
  "tags": ["dev", "rust"],
  "description": "Some notes about this link"
}
```

### 字段说明

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `url` | string | 是 | — | 书签 URL |
| `title` | string | 否 | URL 值 | 书签标题。不传则直接用 url 作为标题 |
| `tags` | string[] | 否 | `[]` | 标签列表，支持 bkmr 标签语法（逗号分隔、层级标签等） |
| `description` | string | 否 | 空字符串 | 书签描述/备注 |

### 内部行为

1. 将 `tags` 数组 join 为逗号分隔字符串，调用 `Tag::parse_tag_str` 解析为标准 Tag 集合
2. 调用 `bookmark_service.add_bookmark()`，参数 `check_existing=true, fetch_title=true`
3. 成功后通知 Tauri 前端（`bookmarks-changed` 事件）

### Response 201 Created

```json
{
  "id": 1234,
  "status": "created"
}
```

`id` 为新书签在数据库中的主键。

### Error Responses

**409 Conflict** — URL 已存在（重复检测）

```json
{
  "error": "Bookmark with URL 'https://...' already exists",
  "duplicate": true
}
```

**500 Internal Server Error** — 其他内部错误

```json
{
  "error": "bkmr add failed: ...",
  "duplicate": false
}
```

> `duplicate` 字段用于调用方快速判断是否需要替换已有书签。

---

## 更新书签

```
PUT /api/bookmarks/{id}
```

更新指定 ID 书签的标题、标签和描述。

### Path Parameters

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 书签 ID（数据库主键） |

### Request Body

```json
{
  "title": "New Title",
  "tags": ["dev", "updated"],
  "description": "Updated description"
}
```

### 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `title` | string | 否 | 新标题。不传则不更新 |
| `tags` | string[] | 否 | 新标签列表。**非空时**会完全替换现有标签；传空数组或用缺省值则不更新 |
| `description` | string | 否 | 新描述。不传则不更新 |

> **关于 `tags` 的行为**：只有 `tags` 非空（`!req.tags.is_empty()`）时才会替换标签。如果你想清空标签，当前版本不支持通过此接口设为空。留空/不传字段则保持不变。

### 内部行为

1. 查询 `bookmark_service.get_bookmark(id)`，若不存在则 404
2. 克隆现有书签对象，逐个字段覆盖（仅当请求提供了对应字段时）
3. 如果传了 `tags` 且非空，调用 `commands::to_tag_set()` 将字符串数组解析为 `HashSet<Tag>`
4. 标记 `updated_at` 为当前时间
5. 调用 `bookmark_service.update_bookmark(updated, false)`
6. 成功后通知 Tauri 前端（`bookmarks-changed` 事件）

### Response 200 OK

```json
{
  "id": 1234,
  "status": "updated"
}
```

### Error Responses

**404 Not Found**

```json
{
  "error": "Bookmark not found"
}
```

**500 Internal Server Error**

```json
{
  "error": "update failed: ..."
}
```

---

## 补充信息

### 通用错误格式

所有错误响应均返回 JSON 对象，结构如下：

```json
{
  "error": "<错误描述>"
}
```

可能存在额外字段（如 `duplicate`），视具体接口而定。

### 触发的前端事件

创建和更新操作成功后，服务端会通过 Tauri 事件系统向桌面应用前端发射 `bookmarks-changed` 事件，payload 为空。

### 数据模型参考

HTTP 接口内部使用了以下核心类型：

- **`AddBookmarkRequest`** — `{url: string, title?: string, tags: string[], description?: string}`
- **`UpdateBookmarkRequest`** — `{title?: string, tags: string[], description?: string}`
- **`Bookmark`** (domain) — 包含 `id`, `url`, `title`, `description`, `tags: HashSet<Tag>`, `updated_at`, `created_at` 等字段

标签解析依赖 `bkmr_lib::domain::tag::Tag::parse_tag_str`，支持 bkmr 原生的标签语法。
