# 设置页信息架构与路径配置重构设计

## 1. 背景

当前设置页按功能模块拆分为「通用、书签、笔记、RSS、服务、关于」六个 Tab，但实际配置量并不均衡：

- 通用页为空；
- 书签页同时承载默认导出目录与数据导入/导出；
- 笔记页只有一个目录字段；
- RSS 页只有 RSSHub 服务配置；
- 服务页只有小牛翻译配置。

这使少量配置被分散到多个入口中，路径设置和第三方服务也没有形成清晰的领域分组。本次重构以「按配置性质组织」替代「按业务模块组织」：路径集中到通用页，外部服务集中到服务页，并为 Todo 导出增加默认目录。

## 2. 目标

1. 设置页仅保留「通用、服务、关于」三个 Tab。
2. 通用页集中管理：
   - 书签默认导出目录；
   - Todo 默认导出目录；
   - Obsidian 笔记目录。
3. 通用页保留书签 JSON 导入、导出能力，但与路径配置分区展示。
4. 服务页统一管理 RSSHub 与小牛翻译。
5. Todo 导出保存对话框默认打开到配置的 Todo 导出目录。
6. 路径设置统一使用紧凑、精致的行内编辑交互，减少重复卡片和说明文本。
7. 对当前单机配置执行一次显式迁移，随后代码只支持新配置结构，不保留旧结构兼容分支。

## 3. 非目标

- 不调整 SQLite 数据库结构。
- 不改变书签 JSON 导入/导出的文件格式和后端逻辑。
- 不改变 Todo Markdown 内容格式、排序和空结果校验。
- 不新增 RSSHub 或小牛翻译的连通性测试按钮。
- 不引入多配置文件、配置版本框架或通用迁移引擎。
- 不为 Windows 文件覆盖行为增加额外处理。
- 不把路径配置做成复杂的表单向导或独立页面。

## 4. 设计原则

### 4.1 信息架构

- 「通用」管理本机路径和通用数据操作。
- 「服务」管理需要 URL、凭据或第三方访问能力的配置。
- 「关于」维持现状。
- Tab 的数量应与真实信息密度匹配，避免只有一个字段的页面。

### 4.2 交互

- 简洁不等于简陋：继续使用现有圆角、边框、背景色、文字层级、焦点环和按钮体系。
- 每个路径只占一行，不为每个路径单独创建 Card。
- 浏览路径仍使用系统目录选择器，手动输入仍被支持。
- 保存和取消必须局部作用于当前行，不影响其他路径草稿。
- 错误在当前行附近显示，不使用全局 toast 替代表单错误。

### 4.3 数据模型

- 持久化结构与页面领域结构保持一致。
- 迁移是实施前的一次性本机数据操作，而不是运行时代码路径。
- 新代码不保留 `bookmark`、`note`、`rss` 顶层旧设置字段。

## 5. 新设置结构

```json
{
  "common": {
    "paths": {
      "bookmark_export_dir": "/path/to/bookmarks",
      "todo_export_dir": "/path/to/todos",
      "notes_dir": "/path/to/obsidian"
    }
  },
  "services": {
    "rsshub": {
      "base_url": "https://rss.example.com",
      "access_key": "secret"
    },
    "niutrans": {
      "app_id": "app-id",
      "api_key": "api-key"
    }
  }
}
```

Rust 模型建议：

```rust
pub struct Settings {
    pub common: CommonSettings,
    pub services: ServiceSettings,
}

pub struct CommonSettings {
    pub paths: PathSettings,
}

pub struct PathSettings {
    pub bookmark_export_dir: Option<String>,
    pub todo_export_dir: Option<String>,
    pub notes_dir: Option<String>,
}

pub struct ServiceSettings {
    pub rsshub: RssHubSettings,
    pub niutrans: NiuTransSettings,
}

pub struct RssHubSettings {
    pub base_url: Option<String>,
    pub access_key: Option<String>,
}
```

前端 `AppSettings` 使用同构类型，不再使用 `Record<string, never>` 表示 `common`。

## 6. 一次性配置迁移

### 6.1 前提

- App 未运行；
- 当前为单机环境；
- 用户确认实施后才执行；
- 不在应用代码中加入旧结构兼容逻辑。

### 6.2 迁移映射

| 旧字段 | 新字段 |
| --- | --- |
| `bookmark.backup_dir` | `common.paths.bookmark_export_dir` |
| `note.notes_dir` | `common.paths.notes_dir` |
| 无 | `common.paths.todo_export_dir = null` |
| `rss.rsshub_base_url` | `services.rsshub.base_url` |
| `rss.rsshub_access_key` | `services.rsshub.access_key` |
| `services.niutrans` | `services.niutrans` |

