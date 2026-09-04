# 通用能力 Provider 架构实施计划

本计划以 [通用能力 Provider 架构设计](./2026-09-04-provider-architecture-design.md) 为架构基线，第一阶段目标是完成翻译 Provider 的注册、发现、激活、停用和无重启热切换闭环。

任务按依赖顺序组织。每个任务应形成可独立评审的提交，并遵循“失败测试 → 最小实现 → 定向回归”的顺序。

## 1. 本阶段范围

### 1.1 纳入范围

- 将小牛翻译实现从现有单文件中拆出；
- 建立 Provider 通用元数据和应用级 `ProviderContext`；
- 建立强类型 `TranslationProviderFactory` 与 `TranslationRegistry`；
- 使用 `arc-swap` 发布不可变 `TranslationRoute`；
- 应用级复用同一个 `reqwest::Client`；
- 增加翻译 primary/fallback 配置结构；
- 支持运行时激活、切换和停用 primary Provider；
- 配置更新采用 `prepare -> save -> commit`；
- 后端提供 Provider 发现与状态；
- 前端展示已配置、已激活、未激活和未配置状态；
- 保持 Chrome 扩展现有翻译 API 契约兼容。

### 1.2 暂不纳入

- 不实现自动 Fallback 执行，只保存并校验有序 fallback 配置；
- 不接入第二个真实翻译供应商；使用测试 Provider 验证可扩展性；
- 不建立 AI Provider 空模块；等真实 AI 接入时再提取第二种能力的重复部分；
- 不迁移 Keychain。本阶段先收紧前端读取边界，Keychain 作为独立安全任务实施；
- 不支持外部动态插件、WASM、动态链接库或脚本 Provider；
- 不让前端根据后端 schema 动态生成供应商凭据表单。

### 1.3 第一阶段完成定义

完成后必须满足：

- 翻译调用方不知道当前供应商；
- `TranslationService` 不读取 settings 文件、不构造 `NiuTransProvider`；
- 配置保存后，新请求立即使用新路由；
- 停用后新翻译请求返回稳定 unavailable 错误；
- 配置或 Provider 构造失败时，磁盘和当前运行时均保持旧状态；
- 所有普通 Provider 复用应用级 HTTP Client；
- 路由快照包含 primary、fallback 列表和策略预留，但本阶段只执行 primary；
- 新增测试 Provider 不需要修改 `TranslationService`。

## 2. 任务依赖图

```text
T1 翻译模块拆分与基线测试
 ├─→ T2 Provider 公共模型与共享 Context
 │     └─→ T4 Translation Factory 与 Registry
 └─→ T3 配置模型、兼容读取与迁移
       └─→ T4 Translation Factory 与 Registry

T2 + T3 + T4
 └─→ T5 ArcSwap TranslationRuntime
       └─→ T6 SettingsService 事务与应用接线
             ├─→ T7 Provider 发现和管理命令
             └─→ T8 前端激活、切换和停用

T7 + T8
 └─→ T9 集成回归、迁移验证与架构审计
```

建议实施批次：

| 批次 | 任务 | 可并行性 |
|---|---|---|
| A | T1 | 单独完成，建立移动代码的测试基线 |
| B | T2、T3 | 可并行，但合并前统一配置命名 |
| C | T4、T5 | 顺序完成 |
| D | T6 | 单独完成，涉及运行时一致性 |
| E | T7、T8 | 后端契约确定后可部分并行 |
| F | T9 | 最终统一验证 |

## 3. T1：翻译模块拆分与基线测试

### 目标

在不改变行为和外部 API 的前提下，把通用翻译模型、服务和小牛供应商实现拆开，为后续重构建立清晰边界。

### 工作

- 将 `apps/desktop/src-tauri/src/translation.rs` 调整为 `translation/` 模块；
- 拆出：
  - `translation/model.rs`：请求和响应；
  - `translation/error.rs`：稳定错误码；
  - `translation/provider.rs`：`TranslationProvider`；
  - `translation/service.rs`：现有 Facade；
  - `translation/providers/niutrans.rs`：签名、DTO 和 HTTP 调用；
- 保持 `crate::translation::{TranslationRequest, TranslationService}` 等现有公开路径兼容；
- 将小牛签名测试和配置构建测试移动到对应模块；
- 保持 HTTP `/api/translations` 请求、响应和错误 envelope 不变；
- 不在此任务引入 Registry、`arc-swap` 或新配置字段。

### 测试围栏

- 小牛签名参数顺序不变；
- 空文本和超长文本校验不变；
- `TranslationService` 仍可委派给测试 Provider；
- 翻译 HTTP API 错误 envelope 不变；
- Chrome 扩展翻译请求和响应类型不变。

