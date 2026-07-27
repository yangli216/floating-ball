# 全医慧助（PCIE）

全医慧助（PCIE，Primary Care Intelligent Expert）是一款面向基层医疗场景的桌面智能专家辅助应用，旨在为医疗从业者提供智能问诊、病历辅助生成、诊疗建议、报告解读、慢病协同及医疗知识检索等能力。

当前工程名仍为 `floating-ball`。为保障既有 HIS 接入、升级和本地数据兼容，`med-hermes://`、`com.med-hermes.app`、`window.MedHermes` 及 `med-hermes-*.js` 等技术标识继续保留；它们不再代表正式产品名称。

## 核心特性
- **AI 智能问诊**: 基于大模型能力，通过语音或表单形式采集患者症状，自动生成标准主诉与现病史。
- **深度链接集成**: 支持通过兼容协议 `med-hermes://` 由 HIS 系统快速唤起。
- **本地桥接**: 通过 HTTP 接口与本地 HIS 医生站无缝对接。
- **跨平台支持**: 采用 Tauri 2.0 框架，支持 Windows、macOS 及 Linux。

## 快速开始
1. 安装依赖: `yarn install`
2. 启动开发环境: `yarn tauri dev`
3. 构建安装包: `yarn tauri build`

## 接口说明
详见 [api.md](./api.md)。