### 6.3 执行步骤

1. 从 Tauri app data 目录定位真实 `settings.json`；macOS 预期位于 `~/Library/Application Support/com.bkmrx/settings.json`，但执行时以实际文件为准。
2. 只读解析原文件，确认字段形态符合预期。
3. 在同目录创建带时间戳的备份，例如 `settings.json.pre-settings-refactor-20260824.bak`。
4. 生成新结构 JSON，并使用临时文件 + rename 替换原文件。
5. 重新读取并逐字段核对迁移结果。
6. 确认备份存在且新 JSON 可被新 Rust 模型反序列化后，再开始代码改造。

若原配置文件不存在，则跳过备份与迁移，后续由新模型生成默认配置。若原文件结构与预期不符，则停止，不猜测字段含义。

## 7. 通用页设计

### 7.1 页面结构

```text
通用
管理本机路径与通用数据操作

┌ 路径配置 ──────────────────────────────────────┐
│ 书签导出目录    /Users/me/Exports/Bookmarks  [编辑] │
│ Todo 导出目录   /Users/me/Exports/Todos      [编辑] │
│ Obsidian 笔记   /Users/me/Documents/Vault    [编辑] │
└──────────────────────────────────────────────┘

┌ 书签数据 ──────────────────────────────────────┐
│ [导出 JSON] [导入 JSON]                         │
│ 最近一次操作结果或错误                           │
└──────────────────────────────────────────────┘
```

外层可以使用两张 Card 表达「路径配置」与「书签数据」两个区域；路径 Card 内部只使用三行紧凑配置，不再为每一项嵌套 Card 或重复解释段落。

### 7.2 路径行组件

新增聚焦组件，例如 `DirectorySettingRow`：

#### 查看态

```text
[Label 固定宽度] [当前路径，单行省略，中间折叠] [铅笔图标按钮]
```

- Label 左对齐，在桌面宽度下固定列宽，三行路径对齐；
- 路径占据剩余宽度，使用等宽或当前路径展示风格；
- 未配置显示「未设置」；
- 编辑按钮使用现有 `ghost` / `icon-sm` 风格，并提供可访问名称；
- 行之间使用轻量分隔线，不使用重复边框盒。

#### 编辑态

```text
[Label 固定宽度] [路径输入框] [浏览] [取消] [保存]
```

- 路径文本变成 Input；
- 浏览使用文件夹图标按钮并调用目录选择器；
- 原编辑按钮区域替换为取消、保存两个紧凑按钮；
- Enter 保存，Escape 取消；
- 保存中禁用输入、浏览、取消和重复提交；
- 保存失败时保持编辑态，在输入框下显示行内错误；
- 保存成功后返回查看态并刷新 settings query；
- 每次仅当前行进入编辑态，其他路径仍可查看。

移动端或窄宽度允许 Label、输入区域上下排列，但按钮仍保持清晰点击区域。

### 7.3 书签数据卡片

- `BookmarkTransferCard` 不再接收 `directoryField`；
- 只负责导入/导出动作、进度、预检确认和结果反馈；
- 从 `common.paths.bookmark_export_dir` 获取默认导出目录；
- 卡片说明保持一行以内，不重复解释路径设置。

## 8. 服务页设计

### 8.1 服务列表

保留当前左侧服务导航 + 右侧详情布局：

```text
内容服务
  RSSHub       已配置 / 未配置

翻译服务
  小牛翻译     已配置 / 未配置
```

- RSSHub 使用 RSS 图标或简洁字标；
- 小牛翻译沿用当前「牛」标识；
- 当前服务使用现有选中背景；
- 每个服务独立显示配置状态。

### 8.2 右侧表单

RSSHub：

- 服务地址；
- Access Key；
- Access Key 遮罩/显示；
- URL 保存前去除末尾 `/`；
- 继续由后端验证 HTTP(S) origin，不允许凭据、query 或 fragment。

小牛翻译：

- App ID；
- API Key；
- API Key 遮罩/显示；
- 保持当前重置确认交互。

两个服务的表单状态彼此独立。切换左侧服务时未保存草稿不丢失；任一服务存在草稿时，「服务」Tab 显示脏状态。保存一个服务时不得覆盖另一个服务的已保存配置。

实现上建议将 `ServicesSettings` 保持为容器，并拆分：

