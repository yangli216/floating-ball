# Client Egress Audit

本文档用于说明 `floating-ball` 当前与 AI、语音、知识库相关的联网边界，重点回答两个问题：

1. 在当前“区域化模式”下，客户端主链路是否统一经由 `floating-ball-server` 转发
2. 客户端代码中是否仍残留可绕过 `floating-ball-server` 的出网路径

更新时间：`2026-04-22`

## 1. 结论

结论分两层：

1. 当前主链路层面：
   `floating-ball` 在区域化模式下，AI 文本、语音转写、PMPHAI 知识库主调用链已经统一走 `floating-ball-server` 的 `/v1/*` 接口，不再由前端直接请求外部 AI/知识库服务。
2. 代码残留层面：
   客户端仍保留了非区域化模式下的备用实现。这些实现要么由前端直接访问外网，要么通过本地 Tauri HTTP 代理或 Tauri Rust 命令由客户端所在机器直接出网。因此，当前代码状态还不能定义为“客户端彻底无外网能力”。

换句话说：

- “当前区域化主运行链路”已经满足服务端转发
- “客户端代码层面”仍然存在可被启用的直连或本地代理出网路径

## 2. 当前区域化主链路

以下链路在区域化模式下都会先进入 `floating-ball-server`：

### 2.1 AI 文本对话

- 客户端入口：`src/services/llm.ts`
- 区域化请求：
  - 流式：`/v1/ai/chat`
  - 非流式：`/v1/ai/chat`

关键代码：

- [llm.ts](./src/services/llm.ts)
- [regionalClient.ts](./src/services/regionalClient.ts)

说明：

- 区域化模式下，客户端只持有 bootstrap 下发的非敏感配置
- API Key 不下发到端
- 真实上游模型调用由服务端代理完成

### 2.2 聊天输入语音转写

- 客户端入口：`src/services/llm.ts`
- 区域化请求：`/v1/ai/speech/transcribe`

说明：

- 客户端先将录音转为 base64
- 再通过 `floating-ball-server` 上传
- 服务端负责转成真实文件后调用上游转写服务

### 2.3 语音问诊转写

- 客户端入口：`src/services/aliyunSpeech.ts`
- 区域化请求：`/v1/ai/speech/realtime`

说明：

- 当前区域化模式下并不是浏览器逐帧直连实时语音服务
- 而是录音结束后通过服务端代理做整段转写

### 2.4 PMPHAI 知识库

- 客户端入口：`src/services/pmphai.ts`
- 区域化请求：
  - `POST /v1/knowledge/pmphai/search`
  - `POST /v1/knowledge/pmphai/clip`
  - `POST /v1/knowledge/pmphai/list`
  - `POST /v1/knowledge/pmphai/page-url`
  - `GET /v1/knowledge/pmphai/kgbases`
  - `GET /v1/knowledge/pmphai/categories`

说明：

- 区域化模式下 PMPHAI 凭据由服务端托管
- 客户端不再保留 `appKey/appSecret`
- 页面签名地址也通过服务端生成

## 3. 当前仍残留的客户端出网路径

以下内容是后续“完全区域化”时需要重点清理的对象。

## 3.1 LLM 文本对话直连上游

风险级别：高

位置：

- [llm.ts](./src/services/llm.ts)

风险说明：

- 非区域化模式下，文本聊天会直接请求 `${baseUrl}/chat/completions`
- 默认配置仍兼容 OpenAI 风格地址
- 这属于客户端直接访问外部模型服务

触发条件：

- `isRegionalMode()` 返回 `false`
- 或调用时显式传入非区域化配置

后续建议：

- 完全区域化后删除非区域化 `fetch` 路径
- 保留 `/v1/ai/chat` 作为唯一入口

## 3.2 聊天输入语音转写直连上游

风险级别：高

位置：

- [llm.ts](./src/services/llm.ts)

风险说明：

- 非区域化模式下，语音转写会请求 `${audioBaseUrl}/audio/transcriptions`
- 若 Tauri 命令不可用，还会回退到前端 `fetch`
- 这条链路可以绕过 `floating-ball-server`

后续建议：

- 完全区域化后仅保留 `/v1/ai/speech/transcribe`
- 删除前端直连与 Tauri 备用直连逻辑

## 3.3 阿里云实时语音直连

风险级别：高

位置：

