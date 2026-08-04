# 全医慧助（PCIE）

**PCIE — Primary Care Intelligent Expert**

全医慧助是一款面向基层医疗机构的桌面端智能全科专家工作站，通过悬浮球融入现有 HIS/PHIS 工作流，为医生提供智能问诊、病历生成、诊疗建议、报告解读、知识检索和安全复核辅助。

## 核心特性
- **AI 智能问诊**: 基于大模型能力，通过语音或表单形式采集患者症状，自动生成标准主诉与现病史。
- **深度链接集成**: 支持由 HIS 系统快速唤起；为兼容既有部署，当前继续使用 `med-hermes://` 协议。
- **本地桥接**: 通过 HTTP 接口与本地 HIS 医生站无缝对接。
- **跨平台支持**: 采用 Tauri 2.0 框架，支持 Windows、macOS 及 Linux。

## 品牌与兼容标识

- 正式产品名称：全医慧助（PCIE）
- 英文全称：Primary Care Intelligent Expert
- GitHub 仓库：`pcie`
- 兼容标识：HIS SDK 的 `MedHermes` / `MedHermesLoader` 全局对象、`med-hermes-sdk.js` 文件名、`med-hermes://` 深链和 `com.med-hermes.app` Bundle Identifier 暂不改名，以保证已部署集成和本地数据连续性。

## 快速开始
1. 安装依赖: `yarn install`
2. 启动开发环境: `yarn tauri dev`
3. 构建安装包: `yarn tauri build`

## 接口说明
详见 [api.md](./api.md)。
