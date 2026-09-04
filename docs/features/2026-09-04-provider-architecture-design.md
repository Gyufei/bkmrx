# 通用能力 Provider 架构设计

## 1. 背景

当前翻译模块已经通过 `TranslationProvider` trait 隔离了供应商调用协议，但生产路径仍由 `TranslationService` 直接读取小牛翻译配置、构造 `NiuTransProvider`，并将当前供应商隐式固定为 `niutrans`。

后续系统需要支持：

- 上层调用翻译或 AI 能力时，不感知具体供应商；
- 用户可以配置多个供应商，并动态激活、切换或停用；
- 切换不要求重启应用，进行中的请求不被中断；
- 翻译和 AI 复用注册、发现、配置、生命周期及状态管理机制；
- 翻译和 AI 保留各自的强类型业务接口；
- 为主供应商失败后的可控降级预留扩展点。

本文描述目标架构和渐进式落地方案，不包含运行时动态加载第三方二进制插件。

## 2. 设计结论

采用以下结构：

> 通用 Provider Catalog + 按能力划分的强类型 Registry + 原子路由快照 + 能力 Facade

```text
HTTP / Tauri Command / Domain Service
                  │
          ┌───────┴────────┐
          ▼                ▼
 TranslationService     AiService              能力 Facade
          │                │
          ▼                ▼
 TranslationRuntime     AiRuntime               原子路由快照
          │                │
          ▼                ▼
 TranslationRegistry    AiRegistry              强类型构建工厂
          └───────┬────────┘
                  ▼
       ProviderCatalog / ProviderContext        通用基础设施
```

不设计一个接收任意 JSON 的万能 `Provider::execute`。翻译和 AI 的请求、响应、错误及流式能力不同，强行统一会丢失类型安全。共享部分只包括 Provider 身份、元数据、注册发现、配置、激活状态、实例生命周期和可观测性。

## 3. 目标与非目标

### 3.1 目标

- 业务上层只依赖 `TranslationService` 或 `AiService`；
- 新增内置供应商时，不修改能力 Facade；
- 配置保存成功后立即切换运行时 Provider；
- Provider 实例和 HTTP 连接池可以跨请求复用；
- 配置无效或新实例构造失败时，旧实例继续服务；
- 能够查询已注册、已配置、已激活及异常状态；
- 错误模型能够区分是否适合重试或降级。

### 3.2 非目标

- 第一阶段不支持动态链接库、WASM 或脚本形式的外部 Provider；
- 不通过 `serde_json::Value` 统一所有能力调用；
- 不默认对所有错误执行跨供应商重试；
- 不在 Provider Registry 中承载业务编排、提示词或领域规则；
- 不因为规划 AI 能力而提前扩展现有翻译请求模型。

## 4. 核心概念

### 4.1 Provider 标识

使用字符串 newtype，而不是全局枚举。这样新增 Provider 不要求修改框架核心枚举，同时仍避免业务代码散落裸字符串。

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ProviderId(String);
```

内置 Provider 在各自模块声明稳定 ID，例如 `niutrans`、`openai`。ID 一旦进入持久化配置，不应随展示名称变化。

### 4.2 能力标识

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    Translation,
    Ai,
}
```

能力枚举描述应用已支持的领域能力。一个供应商将来可以同时为多个能力提供实现，但每个实现分别注册到对应的强类型 Registry。

### 4.3 Provider 元数据

```rust
pub struct ProviderDescriptor {
    pub id: ProviderId,
    pub capability: Capability,
    pub display_name: &'static str,
    pub description: &'static str,
}
```

Descriptor 用于后端发现和前端列表展示，不包含凭据、客户端实例或其他敏感运行时状态。

## 5. 强类型能力接口

### 5.1 翻译

```rust
#[async_trait]
pub trait TranslationProvider: Send + Sync {
    fn id(&self) -> &ProviderId;

    async fn translate(
        &self,
        request: TranslationRequest,
    ) -> Result<Translation, TranslationError>;
}
```

`TranslationService` 是唯一提供给 HTTP、Tauri Command 和领域层的入口：

```rust
pub struct TranslationService {
    runtime: Arc<TranslationRuntime>,
}

impl TranslationService {
    pub async fn translate(
        &self,
        request: TranslationRequest,
    ) -> Result<Translation, TranslationError> {
        validate_request(&request)?;
        self.runtime.execute(request).await
    }
}
```

