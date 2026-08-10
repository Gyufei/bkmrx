# 设置页面扩展 + 关于弹窗 — 实施方案

## 一、目标

1. **设置页面新增"系统信息"区块**，展示 bkmr 底层运行状态信息
2. **新增"关于"弹窗**，展示技术栈、版本号和 GitHub 链接

---

## 二、数据来源调研

### 已发掘到的数据

| 数据项 | 来源 | 获取方式 |
|---|---|---|
| bkmr config 路径 | `~/.config/bkmr/config.toml` | `bkmr_lib::config::get_config_file_path()` |
| SQLite 路径 | `bkmr_lib::config::Settings.db_url` | 解析后的值（可能被 `BKMR_DB_URL` 覆盖） |
| ONNX 是否可用 | fastembed 初始化状态 | 在 bkmr_lib 的 `ServiceContainer` 中判断 embedding provider 是否为 `FastEmbedEmbedding` |
| bkmr 版本 | bkmr crate: `7.6.7` | `bkmr_lib::PKG_VERSION` 或通过 Cargo.toml 引用 |
| bkmr GitHub | `https://github.com/sysid/bkmr` | 硬编码 |
| 前端版本 | React 18.3.1 + TypeScript 5.5 + Vite 5.4 | `package.json` |
| 后端版本 | Rust + Tauri 2 + Axum 0.7 | `src-tauri/Cargo.toml` |
| bkmrx 版本 | `0.1.0` | `src-tauri/Cargo.toml` 和 `package.json` |

### ONNX 状态判断

bkmr_lib 使用 `fastembed` crate，默认启用 `ort-download-binaries` feature。`ServiceContainer` 初始化时选择 provider 类型。可在 Rust 端执行：

```rust
// 判断 embedding provider 是否为 FastEmbed（而非 Dummy）
let embedding = container.embedding_service.get_embedding_provider_type();
// 返回 "fastembed" | "dummy" 等
```

---

## 三、Rust 后端改动

### 3.1 新增 `SystemInfo`

**文件**：`src-tauri/src/commands.rs` 或新建 `src-tauri/src/system_info.rs`

```rust
#[derive(Debug, Clone, Serialize)]
pub struct SystemInfo {
    pub bkmr_config_path: String,
    pub sqlite_db_path: String,
    pub onnx_available: bool,
    pub bkmr_version: String,
    pub bkmr_repo: String,
    pub app_version: String,
}
```

### 3.2 新增 Tauri command `get_system_info`

```rust
#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    let container = crate::container::get();

    // config 路径
    let config_path = bkmr_lib::config::get_config_file_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "未找到".to_string());

    // db 路径 — 从 bkmr_lib Settings 获取
    // 需要在 container.init 后从 settings 中取 db_url
    // 方案 A：在 container.rs 中暴露 settings
    // 方案 B：读取 config.toml 重新解析
    let db_path = container.get_db_path();  // 需要 bkmr_lib 暴露，或自行存储

    // ONNX 状态
    let onnx = container.embedding_service.is_available();  // 需要 bkmr_lib 暴露

    // 版本号
    let bkmr_version = env!("CARGO_PKG_VERSION").to_string();  // 这是 bkmrx 的版本
    // bkmr_lib 的版本需要从依赖中获取
}
```

### 3.3 需要对 bkmr_lib 的补充

当前 `bkmr_lib::infrastructure::di::ServiceContainer` 没有暴露 `db_url` 和 embedding 状态的 getter。需要：

- 在 `container.rs` 中缓存初始化时的 `db_url`
- 判断 embedding provider 类型（fastembed vs dummy）

```rust
// container.rs 修改
use std::sync::OnceLock;

static CONTAINER: OnceLock<ServiceContainer> = OnceLock::new();
static CONFIG_DB_PATH: OnceLock<String> = OnceLock::new();  // 新增

pub fn init(config_path: Option<&Path>) -> Result<(), String> {
    // ... 原有逻辑 ...
    CONFIG_DB_PATH.set(settings.db_url.clone()).ok();
    // ...
}

pub fn get_db_path() -> &'static str {
    CONFIG_DB_PATH.get().map(String::as_str).unwrap_or("unknown")
}
```

### 3.4 bkmr_lib 版本获取

bkmr_lib 作为 git 依赖，版本号可通过以下方式获取：

- 在 `Cargo.toml` 中通过 `[dependencies.bkmr_lib]` 引用
- 在代码中引用 `bkmr_lib::PKG_VERSION`（如果 bkmr_lib 暴露了）
- 或通过 Cargo 构建脚本提取

最简单的做法：**在 `commands.rs` 中定义常量**：

```rust
const BKMR_VERSION: &str = "7.6.7";
const BKMR_REPO: &str = "https://github.com/sysid/bkmr";
```

或通过 `build.rs` 从 `Cargo.lock` 自动提取。

---

## 四、前端改动

### 4.1 扩展 `useSettings`（或新建 `useSystemInfo` hooks）