- [aliyunSpeech.ts](./src/services/aliyunSpeech.ts)

风险说明：

- 非区域化模式下，`transcribeWithAliyunInternal()` 会调用 Tauri 命令 `transcribe_realtime_aliyun`
- 该链路由客户端所在机器直接连外部语音服务
- 不经过 `floating-ball-server`

后续建议：

- 完全区域化后删除 `transcribeWithAliyunInternal()`
- 删除所有依赖本地 DashScope Key 的路径

## 3.4 PMPHAI 本地代理出网

风险级别：高

位置：

- [pmphai.ts](./src/services/pmphai.ts)
- [http_server.rs](./src-tauri/src/http_server.rs)

风险说明：

- 当前保留了本地 HTTP 代理 `http://localhost:8081/api/pmphai/*`
- 前端虽然没有直接访问 `inside.pmphai.com`
- 但本地 Tauri HTTP 服务会代替客户端机器出网访问 PMPHAI
- 从网络边界角度看，这仍属于“客户端侧可出网能力”

涉及接口：

- `/api/pmphai/token`
- `/api/pmphai/search`
- `/api/pmphai/clip`
- `/api/pmphai/list`
- `/api/pmphai/page-url`

后续建议：

- 完全区域化后删除本地 `/api/pmphai/*` 整套代理
- 统一改为 `floating-ball-server` 的 `/v1/knowledge/pmphai/*`

## 3.5 PMPHAI 知识库列表存在直接外网请求

风险级别：高

位置：

- [pmphai.ts](./src/services/pmphai.ts)

风险说明：

- `getKnowledgeBases()` 的非区域化分支没有走本地 `/api/pmphai/*`
- 而是直接请求 PMPHAI 标准接口
- 这是最直接的客户端外网访问之一

后续建议：

- 完全区域化后删除该非区域化实现

## 3.6 区域化模式仍可关闭

风险级别：中

位置：

- [regionalClient.ts](./src/services/regionalClient.ts)

风险说明：

- 当前是“默认启用区域化”，不是“强制启用区域化”
- 只要 `REGIONAL_ENABLED` 被关闭，前述非区域化备用链路仍然可以启用

后续建议：

- 完全区域化后移除 `setRegionalMode(false)` 的业务意义
- 将区域化模式改为不可关闭或仅保留只读显示

## 4. 可删除代码范围建议

当项目进入“完全区域化”阶段后，可按以下顺序清理：

### 第一批：高优先级，直接切断客户端外网能力

1. `src/services/llm.ts` 中所有非区域化 `fetch` 上游模型逻辑
2. `src/services/aliyunSpeech.ts` 中所有非区域化阿里云直连逻辑
3. `src/services/pmphai.ts` 中所有非区域化 PMPHAI 逻辑

### 第二批：删除本地代理基础设施

1. `src-tauri/src/http_server.rs` 中 `/api/pmphai/*` 路由
2. `src-tauri/src/http_server.rs` 中 PMPHAI 常量、签名、token、search、clip、list、page-url 相关实现

### 第三批：删除本地配置入口

1. 设置页中 PMPHAI AppKey/AppSecret 等本地配置项
2. 本地 LLM API Key / Base URL / Audio Base URL 等只用于非区域化的配置项
3. 本地 DashScope Key 配置项

### 第四批：强制化区域化模式

1. 删除或收敛 `REGIONAL_ENABLED=false` 分支
2. 让 AI、语音、知识库统一只保留 `/v1/*` 出口

## 5. 最终目标状态

完全区域化完成后，应满足以下判定标准：

1. `floating-ball` 不再保存任何外部 AI / PMPHAI / DashScope 凭据
2. `floating-ball` 不再直接请求任何外部模型或知识库域名
3. `floating-ball` 不再通过本地 Tauri HTTP 代理代替客户端出网
4. AI、语音、知识库所有请求统一只允许进入 `floating-ball-server`
5. `floating-ball-server` 成为唯一的外部 AI 与知识库访问出口

## 6. 本次审计覆盖范围

本次核查重点覆盖以下模块：

- `src/services/llm.ts`
- `src/services/aliyunSpeech.ts`
- `src/services/pmphai.ts`
- `src/services/regionalClient.ts`
- `src-tauri/src/http_server.rs`
- `floating-ball-server/API.md`

本次文档结论基于代码真实调用链，不以历史 PRD 或规划文档作为判断依据。