调用方不读取 Provider 配置、不解析 Provider ID，也不构造 Provider。

### 5.2 AI

AI 能力独立定义接口：

```rust
#[async_trait]
pub trait AiProvider: Send + Sync {
    fn id(&self) -> &ProviderId;

    async fn complete(
        &self,
        request: CompletionRequest,
    ) -> Result<CompletionResponse, AiError>;

    async fn models(&self) -> Result<Vec<AiModel>, AiError>;
}
```

流式响应应使用 AI 领域自己的 `CompletionStream`，不进入通用 Provider 接口。

## 6. Factory 与 Registry

每种能力拥有强类型 Factory：

```rust
pub trait TranslationProviderFactory: Send + Sync {
    fn descriptor(&self) -> ProviderDescriptor;

    fn validate(
        &self,
        config: &TranslationProviderConfig,
    ) -> Result<(), ProviderConfigError>;

    fn build(
        &self,
        config: &TranslationProviderConfig,
        context: &ProviderContext,
    ) -> Result<Arc<dyn TranslationProvider>, ProviderBuildError>;
}
```

`TranslationRegistry` 保存 `ProviderId -> TranslationProviderFactory` 映射，负责：

- 拒绝重复 ID；
- 枚举已注册 Provider；
- 查找并校验 Factory；
- 根据配置构造 Provider 实例。

`AiRegistry` 使用相同模式，但返回 `Arc<dyn AiProvider>`。两者可以复用内部容器或辅助函数，不共享弱类型业务接口。

第一阶段采用应用启动时显式注册：

```rust
let translation_registry = TranslationRegistry::builder()
    .register(NiuTransProviderFactory)
    .build()?;
```

这里的“发现”表示运行时可以枚举应用已经注册的 Provider；不表示扫描或加载任意外部代码。

## 7. ProviderContext 与连接池生命周期

接受应用级共享 HTTP Client 的建议。

```rust
#[derive(Clone)]
pub struct ProviderContext {
    pub http_client: reqwest::Client,
}
```

约束如下：

1. `ProviderContext` 在应用启动时构造一次；
2. 所有 HTTP Provider 从 Context 克隆 `reqwest::Client`；
3. Factory 禁止自行调用 `reqwest::Client::new()` 或重复创建默认连接池；
4. `reqwest::Client` 自身内部已经使用共享指针，直接 clone 即可，不再额外套 `Arc<Client>`；
5. 代理、TLS、DNS、默认超时和连接池参数在应用级 Client Builder 统一配置；
6. Provider 特有超时优先使用 request timeout 或 Provider 策略，不通过创建新 Client 实现。

例外情况是供应商确实要求不同的 TLS 身份、代理、证书或其他 Client 级隔离配置。此时应由 `ProviderContext` 管理命名 Client，而不是由 Factory 隐式创建：

```rust
pub struct ProviderContext {
    pub default_http_client: reqwest::Client,
    pub isolated_clients: HashMap<ClientProfileId, reqwest::Client>,
}
```

第一阶段只实现默认共享 Client。

## 8. 原子路由快照

接受使用 `arc-swap` 的建议，并将其作为目标实现，而不是先引入异步 `RwLock`。

`arc-swap` 适合读多写少的指针热切换。其读路径不获取传统互斥锁，但仍包含原子操作和 Guard/引用生命周期管理，因此本文使用“无锁读取”，不使用“零成本读取”的表述。

为了避免直接在 `ArcSwapOption` 中存放 unsized trait object 带来的类型约束，存储一个有尺寸的路由快照：

```rust
pub struct TranslationRoute {
    pub primary: ActiveTranslationProvider,
    pub fallbacks: Vec<ActiveTranslationProvider>,
    pub policy: FallbackPolicy,
}

pub struct ActiveTranslationProvider {
    pub id: ProviderId,
    pub provider: Arc<dyn TranslationProvider>,
}

pub struct TranslationRuntime {
    route: arc_swap::ArcSwapOption<TranslationRoute>,
}
```

读取：

```rust
let route = self.route.load_full()
    .ok_or(TranslationError::Unavailable)?;
```

切换：

```rust
self.route.store(Some(Arc::new(next_route)));
```

由此得到以下语义：

