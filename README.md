# Tauri 桌面悬浮球应用 (AI 医疗助手版)

这是一个基于 Tauri 2.0 + Vue 3 + TypeScript 开发的智能桌面悬浮球应用。它不仅是一个悬浮工具，更是一个集成了 LLM 大模型能力的医疗数据助手，支持诊断、药品、诊疗项目的智能匹配与查询。

## 🚀 项目特性

### 🤖 AI 智能核心
- **LLM 集成**：支持 OpenAI 兼容接口（如 DeepSeek、ChatGPT 等），提供智能对话能力。
- **医疗数据匹配**：内置高性能匹配算法，支持 20,000+ 诊断数据、药品和诊疗项目的快速检索与匹配。
- **结构化输出**：将非结构化的 AI 回答自动转换为标准的结构化医疗数据（CSV 格式）。

### 🛠 核心功能
- **透明悬浮球**：无边框、背景透明、始终置顶，不打扰工作流。
- **智能对话面板**：双击悬浮球唤起对话界面，支持流式响应。
- **数据管理**：
  - 支持 `diagnoses.csv` (诊断)、`medicines.csv` (药品)、`items.csv` (诊疗项目) 的导入与解析。
  - 内置 CSV 解析器，支持标准 CSV 格式（含引号处理）。
- **设置中心**：
  - **通用设置**：窗口置顶开关。
  - **模型配置**：自定义 API Key、Base URL 和模型名称。
  - **软件更新**：集成自动检查更新功能。

### 📦 工程化特性
- **跨平台支持**：支持 macOS (Intel/Apple Silicon)、Windows 和 Linux。
- **自动更新**：基于 GitHub Releases 的自动更新机制（支持增量更新）。
- **一键发版**：提供自动化发版脚本，自动管理版本号、Git 标签和构建流程。

## 🏗 技术栈
- **前端框架**：Vue 3 + TypeScript + Vite
- **桌面框架**：Tauri 2.0 (Rust)
- **样式方案**：CSS Variables + Flex/Grid 布局
- **工具库**：
  - `tauri-plugin-updater`: 自动更新
  - `tauri-plugin-store`: 本地存储
  - `tiny-pinyin`: 中文拼音匹配支持

## 📂 项目结构

```
floating-ball/
├── src/
│   ├── assets/            # 静态资源 (CSV 数据文件等)
│   ├── components/        # Vue 组件 (ConsultationPage, SettingsPanel 等)
│   ├── services/          # 核心服务 (llm.ts, medicalData.ts)
│   ├── App.vue            # 主入口
│   └── main.ts
├── src-tauri/
│   ├── src/               # Rust 后端代码
│   ├── capabilities/      # 权限配置
│   └── tauri.conf.json    # Tauri 配置文件
├── scripts/               # 工程化脚本
│   └── release.mjs        # 自动发版脚本
└── package.json
```

## 👩‍💻 开发指南

### 环境要求
- Node.js 18+
- Rust 1.70+
- Yarn (推荐) 或 npm/pnpm

### 快速开始
1. **安装依赖**
   ```bash
   yarn install
   ```

2. **启动开发环境**
   ```bash
   yarn tauri dev
   ```

3. **构建应用**
   ```bash
   yarn tauri build
   ```

## 🔄 发版与更新

本项目内置了自动化的发版流程，只需一条命令即可完成版本更新、Tag 创建和推送。

### 发版命令
```bash
# 发布补丁版本 (例如 0.1.0 -> 0.1.1)
yarn release

# 发布次版本 (例如 0.1.0 -> 0.2.0)
yarn release minor

# 发布主版本 (例如 0.1.0 -> 1.0.0)
yarn release major
```

### 触发构建
运行上述命令后，脚本会提示您推送代码。推送到 GitHub 后，GitHub Actions 会自动触发构建流程：
1. 构建 macOS、Windows、Linux 安装包。
2. 对安装包进行签名。
3. 生成更新元数据 (`latest.json`)。
4. 发布 Release 到 GitHub。

## ⚙️ 配置说明

### LLM 配置
在应用的“设置”面板中，您可以配置以下 LLM 参数（也可以通过环境变量设置默认值）：
- **API Key**: 您的模型服务 API 密钥
- **Base URL**: 模型服务地址 (例如 `https://api.deepseek.com/v1`)
- **Model Name**: 模型名称 (例如 `deepseek-chat`)

### 医疗数据格式
系统支持 CSV 格式的数据导入，文件位于 `src/assets/` 目录下：
- **diagnoses.csv**: `id,code,name,keywords`
- **medicines.csv**: `id,name,spec`
- **items.csv**: `id,name,category`

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
