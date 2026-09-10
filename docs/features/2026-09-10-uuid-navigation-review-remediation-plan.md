# UUID 与导航功能审查修复设计及实施计划

日期：2026-09-10

状态：待实施

范围：修复 `ac8e7ab...51f8b03` 代码审查发现的问题，并完成 GitHub Issue #9，使已提交的 UUID 与导航架构形成闭环。

## 1. 目标与完成定义

本轮同时解决四类问题：

1. Bookmark Transfer 仍是 V1 合并导入，与 Bookmark Dataset V2 ADR 直接冲突。
2. Navigation Store 水合分类时原地修改实体。
3. `NavigationPage` 同时承担查询、mutation、外链、副作用反馈和页面渲染，接口浅、变化不集中。
4. Navigation 打开书签时吞掉错误上下文，并复制了书签页已有的外链打开语义。

完成后必须满足：

- Bookmark Dataset 只支持 V2，完整导出 Bookmark 领域，使用 Entity ID 表达实体和关系。
- Bookmark Initialization 只允许初始化空的 Bookmark 领域，不预检、不合并、不兼容 V1，并在单事务内完成。
- Navigation 后端分别表达实体和读取投影，水合过程不可变。
- Navigation 页面只负责布局和组合；服务端状态、mutation、撤销和打开行为集中在领域模块内。
- 错误对用户可理解、对开发者有上下文，同时不在日志中泄露完整 URL 等潜在敏感数据。
- 每个任务都有独立测试围栏和提交边界。

## 2. 设计原则

- Bookmark 是网站数据的唯一事实来源；Navigation 只拥有 Navigation Category 和 Navigation Placement。
- 使用深模块：调用方学习少量接口，事务顺序、校验、缓存失效、撤销和错误策略隐藏在实现内部。
- SQLite 是 local-substitutable 依赖；后端测试使用内存数据库，不新增只有一个生产实现的抽象端口。
- Tauri 外链和命令调用在前端测试中已有替代实现，可在共享 Bookmark 打开模块的接口处测试。
- V2 是明确允许的 breaking change，不保留 V1 类型、命令、文案或兼容分支。
- 测试只穿过公开接口验证可见结果，不绑定 SQL 语句形状或 React 内部 state。

## 3. 目标模块与接口

### 3.1 Bookmark Dataset 模块

模块位置：`apps/desktop/src-tauri/src/bookmarks/dataset.rs`

外部接口保持三个入口：

```rust
pub struct BookmarkDatasetStore { /* Database */ }

impl BookmarkDatasetStore {
    pub fn export(&self, destination: &Path) -> AppResult<PathBuf>;
    pub fn initialization_status(&self) -> AppResult<BookmarkInitializationStatus>;
    pub fn initialize(&self, source: &Path) -> AppResult<BookmarkInitializationResult>;
}
```

接口约束：

- `export` 从一个数据库快照生成完整 V2 文件并原子写盘。
- `initialization_status` 只回答 Bookmark 和 Navigation Category 是否均为空，供界面禁用入口及说明原因。
- `initialize` 读取一份文件字节、完整解析和校验，然后在写事务内再次检查空域并写入；不使用 preview/hash 两阶段协议。
- `initialize` 返回恢复的 Bookmark 与 Navigation Category 数量；成功后调用方保持在 Application Settings。
- 不暴露解析器、校验中间类型、插入顺序或 FTS 重建步骤。

V2 根结构：

```rust
struct BookmarkDatasetV2 {
    format_version: u32, // 必须为 2
    exported_at: String,
    app_version: String,
    bookmarks: Vec<DatasetBookmark>,
    tags: Vec<DatasetBookmarkTag>,
    bookmark_tag_relations: Vec<DatasetBookmarkTagRelation>,
    navigation_categories: Vec<DatasetNavigationCategory>,
    navigation_placements: Vec<DatasetNavigationPlacement>,
}
```

所有实体记录携带原始 Entity ID；关系只使用 Entity ID。集合稳定排序规则：实体按 ID，Navigation Category 按 `order` 后 ID，Navigation Placement 按 ID。favicon、Todo、RSS、Notes 和 Application Settings 不进入文件。

### 3.2 V2 校验与事务算法

解析阶段先反序列化到严格 wire types（`deny_unknown_fields`），再转换为 `ValidatedBookmarkDataset`。写事务只接收验证后的值。

校验顺序：

1. 根版本必须等于 2，所有时间戳和字段满足领域约束。
2. 所有 Entity ID 必须是 canonical lowercase UUID v7。
3. 各实体集合内 UUID 唯一。
4. Bookmark URL、Tag name、Navigation Category normalized name 和 category order 满足唯一约束。
5. Bookmark–Tag Relation 与 Navigation Placement 自身不得重复。
6. 每个关系端点必须引用文件内实体；Navigation Placement ID 自身也必须唯一。
7. 完整通过后才允许进入数据库写事务。

事务顺序：