### 验证命令

```bash
cd apps/desktop/src-tauri
cargo test translation
cargo test http_server
cd ../../..
pnpm --filter bkmrx-ext test
```

### 完成条件

模块职责完成拆分，未引入任何功能变化，现有定向测试通过。

## 4. T2：Provider 公共模型与共享 Context

### 目标

建立可供翻译和未来 AI 复用的最小 Provider 基础设施，不引入弱类型业务调用接口。

### 工作

- 新增 `providers/` 模块；
- 定义 `ProviderId`、`Capability`、`ProviderDescriptor`；
- 为 `ProviderId` 增加非空、格式和长度校验；
- 定义只包含非敏感静态信息的 Provider Catalog view；
- 定义 `ProviderContext`；
- 在应用启动阶段使用 `reqwest::Client::builder()` 构造唯一默认 Client；
- 明确 Client 构造失败的稳定启动错误；
- Factory 只能 clone Context 中的 Client，禁止创建默认 Client；
- 暂不抽象通用 `ProviderFactory<T>`，避免复杂泛型早于真实复用需求。

### Provider ID 约束

建议规则：

- 仅允许 ASCII 小写字母、数字和连字符；
- 首字符必须是字母；
- 长度限制为 1～64；
- 持久化 ID 不随品牌展示名称改变。

### 测试围栏

- 合法 Provider ID 可以序列化往返；
- 空值、大小写、空白和非法字符被拒绝；
- Descriptor 不包含凭据字段；
- clone 出来的 `reqwest::Client` 可跨 Factory 共享；
- 应用级 Client 构造失败能够显式上报，而非 panic。

### 验证命令

```bash
cd apps/desktop/src-tauri
cargo test providers
```

### 完成条件

通用模型不依赖翻译或 AI 请求类型，且没有出现 `execute(Value)` 一类弱类型入口。

## 5. T3：配置模型、兼容读取与迁移

### 目标

将“供应商凭据”和“能力当前选择”分离，同时安全读取现有用户的 `services.niutrans` 配置。

### 目标配置

第一阶段建议保持内置 Provider 配置强类型：

```rust
pub struct Settings {
    pub common: CommonSettings,
    pub capabilities: CapabilitySettings,
    pub providers: ProviderSettings,
}

pub struct CapabilitySettings {
    pub translation: ProviderRouteSettings,
}

pub struct ProviderRouteSettings {
    pub primary_provider: Option<ProviderId>,
    pub fallback_providers: Vec<ProviderId>,
}

pub struct ProviderSettings {
    pub niutrans: NiuTransSettings,
}
```

### 工作

- 增加 `capabilities.translation.primary_provider`；
- 增加默认空的 `fallback_providers`；
- 将新配置写入 `providers.niutrans`；
- 为旧 `services.niutrans` 增加显式兼容读取；
- 旧配置中 app ID 和 API key 均为非空时，迁移后的 primary 为 `niutrans`；
- 凭据不完整时 primary 为 `None`；
- 新旧字段同时存在时，以新字段为准，避免旧值覆盖用户新配置；
- 保存时只输出新结构；
- 校验 primary/fallback 不重复、fallback 内部不重复；
- 校验路由引用的 Provider 已注册和配置完整，此项可以在 T6 的 `prepare` 中完成；
- 明确未知字段策略：本阶段至少保证读取旧结构，不承诺任意未来 Provider 配置的无损往返；
- 给设置结构增加 schema version，后续迁移不得继续依靠字段存在性猜测版本。

### 安全边界

- 本阶段不实施 Keychain；
- 后端内部仍可读取完整凭据；
- 新增供 UI 使用的设置 DTO 时不返回完整 API key，只返回 `configured` 或掩码；
- 写入接口使用“未修改 secret / 替换 secret / 删除 secret”的明确语义，不能用掩码覆盖真实值。

### 测试围栏

- 当前 settings 文件可以无损迁移到新模型；
- 凭据完整时自动激活小牛，保持现有用户行为；
- 凭据不完整时不激活；
- 新旧字段同时存在时使用新结构；
- 缺失 capabilities/providers 时使用稳定默认值；
- primary/fallback 重复配置被拒绝；
- 新配置序列化后不再输出旧 `services.niutrans`；
- UI 查询 DTO 不包含完整 API key；
- schema version 可以稳定往返。

### 验证命令

```bash
cd apps/desktop/src-tauri
cargo test --test settings
cargo test settings
```

### 完成条件

现有用户无需手工编辑配置即可保持小牛翻译可用，新配置能够表达激活、停用和 fallback 顺序。