- `None` 表示整个能力已停用；
- 新请求读取新快照；
- 已经开始的请求继续持有旧快照；
- 旧 Provider 在最后一个请求释放 `Arc` 后销毁；
- 切换是整个路由的原子替换，不会出现 primary 和 fallback 来自不同配置版本的中间状态。

AI 使用独立的 `AiRoute` 和 `AiRuntime`。通用层可以抽取快照发布辅助结构，但不要求第一阶段实现复杂泛型。

## 9. 配置模型

能力选择与 Provider 凭据分离：

```json
{
  "capabilities": {
    "translation": {
      "primary_provider": "niutrans",
      "fallback_providers": []
    },
    "ai": {
      "primary_provider": null,
      "fallback_providers": []
    }
  },
  "providers": {
    "niutrans": {
      "app_id": "...",
      "api_key_ref": "keychain://providers/niutrans/api-key"
    }
  }
}
```

状态语义：

- `primary_provider = null`：能力停用；
- Provider 已配置但未进入路由：已配置、未启用；
- Provider 是 primary：当前主供应商；
- Provider 位于 `fallback_providers`：备用供应商；
- primary 和 fallback 不允许重复；
- 未注册、配置缺失或配置无效的 Provider 不能进入运行时路由。

第一阶段内置 Provider 配置继续使用强类型结构，不立即改为 `HashMap<ProviderId, serde_json::Value>`。等系统真正支持外部 Provider 后，再引入带 schema version 的动态配置。

凭据不应长期明文保存在 settings JSON 中。目标形态是写入系统 Keychain，settings 只保存 secret reference；前端查询只返回是否已配置或掩码，不返回完整 secret。

## 10. 激活、切换与停用事务

设置变更由 `SettingsService` 协调，不能继续由 Command 直接写文件：

```text
接收 next settings
       │
       ▼
校验 Provider ID、重复项和配置
       │
       ▼
在当前路由之外构造完整 next route
       │
       ▼
原子保存 settings 文件
       │
       ▼
ArcSwap 原子发布 next route
```

建议接口：

```rust
impl SettingsService {
    pub async fn update(
        &self,
        next: Settings,
    ) -> Result<(), SettingsError> {
        let prepared = self.provider_manager.prepare(&next).await?;
        self.store.save(&next)?;
        self.provider_manager.commit(prepared);
        Ok(())
    }
}
```

关键不变量：

- `prepare` 可以失败，但不能修改当前运行时；
- `commit` 只发布已经构造完成的快照，不执行网络或磁盘操作；
- 配置保存失败时继续使用旧路由；
- 保存成功后立即发布新路由；
- 停用通过发布 `None` 完成；
- 应用启动时使用同一套 `prepare + commit` 恢复运行状态。

“测试连接”作为显式操作提供，不作为保存配置的强制步骤。供应商临时不可达不应阻止用户保存合法配置。

## 11. 错误分类与 Fallback

接受为 Fallback 预留路由列表的建议，但自动降级必须由错误语义和调用策略共同决定。

### 11.1 统一错误属性

不同能力保留自己的错误枚举，同时实现通用分类：

```rust
pub enum ProviderFailureKind {
    InvalidRequest,
    Authentication,
    PermissionDenied,
    RateLimited,
    Timeout,
    Transport,
    InvalidResponse,
    ProviderRejected,
    Internal,
}

pub struct ProviderFailureMeta {
    pub kind: ProviderFailureKind,
    pub retryability: Retryability,
}

pub enum Retryability {
    Never,
    SameProvider,
    NextProvider,
}
```

Provider 负责把供应商特有错误映射到稳定分类，Runtime 根据策略决定是否降级。

### 11.2 默认降级规则

| 错误 | 默认切换 fallback | 原因 |
|---|---:|---|
| 输入校验失败 | 否 | 换供应商不能修复输入 |
| 凭据/权限错误 | 否 | 应提示用户修复配置，避免掩盖错误 |
| 内容安全或明确拒绝 | 否 | 不应绕过供应商策略 |
| 网络连接失败 | 是 | 典型临时基础设施故障 |
| 超时 | 是 | 可能由供应商临时不可用导致 |
| 限流 | 是 | 备用供应商可以恢复服务 |
| 响应格式无效 | 可配置 | 可能是供应商异常，也可能是客户端兼容问题 |
| 未知内部错误 | 否 | 默认保守，避免重复副作用 |

### 11.3 调用安全约束