1. 再次检查本地 `bookmarks` 与 `navigation_categories` 都为空，否则失败。
2. 插入 Bookmark、Tag、Navigation Category 实体。
3. 插入 Bookmark–Tag Relation 与 Navigation Placement。
4. 从 Bookmark 与 Tag 关系重建完整 FTS。
5. 在提交前检查预期计数和外键一致性；任一步失败回滚整个事务。

不清理、不覆盖 Todo/RSS/Notes/Application Settings，也不删除现有数据。空域检查使“覆盖数据库”不成为实现路径。

### 3.3 Navigation 后端读取投影

当前 `NavigationCategory` 同时充当实体和携带 Bookmark 的页面投影，导致水合时修改已构造对象。调整为：

```rust
struct NavigationCategory { id, name, order, created_at, updated_at }
struct NavigationPlacementCard { placement_id, bookmark_id, title, url, created_at }
struct NavigationSection { category: NavigationCategory, cards: Vec<NavigationPlacementCard> }
```

`NavigationStore::list_sections()` 直接构造 `NavigationSection`，不先创建可变 Category 再补字段。CRUD 返回 `NavigationCategory`，页面列表返回 `NavigationSection`。这样实体、关系和读取投影职责明确，也避免使用领域词汇中不推荐的 `NavigationBookmark`。

写接口维持最小集合：

```rust
create_category(input) -> NavigationCategory
rename_category(id, input) -> NavigationCategory
delete_category(id) -> ()
add_bookmarks(category_id, bookmark_ids) -> Vec<NavigationPlacementCard>
remove_bookmark(category_id, bookmark_id) -> ()
```

撤销仍调用 `add_bookmarks`，按已确认规格生成新的 Navigation Placement 并排到末尾。

### 3.4 Navigation 前端模块

把服务器状态和副作用收拢到 `use-navigation-controller.ts`。其接口只向页面暴露：

```ts
type NavigationController = {
  sections: NavigationSection[];
  loadState: 'loading' | 'error' | 'ready';
  category: CategoryCommands;
  placement: PlacementCommands;
};
```

controller 隐藏 React Query keys、mutation、缓存失效、撤销 toast 及 pending 判定。短生命周期的文本输入和 Dialog 开关由对应展示模块自己拥有，不塞入 Query 缓存。

页面拆分为：

```text
navigation/
  NavigationPage.tsx              # 页面布局、空态和模块组合
  use-navigation-controller.ts    # 查询、mutation、缓存、撤销与反馈
  NavigationCategoryComposer.tsx  # 新建分类输入
  NavigationSectionView.tsx       # 单分类标题、操作和卡片网格
  BookmarkPickerDialog.tsx        # 搜索与多选现有 Bookmark
  NavigationPlacementCard.tsx     # 单个 Navigation Placement 的卡片呈现
  navigation.api.ts               # Tauri 命令 adapter 与 query key
```

`NavigationPage` 不再直接声明 mutation 或外链调用。拆分目标由职责和数据所有权决定，而不是仅追求文件变短。

### 3.5 共享 Bookmark 打开模块

书签页和 Navigation 必须通过同一模块打开 Bookmark：

```ts
async function openBookmark(bookmark: Pick<Bookmark, 'id' | 'url'>): Promise<void>
```

实现先调用系统浏览器；成功后记录访问。打开失败抛出带 Bookmark ID 的领域错误，由 controller 显示用户友好 toast。访问记录失败不把已经成功的打开显示成失败，但记录 Bookmark ID、操作名和原始异常；日志不包含完整 URL。

该模块替换 `use-bookmark-navigation.ts` 与 `NavigationPage.tsx` 中重复的打开/计数逻辑。测试在此接口处替换 Tauri adapters，页面测试不再了解两个底层调用的先后细节。

## 4. 实施任务与提交边界

### T0：建立失败测试围栏

- 将现有 V1 merge 测试替换为 Issue #9 的 V2 round-trip、空域、V1 拒绝、重复 ID/自然键/关系、悬空关系和事务回滚测试。
- 增加 Application Settings 初始化入口禁用、成功计数及保留当前页面测试。
- 为共享 Bookmark 打开行为增加成功、打开失败、访问记录失败测试。

完成条件：新测试能在现有实现上准确失败，既有 UUID、Navigation、Bookmark 行为测试继续通过。

建议提交：`test: define dataset v2 and navigation remediation behavior`

### T1：实现 Bookmark Dataset V2 深模块

- 新增 V2 wire types、完整校验和稳定快照导出。
- 实现空域状态查询和单事务初始化。
- 删除 `BookmarkExportV1`、merge structs、preview/hash、URL 合并和旧测试。
- Tauri commands 与 TypeScript adapter 改为 Dataset/Initialization 术语。

完成条件：V2 导出→空库初始化→再导出保留所有 Entity ID、关系、时间和顺序；所有拒绝路径不修改数据库。

建议提交：`feat(bookmarks): replace import merging with dataset v2 initialization`

### T2：更新 Application Settings 初始化体验