- `RssHubServicePanel`；
- `NiuTransServicePanel`；
- 可复用但不过度抽象的密钥输入组件仅在两处交互确实完全一致时提取。

## 9. Todo 默认导出目录

### 9.1 行为

- 配置存在：保存对话框默认路径为 `{todo_export_dir}/{日期}-待办-{标签名}.md`；
- 未配置：维持当前仅使用文件名的行为；
- 标签名继续使用现有文件名净化逻辑；
- 用户仍可在保存对话框选择其他目录；
- 空标签仍由后端拒绝导出，不创建文件。

### 9.2 路径拼接

新增共享函数，例如：

```ts
joinDirectoryAndFilename(directory: string | null | undefined, filename: string): string
```

要求：

- 空目录返回 `filename`；
- 正确处理目录末尾 `/` 或 `\\`；
- 保留目录自身使用的分隔符；
- 书签与 Todo 导出共同使用；
- 不在前端尝试解析或规范化用户的绝对路径。

Todo 导出 hook 通过 settings query 读取 `common.paths.todo_export_dir`。设置尚未加载或加载失败时，默认路径退化为文件名，不阻断导出动作。

## 10. 运行时消费者调整

| 消费者 | 旧读取位置 | 新读取位置 |
| --- | --- | --- |
| 书签导出 UI | `settings.bookmark.backup_dir` | `settings.common.paths.bookmark_export_dir` |
| Todo 导出 UI | 无 | `settings.common.paths.todo_export_dir` |
| 笔记工作区 | `settings.note.notes_dir` | `settings.common.paths.notes_dir` |
| RSS service | `settings.rss` | `settings.services.rsshub` |
| 小牛翻译 | `settings.services.niutrans` | 不变 |

`settings/store.rs` 的 RSSHub URL 校验同步改为新路径。设置读写 command 和文件位置保持不变。

## 11. 文件影响范围

### 后端

- `apps/desktop/src-tauri/src/settings/model.rs`
- `apps/desktop/src-tauri/src/settings/store.rs`
- `apps/desktop/src-tauri/src/settings/mod.rs`
- `apps/desktop/src-tauri/src/rss/service.rs`
- `apps/desktop/src-tauri/src/rss/fetcher.rs`
- `apps/desktop/src-tauri/tests/settings.rs`
- RSS fetcher/service 相关单元测试

### 前端

- `apps/desktop/src/lib/invoke.ts`
- `apps/desktop/src/lib/path.ts`
- `apps/desktop/src/lib/path.test.ts`
- `apps/desktop/src/settings/SettingsPage.tsx`
- `apps/desktop/src/settings/SettingsTabs.tsx`
- `apps/desktop/src/settings/sections/GeneralSettings.tsx`
- `apps/desktop/src/settings/sections/ServicesSettings.tsx`
- `apps/desktop/src/settings/BookmarkTransferCard.tsx`
- 新增路径行与服务面板组件
- 删除 `BookmarkSettings.tsx`、`NoteSettings.tsx`、`RssSettings.tsx`
- `apps/desktop/src/notes/use-notes-workspace.ts`
- `apps/desktop/src/todos/use-todo-export.ts`
- `apps/desktop/src/settings/SettingsPage.test.tsx`
- 笔记工作区、Todo 导出相关测试

## 12. 实施任务拆分

### Task 0：迁移前检查与本机配置迁移

**修改范围：** 当前用户的 Tauri app data `settings.json`，不改代码。

1. 确认 App 进程未运行。
2. 定位并读取真实配置文件。
3. 校验旧字段并创建带时间戳备份。
4. 按 6.2 映射写入新结构。
5. 重新读取并核对所有值。

**验收：**

- 原配置备份可恢复；
- 新配置 JSON 结构与第 5 节一致；
- 原书签路径、笔记路径、RSSHub 和小牛凭据无丢失；
- Todo 路径为 `null`；
- 若任一步失败，停止后续任务。

### Task 1：切换后端设置模型

1. 重写 Rust settings model，仅保留新结构。
2. 更新导出类型与默认实现。
3. 修改 store 中 RSSHub URL 校验路径。
4. 删除旧 `BookmarkSettings`、`NoteSettings`、`RssSettings` 类型。
5. 修改设置往返、默认值和验证测试。

**验收：** 新配置可 load/save；旧结构不作为支持格式测试；保存 JSON 不包含旧顶层字段。

### Task 2：更新 RSS 与笔记运行时消费者

