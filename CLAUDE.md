# Atomic

Atomic 是一个个人知识库，将自由格式的 markdown 笔记（"原子"）转化为语义连接的 AI 增强知识图谱。它可以作为 Tauri 桌面应用、无头 HTTP 服务器或两者同时运行。

# 你

你是一位专业的软件开发者和架构师。你规划和实现的软件设计应该是简单、可维护且优雅的。你选择的抽象不仅要解决当前问题，还要为代码库的将来迭代做好准备。你避免重复，高度重视编写易于理解和扩展的代码。你在一个目前被全球用户使用的开源代码库中工作。因此，你不仅会受到软件功能输出的评判，还会受到代码本身质量的评判。最重要的是，不要懒惰：对你的实现感到自豪，深入思考解决问题的最佳方式，而不是最简单的方式。质量就是一切。

# 约定

- **所有回答和思考必须使用中文**
- 代码审查和实现优先考虑简洁性、可维护性和优雅性
- 避免重复，选择能够为未来迭代做好铺垫的抽象
- 在实现前先深入思考最佳方案，而非最简单方案
- 质量至上

## 核心概念

**原子（Atoms）** 是基本单位——带有可选来源 URL 和层级标签的 markdown 笔记。当创建或更新原子时，异步管道会自动：

1. 使用 markdown 感知的边界对内容进行分块（尊重代码块、标题、段落）
2. 通过配置的 AI 提供商生成向量嵌入
3. 使用 LLM 结构化输出提取和分配标签（如果启用了自动标签）
4. 基于嵌入相似度构建与其他原子的语义边

从调用者的角度来看，这个管道是"即发即忘"的——调用者立即收到保存的原子，而嵌入/标记在后台运行，通过回调报告进度。

**标签（Tags）** 形成层级树。自动提取的标签在类别父标签下组织（主题、人物、地点、组织、事件）。标签既作为组织结构，也作为 wiki 生成和聊天对话的范围机制。

**Wiki 文章** 是给定标签下所有原子的 LLM 综合摘要，包含指向源原子的内联引用。它们支持增量更新——当新原子被标记时，只有新内容被发送给 LLM 以集成到现有文章中。

**聊天** 是一个代理式 RAG 系统。对话可以限定在特定标签范围内，代理在对话期间有工具来语义搜索知识库。响应通过与嵌入相同的回调系统流式返回。

**画布（Canvas）** 是一个空间可视化，其中原子使用 d3-force 模拟定位。共享标签的原子被链接，自定义相似力将语义相关的原子拉近。位置被持久化，以便布局在会话之间保持稳定。

## 架构：核心 + 薄封装

核心架构原则是**业务逻辑**与**传输层**的分离。所有领域逻辑都存在于 `atomic-core` 中，这是一个没有框架依赖的独立 Rust crate。每个客户端都是一个薄封装，将 `atomic-core` 适配到特定的传输机制。

```
                    ┌─────────────────┐
                    │   atomic-core   │
                    │  (所有逻辑)      │
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌─────────────┐  ┌──────────────┐  ┌───────────┐
    │  src-tauri   │  │atomic-server │  │ mcp-bridge│
    │ (Tauri IPC)  │  │(REST+WS+MCP)│  │(stdio→HTTP)│
    └──────┬──────┘  └──────┬───────┘  └─────┬─────┘
           │                │                 │
    ┌──────▼──────┐  ┌──────▼───────┐        │
    │   React UI   │  │  HTTP clients│  ┌─────▼──────┐
    │(Tauri or HTTP)│  │ (iOS, etc.) │  │ MCP clients│
    └─────────────┘  └──────────────┘  │(Claude,etc)│
                                       └────────────┘
```

### `atomic-core` — 门面模式

`AtomicCore` 是围绕 `Arc<Database>` 的 `Clone` 封装，暴露所有操作：CRUD、搜索、嵌入、wiki 生成、聊天、聚类、标签压缩和导入。它完全与传输无关。

关键设计决策是**基于回调的事件系统**：产生异步事件的操作（嵌入、聊天）接受 `Fn(EmbeddingEvent)` 或 `Fn(ChatEvent)` 闭包。核心不知道也不关心事件如何传递——它只是调用闭包。这使得它可以在任何 Rust 上下文中使用，而无需引入 Tauri、actix 或任何框架。

### `src-tauri` — 桌面封装

Tauri 应用将 `atomic-server` 作为**边车进程**启动，并暴露一个 IPC 命令（`get_local_server_config`），返回服务器的 base URL 和认证令牌。然后前端通过 HTTP/WebSocket 连接到边车，就像连接到独立的 `atomic-server` 一样。退出时，Tauri 杀死边车。

### `atomic-server` — 无头 HTTP 封装