## 6. T4：Translation Factory 与 Registry

### 目标

让小牛 Provider 的验证和构造离开 `TranslationService`，通过强类型 Registry 完成发现和实例化。

### 工作

- 定义 `TranslationProviderFactory`；
- 定义 `TranslationRegistry`；
- 实现重复 ID 检测、descriptor 枚举、Factory 查找和 build；
- 实现 `NiuTransProviderFactory`；
- 将小牛凭据校验从 `NiuTransProvider::from_settings` 移到 Factory；
- Factory 使用 `ProviderContext` 中的共享 Client；
- `NiuTransProvider` 不再拥有构建配置或读取 settings 的职责；
- Registry 返回稳定的 unknown provider、invalid config 和 build failure 错误；
- 使用测试 Factory 证明新增 Provider 不需要修改 Registry 核心逻辑。

### 测试围栏

- 重复 Provider ID 注册失败；
- 能枚举小牛 descriptor；
- 未注册 ID 构建失败；
- 小牛配置缺少任一凭据时验证失败；
- 小牛 Factory 使用传入的共享 Client；
- 测试 Provider 可以注册、发现和构建；
- Registry 和 Factory 日志不输出 secret。

### 验证命令

```bash
cd apps/desktop/src-tauri
cargo test translation::registry
cargo test translation::providers
```

### 完成条件

具体 Provider 只通过注册进入系统，`TranslationService` 不包含任何小牛构造分支。

## 7. T5：ArcSwap TranslationRuntime

### 目标

以不可变路由快照承载当前翻译 Provider，实现无锁读取和原子切换。

### 工作

- 在 `Cargo.toml` 增加锁定兼容版本的 `arc-swap`；
- 定义有尺寸的 `TranslationRoute`，内部持有：
  - primary Provider；
  - 有序 fallback Provider 列表；
  - fallback policy 预留；
- 定义 `TranslationRuntime`，使用 `ArcSwapOption<TranslationRoute>`；
- `None` 表示翻译能力停用；
- 提供 `current()`、`publish()` 和 `disable()` 等最小操作；
- `TranslationService` 只校验输入并调用 Runtime；
- 本阶段 Runtime 只执行 primary，不自动尝试 fallback；
- 移除每次请求读取 settings 和创建 HTTP Client 的逻辑；
- Provider ID 仅用于响应诊断与日志，业务调用方不得据此分支。

### 并发语义测试

- 未发布路由时返回 unavailable；
- 发布 A 后新请求使用 A；
- 原子切换到 B 后新请求使用 B；
- 切换时已经取得 A 快照的请求继续完成；
- disable 后新请求 unavailable；
- disable 不取消已经开始的请求；
- primary 与 fallback 总是来自同一个快照；
- 连续切换不会形成失效引用或 panic。

测试中使用 barrier/channel 控制请求时序，不依赖 sleep 猜测并发顺序。

### 验证命令

```bash
cd apps/desktop/src-tauri
cargo test translation::runtime
cargo test translation::service
```

### 完成条件

翻译读路径不获取 `RwLock`，热切换语义有确定性并发测试保护。

## 8. T6：SettingsService 事务与应用接线

### 目标

保证配置文件和运行时路由一致，并让 Tauri Command 与本地 HTTP Server 使用同一个 `TranslationService` 实例。

### 工作

- 将 `settings::load/save` 包装为可注入的 `SettingsStore`；
- 新增 `SettingsService`；
- 新增 `ProviderManager::prepare`：
  - 验证路由 ID；
  - 验证 Provider 配置；
  - 在当前路由之外构造完整 next route；
- 新增 `ProviderManager::commit`：只原子发布已经构造完成的快照；
- `SettingsService::update` 严格执行 `prepare -> save -> commit`；
- 应用启动时 load settings，并通过相同 prepare/commit 初始化路由；
- `main.rs` 构造共享 Client、Registry、Runtime、ProviderManager、SettingsService；
- 将同一个 `TranslationService` clone 注入 Axum `HttpState`；
- 移除 `TranslationService::from_settings_path`；
- `update_settings` Command 改为异步调用 `SettingsService`；
- 保留现有 settings 文件原子写入行为；
- 启动配置无效时记录稳定错误并停用对应能力，不泄露凭据；是否阻止应用启动由实现前确认，默认不阻止应用其他功能启动。

### 一致性测试

- prepare 失败：不保存、不切换；
- Provider build 失败：不保存、不切换；
- settings 保存失败：不切换；
- 保存成功：立即切换；
- 停用配置保存成功：立即发布 None；
- 应用启动可以恢复已激活路由；
- Tauri 更新配置后，本地 HTTP Server 的下一次请求看到新 Provider；
- Tauri 和 HTTP Server 不各自创建独立 Runtime 或 Client。