翻译通常是无副作用操作，适合自动 Fallback。AI 请求可能产生重复计费、重复工具调用或外部副作用，因此：

- 普通文本生成只有在尚未向上游输出内容时才允许切换；
- 流式响应一旦向调用方发送首个 chunk，默认禁止切换；
- 带 tool calls 或其他副作用的 AI 请求默认禁止自动 Fallback；
- 每次逻辑请求设置最大尝试次数，不允许循环回到已尝试 Provider；
- 不在单个 Provider 内部偷偷切换，所有降级由 Runtime 统一编排；
- 结果记录实际成功的 Provider 和尝试链，用于日志和诊断。

第一阶段可以落地 `fallback_providers` 配置、路由快照和错误分类，但只启用 primary。第二阶段在测试覆盖完整后，为纯翻译请求启用自动 Fallback；AI Fallback 在 AI 的计费、流式和工具调用语义明确后单独设计。

## 12. ProviderManager

通用协调器持有各能力 Runtime 和 Registry：

```rust
pub struct ProviderManager {
    translation: TranslationProviderRuntime,
    ai: AiProviderRuntime,
}

impl ProviderManager {
    pub fn catalog(&self) -> ProviderCatalog;
    pub async fn prepare(&self, settings: &Settings)
        -> Result<PreparedProviderRoutes, ProviderError>;
    pub fn commit(&self, prepared: PreparedProviderRoutes);
    pub fn statuses(&self) -> Vec<ProviderStatusView>;
}
```

`ProviderManager` 只协调基础设施状态，不成为业务调用入口。业务层始终调用 `TranslationService::translate` 或 `AiService::complete`。

## 13. 发现和管理 API

建议提供：

```text
list_providers()
get_provider_config(provider_id)
update_provider_config(provider_id, config)
activate_provider(capability, provider_id)
deactivate_provider(capability)
set_fallback_providers(capability, provider_ids)
test_provider(provider_id)
```

列表返回模型：

```rust
pub struct ProviderStatusView {
    pub descriptor: ProviderDescriptor,
    pub configured: bool,
    pub activation: ProviderActivation,
    pub health: ProviderHealth,
}

pub enum ProviderActivation {
    Inactive,
    Primary,
    Fallback { priority: usize },
}
```

健康状态是观测结果，不直接等价于激活状态。一个 Provider 可以处于 Active 但最近请求失败，也可以处于 Inactive 但配置完整。

前端通过 descriptor 和 status 驱动服务列表，供应商特有表单仍由各自组件负责。第一阶段允许前端显式映射内置表单，不要求后端下发动态表单 schema。

## 14. 可观测性

每次调用至少记录：

- operation ID；
- capability；
- Provider ID；
- attempt index；
- 是否为 fallback；
- 耗时；
- 稳定错误分类；
- 最终成功 Provider；
- 总尝试次数。

日志不得包含 API Key、Authorization、完整请求正文或未经清理的供应商错误响应。

Provider ID 可以出现在诊断信息和响应元数据中，但上层业务逻辑不得根据 Provider ID 分支。

## 15. 建议目录

```text
src/
├── providers/
│   ├── mod.rs
│   ├── catalog.rs
│   ├── context.rs
│   ├── descriptor.rs
│   ├── error.rs
│   └── manager.rs
├── translation/
│   ├── mod.rs
│   ├── model.rs
│   ├── error.rs
│   ├── provider.rs
│   ├── registry.rs
│   ├── runtime.rs
│   ├── service.rs
│   └── providers/
│       ├── mod.rs
│       └── niutrans.rs
├── ai/
│   ├── mod.rs
│   ├── model.rs
│   ├── error.rs
│   ├── provider.rs
│   ├── registry.rs
│   ├── runtime.rs
│   ├── service.rs
│   └── providers/
│       └── openai.rs
└── settings/
    ├── model.rs
    ├── service.rs
    └── store.rs
```

不要在第一轮机械地创建所有空文件。先拆翻译模块，AI 接入时再提取已经出现的真实重复。

## 16. 配置迁移

当前配置只有 `services.niutrans`。迁移规则：

1. 如果旧配置的小牛 `app_id` 和 `api_key` 都有效，则生成 `translation.primary_provider = "niutrans"`；
2. 否则生成 `translation.primary_provider = null`；
3. `fallback_providers` 默认为空；
4. 保留未知 Provider 配置，避免旧版本应用覆盖新版本字段；
5. 迁移完成并成功写入前，不删除旧字段；
6. 凭据迁入 Keychain 应是单独、可恢复的迁移步骤。