- 标题改为“书签数据集”，操作改为“导出数据集 / 初始化书签”。
- 仅当 Bookmark 与 Navigation Category 均为空时启用初始化按钮。
- 移除预检确认流程；文件选择后直接调用初始化，失败保留错误，成功显示 Bookmark/Navigation Category 数量。
- 成功后失效 Bookmark、Tag 与 Navigation queries，不进行页面跳转。

完成条件：非空域无法从 UI 发起且 Rust 接口仍二次拒绝；界面无“导入、合并、更新、跳过”遗留文案。

建议提交：`feat(settings): expose bookmark initialization workflow`

### T3：修正 Navigation 后端模型与不可变水合

- 分离 Navigation Category 实体、Navigation Placement 卡片投影和 Navigation Section。
- `list_categories` 改为 `list_sections`，一次构造完整不可变结果。
- 更新 Tauri/TypeScript 类型和 Store 公开行为测试。

完成条件：无实体原地修改，Category CRUD 与 Placement 顺序、去重、级联语义不变。

建议提交：`refactor(navigation): separate entities from section projections`

### T4：深化 Navigation 前端模块并统一打开行为

- 抽取共享 Bookmark 打开模块。
- 抽取 Navigation controller、分类创建和单分类展示模块。
- controller 统一错误上下文、用户提示、缓存失效、pending 和撤销。
- 页面测试保留可见行为断言；controller/共享打开模块测试覆盖副作用与错误路径。

完成条件：`NavigationPage` 只组合页面模块；异常不被无上下文吞掉；书签页与 Navigation 使用同一打开语义。

建议提交：`refactor(navigation): centralize workflow and bookmark opening`

### T5：整体回归、文档和发布修正

- 搜索并移除生产代码、类型、测试和 UI 中残留的 V1/import/merge/preview 术语。
- 核对 ADR、CONTEXT、Issue #9 与实现一致；按实际发布策略更新 Changelog 和版本号。
- 执行安全扫描，确认 Dataset 错误和日志不泄露文件内容、Bookmark URL 或凭据。
- 运行全量验证，并人工执行一次导出与全新空库初始化。

建议提交：`chore: document bookmark dataset v2 remediation`

## 5. 测试矩阵

| 层级 | 必测行为 |
| --- | --- |
| Entity ID | UUID v7 生成、canonical 解析、Rust 强类型、TypeScript brand |
| Dataset export | 五个集合完整、UUID 关系、稳定顺序、排除非 Bookmark 领域 |
| Dataset validation | 版本、UUID、重复实体、自然键、重复关系、悬空端点、字段约束 |
| Initialization | 双空条件、原 UUID 保留、实体先于关系、FTS 重建、失败全回滚 |
| Navigation Store | 不可变读取投影、CRUD、去重、多分类、级联和 Placement 顺序 |
| Shared open | 打开成功后记录、打开失败不记录、计数失败有上下文且不否定打开成功 |
| Navigation UI | 加载/错误/空态、分类 CRUD、搜索多选、打开、移除、撤销、favicon fallback |
| Settings UI | 空域启用、非空禁用、初始化结果计数、失败反馈、保持当前页面 |

发布前命令：

```bash
cd apps/desktop/src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test

cd ..
npm test -- --run
npm run build
```

若 Rust 全量测试再次受本机端口或网络时序影响，必须单独运行失败测试并记录环境证据；不得用定向测试通过替代未说明的全量失败。

## 6. 风险与控制

| 风险 | 等级 | 控制 |
| --- | --- | --- |
| V2 文件部分合法时写入半套关系 | 高 | 写前完整校验 + 单事务 + 强制失败回滚测试 |
| 非空库被初始化覆盖 | 高 | UI 状态门禁 + Rust 事务内二次空域检查 |
| Entity ID 或关系在 round-trip 中变化 | 高 | 双向导出比较 UUID、关系和排序 |
| FTS 与初始化后的 Tag 关系不一致 | 高 | 初始化后通过真实搜索接口验证，并比较重建计数 |
| Navigation 拆分引入缓存或撤销回归 | 中高 | controller 接口测试 + 页面行为测试，先固定后移动 |
| 错误日志泄露带凭据 URL 或 Dataset 内容 | 中高 | 只记录 operation、Entity ID 和错误类别，不记录原始文件内容/完整 URL |
| 一次提交同时混入契约替换和 UI 重构 | 中 | 严格按 T0–T5 提交边界推进 |

## 7. 明确不做

- 不兼容 V1，不保留 V1 parser 或转换器。
- 不实现导入 preview、hash 确认、merge、update、skip 或冲突解决。
- 不初始化非空 Bookmark 领域，也不提供清库入口。
- 不导出 Todo、RSS、Notes、Application Settings 或 favicon。
- 不增加 Navigation 分类排序 UI、Bookmark 手动排序或 Bookmark 管理入口。
- 不为只有一个实现的 SQLite 访问增加仓储 trait 或额外 adapter 层。