### 验证命令

```bash
cd apps/desktop/src-tauri
cargo test settings_service
cargo test provider_manager
cargo test http_server
cargo test --test settings
cargo test --test http_api
```

### 完成条件

磁盘配置与运行时切换形成事务边界，所有翻译入口共享同一条运行时路由。

## 9. T7：Provider 发现和管理命令

### 目标

向前端提供稳定的 Provider 发现、状态和切换契约，不暴露内部实例或完整凭据。

### 第一阶段命令

```text
list_providers()
get_provider_settings()
update_provider_settings(provider_id, patch)
activate_provider(capability, provider_id)
deactivate_provider(capability)
set_fallback_providers(capability, provider_ids)
```

是否继续保留通用 `update_settings`：

- 普通路径和非 Provider 设置可以继续使用；
- Provider 凭据与激活状态必须进入 `SettingsService`；
- 不允许存在一个绕过 prepare/commit、直接覆盖 Provider 配置的写入口。

### 工作

- 定义 `ProviderStatusView`；
- 返回 descriptor、configured、activation 和最近健康状态；
- configured 根据后端完整配置计算，不返回 secret；
- 激活前完成注册、配置与重复项校验；
- 停用是显式操作，不通过清空凭据隐式实现；
- fallback 顺序写入配置，但本阶段状态明确标记为“已配置、尚未启用自动降级”；
- 错误使用稳定 code，不让前端解析错误字符串；
- 将新 Command 注册到 Tauri invoke handler；
- 更新 TypeScript 调用类型。

### 测试围栏

- list 能发现小牛 Provider；
- 未配置、未激活、primary、fallback 状态准确；
- list/get 不返回完整 API key；
- 未注册 Provider 无法激活；
- 配置不完整 Provider 无法激活；
- 停用不会删除凭据；
- Provider 更新不能绕过事务；
- fallback 重复或包含 primary 时返回稳定错误码。

### 验证命令

```bash
cd apps/desktop/src-tauri
cargo test provider_commands
cd ../../..
pnpm --filter bkmrx exec vitest run src/settings/settings.api.test.ts
```

### 完成条件

前端能够完全通过后端返回的状态渲染 Provider，并安全执行配置、激活与停用。

## 10. T8：前端激活、切换和停用

### 目标

让用户清楚区分“已配置”和“正在使用”，并能显式切换或停用翻译 Provider。

### 工作

- 将服务导航的供应商元数据改为由 `list_providers` 驱动；
- 内置 Provider ID 到配置面板组件的映射仍保留在前端；
- 小牛面板展示：
  - 未配置；
  - 已配置、未启用；
  - 当前主供应商；
  - 备用供应商；
  - 配置异常；
- 增加“启用”“设为主供应商”“停用翻译”动作；
- 保存凭据和激活分为明确动作；保存凭据不能隐式抢占当前 Provider；
- 首次从旧配置迁移时，后端迁移规则保证当前行为不变；
- secret 输入使用保留/替换/删除语义，不把掩码字符串回写；
- mutation 成功后统一失效 settings/provider status 查询；
- mutation 失败保留用户输入并展示稳定错误；
- fallback 排序 UI 不在本阶段实现；已有 fallback 只读显示即可。

### 测试围栏

- 已配置不等于已启用；
- 未配置 Provider 不能启用；
- 启用后状态立即更新；
- 切换失败时旧 Provider 仍显示为 active；
- 停用后凭据仍保留；
- API key 掩码不会作为新值提交；
- 保存新 key、保留旧 key、删除 key 三条路径明确；
- Provider 列表新增测试 descriptor 后导航无需新增状态分支；
- 现有 RSSHub 设置行为无回归。

### 验证命令

```bash
pnpm --filter bkmrx exec vitest run src/settings/SettingsPage.test.tsx
pnpm --filter bkmrx test
```

### 完成条件

用户能够安全、明确地配置、激活、切换和停用翻译 Provider，界面不再将“凭据完整”当作“已启用”。

## 11. T9：集成回归、迁移验证与架构审计

### 目标

证明第一阶段闭环成立，并确认没有绕过 Provider Runtime 的遗留生产路径。

### 自动化验证

```bash
cd apps/desktop/src-tauri
cargo fmt --check
cargo test
cargo check
cargo check --release
cd ../../..
pnpm --filter bkmrx test
pnpm --filter bkmrx build
pnpm --filter bkmrx-ext test
pnpm --filter bkmrx-ext build
```

### 架构审计