独立服务器用完整的 REST API（~78 个路由）以及 WebSocket 端点和 Streamable HTTP MCP 端点包装 `atomic-core`。相同的薄封装模式适用：每个路由处理器解包 HTTP 请求参数，调用 `core.method()`，返回 JSON。

事件通过 `tokio::sync::broadcast` 流动——路由处理器将 `ServerEvent` 变体发送到通道，WebSocket 客户端接收它们。事件桥将 `atomic-core` 回调转换为广播消息，镜像 Tauri 将它们桥接到 `app_handle.emit()` 的方式。

认证使用存储为 SHA-256 哈希的命名可撤销 API 令牌。首次运行时自动创建默认令牌。通过 CLI 子命令或 REST 端点管理。

### 前端传输抽象

React 前端定义了具有 `invoke()` 和 `subscribe()` 方法的 `Transport` 接口。Tauri 和浏览器环境都使用 `HttpTransport`，它通过命令映射将命令名称映射到 HTTP 规范（方法、路径、body/query 转换），并通过 WebSocket 接收事件。在 Tauri 中，前端首先通过 Tauri IPC 调用 `get_local_server_config` 获取边车的 URL 和令牌，然后对其他所有操作使用 `HttpTransport`。

这意味着 React 代码与传输无关——无论在什么环境中，它都调用 `transport.invoke('create_atom', args)` 和 `transport.subscribe('embedding-complete', handler)`。

## AI 提供商抽象

AI 能力通过基于 trait 的提供商可插拔：
- `EmbeddingProvider` — 批量嵌入生成
- `LlmProvider` — 聊天补全
- `StreamingLlmProvider` — 带工具调用的流式补全

存在两个实现：**OpenRouter**（云端，默认）和 **Ollama**（本地）。工厂函数根据配置的提供商类型返回 `Arc<dyn Trait>`。添加新提供商需要实现 trait 并添加工厂分支——无需更改嵌入、wiki、聊天或任何消费者代码。

提供商配置存储在设置表中（SQLite 键值对）。OpenRouter 为嵌入、标记、wiki 和聊天使用单独的模型设置。Ollama 从运行的服务器自动发现可用模型。

## 工作区结构

```
Cargo.toml                  # 工作区根目录
crates/atomic-core/         # 所有业务逻辑（无框架依赖）
crates/atomic-server/       # 无头 REST + WS + MCP 服务器
crates/mcp-bridge/          # stdio 到 HTTP 的 MCP 桥接（用于 Claude Desktop 等）
src-tauri/                  # Tauri 桌面应用（边车启动器）
src/                        # React 前端（TypeScript）
mobile/ios/                 # 围绕 React 前端的 Capacitor iOS 封装
mobile/android/             # 围绕 React 前端的 Capacitor Android 封装
scripts/                    # 导入、构建和数据库工具
databases/                  # 本地数据目录（registry.db + per-DB 文件）
```

## 技术栈

- **核心**：Rust、SQLite + sqlite-vec（向量搜索）、rusqlite、tokio、reqwest
- **桌面**：Tauri v2
- **服务器**：actix-web、clap（CLI）、tokio broadcast channels
- **前端**：React 18、TypeScript、Vite 6、Tailwind CSS v4、Zustand 5
- **编辑器**：CodeMirror 6（markdown 编辑）、react-markdown（渲染）
- **画布**：d3-force（模拟）、react-zoom-pan-pinch（交互）
- **虚拟化**：@tanstack/react-virtual
- **AI**：OpenRouter 或 Ollama（可插拔）、tiktoken 用于 token 计数

## 常用命令

```bash
# 开发
npm run tauri dev             # 桌面应用（前端 + Tauri）
npm run dev                   # 仅前端
cargo check                   # 检查所有工作区 crate
cargo test                    # 运行所有测试
cargo check -p atomic-core    # 检查特定 crate

# 独立服务器（--data-dir 默认为当前目录）
cargo run -p atomic-server -- serve --port 8080
cargo run -p atomic-server -- --data-dir /path/to/data serve --port 8080

# 令牌管理
cargo run -p atomic-server -- token create --name "my-laptop"
cargo run -p atomic-server -- token list
cargo run -p atomic-server -- token revoke <token-id>

# Capacitor 移动端（共享 React 前端打包为 webview）
npm run dev:mobile:ios         # 构建、安装、启动带有 Vite HMR 的 iOS Capacitor 应用
npm run dev:mobile:android     # 构建、安装、启动带有 Vite HMR 的 Android Capacitor 应用
npm run build:mobile           # 两个平台的生产构建（cap sync ios + android）
npm run cap:open:ios           # 在 Xcode 中打开 mobile/ios/App
npm run cap:open:android       # 在 Android Studio 中打开 mobile/android

# 生产
npm run tauri build
npm run release:patch         # 升级版本并构建
```

## 数据库

