# Atomic 项目全面分析

## 项目概述

**Atomic** 是一个个人知识库应用，将 Markdown 笔记（称为"Atoms"）转化为语义连接的知识图谱，支持 AI 增强。它是一个全栈应用，支持多种部署方式。

---

## 技术栈总览

### 核心语言
| 语言 | 用途 |
|------|------|
| **Rust** | 后端核心逻辑、桌面应用、服务器 |
| **TypeScript** | 前端、插件、工具脚本 |
| **Swift** | iOS 移动端 |
| **Kotlin** | Android 移动端 |

### 前端技术栈
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3.1 | UI 框架 |
| Vite | 6.x | 构建工具 |
| Tailwind CSS | 4.x | 样式框架 |
| Zustand | 5.x | 状态管理 |
| React Router | 7.x | 路由 |
| CodeMirror | 6.x | 代码/文本编辑器 |
| Sigma.js + Graphology | 3.x | 知识图谱可视化 |
| @dnd-kit | - | 拖拽功能 |
| Framer Motion | - | 动画 |
| @atomic-editor/editor | 0.3.x | 自定义编辑器扩展 |

### 后端技术栈
| 技术 | 用途 |
|------|------|
| actix-web 4.9 | HTTP 服务器框架 |
| tokio | 异步运行时 |
| rusqlite + sqlite-vec | SQLite + 向量搜索 |
| sqlx + pgvector | PostgreSQL 支持（可选） |
| serde | 序列化 |
| utoipa | OpenAPI 文档 |

### 桌面与移动
| 技术 | 用途 |
|------|------|
| Tauri 2 | 桌面应用包装器 |
| Capacitor 8 | iOS/Android 移动端包装 |
| Litestream | SQLite WAL 备份到 S3 |

---

## 核心功能模块

### 1. Atoms（原子笔记）
- Markdown 笔记系统
- 自动分块（chunking）和向量化
- 自动标签和元数据提取

### 2. Semantic Search（语义搜索）
- 基于 sqlite-vec/pgvector 的向量相似度搜索
- 混合关键词 + 语义搜索

### 3. Canvas（图谱可视化）
- Force-directed 力导向图
- Sigma.js + Graphology 实现
- 节点可拖拽、缩放、筛选

### 4. Wiki（知识库合成）
- LLM 自动生成综述文章
- 带原子引用溯源

### 5. Chat（对话式 RAG）
- Agentic RAG 界面
- 工具调用（Tool Calling）
- 多轮对话支持

### 6. Reports（研究报告）
- 定时研究任务
- 自动抓取 + 摘要

### 7. RSS Feeds（内容摄取）
- 自动摄取 RSS/Atom 源
- feed-rs 解析器

### 8. Browser Extension（浏览器扩展）
- Manifest V3 Chrome 扩展
- 网页剪藏（Readability + Turndown）
- 离线队列，30 秒同步间隔

### 9. MCP Server（AI 集成）
- Model Context Protocol 支持
- 工具：semantic_search, read_atom, create_atom, update_atom, edit_atom, ingest_url
- mcp-bridge 提供 stdio-to-HTTP 桥接（用于 Claude Desktop）

### 10. Multi-Database（多数据库）
- 支持多个知识库
- 共享注册表

---

## 扩展机制（二次开发前提）

### 存储抽象层
`atomic-core/src/storage/traits.rs` 定义了核心 trait：
- `AtomStore` - 原子 CRUD
- `TagStore` - 层级标签
- `ChunkStore` - 向量/嵌入

### AI Provider 抽象
`atomic-core/src/providers/traits.rs` 定义了：
- `EmbeddingProvider` - 向量化提供者
- `LlmProvider` / `StreamingLlmProvider` - LLM 提供者
- 支持：OpenRouter（默认）、Ollama（本地）、OpenAI 兼容 API

### 插件集成
| 插件 | 位置 | 功能 |
|------|------|------|
| Obsidian 插件 | `plugins/obsidian-plugin/` | 双向同步、语义搜索、图谱视图 |
| Discord Bot | `plugins/discord/` | Discord 消息捕获 |

### 自定义编辑器
`@atomic-editor/editor` npm 包提供：
- CodeMirror 6 的 wiki 链接扩展
- `cmd/ctrl+click` 打开原子
- `[[` 触发原子建议

---

## 项目结构

```
d:/code/atomic/
├── Cargo.toml              # Rust workspace（6 个成员）
├── package.json            # 前端依赖
├── vite.config.ts          # Vite 配置
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   ├── stores/             # Zustand 状态
│   ├── editor/             # CodeMirror 编辑器
│   └── router/             # 路由
├── src-tauri/              # Tauri 桌面应用
├── crates/
│   ├── atomic-core/        # 核心业务逻辑（无框架依赖）
│   ├── atomic-server/      # REST + WebSocket + MCP 服务器
│   ├── mcp-bridge/         # MCP stdio 桥接
│   ├── atomic-cloud/       # 云功能
│   └── atomic-test-support/# 测试工具
├── mobile/                 # Capacitor 移动端
│   ├── ios/                # Swift 项目
│   └── android/            # Kotlin 项目
├── plugins/                # 插件
│   ├── obsidian-plugin/    # Obsidian 同步插件
│   └── discord/            # Discord Bot
├── extension/              # Chrome 扩展
├── docker/                 # Docker 配置
└── .github/workflows/      # CI/CD
```

---

## IDE 二次开发前提条件

### 1. 开发环境要求
- **Rust** 1.75+（用于后端和 Tauri）
- **Node.js** 20+（用于前端和构建）
- **pnpm**（包管理器）
- **SQLite**（开发调试）
- **PostgreSQL**（可选，生产级）

### 2. 理解核心架构
- `atomic-core` 是核心库，无框架依赖
- `atomic-server` 是 HTTP 包装器
- 所有客户端通过 HTTP/WebSocket 连接

### 3. 扩展点
1. **存储层**：实现 `AtomStore`/`TagStore`/`ChunkStore` trait
2. **AI Provider**：实现 `EmbeddingProvider`/`LlmProvider` trait
3. **插件**：通过 Obsidian 插件或 Discord Bot 扩展
4. **MCP 工具**：在 `mcp-bridge` 中添加新工具

### 4. 关键配置文件
| 文件 | 用途 |
|------|------|
| `Cargo.toml` | Rust 依赖和工作区 |
| `package.json` | Node 依赖 |
| `vite.config.ts` | 前端构建配置 |
| `src-tauri/tauri.conf.json` | Tauri 应用配置 |
| `docker-compose.yml` | 生产部署 |

---

## 部署方式

1. **桌面应用** - Tauri 二进制（macOS/Linux/Windows）
2. **Docker** - `docker compose up` 自托管
3. **Fly.io** - 边缘部署
4. **移动端** - iOS App Store / Android APK（Capacitor）