**文件**：`src/settings/useSystemInfo.ts`

```typescript
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SystemInfo {
  bkmr_config_path: string;
  sqlite_db_path: string;
  onnx_available: boolean;
  bkmr_version: string;
  bkmr_repo: string;
  app_version: string;
}

export function useSystemInfo() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<SystemInfo>("get_system_info");
      setInfo(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { info, loading, reload: load };
}
```

### 4.2 `SettingsPage` 新增"系统信息"区块

放在已有的"笔记目录"区块之后：

```tsx
<section>
  <h3 className="text-sm font-medium ...">系统信息</h3>
  <div className="space-y-2 p-4 rounded-card bg-surface-sidebar ...">
    {systemInfo.items.map(item => (
      <Row label={item.label} value={item.value} copyable />
    ))}
  </div>
</section>
```

显示项：
| 标签 | 值 | 可复制 |
|---|---|---|
| bkmr 配置路径 | `~/.config/bkmr/config.toml` | ✅ |
| SQLite 数据库路径 | `/Users/.../.config/bkmr/bkmr.db` | ✅ |
| ONNX / 嵌入模型 | 已加载 / 未配置 | ❌ |
| bkmr 版本 | `7.6.7` | ✅ |

### 4.3 "关于"弹窗

**触发方式**：设置页面右上角新增一个"关于"按钮或链接

```tsx
interface AboutInfo {
  frontend: { name: string; version: string }[];
  backend: { name: string; version: string }[];
  bkmr_version: string;
  bkmr_repo: string;
  app_version: string;
}
```

展示内容：

**前端**
| 技术 | 版本 |
|---|---|
| React | 18.3.1 |
| TypeScript | 5.5.x |
| Vite | 5.4.x |
| Tailwind CSS | 3.4.x |
| Tauri API | 2.x |
| Lucide React | 1.24.x |

**后端**
| 技术 | 版本 |
|---|---|
| Rust | 1.x |
| Tauri | 2.x |
| Axum | 0.7.x |
| bkmr_lib | 7.6.7 |
| 应用版本 | 0.1.0 |

- **bkmr GitHub**: [https://github.com/sysid/bkmr](https://github.com/sysid/bkmr)

弹窗布局：
```
┌─ About bkmrx ─────────────────────┐
│                                    │
│  bkmrx v0.1.0                      │
│  基于 bkmr v7.6.7                  │
│                                    │
│  ── 前端 ──                        │
│  React 18.3.1                      │
│  TypeScript 5.5.x                  │
│  ...                               │
│                                    │
│  ── 后端 ──                        │
│  Tauri 2.x                         │
│  Rust                             │
│  ...                               │
│                                    │
│  📎 https://github.com/sysid/bkmr  │
│                                    │
└────────────────────────────────────┘
```

### 4.4 设置页右上角的操作入口

在当前设置页的标题区域新增"关于"链接/按钮：

```tsx
<div className="flex items-center justify-between">
  <div>
    <h2>设置</h2>
    <p>应用全局偏好</p>
  </div>
  <Button variant="ghost" size="sm" onClick={() => setShowAbout(true)}>
    关于
  </Button>
</div>
```

---

## 五、实现步骤（按依赖顺序）

```
Step 1  [Rust]  container.rs 缓存 db_url，暴露 get_db_path()
Step 2  [Rust]  commands.rs 新增 get_system_info command
Step 3  [Rust]  main.rs 注册 get_system_info
Step 4  [Frontend]  新建 useSystemInfo.ts
Step 5  [Frontend]  SettingsPage 新增"系统信息"区块
Step 6  [Frontend]  SettingsPage 新增"关于"按钮 + AboutDialog 组件
Step 7  [Verify]    tsc 编译 + tauri build 验证
```

---

## 六、关键设计决策

| 项 | 决策 | 理由 |
|---|---|---|
| 前端技术版本号 | 硬编码在 `AboutDialog.tsx` 中 | 依赖在 `package.json` 中固定，运行时无法读取 package.json |
| bkmr 版本号 | Rust 端常量或 build.rs 提取 | 避免每次改版本都改两处 |
| ONNX 检测 | 判断 `embedding_service` provider 类型 | bkmr_lib 的 FastEmbed vs Dummy |
| 统一弹窗 | Dialog 组件（复用现有 Radix 封装） | 项目已有 `Dialog/RadixDialog` |
| 信息展示样式 | 只读的 label-value 行，类 monospace | 保持设置页简洁 |

---

## 七、注意事项

1. bkmr_lib 的某些 API（如 `get_db_path`、`is_embedding_available`）可能需要给 bkmr_lib 提 PR 暴露，或用反射/静态字段替代
2. 如果 bkmr_lib 不暴露 provider 类型判断，可以用一个 simpler check: `embedding_service.embedding_dimensions() != 0` 来判断是否已初始化
3. "关于"弹窗中的依赖版本号更新频率较低，硬编码可接受