需要注意：当前 serde 强类型结构在保存时可能丢弃未知字段。若要支持版本回退或新旧版本并存，应在设置存储层明确制定 unknown-field preservation 策略。

## 17. 测试策略

### 17.1 Registry

- 重复 Provider ID 注册失败；
- 未注册 Provider 无法激活；
- descriptor 能正确枚举；
- Factory 配置验证错误保持稳定错误码。

### 17.2 Runtime 切换

- 未激活时返回 unavailable；
- A 切换到 B 后，新请求只进入 B；
- 切换过程中已持有 A 快照的请求可以完成；
- 构造 B 失败时 A 仍然有效；
- 停用后新请求失败，但进行中的请求不被取消；
- primary 与 fallback 作为一个快照原子更新。

### 17.3 Settings 事务

- 配置校验失败时不保存、不切换；
- Provider 构造失败时不保存、不切换；
- settings 保存失败时不切换；
- 保存成功后运行状态立即更新；
- 应用重启后恢复相同路由。

### 17.4 连接池

- 多个 Factory 获得的 Client clone 来自同一个应用级 Client；
- 热切换不会在 Factory 中创建新的默认 Client；
- Provider 特殊 Client 必须通过命名 profile 显式声明。

### 17.5 Fallback

- validation/auth/rejection 不触发 fallback；
- timeout/transport/rate-limit 按策略进入下一个 Provider；
- 每个 Provider 每次逻辑请求最多尝试一次；
- 全部失败时返回包含最终稳定错误码的聚合错误；
- AI 流已经输出后不触发 fallback；
- 带副作用的 AI 请求默认不触发 fallback。

## 18. 分阶段实施

### 阶段一：完成翻译解耦

- 拆分 `NiuTransProvider`；
- 建立 `TranslationProviderFactory` 和 Registry；
- 应用级创建共享 `reqwest::Client`；
- 引入 `arc-swap` 和 `TranslationRoute`；
- 增加 primary/fallback 配置模型，但只执行 primary；
- 将 settings 更新改为 `prepare -> save -> commit`；
- 前端支持配置、激活、切换和停用。

### 阶段二：翻译 Fallback

- 完成稳定错误分类；
- 加入最大尝试次数和尝试链日志；
- 对无副作用翻译请求启用可配置 Fallback；
- 增加限流、超时和全部失败测试。

### 阶段三：接入 AI Provider

- 建立 `AiProvider`、Factory、Registry、Runtime 和 Facade；
- 从翻译与 AI 的真实重复中提取通用 Catalog、Context 和 Manager；
- 单独定义 AI 流式、计费、工具调用和降级规则。

### 阶段四：可选外部插件

只有出现真实的第三方扩展需求后，才评估 WASM、子进程或动态插件协议。该阶段需要独立处理权限、签名、版本兼容、资源限制和 secret 隔离。

## 19. 验收标准

- HTTP handler 和领域调用方中不存在 `niutrans`、`openai` 等供应商分支；
- `TranslationService` 不读取 settings 文件、不构造具体 Provider；
- 新增第二个翻译 Provider 不修改 `TranslationService`；
- 配置切换无需重启，且进行中的请求不受影响；
- 所有普通 HTTP Provider 复用应用级 `reqwest::Client`；
- 配置或构造失败不会破坏当前可用 Provider；
- 能力可以显式停用；
- 路由模型支持有序 fallback，但降级只在明确允许的错误和调用类型上发生；
- API Key 等 secret 不再通过普通 settings 查询完整返回前端。

## 20. 决策摘要

| 建议 | 决策 | 说明 |
|---|---|---|
| 使用 `arc-swap` | 接受 | 采用 `ArcSwapOption<RouteSnapshot>`；称为无锁读取，不称为零成本 |
| 所有 Provider 共享 `reqwest::Client` | 接受 | Client 在应用级构造一次并直接 clone；特殊隔离必须显式声明 |
| 预留 Primary + Fallback | 接受并分阶段实现 | 第一阶段保留路由和配置结构；翻译先启用，AI 根据流式与副作用语义另行启用 |
| 通用 Provider 注册发现 | 接受 | 复用元数据和生命周期；业务接口与 Registry 仍按能力强类型隔离 |