- `TranslationService` 不引用 `NiuTransProvider`、settings path 或具体 Provider 配置；
- HTTP handler 不按 Provider ID 分支；
- 只有启动装配代码知道所有内置 Factory；
- 所有 HTTP Provider 使用 Context Client；
- Factory 中不存在 `reqwest::Client::new()`；
- Provider 配置写入无法绕过 `SettingsService`；
- Runtime 路由只通过原子快照发布；
- Provider list/settings DTO 不返回完整 secret；
- 日志不包含 API key、Authorization 或翻译正文；
- fallback 本阶段没有被意外执行；
- Chrome 扩展 `/api/translations` 契约保持兼容。

### 人工验收

1. 使用旧版 settings 启动应用，小牛翻译保持可用；
2. 停用翻译，扩展下一次翻译收到 unavailable；
3. 重新启用小牛，无需重启即可恢复；
4. 编辑无关设置，不影响当前 Provider；
5. 输入不完整凭据，保存/激活失败且旧 Provider 继续工作；
6. 清除 API key 前得到明确影响提示；
7. 页面只显示掩码，不显示完整 API key；
8. 连续切换和停用不会导致应用 panic 或 HTTP Server 重启。

### 完成条件

全部自动化验证通过，人工验收完成，设计文档中的第一阶段验收标准全部满足。

## 12. 后续独立任务

以下内容不应夹带进入 T1～T9：

### F1：翻译自动 Fallback

- 完成 `ProviderFailureKind` 和 `Retryability`；
- 支持有序 fallback 执行；
- 限制最大尝试次数；
- 记录完整尝试链；
- 只对 timeout、transport、rate limit 等允许的错误降级。

### S1：Secret Store / Keychain

- 选定 macOS Keychain 接入方案；
- 将 settings 中的 secret 替换为 reference；
- 设计可恢复迁移与回滚；
- 确保删除 Provider 配置时同步处理孤立 secret；
- 补充升级、降级和权限失败测试。

### A1：首个 AI Provider

- 基于真实用例定义 `AiProvider`；
- 明确普通生成、流式、模型发现和 tool call 边界；
- 建立独立 AI Registry、Runtime 和 Facade；
- 从翻译与 AI 的真实重复中提取通用 ProviderManager 能力。

### P1：外部 Provider 插件协议

只有在出现安装第三方 Provider 的真实需求后启动，独立评估进程隔离、权限、签名、版本协商和资源限制。

## 13. 实施约束

- 不为未来需求创建未使用的 AI 空类型或空目录；
- 不使用 `serde_json::Value` 作为翻译业务接口；
- 不在 Provider 内部实现隐藏 fallback；
- 不在持锁状态下构造 Provider 或执行网络请求；
- 不依赖 sleep 验证并发切换；
- 不以展示文案或错误字符串作为程序分支条件；
- 不在本轮顺手重构 RSSHub；它可以在 Provider 框架稳定后另行评估是否属于同类能力；
- 每项修改必须能追溯到本计划的具体任务和验收条件。

## 14. 实施状态（2026-09-04）

| 任务 | 状态 | 说明 |
|---|---|---|
| T1 | 已完成 | 翻译模块已拆分，外部 HTTP 契约保持兼容 |
| T2 | 已完成 | 已增加 Provider 公共模型和应用级共享 HTTP Client |
| T3 | 已完成 | 已增加 schema version、能力路由、`providers.niutrans` 与旧配置迁移 |
| T4 | 已完成 | 已增加强类型 Translation Factory/Registry 和通用状态判断 |
| T5 | 已完成 | 已使用 `ArcSwapOption<TranslationRoute>` 实现激活、切换和停用 |
| T6 | 已完成 | 已实现 `prepare -> save -> commit`，Tauri 与 HTTP Server 共享 Runtime |
| T7 | 部分完成 | 已提供发现、激活和停用命令；独立凭据 patch 与 fallback 排序命令待后续任务 |
| T8 | 已完成（primary） | UI 已区分配置/激活状态并支持启用、停用；fallback 排序按范围约定延期 |
| T9 | 自动验证完成 | Rust、桌面端和扩展端全量测试及构建通过；人工 GUI 验收待执行 |

当前已知范围偏差：

- Keychain 和 secret-only DTO 按 S1 延期，因此现有设置读取链路仍会把凭据交给受信任的 Tauri WebView；
- 自动 Fallback 按 F1 延期，当前路由会构造并原子保存 fallback 快照，但只执行 primary；
- Provider 凭据保存暂时复用事务化 `update_settings`，激活和停用已经使用独立命令，不会把完整 settings 作为切换请求重新提交。