1. RSS service 从 `services.rsshub` 读取配置。
2. RSS fetcher 接收/使用 `RssHubSettings`。
3. 更新 RSS URL、Access Key 相关测试。
4. 笔记工作区改读 `common.paths.notes_dir`。
5. 更新笔记 hook mocks 和测试数据。

**验收：** RSSHub 重写、鉴权和笔记目录扫描行为保持不变。

### Task 3：建立新前端设置类型与路径工具

1. 更新 `AppSettings` 类型。
2. 新增 `joinDirectoryAndFilename`。
3. 增加 `/`、`\\`、尾部分隔符、空目录测试。
4. 统一 settings mock 工厂，减少测试中重复的大对象。

**验收：** TypeScript 类型检查通过，路径工具覆盖主要平台输入。

### Task 4：实现统一路径配置交互

1. 新增 `DirectorySettingRow`。
2. 实现查看、编辑、浏览、取消、保存、pending、行内错误状态。
3. 支持 Enter/Escape 和可访问按钮名称。
4. 通用页渲染三行路径配置。
5. 保存时只更新对应路径字段，并刷新 settings query。

**验收：** 三项路径交互一致；路径行视觉对齐；一行失败不影响其他行；窄宽度不溢出。

### Task 5：迁移书签数据操作并精简导航

1. 将 `BookmarkTransferCard` 放入通用页独立区域。
2. 移除其 `directoryField` 插槽，只保留数据操作。
3. 默认导出目录改读 `common.paths.bookmark_export_dir`。
4. 设置导航删除书签、笔记、RSS Tab。
5. 删除旧 section 文件和引用。

**验收：** 只剩通用、服务、关于；书签导入、导出、预检确认和 query invalidation 全部保留。

### Task 6：合并 RSSHub 与小牛翻译服务管理

1. 将 `ServicesSettings` 改为服务容器。
2. 新增 RSSHub 与小牛翻译两个面板。
3. 实现左侧服务选择与配置状态。
4. 保留两面板独立草稿、遮罩、保存和取消/重置行为。
5. 聚合服务 Tab 的脏状态。

**验收：** 服务切换不丢草稿；结构化错误就地显示；保存任一服务不覆盖另一服务配置。

### Task 7：接入 Todo 默认导出目录

1. Todo 导出 hook 读取 settings query。
2. 使用共享路径函数生成 `defaultPath`。
3. 保留未配置和 settings 未加载时的回退。
4. 增加配置目录、无配置目录和净化标签名组合测试。

**验收：** Todo 保存对话框默认进入配置目录；实际导出 command 参数仍来自用户最终选择路径。

### Task 8：回归、视觉检查与清理

1. 更新 SettingsPage 集成测试覆盖新信息架构。
2. 运行前端全量测试和生产构建。
3. 运行 Rust settings、RSS、notes、todos 相关测试。
4. 运行格式化与 `git diff --check`。
5. 启动桌面 App，人工检查宽屏和较窄窗口下的通用页、服务页、路径编辑态和错误态。
6. 确认不存在旧设置字段、旧 Tab 文案和无引用组件。

**验收：** 自动测试全部通过；无新增构建错误；视觉层级、对齐、交互反馈符合当前设计体系。

## 13. 测试矩阵

| 范围 | 必测行为 |
| --- | --- |
| 配置迁移 | 备份、字段映射、空值、小牛凭据保留、失败停止 |
| Rust settings | 默认值、往返、RSSHub URL 校验、新 JSON 结构 |
| 路径行 | 查看、编辑、浏览、保存、取消、Enter、Escape、pending、错误 |
| 通用页 | 三项路径、独立保存、书签导入导出保留、脏状态 |
| 服务页 | 服务选择、配置状态、草稿保留、密钥遮罩、保存隔离 |
| RSS | 官方 RSSHub URL 重写、Access Key、未配置回退 |
| 笔记 | 新路径读取、未配置提示、目录扫描 |
| Todo 导出 | 配置目录、无配置回退、非法标签名净化、取消保存 |

## 14. 完成标准

- 本机旧配置已备份并成功迁移；
- 代码只包含新设置结构；
- 设置页仅有通用、服务、关于三个 Tab；
- 三项路径使用统一、紧凑且精致的行内交互；
- RSSHub 与小牛翻译在服务页统一管理；
- 书签导入导出能力无回归；
- Todo 默认导出目录生效；
- RSS、笔记、翻译和导出运行时行为无回归；
- 自动测试、生产构建、Rust 测试和视觉检查通过。