SQLite 配合 sqlite-vec 扩展是默认配置。并行 Postgres 后端位于 `storage/postgres/` 下，实现了相同的存储 trait——用于共享基础设施运行。以下描述均针对 SQLite 布局；Postgres 将 file-per-DB 替换为 schema-per-DB，但暴露相同的 API。多数据库支持，采用 registry/data 分隔：

### 文件布局

从仓库根目录通过 `atomic-server` 运行时，数据库位于 `./databases/`：

```
databases/
  registry.db          # 共享配置：设置、API 令牌、数据库元数据
  default.db           # 默认知识库
  {uuid}.db            # 额外数据库（通过 API 或多数据库创建）
```

通过 Tauri 桌面应用运行时，基础目录是平台特定的：
- macOS：`~/Library/Application Support/com.atomic.app/`
- Linux：`~/.local/share/com.atomic.app/`

### Registry vs Data 数据库

- **`registry.db`** 保存跨数据库状态：设置（提供商配置、模型选择）、API 令牌，以及映射 UUID 到名称的 `databases` 表。
- **数据数据库**（`default.db`、`{uuid}.db`）各自保存原子、标签、块、嵌入、wiki 文章、对话、消息、语义边和原子位置。每个数据 DB *也*有自己的 `settings` 表（由 `db.rs` 中的 `migrate_settings` 填充）——这是 per-DB 配置所在的位置。

### 多数据库注意事项（添加 per-DB 状态前必读）

Atomic 可以在单个进程下运行 N 个数据数据库。`atomic-server` 的后台循环（`main.rs`）通过 `manager.list_databases()` 返回的每个数据库进行扇出——订阅轮询、计划任务运行器等。任何读写 "per-database" 状态的代码都需要实际上是 per-database 的。两个陷阱：

1. **`AtomicCore::get_settings()` / `set_setting()` 在附加 registry 时静默路由到 `registry.db`**（参见 `lib.rs`——它首先检查 `self.registry`）。这对于*全局*配置（提供商、模型、wiki 提示）是正确的，但这意味着任何在 per-DB 上下文中调用这些方法的辅助函数都在写入单个共享键，而不是 per-DB 键。如果需要 per-DB 设置，直接调用 `core.storage().get_all_settings_sync()` / `set_setting_sync()` 绕过 registry。调度器状态辅助函数（`scheduler::state`）是典型示例。

2. **遍历所有 DB 的后台循环需要 per-(task, db) 状态和锁，否则只有一个 DB 会取得进展。** 计划任务运行器持有 `(task_id, db_id)` 键控的锁映射，每个任务的 `last_run` 位于其 DB 的设置表中。订阅轮询遵循相同的形状。如果添加新的跨 DB 后台作业，镜像该模式——不要引入单例时间戳或锁。

接触任何 per-DB 运行内容的快速检查清单：
- 这个状态需要在 DB 之间隔离吗？如果是，通过 `core.storage()` 写入，而不是 `core.get_settings()` / `set_setting()`。
- 这个锁/ guard 需要 per-DB 吗？如果是，用 `db_id` 键控，而不仅仅是 `task_id` 或进程全局的 `Mutex`。
- 如果在 `atomic-server::main` 中添加计划或轮询循环，遍历 `manager.list_databases()` 并通过 `manager.get_core(&db_id)` 为每个 DB 解析一个新的 `core`。

### 使用 sqlite3 直接访问

```bash
# 列出所有数据库
sqlite3 databases/registry.db "SELECT id, name, is_default FROM databases;"

# 检查特定数据库中的原子/嵌入状态
sqlite3 databases/{uuid}.db "SELECT embedding_status, COUNT(*) FROM atoms GROUP BY embedding_status;"

# 检查设置（提供商、模型等）
sqlite3 databases/registry.db "SELECT key, value FROM settings;"
```

数据数据库中的关键表：`atoms`、`atom_chunks`、`atom_tags`、`tags`、`semantic_edges`、`vec_chunks`（sqlite-vec 虚拟表）、`wiki_articles`、`conversations`、`chat_messages`。

### 相似度

从 sqlite-vec 的归一化向量欧氏距离计算：`similarity = 1.0 - (distance² / 2.0)`。默认阈值：相关原子/语义边为 0.3，语义搜索和 wiki 块选择为 0.5。

## 设计系统

深色主题（受 Obsidian 启发）。背景：`#1e1e1e`/`#252525`/`#2d2d2d`。强调色：紫色（`#7c3aed`）。三面板布局：固定宽度的左侧面板（标签树、导航）、灵活的主视图（画布/网格/列表）、覆盖式右侧抽屉（编辑器、查看器、wiki、聊天）。

前端状态由 Zustand stores 管理：`atoms`、`tags`、`ui`、`settings`、`wiki`、`chat`、`databases`。`ui` store 跟踪选定的标签过滤器、抽屉状态、视图模式和搜索查询。视图模式（画布/网格/列表）持久化到 localStorage。