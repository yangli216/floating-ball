# 智医助理 (MedHermes)

智医助理 (MedHermes) 是一款基于 AI 的桌面悬浮球应用，旨在为医疗从业者提供智能问诊、病历自动生成及医疗知识检索等辅助功能。

## 核心特性
- **AI 智能问诊**: 基于大模型能力，通过语音或表单形式采集患者症状，自动生成标准主诉与现病史。
- **深度链接集成**: 支持通过 `med-hermes://` 协议由 HIS 系统快速唤起。
- **本地桥接**: 通过 HTTP 接口与本地 HIS 医生站无缝对接。
- **跨平台支持**: 采用 Tauri 2.0 框架，支持 Windows、macOS 及 Linux。

## 快速开始
1. 安装依赖: `yarn install`
2. 启动开发环境: `yarn tauri dev`
3. 构建安装包: `yarn tauri build`

## 接口说明
详见 [api.md](./api.md)。
