# 客户端出站审计

> 状态：2026-07-01 本地模式移除后基线。

## 结论

`floating-ball` 已取消本地/区域双模式。生产业务中的 AI 文本、语音转写、PMPHAI/内置知识库、Prompt/模板同步、反馈、审计和功能统计都只通过设备签名后的 `floating-ball-server /v1/*` 接口；客户端不再持有第三方 API Key、OAuth Secret 或供应商直连地址。

服务端不可达时相关远程能力明确失败，不回退到客户端直连第三方服务。

## 当前出站边界

| 能力 | 客户端出口 | 凭据归属 |
| --- | --- | --- |
| LLM 流式/非流式 | `/v1/ai/chat` | `floating-ball-server` |
| 批量语音转写 | `/v1/ai/speech/transcribe` | `floating-ball-server` |
| 实时语音 | `/v1/ai/speech/realtime/ws`，失败后 `/v1/ai/speech/realtime` | `floating-ball-server` |
| PMPHAI | `/v1/knowledge/pmphai/*` | `floating-ball-server` |
| 内置知识库页面 | bootstrap 配置 + 服务端 page URL | `floating-ball-server` |
| Prompt/模板/目录 | `/v1/client/*/delta` | 设备签名 |
| 反馈/审计/功能统计 | `/v1/client/*` | 设备签名 |

所有 `/v1/*` HTTP、SSE 和 WebSocket 请求必须继续经过 `requestSigner.ts` 所在的 regional client 出口。

## 保留的本地能力

以下属于桌面/HIS 基础设施，不是已废弃的本地 AI 模式：

- `src-tauri/src/http_server.rs` 的 `/api/consultation/*`、住院病历入口和事件回执通道，供本机 HIS/SDK 接入。
- HIS Adapter 对 PHIS 的调用、当前药房库存/药品详情读取和本地联调日志。
- Tauri 窗口、更新器、音频采集、文件/目录访问等桌面能力。
- 医学目录 SQLite/localStorage 缓存、失败重试队列和本地确定性安全规则。
- `SPEECH_TEST_MODE` 开发测试夹具；它不得成为生产供应商直连路径。

历史本地 `/api/pmphai/*` 代理、Rust DashScope/Whisper 命令、本地反馈 SQLite 和本地数据分析面板均已删除。

## 迁移与防回归

- 启动时清理 `REGIONAL_ENABLED`、本地 LLM/Reviewer/Speech/PMPHAI/KB 凭据和地址；只保留服务端连接参数、设备标识及非敏感展示偏好。
- CI/release 不再注入 `VITE_OPENAI_API_KEY`、`VITE_DASHSCOPE_API_KEY`、`VITE_LLM_BASE_URL` 或 `VITE_LLM_MODEL`。
- 单元测试覆盖签名 chat、stream、transcription、PMPHAI 和历史配置清理。
- 审查新增网络出口时，应拒绝业务代码直接 `fetch('/v1/*')`、直连第三方域名或新增客户端密钥存储。
