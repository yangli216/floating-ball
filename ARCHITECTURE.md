# 架构文档 (ARCHITECTURE.md)

> **最后更新**: 2026-06-15
>
> **重要**: 此文档是项目架构的唯一真实来源。任何架构级别的代码修改都必须同步更新此文档。

## 目录

- [概述](#概述)
- [复用架构准则](#复用架构准则)
- [核心架构](#核心架构)
- [用户体系 (Auth)](#用户体系-auth)
- [应用入口 (App.vue)](#应用入口-appvue)
- [组合式函数 (Composables)](#组合式函数-composables)
- [组件 (Components)](#组件-components)
- [常量 (Constants)](#常量-constants)
- [样式模块 (Styles)](#样式模块-styles)
- [服务 (Services)](#服务-services)
- [数据流](#数据流)
- [维护指南](#维护指南)
- [重构历史](#重构历史)

---

## 概述

这是一个 Tauri 2.0 + Vue 3 桌面应用，采用**组合式架构 (Composition Architecture)** 模式，当前运行时以本地桌面能力为主：

- **UI 层**: Vue 组件负责渲染和用户交互
- **逻辑层**: Composables 封装可复用的业务逻辑
- **状态层**: Vue Composition API `ref/reactive` + Pinia（用于跨组件共享配置状态）
- **数据层**: Services 负责外部通信（LLM、语音识别、知识库、HIS 本地桥接）

补充说明：

1. 当前真实运行契约以 `src-tauri/src/http_server.rs` + `api.md` 为准。
2. `docs/regionalization/*.md` 仍然保留，但属于未来区域化改造设计稿，不代表当前运行态。

### 设计原则

1. **单一职责 (SRP)**: 每个模块只做一件事
2. **关注点分离**: UI、逻辑、状态分离
3. **组合优于继承**: 通过 Composables 组合功能
4. **状态本地化**: 优先使用组件内状态，仅在必要时使用全局状态
5. **渐进式状态管理**: 优先局部 `ref/reactive`，跨模块共享状态使用 Pinia

### 架构特点

- ✅ **轻量级**: 以 `ref/reactive` 为主，仅在必要场景使用 Pinia
- ✅ **模块化**: 代码按职责分离到独立文件
- ✅ **可测试**: Composables 可独立测试
- ✅ **高性能**: 缓存优化、防抖、GPU 加速动画
- ✅ **可维护**: 清晰的代码结构，易于理解和修改

---

## 复用架构准则

前端复用治理以 [docs/frontend-reuse-architecture.md](docs/frontend-reuse-architecture.md) 为准，文件迁移路线图见 [docs/frontend-file-structure-plan.md](docs/frontend-file-structure-plan.md)。两者关系是：

1. `frontend-reuse-architecture.md` 回答“哪些能力值得复用、用什么模式复用、什么时候不该继续拆”。
2. `frontend-file-structure-plan.md` 回答“稳定能力最终放在哪个路径、旧路径如何迁移”。

当前治理立场：

1. 不再把“拆出更多文件”视为单独成果；每次重构必须沉淀为 Adapter、Builder、Strategy、Composable Controller、Headless UI 或明确 feature/domain 能力之一。
2. 语音问诊与智能问诊共享的结果页能力优先沉淀在 `features/clinical-result` 与 `features/consultation-result`，页面层只保留 toast、缓存、Tauri invoke 和渠道流程编排；渠道派生、放弃确认、用户日志三态这类轻状态优先进入 `consultation-result/model` 并通过 options 注入副作用。
3. `ConsultationPage.vue` 后续优先 controller 化：症状采集、assist 快进入口、AI 推荐、PHIS 引用、完成问诊分别形成可读的流程 controller，再考虑移动入口文件；App 级事件入口优先把接诊、患者补全和风险胶囊这类跨问诊/语音的状态机沉淀到 `app/events`。
4. `shared/*` 只接收无业务语义的基础能力；诊断、治疗、问诊、反馈等医疗语义能力不得因为“多个地方用”就提前放入 shared。
5. 旧 `components/`、`composables/` facade 在调用方切完后应被清理；治理后只新增不删除，视为未完成收敛。
6. 智能问诊症状采集阶段的模板表单初始化、互斥选择、必填校验、病历草稿拼装等纯规则归入 `features/symptom-consultation/lib`；页面只保留用户动作编排、toast、DOM 滚动、AI 请求和 PHIS/HIS 副作用。
7. 面向用户展示的错误文案统一经 `src/shared/lib/errorMessages.ts` 归一化。业务页面可以追加场景前缀，但不得直接把 `Error.message`、`TypeError: Failed to fetch`、`Load failed`、HTTP statusText、JSON 解析错误或后端底层异常原样展示给医生；需要排障时展示 `requestId` 或引导查看 HIS 联调日志 / 后台日志。

---

## 核心架构

```
┌─────────────────────────────────────────────┐
│           App.vue (应用编排器)               │
│  - 723 行（保留编排，不承接新业务逻辑）      │
│  - 初始化所有 Composables                    │
│  - 管理全局状态（ref/reactive）              │
│  - 渲染根组件和路由视图                      │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
   ┌────────┐  ┌────────┐  ┌────────┐
   │Components│ │Composables│ │Constants│
   │         │  │ (业务逻辑)│  │ (配置)  │
   └────────┘  └────────┘  └────────┘
        │           │           │
        └───────────┼───────────┘
                    ▼
              ┌──────────┐
              │ Services │
              │(外部通信)│
              └──────────┘
                    │
                    ▼
            ┌───────────────┐
            │ Tauri Backend │
            │  (Rust Core)  │
            └───────────────┘
```

### 层次职责

| 层次 | 职责 | 示例 |
|------|------|------|
| **App.vue** | 应用编排、状态声明、组件路由 | 初始化 composables、渲染视图组件 |
| **Composables** | 业务逻辑封装、可复用功能 | 窗口管理、工作模式、导航 |
| **Stores (Pinia)** | 跨组件共享状态 | `consultationConfig` 配置状态、`diagnosisPath` 诊断路径缓存 |
| **Components** | UI 渲染、用户交互 | 聊天面板、设置面板、语音胶囊 |
| **Services** | 外部通信、数据转换 | LLM API、语音识别、医疗数据匹配 |
| **Shared Lib** | 跨业务基础工具 | 错误文案归一、通用纯函数 |
| **Constants** | 配置常量、类型定义 | 窗口尺寸、动画参数 |
| **Styles** | 样式模块化 | 全局样式、布局、动画 |

### Pinia 使用说明

- `src/main.ts` 在应用启动时执行 `createPinia()` 并 `app.use(pinia)`
- 当前主要用于 `src/stores/consultationConfig.ts` 的跨组件配置共享
- `src/stores/diagnosisPath.ts` 用于主问诊页和独立诊断路径窗口之间共享诊断路径结构化结果缓存
- 其余页面状态仍以局部 `ref/reactive` 为主，避免过度全局化

---

## 用户体系 (Auth)

### 当前状态

当前代码库**尚未落地独立医生登录态**，运行态分为本地模式与区域化模式两条链路：

1. 本地模式下，LLM / 审查模型 / PMPHAI 等凭据仍通过设置页、`localStorage` 与 `.env` 兜底管理。
2. 区域化模式下，桌面端通过 `SettingsPanel.vue` 或预置的 `REGIONAL_*` 配置项保存 `REGIONAL_ENABLED / REGIONAL_BASE_URL / REGIONAL_ORG_CODE`，再由 `regionalRuntime.ts -> regionalClient.ts` 完成设备注册、`bootstrap` 拉取和 `/v1/*` 调用；首启默认接入值中的后端地址优先取构建时注入的 `VITE_REGIONAL_BASE_URL`（CI/Release 由 GitHub Actions Repository Variables 注入），机构编码默认回退到 `ORG001`，如需覆盖仅通过本地 `.env` 或设置页手工配置；后续仍允许在设置页修改或关闭；桌面端不再编辑这些密钥类配置。
2.1 `regionalClient.ts` 会优先通过 Tauri Rust 命令读取设备网卡 MAC 地址，并将其作为 `cdDevice` / 设备编码持久化使用；仅在当前环境无法读取 MAC 时才回退到本地生成的兜底编码。
2.2 `SettingsPanel.vue` 需要同时提供“桌面端到 floating-ball-server”的接入测试入口，用于验证 `register -> bootstrap` 链路，并与后台“server 到 LLM”测试入口形成分层排障。
2.3 设置页“测试 server 连通性”只等待更新策略检查、设备注册和 `bootstrap` 获取，不再同步等待 prompt / template / mapping 数据包等运行时后置同步；区域化 HTTP 请求与更新策略检查必须设置有限超时，失败时结束按钮等待态并展示可操作错误信息。
2.4 区域化签名时间戳使用 epoch 毫秒。`requestSigner.ts` 会根据 `/v1/*` 响应体顶层 `timestamp` 维护“本机到服务端”的时钟偏移；遇到 `SIG-401` 且响应带服务端时间时，HTTP/SSE 请求会刷新偏移后重签重试一次，避免桌面端系统时间与后台服务器相差超过 5 分钟时阻断诊断推荐。
2.5 区域化客户端版本升级、WebView 存储域变化或本地签名密钥重建时，桌面端仍以同机构同 `cdDevice` 调用 `POST /v1/client/register`；若本地仍持有旧 `deviceToken`，注册请求会携带该令牌作为同终端证明，后台负责更新设备公钥并返回设备令牌，桌面端不应因同设备码已存在而提示医生手工更新密钥。
3. HIS 联调通过本地 HTTP Bridge 完成，不依赖独立登录态。
4. `docs/regionalization/*.md` 中关于 `auth.ts`、`AuthGate.vue` 的更完整登录态设计仍未进入当前实现。

### 前端分层设计

1. 当前设置与凭据状态通过 `localStorage`、`consultationConfig` store、本地 Tauri Store 管理，其中“通用 LLM”和“语音转写”配置分域存储，避免同一组 Audio 字段误导到不同 provider。本地模式下，“模型配置”页同时维护主模型、`chatFast` 独立模型和 `enable_thinking` 开关；区域化模式下继续隐藏该页签，并以 `bootstrap` 下发的主模型 / `chatFast` 模型和 `enableThinking` 开关为准，由 `floating-ball-server` 统一托管是否向上游传递 `enable_thinking`。
2. 本地 HIS 对接入口由 `src-tauri/src/http_server.rs` 提供。
3. 若未来引入真实登录态，应新增专用文档章节并在 `AGENTS.md` / `api.md` 中同步说明。
4. Windows 内网更新源采用本地配置驱动：测试环境地址、正式环境地址和当前生效环境保存在 `localStorage`，前端只负责展示与选择，真正的 updater endpoint 在 Rust 侧通过 `updater_builder()` 运行时注入。区域化模式下，客户端会按当前更新通道访问 `floating-ball-server` 的 `/v1/client/releases/{channel}/policy.json`；若服务端发布策略要求强制更新且当前版本低于 `minSupportedVersion`，应用进入强制更新门禁，只保留更新源配置、检查更新、下载安装并重启能力。
5. 主窗口的聊天、设置、问诊等可调整工作视图会将用户最后一次手动调整后的窗口尺寸写入 `.settings.dat`，再次打开对应视图时优先恢复该尺寸；聊天视图会丢弃低于标准工作面板高度的历史扁窗尺寸并回到默认窄高比例，智能问诊视图会丢弃低于当前默认尺寸的历史记录并回到适度放大的双栏比例，避免欢迎区、病历编辑区、推荐清单或底部操作区被不合适的历史尺寸继续影响；悬浮球启动阶段在 Rust 层读取 `.settings.dat` 的历史位置，并按当前显示器 `workArea`、实际窗口物理尺寸和最近边缘吸附策略夹回可见安全区域，若历史位置已不属于当前工作区则回落到主屏右侧居中位置。
6. 通用设置页新增音频输入设备配置，首选麦克风 `deviceId` 保存在 `localStorage`；聊天录音和语音接诊共用同一配置，若指定设备不存在则自动回退到系统默认输入设备。设置页首次进入时会按权限状态自动补做一次设备列表预热，尽量避免初次枚举不完整、必须手动刷新后才看到全部麦克风。
7. 语音转写配置与通用 LLM 配置分离：本地模式下默认 provider 为阿里云 DashScope，`VoiceCapsule.vue` 实时语音和 `ChatPanel.vue` 录音转写共用同一套 speech config；若切换到 OpenAI 兼容 provider，则统一降级为批量转写链路。

### 与主流程关系

1. 现阶段所有问诊、语音、session 回写能力都必须兼容本地模式。
2. 区域化模式下，`LLM`、独立审查 AI、PMPHAI 知识库等上游能力默认走 `floating-ball-server` 的 `/v1/*` 代理或服务端签名接口，桌面端不直接保存或下发这些密钥。
3. 本地模式仍保留直连 OpenAI 兼容接口、DashScope 与本地 PMPHAI 代理的兜底路径。
4. 区域化模式下，工作区共用顶栏的"问题反馈"入口与一键回写后弹出的整页反馈，统一使用同一份 `FeedbackSubmissionPanel`（紧凑星级 + 预置问题标签 + 选填截图 + 选填补充说明）；通用反馈面板会按“当前问诊锚点 + 模块”回填上次已提交内容，医生再次进入时默认编辑同一份反馈而不是新建一条；语音问诊的推荐项 / 病例字段 / 整页反馈则通过 `voiceFeedback.ts` 映射到同一 `/v1/client/feedbacks` 接口，所有反馈都会附带最近一次 AI 调用的 `traceId`、`sessionId`、`chainContext` 与握手阶段缓存的医生 / 机构 / 科室身份（`feedbackContext.ts`），由 `floating-ball-server` 端按 `kind`（`general | recommendation | record_field | session`）+ `severity` 分类落库。
5. 区域化模式下，每个 `/v1/*` 业务请求会附带 `X-Client-Version` 与 `X-Update-Channel`，服务端返回 `426 / UPDATE-REQUIRED` 时，客户端立即切换到强制更新门禁，禁止继续使用问诊、语音、知识库、AI 代理、模板同步、反馈等业务能力。
6. 区域化模式下，智能问诊和语音问诊会通过 `consultationUserLog.ts` 向 `floating-ball-server` 的 `/v1/client/user-logs/consultations` 上报运维用户日志快照：首版 AI 生成内容与医生最终提交/回写内容分别落到同一条问诊记录中，不记录中间每一次编辑；语音问诊停止录音后会额外上报本次录音和 ASR 识别文字，供后台用户日志详情播放与复盘。
7. 区域化模式下，原始操作日志只保留能定位业务路径的结构化事件：`operationTracker.ts` 负责把高噪声 UI 事件白名单化过滤，并把保留事件统一上报为 `{ module, action, title, sourceModule, scene }`；`aiTrace.ts` 则为 AI 代理补齐“哪个业务发起了这次调用”的上下文，避免后台只看到泛化的 `ai/chat`。
8. 区域化模式下，辅诊功能统计不再从原始操作日志推断。`featureUsageTracker.ts` 负责在用户真实触发功能时向 `/v1/client/feature-events/batch` 上报业务事件；一次明确功能调用只写一条，默认以本地队列事件自身作为幂等键，保证离线重试或接口重试不重复入库。`featureUsageEntryTracker.ts` 负责把 HIS Bridge 入口归一到产品功能维度：`start-consultation`、`start-voice`、`assist` 在接诊上下文校验通过并准备打开目标界面时即记一次成功调用；同一就诊再次显式触发入口按新调用计数，后续 AI 生成、问诊提交或结果页自动触发不再额外补一条功能统计。审计日志继续用于排障，功能事件才是后台“辅诊功能”统计事实源。智能问诊、语音问诊、报告单解读、聊天、知识库使用按用户进入/提交的主功能计数；知识库批量检索只按一次用户检索动作计数，不按内部拆开的多个查询词累加；诊断鉴别和推荐诊断/用药/检查/检验/处置/诊疗方案推荐只在医生显式触发独立辅助入口时计数，智能问诊或语音问诊主流程内部自动生成的 AI trace 不再拆成子功能调用次数。
9. 登录态设计在当前版本不是前置依赖，不能假定仓库内已有 `auth store` 或受保护 API 基座。
10. 独立诊疗方案推荐由 `features/treatment-plan` 承载，入口为 `/api/consultation/assist` 的 `action: treatment_plan`。该功能不进入 `ConsultationPage.vue` 的症状采集栈，也不维护另一套回写格式：AI 请求继续复用 `features/clinical-result` 的治疗推荐 request builder、JSON 解析、标准库匹配与治疗归一化能力；推荐项二次编辑继续复用 `features/consultation-result` 的 `TreatmentRecommendationCard`、`TreatmentItemEditor`、手动匹配、二级属性搜索、药品字段编辑、药品详情和库存校验能力；选中前和最终提交前必须复用共享治疗项非空校验，确保用药、检查、检验、处置均具备 PHIS 调入确认所需的标准服务 ID、名称、分类、执行位置及各类型专属必填字段；医生手动清空执行科室后由 `TreatmentRecommendation.execDeptCleared` 标记当前输入空值，hydrate、归一化、门禁和 order resolver 都不得再用匹配元数据或默认科室补回；最终提交继续使用 `recordConfirmedPayload.ts` 构造 `diagList/orderList` 并等待 PHIS `reference-feedback` 回执。独立鉴别诊断由 `features/differential-diagnosis` 承载，入口为 `action: diffDx`，只打开“鉴别排查确认”小窗并生成 checklist，不进入后续问诊结果页。
11. 住院病历辅助生成由 `features/inpatient-emr` 承载，入口为 `POST /api/inpatient/emr/generate`。该功能不进入 `ConsultationPage.vue` 或语音问诊结果页，而是作为独立工作视图展示模板解析、住院 HIS 数据拉取、AI 生成步骤和病历预览；模板字段侧栏只展示适合 AI 生成的字段，字段提示词默认折叠在详情中。入口必须传入 `templateId + templateName + htmlContent`，可选传入 `recordTime` 作为本次病程记录书写时间，并可传 `doctorSupplement + contextPolicy + hisContext` 按 [三方对接手册](docs/his-inpatient-emr-ai-context-integration.md) 提供裁剪后的 AI 上下文包；生成上下文会形成 `documentContext` 和标准化 `aiContext`，只使用请求自带 `hisContext` 或 HIS Adapter 聚合上下文能力，PHIS 侧直连 `api/phis.aiInpatientEmrContextService/buildContext`，不再回退到住院登记、医嘱、体温单分散接口。AI 生成以 `recordTime` 的日期作为“今日 / 本次查房日期”，体温单历史记录只能按“最近一次记录日期”引用，不能替代书写日期。医生可在“重新生成”弹窗中手动输入或语音转写补充本次查房要点，也可引用已拉取正文的门诊病历作为入院记录病史来源；两类材料可以同时进入提示词并共同作为依据。初次自动生成时，入院类模板若既无补充要点、也无可用门诊正文，会进入等待补充依据状态；医生点击弹窗中的“直接重新生成”后，页面通过 `allowGenerateWithoutExternalBasis` 显式确认只基于住院聚合上下文继续生成，服务层不得再次返回 waiting。入院记录生成必须从住院病历书写角度综合门诊病历、医生补充与住院上下文重新组织语言，不得把门诊主诉、现病史或门诊正文原样搬到入院记录字段中。区域化模式下模板解析结果优先通过后端 `/v1/client/inpatient-emr/templates/resolve` 按 `templateId` 缓存并接收管理端维护的字段提示词，命中后不得再先跑本地未知字段 LLM 分类；非区域化、后端不可用或后端未返回字段时才使用本地解析兜底。病历预览中非 AI 字段保持只读，AI 字段高亮并允许医生直接修改；页眉病历标题等模板自带非 AI 字段必须保留原模板默认值，不得被病程记录固定文案覆盖。生成结果必须携带结构化 `trace` 与 `evidenceSummary`：trace 覆盖 HIS 聚合上下文、门诊正文、模板解析、AI 首 token / 总耗时、回写发送和回执耗时，evidenceSummary 展示住院上下文、门诊病历正文、医生补充要点和模板缓存是否参与生成；生成完成、回写发送和回执到达时会把脱敏 trace 汇总写入本地 HIS 集成日志，只记录阶段状态、耗时、计数和 requestId，不记录 `htmlContent`、`fieldValues` 或门诊/住院病历正文。住院病历页在 App 层以 `v-show` 保活，收缩到小球时通过 `useMinimizedSessions` 记录 `inpatient-emr` 槽位；`start-inpatient-emr-generation` 入口再次收到同一 `admissionId` 且当前存在同槽位最小化现场时，只调用 `navigation.openInpatientEmr()` 恢复，不覆盖 `inpatientEmrRequest`，因此不会触发页面 watcher 重启 AI 生成；收到不同 `admissionId` 的新请求时先清理旧住院病历最小化槽位，再按新请求生成。页面内“放弃”按钮走二次确认，确认后清空 `inpatientEmrRequest` 与最小化记录并退出工作模式。医生在病历预览中确认 AI 字段后点击“一键回写”，页面先执行一轮本地轻量病历质控；未发现风险项时直接复用本地结果事件通道产出 `record-confirmed`，发现风险项时只弹出质控提醒让医生返回预览修改或确认继续回写。`record-confirmed.fieldValues` 仍只包含本次模板内标记为适合 AI 生成的 `{ [data-id]: 文本 }` 字段级结果，供 HIS 按当前模板回填；PHIS/HIS 后续通过 `reference-feedback` 回执更新页面状态，成功回执会让病历生成界面收起回小球状态，失败回执保留当前编辑现场并允许重试。

---

## 应用入口 (App.vue)

### 当前状态

**代码行数**: 约 723 行（当前以编排职责为主，未重新收敛回单体逻辑）

**职责**: 轻量级应用编排器

### 交互目标（2026-03 设计约束）

1. 保留 `ConsultationPage.vue` 现有症状问诊主链路，支持完整走完既有流程。
2. 原灵活模式入口已完全并入 `ConsultationPage.vue`，作为“主问诊内嵌灵活模式”存在；项目内不再保留独立 `consultation-session` 小窗实现。
3. `/api/consultation/assist` 与桌面端附加入口仍然保留，但其目标变为“打开 `ConsultationPage` 指定阶段”。当 HIS 已传入 `chiefComplaint/historyOfPresentIllness` 时，页面应直接跳过症状选择，进入病历详情与 AI 推荐阶段。
4. 灵活模式下的推荐诊断 / 推荐用药 / 推荐检查 / 推荐检验 / 推荐处置，必须继续复用 `ConsultationPage.vue` 现有的诊断生成、标准库匹配、诊断路径与方案联动逻辑，不允许维护第二套轻量推荐口径；外部 API 新接入推荐使用 `suggestedDx` 表示诊断推荐，前端事件层统一归一到内部 `diagnosis` 流程，历史 action 继续兼容。`diffDx` 是独立鉴别诊断入口，直接打开独立“鉴别排查确认”小窗，不进入 `ConsultationPage.vue` 或共享结果页。
5. 各模块的“确认”和“引用”语义必须拆分：主诉/现病史回写可以直接更新医生站草稿；诊断鉴别确认只记日志，不修改病历；推荐诊断、推荐用药、推荐检查等的“引用”才真正进入 PHIS 保存闭环。
6. 灵活模式必须实现前置门禁：`suggestedDx` / `diagnosis` 入口要求已有主诉和现病史，且诊断推荐调用不要求 HIS 传入当前诊断；`diffDx` / `differential` / `medication` / `examination` / `lab_test` / `procedure` 入口要求已有主诉、现病史和当前诊断；若条件不足，页面需要给出明确提示并停留在可继续补全信息的位置。
7. `web_project/public/mock-his.html` 作为联调页时，应优先通过 `sdk/med-hermes-sdk.js` 的 WebSocket 事件订阅获取 `/api/consultation/events/ws` 推送；`/api/consultation/events/poll` 仅作为 WebSocket 不可用时的兜底，并且仍必须支持“引用请求 -> PHIS 保存成功/失败 -> 回执 floating-ball”的完整闭环。
8. `POST /api/consultation/reference-feedback` 成为 PHIS 引用回执入口。floating-ball 发起引用后应继续停留在当前 `ConsultationPage`，医生可继续完成本次问诊；收到回执后，必须更新当前问诊页状态、记录日志、标注已引用或失败原因。当前实现仍以内存状态为主，而不是落盘恢复。
9. `/api/consultation/events/ws` 与 `/api/consultation/events/poll` 需要统一返回“病历草稿写回”、“引用请求发起”、“PHIS 引用回执”等事件 envelope；联调页或 HIS 侧仍需校验 `event.id`、`consultationId` 与当前患者一致，避免旧结果提前命中。
10. 本地 HTTP Bridge 的业务接口不允许使用 permissive CORS 或仅依赖已保存握手上下文；`POST /api/handshake` 成功后必须发放当前 origin 绑定的本地 Bridge session，后续 REST / WebSocket 请求必须逐请求校验 session、origin、timestamp、nonce 与签名。`GET /api/health` 和 `/sdk/*` 只用于在线探测与 SDK 加载，不代表业务授权。
11. 针对推荐诊断的重复引用，需要区分“同一诊断重复点击”和“更换为新诊断引用”；前者应提示已成功引用，后者应允许 PHIS 进入诊断修改流程并通过回执反馈最终结果。
12. 后端内部仍沿用 `start-consultation-session` 这个 Tauri 事件名承接 `/api/consultation/assist` 的兼容分发；普通灵活模式落点是 `navigation.openConsultation()` + `ConsultationPage`，`treatment_plan` / `diffDx` 分别由独立诊疗方案页和独立鉴别诊断小窗承载，不再存在旧版独立 session 小窗视图。
13. `ConsultationPage.vue` 里的推荐诊断必须保持单选，并以当前选中诊断作为引用对象；推荐用药、检查、检验、处置则保留多选，并在各自分组级提供一次引入所选项的入口。对暂不支持 PHIS 引用的推荐项，应作为只读处置建议单独展示，避免被误当作检查项提交。
14. 检验检查报告解读不进入 `ConsultationPage.vue`。该能力通过 `POST /api/report/interpret` -> `useEventListeners.ts` -> 独立报告解读窗口链路完成，避免打断当前问诊主页面。
15. 报告解读独立窗口默认隐藏原生标题栏，窗口移动依赖页面头部拖拽区，关闭动作统一走页面内虚拟按钮；窗口外壳、操作按钮、loading 与空态沿用 floating-ball 既有柔和玻璃态窗口语言；正文采用单页报告单式纵向阅读版式，窗口主体滚动容器承接溢出内容，不能裁切报告元数据、异常项目或综合判断；打印模式必须覆盖全局 `html/body/#app` 的固定高度与 `overflow: hidden`，让报告按内容自然分页。
15.1 住院病历辅助生成不进入 `ConsultationPage.vue`。该能力通过 `POST /api/inpatient/emr/generate` -> `start-inpatient-emr-generation` Tauri 事件 -> `navigation.openInpatientEmr()` 链路打开主窗口内独立界面；HIS 数据通过 `fetchInpatientEmrContext` / `buildContext` 一次性获取，当前 PHIS Adapter 直连 `api/phis.aiInpatientEmrContextService/buildContext`，再在桌面端拆解为登记、医嘱、生命体征、历史病历等上下文。入院记录引用门诊基础资料时，先由 `HisAdapter.fetchOutpatientVisitHistory` 调用 PHIS `api/phis.clinicPatientService/queryVisitHistory` 拉取门诊就诊列表并映射为中性 `HisOutpatientVisit`，查询所需患者主键来自入口 `patient.idPi / patient.patientId` 或 `buildContext` 返回的 `hisContext.patient.patientId`，该字段不得被上下文裁剪移除；门诊历史默认查近 7 天，弹窗提供近 1 月 / 近 3 月切换，PHIS 入参使用 `params.dtBgn: ["YYYY-MM-DD 00:00:00", "YYYY-MM-DD 23:59:59"]`；列表只展示同时具备有效诊断和门诊病历文书的就诊记录，无诊断或 `getLookMedList` 无文书的就诊在 adapter 层过滤。医生选定一次就诊后，当前 PHIS Adapter 先通过 `api/otms.rpcEmrEditorLookService/getLookMedList` 拉取该门诊就诊下的病历文书列表，入参固定 `idApp = 42`、`idHospital = 门诊 idVis`、`idTet = 握手 tenantId 或门诊记录 raw.idTet`，再按选中的 `idMedrecdoc` 调用 `api/otms.rpcEmrEditorLookService/getMedContentLook` 拉取 HTML 正文，入参固定 `courseShow = 0`。门诊病历正文会转换为预览 HTML 和 AI 可读纯文本；若正文接口失败，才退回只展示文书列表并提示正文暂不可用。已选门诊病历正文和医生补充要点可共同作为入院记录生成依据，即使请求已携带住院 HIS 聚合上下文，也必须继续按 `outpatientVisitId` 拉取该门诊正文；生成时必须以入院记录结构重新归纳主诉、现病史、入院情况等字段。历史病历上下文应在 HIS 适配层完成裁剪：病案首页不进入 AI 上下文，入院记录提取主诉、现病史和关键结构化章节，病程记录保留近期摘要。界面必须用统一“生成过程”面板合并展示“获取住院上下文 / 整理诊疗摘要 / 整理病历依据 / 解析病历 / AI 生成”的步骤状态和对应依据摘要；耗时统一只在面板底部折叠的详细联调 trace 中查看。AI 生成字段、折叠式字段提示词详情和可编辑病历预览仍独立展示。预览内非 AI 字段不得编辑，AI 字段直接在模板位置高亮编辑，避免为不同病历模板维护固定正文编辑区；“重新生成”必须先允许医生补充病历要点，支持文本输入和语音转写，补充内容作为 `doctorSupplement` 进入下一次 AI 生成；若已有补充要点、已引用带正文的门诊病历，或医生点击“直接重新生成”并由页面设置 `allowGenerateWithoutExternalBasis`，则不再停在等待输入状态。住院病历页的顶栏收缩和页面 `close` 事件只做最小化保活，可通过悬浮球恢复入口、双击小球或同一 `admissionId` 的新入口请求回到同一现场；页面“放弃”才清空现场并退回小球。一键回写前不再展示重复的字段审核页；页面改为执行本地轻量质控，重点检查 AI 字段空值或占位文本、生成兜底/等待输入、住院上下文缺失、体温单日期不匹配、上下文裁剪和门诊正文不可用等风险。只有存在风险项时才弹出质控提醒，医生可返回预览修改或确认继续回写；无风险时直接发送回写事件。发送回写后继续记录发送耗时与 `reference-feedback` 回执耗时。收到 HIS `reference-feedback` 成功回执后收起回小球，失败回执保留页面和当前编辑内容。
16. 智能问诊的页面留存与语音问诊一致：未诊毕、未确认放弃时，再次点击“智能问诊”或最小化后再次打开，必须恢复 `ConsultationPage` 上次内部页面（症状采集、病历详情或最终报告）及数据快照；症状问诊结果页“返回”只回编辑页，“放弃”确认后必须清空当前快照和页面内勾选/推荐状态并直接退回悬浮球；语音问诊一键回写成功只代表本次回写闭环成功，不代表诊毕，同一接诊上下文内再次触发 `start-voice-consultation` 时必须恢复上一张语音结果页；但当前接诊从患者 A 切换到患者 B 时，患者 A 的语音缓存和最小化入口必须同步失效，之后再切回患者 A 也重新开始语音问诊；只有诊毕、确认放弃、患者切换或跨自然日失效时才清理。
17. 智能问诊 AI 调用不得在请求发起时清空已有诊断或推荐结果；新结果只有在 LLM 响应解析成功且仍匹配当前诊断上下文时才提交到页面状态。结构化 JSON 解析统一允许代码块和少量前后说明，从响应中抽取 JSON 对象/数组后再解析；各路推荐独立失败时保留上一版数据，并只更新对应错误态，避免单次解析或网络抖动造成整页丢结果。
17.1 智能问诊症状采集后的主诉 / 现病史草稿优先由 LLM 生成：`ConsultationPage.vue` 收集症状表单、患者基础信息和一般情况，交给 `features/symptom-consultation/lib/consultationRecordAiDraft.ts` 组装基层全科模板风格的 JSON 请求；模型输出必须包含 `chiefComplaint` 与 `historyOfPresentIllness`，解析或内容校验失败时退回 `consultationGeneratedRecord.ts` 的本地规则草稿，避免阻断后续诊断推荐。AI 草稿只写入当前可编辑结果页，不直接回写 HIS。
18. 症状问诊和语音问诊最终一键回写共用 `record-confirmed` 构造器；进入 `diagList.idDiag` 的值必须是标准诊断库 ID（PHIS `ID_DIE`），不得使用 `diag_*`、`phis-diagnosis-*` 等前端临时 ID。症状问诊从 `Diagnosis` 适配到共享结果页的 `VoiceIntentResult.diagnoses` 时必须把标准诊断 ID 透传为 `matchedItem.id` 或等价标准 ID 字段，避免共享结果页初始化时丢失诊断主键。
19. HIS 联调相关的调用必须进入本地 HIS 集成日志：HTTP Bridge 入站接口由 Rust 侧直接记录，前端 `hisService.ts` 出站请求通过 `hisIntegrationLog.ts` 写入同一 JSONL 日志，并在日志面板中按 `traceId`、接口、方向、状态筛选和导出。

### 代码结构

```vue
<script setup lang="ts">
// 1. 导入声明 (~30 行)
import { useWindowManagement } from "@app/shell/useWindowManagement";
import { useWorkMode } from "@app/shell/useWorkMode";
import { useNavigation } from "@app/navigation/useNavigation";
// ...

// 2. 全局状态声明 (~40 行)
const appWindow = ref<TauriWindow | null>(null);
const currentView = ref<ViewType>('chat');
const currentPatient = ref<AppPatient | null>(null);
const storeRef = ref<AppStore | null>(null);
// ...

// 3. Composables 初始化 (~90 行)
const windowMgmt = useWindowManagement({ appWindow, store: storeRef, isWorking, transitioning });
const workMode = useWorkMode({ appWindow, windowMgmt, currentView, ... });
const navigation = useNavigation({ appWindow, currentView, windowMgmt, workMode });
const voiceConsultation = useVoiceConsultation({ appWindow, currentView, ... });
const eventListeners = useEventListeners({ appWindow, currentView, ... });

// 4. 辅助函数 (~50 行)
const closeRiskAlert = async () => { ... };
const handleRiskExpand = async (expanded: boolean) => { ... };

// 5. 生命周期钩子 (~100 行)
onMounted(async () => { ... });
onUnmounted(() => { ... });
watch([isWorking, currentView], async () => { ... });
</script>

<template>
  <!-- 6. 模板 (~115 行) -->
  <!-- 悬浮球层 -->
  <Transition name="morph">
    <div v-show="!isWorking" class="ball-layer">...</div>
  </Transition>

  <!-- 工作面板层 -->
  <Transition name="morph">
    <div v-show="isWorking" class="assistant-layer">...</div>
  </Transition>
</template>

<style scoped>
  /* 7. 组件样式 (~90 行) */
</style>
```

### 管理的全局状态

```typescript
// 窗口状态
const appWindow = ref<TauriWindow | null>(null);
const isWorking = ref(false);          // 是否处于工作模式
const isHovered = ref(false);          // 鼠标是否位于小球交互范围内（驱动环绕菜单显示）
const isFocused = ref(false);          // 是否聚焦（不驱动环绕菜单显示）
const transitioning = ref(false);      // 是否正在过渡动画

// 视图状态
const currentView = ref<ViewType>('chat');  // 当前视图
const hoveredBtnIndex = ref(-1);            // 悬停的按钮索引
const consultationAssistTrigger = ref(...);  // 灵活模式自动触发请求

// 业务状态
const currentPatient = ref<PatientContext | null>(null);  // 当前患者统一上下文
const generatedRecord = ref<GeneratedRecord | null>(null); // 生成的病历

// 风险提示状态
const riskPatientName = ref('');
const riskPatientGender = ref<'M' | 'F'>('M');
const riskPatientAge = ref(0);
const riskItems = ref<RiskItem[]>([]);
const isRiskAnalyzing = ref(false);
```

### 初始化的 Composables

| Composable | 职责 | 导出 API |
|-----------|------|---------|
| `windowMgmt` | 窗口管理 | 位置保存/恢复、智能展开、尺寸调整 |
| `workMode` | 工作模式 | 进入/退出工作模式、收起处理 |
| `navigation` | 导航管理 | 打开各视图、视图切换追踪 |
| `voiceConsultation` | 语音问诊 | 语音处理、病历生成、结果提交 |
| `eventListeners` | 事件监听 | HIS 集成、Deep Link、鼠标/窗口事件 |
| `reportInterpretation` | 报告解读服务 | 报告原文解析、LLM 解读、独立窗口事件投递 |
| `inpatientEmr` | 住院病历生成 | 后端模板解析缓存对接、住院 HIS 数据聚合、AI 病程生成、病历回写事件构造 |

### 患者上下文基线

`currentPatient` 是应用级唯一患者上下文。约束如下：

1. 外部事件只提供患者主键 / 就诊主键和少量当前场景字段。
2. `app/events/useReceptionController.ts` 的接诊流程负责调用 `HisAdapter.fetchPatientInfo()` 与 `HisAdapter.fetchPatientHistory()` 补全完整信息；`useEventListeners.ts` 只负责把 HIS 事件分发给该 controller。
3. 统一上下文同时保存身份信息、展示信息、结构化 `hisHistory`、历史摘要与接诊状态。
4. UI、AI prompt、日志、缓存等模块不得再各自维护 `naPi/name`、`sdSexText/gender`、`ageText/age` 的读取分支；统一通过患者上下文 helper / selector 读取。
5. `show-patient-risks`、`start-consultation`、`start-consultation-session`、`start-voice-consultation` 都必须复用同一套上下文构建逻辑，不能绕过 HIS 补全直接写全局状态。

---

## 组合式函数 (Composables)

Composables 是架构的核心，封装可复用的业务逻辑。

### `useWindowManagement.ts` ✅

**文件**: [src/app/shell/useWindowManagement.ts](src/app/shell/useWindowManagement.ts)

**行数**: 422 行

**职责**: 窗口位置、尺寸、显示器管理

**核心功能**:
- ✅ 保存/恢复窗口位置（带边界验证）
- ✅ 智能调整窗口位置（边界检测，防止超出显示器范围）
- ✅ 窗口尺寸调整（包含 Resizable 状态管理）
- ✅ 显示器信息缓存（性能优化，避免频繁调用 `currentMonitor`）
- ✅ 等待窗口尺寸达到目标值（确保动画完成）
- ✅ 窗口移动防抖处理（500ms）
- ✅ Tauri `Window` / `Store` 实例通过浅引用传递，避免被 Vue 深代理后触发私有字段异常；独立窗口展示需在 capability 中显式放行 `window.show`

**导出 API**:
```typescript
{
  // 状态
  cachedMonitor: Ref<Monitor | null>,
  lastBallPos: Ref<{x: number, y: number} | null>,
  isMoving: Ref<boolean>,

  // 方法
  saveWindowPosition: () => Promise<void>,
  restoreWindowPosition: () => Promise<void>,
  updateCurrentMonitor: () => Promise<void>,
  smartExpand: (width: number, height: number) => Promise<void>,
  waitForWindowSize: (logicalW: number, logicalH: number) => Promise<void>,
  resizeWorkWindow: (targetW: number, targetH: number) => Promise<void>,
  handleWindowMove: () => void
}
```

**使用示例**:
```typescript
const windowMgmt = useWindowManagement({
  appWindow,
  store: storeRef,
  isWorking,
  transitioning,
});

// 智能展开窗口（自动边界检测）
await windowMgmt.smartExpand(1200, 900);

// 恢复窗口位置
await windowMgmt.restoreWindowPosition();
```

---

### `useWorkMode.ts` ✅

**文件**: [src/app/shell/useWorkMode.ts](src/app/shell/useWorkMode.ts)

**行数**: 429 行

**职责**: 工作模式（展开/收起）切换逻辑

**核心功能**:
- ✅ 进入工作模式（小球展开为面板，支持动态尺寸）
- ✅ 退出工作模式（面板收起为小球，平滑动画）
- ✅ 计算变形动画原点（基于小球位置）
- ✅ 管理过渡状态（防止动画冲突）
- ✅ 智能收起逻辑（问诊→胶囊 or 完全退出）
- ✅ reception-capsule 始终以 `WINDOW_SIZES.RISK_CARD` 作为默认收起尺寸，避免不同入口出现两套胶囊几何
- ✅ 会话生命周期管理（集成 feedbackService）
- ✅ Always-on-Top 状态切换

**导出 API**:
```typescript
{
  // 状态
  exiting: Ref<boolean>,
  ballOffset: Ref<{x: number, y: number}>,
  morphOrigin: Ref<string>,
  containerStyle: ComputedRef<Record<string, string>>,
  ballStyle: ComputedRef<Record<string, string>>,

  // 方法
  enterWorkMode: (customW?: number, customH?: number) => Promise<void>,
  exitWork: (sessionStatus?: 'completed' | 'cancelled' | 'error') => Promise<void>,
  handleCollapse: () => Promise<void>
}
```

**使用示例**:
```typescript
const workMode = useWorkMode({
  appWindow,
  windowMgmt,
  currentView,
  isWorking,
  transitioning,
  isHovered,
  currentPatient,
  syncRiskPatientInfo,
  store: storeRef,
});

// 进入工作模式（默认尺寸）
await workMode.enterWorkMode();

// 进入工作模式（自定义尺寸）
await workMode.enterWorkMode(360, 80);

// 智能收起（根据上下文决定收起到胶囊还是完全退出）
await workMode.handleCollapse();
```

---

### `useNavigation.ts` ✅

**文件**: [src/app/navigation/useNavigation.ts](src/app/navigation/useNavigation.ts)

**行数**: 194 行

**职责**: 应用内视图导航管理

**核心功能**:
- ✅ 统一管理所有视图导航逻辑
- ✅ 自动触发工作模式切换
- ✅ 自动调整窗口尺寸
- ✅ 集成视图切换追踪

**导出 API**:
```typescript
{
  // 基础导航
  openSettings: () => Promise<void>,
  openChat: () => Promise<void>,
  openAnalytics: () => Promise<void>,

  // 业务导航
  openHisIntegrationLog: () => Promise<void>,
  openMedicalCatalogCache: () => Promise<void>,
  openConsultation: () => Promise<void>,
  openKnowledgeBase: () => Promise<void>,
  startVoiceInteraction: () => Promise<void>
}
```

**使用示例**:
```typescript
const navigation = useNavigation({
  appWindow,
  currentView,
  isWorking,
  currentPatient,
  windowMgmt,
  workMode,
});

// 打开设置页（自动展开窗口）
await navigation.openSettings();

// 打开主问诊页（自动调整窗口尺寸）
await navigation.openConsultation();
```

---

### `useVoiceFeedback.ts` ✅

**文件**: [src/features/feedback/model/useVoiceFeedback.ts](src/features/feedback/model/useVoiceFeedback.ts)

**职责**: 结果页反馈编排（兼容历史 voice 命名）

**核心功能**:
- ✅ 登记语音结果页诊断 / 治疗推荐快照，便于后续反馈引用稳定 targetId
- ✅ 支持把页面已落库的 recommendationId 反注册回反馈编排层，供症状问诊等非语音页面复用同一套推荐反馈弹窗与提交链路
- ✅ 管理单条推荐反馈、病例字段反馈草稿与整页评分草稿
- ✅ 调用 `feedback.ts` 完成本地推荐反馈与整页反馈落库
- ✅ 调用 `voiceFeedback.ts` 生成后续可直推后台的标准 payload，并为病例字段反馈补齐 AI 原文 / 医生现值 / 差异摘要
- ✅ 负责从本地恢复未提交的语音反馈草稿，避免医生误关窗口后丢失
- ✅ 旧路径 [src/composables/useVoiceFeedback.ts](src/composables/useVoiceFeedback.ts) 仅保留兼容 re-export；新调用默认从 `@features/feedback` 消费

**导出 API**:
```typescript
{
  registerRecommendations: () => Promise<void>,
  registerExternalRecommendationTarget: () => void,
  submitRecommendationFeedback: () => Promise<void>,
  submitSessionFeedback: () => Promise<void>,
  restoreVoiceFeedbackDraft: () => void,
  clearVoiceFeedbackDraft: () => void,
}
```

---

### `useVoiceConsultation.ts` ✅

**文件**: [src/composables/useVoiceConsultation.ts](src/composables/useVoiceConsultation.ts)

**行数**: 262 行

**职责**: 语音问诊完整业务流程，并按 `consultationId` 缓存语音病例解析结果

**核心功能**:
- ✅ 处理语音停止事件（转录 + LLM 生成）
- ✅ 命中本地缓存时跳过重复 LLM 解析，应用重启后可恢复未提交结果
- ✅ 缓存 key 优先使用 `idVis`（就诊 ID），同患者多就诊互不串扰；缓存跨自然日自动失效，且当前接诊切换到其他患者时会清理上一患者语音缓存
- ✅ 通过 `editorSnapshot` 持久化整张语音病历快照（治疗方案、诊断、病历文本、当前选中诊断），下次同就诊恢复时直接复用，跳过 `fetchAITreatment`
- ✅ 当实时转写为空时，自动使用音频文件兜底转写
- ✅ LLM 病历生成（结构化 JSON，包含病例草稿、诊断/项目/药品提示与来源标记）
- ✅ 对语音抽取结果做结构校验与一次修复重试，降低模型输出格式漂移导致的整链路失败
- ✅ JSON 解析和验证
- ✅ 病历确认并提交到 HIS
- ✅ 错误处理和降级

**导出 API**:
```typescript
{
  // 方法
  handleVoiceStop: (audioBlob: Blob, transcribedText: string) => Promise<void>,
  handleVoiceError: (err: any) => void,
  handleResultConfirm: (record: GeneratedRecord) => Promise<void>,
  cancelVoiceResult: () => Promise<void>,
  // 模块级缓存接口（顶层导出）
  // updateVoiceConsultationCache(patient, snapshot): 写回 editorSnapshot（实现位于 features/voice-consultation/model/voiceConsultationCache.ts）
  // getVoiceConsultationEditorSnapshot(patient): 读取 editorSnapshot（实现位于 features/voice-consultation/model/voiceConsultationCache.ts）
}
```

**使用示例**:
```typescript
const voiceConsultation = useVoiceConsultation({
  appWindow,
  currentView,
  generatedRecord,
  currentPatient,
  showToast,
  windowMgmt,
  workMode,
});

// 处理语音停止（自动调用 LLM 生成病历）
await voiceConsultation.handleVoiceStop(audioBlob, transcribedText);

// 确认并提交病历
await voiceConsultation.handleResultConfirm(record);
```

---

### `useMinimizedSessions.ts` ✅

**文件**: [src/composables/useMinimizedSessions.ts](src/composables/useMinimizedSessions.ts)

**职责**: 跟踪症状问诊 / 语音问诊从问诊态收起到悬浮球后的"最小化"现场

**核心功能**:
- ✅ 两个独立槽位：`symptom` / `voice`，可同时存在
- ✅ 以 `idVis`（缺失时降级 `idPi / patientId / id`）作为锚点；切换患者不丢弃旧会话
- ✅ 跨自然日自动失效，并在 init 时一次性清理
- ✅ 持久化到 `localStorage` (`MINIMIZED_SESSIONS_V1`)，仅存元数据（patientId/Name、anchorId、recordedAt），不存业务状态
- ✅ `latestType` 计算属性供"双击悬浮球恢复最近一个最小化会话"使用
- ✅ 症状问诊数据和内部页签由 `ConsultationPage.vue` 常驻 `v-show` 实例 + `useSymptomConsultationCache` 快照保留；收起到接待胶囊或从小球恢复时不得调用内部复位方法

**导出 API**:
```typescript
{
  symptomSession, voiceSession,
  hasSymptom, hasVoice, latestType,
  getActive(type),
  record(type, patient),
  clear(type),
  clearAll()
}
```

**约束**:
- 业务状态必须由各问诊链路自己承接：症状问诊由 `useSymptomConsultationCache` 按就诊锚点保存内部页面、症状、表单、病历、推荐和引用回执快照，语音问诊病历快照由 `useVoiceConsultation.editorSnapshot` 承接；本模块只负责"是否最小化、何时、对应哪个就诊"三件事

### `useSymptomConsultationCache.ts` ✅

**文件**: [src/composables/useSymptomConsultationCache.ts](src/composables/useSymptomConsultationCache.ts)

**职责**: 为智能问诊保存与恢复未结束现场，语义对齐语音问诊缓存

**核心功能**:
- ✅ 以就诊锚点为 key 写入 `localStorage` (`SYMPTOM_CONSULTATION_CACHE_V1:{consultationId}`)
- ✅ 保存内部页面、问诊模式、症状选择、动态表单、病历草稿、诊断、治疗推荐、引用回执和知识面板基础状态
- ✅ 跨自然日自动失效；诊毕回写成功或确认放弃时显式清除，其中结果页“放弃”会清空页面内状态并直接退回悬浮球
- ✅ 恢复时只作用于同一就诊，避免切换患者污染

---

### `useEventListeners.ts` ✅

**文件**: [src/composables/useEventListeners.ts](src/composables/useEventListeners.ts)

**行数**: ~575 行

**职责**: 统一管理 App 级 Tauri 事件监听、deep link、window listen 和事件到导航 / controller 的分发

**核心功能**:
- ✅ Deep Link 单点监听（仅在 `useEventListeners` 注册）
- ✅ HIS 集成事件监听
  - `receive-patient` - 接诊入口；具体患者补全、并发保护和风险胶囊加载委托 `app/events/useReceptionController.ts`
  - `show-patient-risks` - 风险提示入口；具体患者补全、风险状态和患者切换清理由 `app/events/useReceptionController.ts` 处理
  - `start-consultation` - 开始问诊
  - `start-consultation-session` - HIS 灵活模式 / assist 兼容事件（普通推荐打开 `ConsultationPage` 并写入自动触发上下文；`treatment_plan` / `diffDx` 分别打开独立诊疗方案页和独立鉴别诊断小窗）
  - `stop-consultation` - 停止问诊；视为诊毕/结束接诊，会清空当前患者上下文、当前就诊的语音缓存和问诊最小化恢复入口
  - `start-voice-consultation` - 语音问诊；来自 HIS / HTTP Bridge 的显式开始语音请求会先按目标患者 `idPi / patientId` 判断是否存在未提交缓存：同患者且存在缓存时直接恢复到语音结果页，否则开启新语音会话；仅在已处于录音胶囊页时对重复请求做幂等忽略
  - `start-inpatient-emr-generation` - 住院病历辅助生成；来自 `/api/inpatient/emr/generate`，打开 `features/inpatient-emr` 独立工作视图并按 `admissionId + templateId + templateName + htmlContent + recordTime?` 生成可回写预览
  - `sdk-handshake` - 订阅 HIS 握手事件；payload 解析、`HisService` 初始化、反馈 actor 和基础数据上下文由 `app/events/useSdkHandshakeController.ts` 处理
- ✅ 鼠标事件监听
  - `hover-change` - 小球交互范围悬停状态，作为环绕菜单唯一展开条件
  - `mouse-pos` - 鼠标位置（环绕菜单高亮）
- ✅ 窗口事件监听
  - `tauri://move` - 窗口移动
  - `tauri://resize` - 窗口大小变化（通过 `getWindowSizeForView(currentView)` 自愈）
- ✅ 自动清理所有监听器（含 Deep Link/HIS/mouse/window，防止重复处理和内存泄漏）

**导出 API**:
```typescript
{
  // 方法
  registerAllListeners: () => Promise<void>,
  unregisterAllListeners: () => void
}
```

**使用示例**:
```typescript
const eventListeners = useEventListeners({
  appWindow,
  currentView,
  isWorking,
  transitioning,
  isHovered,
  hoveredBtnIndex,
  ringMenuRef,
  currentPatient,
  riskState,
  showToast,
  handleWindowMove,
  workMode,
  navigation,
  exiting,
  resizeTimeoutRef,
});

// onMounted 中一行注册所有监听
await eventListeners.registerAllListeners();

// onUnmounted 中一行注销所有监听
eventListeners.unregisterAllListeners();
```

---

## 组件 (Components)

组件负责 UI 渲染和用户交互，不包含复杂业务逻辑。

### 核心组件列表

| 组件 | 职责 | 文件 |
|------|------|------|
| `ChatPanel.vue` | LLM 对话界面 | [src/components/ChatPanel.vue](src/components/ChatPanel.vue) |
| `SettingsPanel.vue` | 系统设置（含通用设置、紧凑界面主题选择、区域化接入、关于版本、音频输入设备选择；本地模式下额外显示文本/音频模型配置，区域化模式下隐藏“模型配置”页签；通用设置页提供基础数据缓存和 HIS 联调日志独立入口）。当前仍作为根级历史入口保留，音频输入设备枚举 / 权限探测 / devicechange 刷新已下沉到 settings model 的 `useSettingsAudioInput.ts`，语音接诊录音目录选择状态已下沉到 `useSettingsVoiceRecordingDirectory.ts`，保存快照 / dirty 状态 / Cmd+S 监听已下沉到 `useSettingsSaveState.ts`，通用设置页签已抽为受控展示组件 `SettingsGeneralTab.vue`，模型配置页签已抽为受控展示组件 `SettingsModelTab.vue`，底部保存状态条已抽为 `SettingsSaveBar.vue`；父组件继续负责当前设置 snapshot 汇总、真实保存策略、toast、埋点、区域化重连和窗口置顶副作用 | [src/components/SettingsPanel.vue](src/components/SettingsPanel.vue) |
| `ConsultationPage.vue` | 完整症状问诊主链路，同时承接新的“内嵌灵活模式”；支持根据 `/assist` 上下文直接跳过症状采集进入病历详情页，继续复用现有推荐诊断、诊断鉴别、推荐用药、推荐检查与诊断路径能力；进入 `record` 阶段后不再继续内嵌维护旧结果页，而是把当前病历、诊断、治疗快照切换到独立的症状结果页包装组件，由后者复用共享结果页主体；PHIS 引用闭环状态仍由症状包装层承接；页面 scoped 样式原样外置到 `features/symptom-consultation/ui/ConsultationPage.css`，SFC 继续保留模板、脚本和问诊状态机；AI 推荐链路采用成功后覆盖与当前诊断上下文校验，解析失败或慢请求过期时保留上一版结果；患者文本读取、既往史解析、患者草稿/诊断预填、诊断 identity / AI 请求防串线、同类诊断候选 / 替换列表更新、病历草稿 AI 请求规格与本地兜底、病历草稿主诉 / 现病史本地拼装、中医诊断证候 / 治法映射、诊断展示分组、诊断 / 治疗事实核查编排、LLM JSON 宽容解析、诊断/治疗推荐反馈目标落库 / 注册编排、完成问诊推荐采纳 / 拒绝埋点编排、医嘱文案生成、最终报告数据拼装、当前医疗 payload、智能问诊用户日志快照、PHIS 引用 key / 状态图 / 回执归一 / 引用展示判断等数据处理逐步下沉到 `features/symptom-consultation/lib|model`；western 诊断 raw 映射、western 治疗推荐 raw 映射和 PHIS 提交前治疗选择 / 库存提示 / 处理意见摘要复用 `features/clinical-result`；同类诊断卡片内联下拉开合与候选状态复用 `features/consultation-result/model/useRelatedDiagnosisDropdown.ts`，页面仅保留候选来源、诊断替换、选中同步和埋点；页面层只保留状态、副作用依赖注入和流程编排 | [src/components/ConsultationPage.vue](src/components/ConsultationPage.vue) |
| `entities/patient/*` | 患者实体展示与后续稳定转换归属。当前 `PatientHeader.vue` 是无副作用患者头部展示组件，接收 patient/payType/avatar props 和 actions slot，复用既有 patientContext / patientAvatar 工具解析姓名、性别、年龄、过敏史和头像；不持有问诊流程状态、不调用 Tauri / HIS / toast。智能问诊和语音问诊均通过 `@entities/patient` 复用，旧 `src/components/PatientHeader.vue` 已删除 | [src/entities/patient](src/entities/patient) |
| `features/symptom-consultation/*` | 智能问诊主流程的无 UI 辅助层：`model/useSymptomCategoryFilter.ts` 管理症状系统分类筛选下拉的已选分类、开合、按钮文案和外部点击关闭判断；`model/useCompanionSymptoms.ts` 管理伴随症状选中集合、名称派生、按关联表生成推荐和升级详细问诊后的移除；`model/useSymptomSelectionController.ts` 管理症状选中 / 取消 / 移除 / 清空和模板表单初始化，最大数量提示、埋点和伴随症状清理由页面通过 options 注入；`model/useSymptomCollectionController.ts` 组合分类筛选、伴随症状、症状选中、过滤结果、渲染计划和表单 key 同步，模板同步、动态症状 AI、缓存恢复、生成病历和 PHIS 回写仍由页面编排；`model/useConsultationAssistController.ts` 编排 assist 快进入口的病历/诊断上下文保障、按类型触发推荐/鉴别清单和成功后的埋点入口，AI 请求、toast、视图切换、预填、埋点和自动触发消费均由页面注入；`lib/symptomFiltering.ts` 负责症状列表的系统分类过滤、适用性别过滤、名称 / 拼音 / 首字母搜索纯函数；`lib/symptomFormData.ts` 负责症状模板字段默认值构造、字段 key 兼容和 checkbox mutualExclusions 数组处理；`lib/consultationRenderPlan.ts` 负责选中症状、问诊模式和当前 formData 到 renderList、需初始化 key、需清理 key 的纯计划；`lib/consultationFormConfigs.ts` 保存一般情况问诊和中医四诊的静态表单配置常量；`lib/consultationFormValidation.ts` 负责根据选中症状、formData、患者信息和注入的适用性判断生成必填错误列表、错误 key map 和首个错误 DOM id；`lib/consultationAssistPresentation.ts` 负责 assist 快进入口的展示标签、提示文案、banner tone / 样式和功能统计 featureCode 映射；`lib/consultationRecommendationPresentation.ts` 负责智能问诊推荐区的治疗推荐可见性、卡片显示、类型标签、诊断置信度 class 和药品行内摘要纯派生；`lib/consultationPatientText.ts` 负责患者/病历记录文本读取、既往门诊摘要过滤与既往史解析；`lib/consultationPayloadBuilders.ts` 根据显式入参构造当前问诊摘要、诊断列表、PHIS 引用/草稿医疗 payload 和用户日志快照；`lib/consultationPrefill.ts` 根据患者上下文和当前草稿/诊断状态推导预填动作；`lib/consultationReference.ts` 负责 PHIS 引用项类型、引用 key、状态 map 更新、回执 payload 归一、引用按钮文案和治疗类型到引用 action 的映射；`lib/consultationDiagnosisContext.ts` 负责诊断 identity 与 AI 请求防串线纯判断；`lib/consultationDiagnosisSwap.ts` 负责同类诊断候选过滤、替换时的列表更新和选中诊断同步判断，诊断 identity 与标准库候选查询函数均由页面显式注入；`lib/consultationGeneratedRecord.ts` 负责选中症状、表单数据、一般情况、四诊和伴随症状到 generatedRecord 草稿的纯拼装；`lib/consultationDiagnosisMapping.ts` 负责中医诊断项证候 / 治法匹配、伪码补齐和置信度排序，western 诊断 raw 匹配委托 `features/clinical-result/clinicalResultAiMapping.ts` 并通过策略保持 code 优先和未匹配清空临时 id；`lib/consultationTcmSigns.ts` 负责中医四诊表单到 AI prompt 文本和最终报告四诊文本的纯格式化；`lib/consultationGeneralCondition.ts` 负责一般情况表单到现病史片段的纯格式化；`lib/consultationDiagnosisGrouping.ts` 负责中医单组与西医 ICD10 展示分组、未知组兜底和分组排序，ICD10 分类查询函数由页面显式注入；AI 治疗推荐 raw 映射已收敛到 `features/clinical-result/clinicalResultAiMapping.ts`，症状域不再维护专属治疗推荐 mapper；`lib/consultationLlmJsonParser.ts` 负责去 BOM / markdown fence / 平衡括号候选扫描 / JSON parse 错误包装；`lib/consultationMedicalAdvice.ts` 负责西医 / 中医默认医嘱文案和中药煎服法追加规则；`lib/consultationFinalRecord.ts` 负责已选治疗快照、TCM 治则治法和 `FinalRecord` 对象拼装；`model/consultationFactCheck.ts` 负责诊断/治疗事实核查启用判断、逐条检查、进度回调、结果写入和 issue 合并编排，检查函数与页面状态写入均由页面注入；`model/recommendationFeedbackRegistration.ts` 负责诊断/治疗推荐反馈落库后的外部目标注册编排，并通过显式参数接收 `saveRecommendation`、`recordMetric`、`registerTarget` 和 `getRecommendationKey`；`model/consultationCompletionTracking.ts` 负责完成问诊时诊断/治疗推荐采纳或拒绝反馈和最终报告统计埋点编排，并通过显式参数接收追踪函数；`index.ts` 是对外公开入口。`lib` 不得直接访问 Vue ref、toast、Tauri invoke、PHIS 请求或页面缓存状态；`model` 可编排副作用，但不得直接 import 单例服务或读取页面 ref | [src/features/symptom-consultation](src/features/symptom-consultation) |
| `SymptomResultEntry.vue` | 症状问诊结果页包装组件：接收 `ConsultationPage.vue` 产出的记录快照、推荐诊断和治疗方案，委托 `features/clinical-result/clinicalResultAdapter.ts` 转换为中性 `ClinicalResultInput`；症状渠道只保留“返回上一页”等包装语义，诊断鉴别入口与 checklist 弹窗由共享结果页主体统一提供，结果页结构与编辑标准以共享结果页为准。旧 `src/components/SymptomConsultationResultPage.vue` 已删除，问诊页通过 `@features/symptom-consultation` 消费 | [src/features/symptom-consultation/ui/SymptomResultEntry.vue](src/features/symptom-consultation/ui/SymptomResultEntry.vue) |
| `DiagnosisPathWindow.vue` | 独立诊断推理路径窗口，使用 ECharts Sankey 展示患者事实、章节归类、证据汇聚与诊断去向；默认提供更宽画布，并按容器尺寸动态计算 Sankey 的布局盒子，用对称留白实现“适应屏幕并居中”的默认视图，再开放滚轮缩放、平移与节点拖动；点击入口后窗口先显示 loading 动画，并按“检查缓存 -> 生成推理链 -> 渲染图表”的阶段更新提示，若生成超时或渲染失败会切换到明确错误态；正文容器在收到 payload 后保持挂载，loading 改为遮罩层，避免 `chartEl` 尚未挂载时误判渲染成功；开窗后的 `show/focus` 调用采用 best-effort 非阻塞方式，避免 Tauri 原生命令卡住整个推理链；右侧说明面板采用“支持证据 / 反证提醒 / 鉴别要点”三段式，未返回结构化分段时回退显示整体 rationale；真实实现已迁至 diagnosis-path 功能域，旧 `src/components/DiagnosisPathWindow.vue` 已删除 | [src/features/diagnosis-path/ui/DiagnosisPathWindow.vue](src/features/diagnosis-path/ui/DiagnosisPathWindow.vue) |
| `ReportInterpretationWindow.vue` | 独立检验检查报告解读窗口：以单页报告单版式展示 AI 摘要结论、患者与报告元数据、异常/阳性项目、综合判断、建议动作、风险提示与解读局限；窗口以只读结果为主，不进入 PHIS 回写；支持在未接诊时使用显式 `patient` 入参，在已接诊时自动补齐当前患者上下文；真实实现已迁至 report-interpretation 功能域，旧 `src/components/ReportInterpretationWindow.vue` 已删除 | [src/features/report-interpretation/ui/ReportInterpretationWindow.vue](src/features/report-interpretation/ui/ReportInterpretationWindow.vue) |
| `VoiceCapsule.vue` | 语音录制胶囊；真实实现已迁至语音问诊功能域，旧 `src/components/VoiceCapsule.vue` 兼容包装已删除 | [src/features/voice-consultation/ui/VoiceCapsule.vue](src/features/voice-consultation/ui/VoiceCapsule.vue) |
| `VoiceConsultationNew.vue` | 当前共享结果页实现载体：消费中性 `ClinicalResultInput`（兼容旧 `VoiceIntentResult`），承载左侧病例正文编辑、右侧诊断/治疗推荐、反馈、刷新方案与最终回写 UI；语音专属的缓存恢复、放弃语音会话、语音用户日志、HIS 回执等待态和整页反馈触发仍留在此文件，语音问诊与智能问诊结果页的“诊断鉴别” checklist 弹窗由此共享结果页主体统一提供；重复传入语义相同的 `intentResult` 时不得重置结果页现场，已选主诊断再次点击或点击其内部动作时也不得触发治疗方案刷新；editorSnapshot 的节流 / 立即持久化已下沉到 `features/voice-consultation/model/useVoiceEditorSnapshotPersistence.ts`，病例字段初始快照 / 当前值读取 / 人工修改判断 / 字段反馈展示状态已下沉到 `features/voice-consultation/model/useVoiceRecordFieldFeedbackState.ts`，诊断 / 治疗事实核查结果 Map、issue getter 和逐条核查循环已下沉到 `features/voice-consultation/model/useVoiceResultFactCheckState.ts`，推荐项 / 病例字段 / 整页反馈提交动作已下沉到 `features/voice-consultation/model/useVoiceFeedbackActions.ts`，语音知识库检索轻包装已下沉到 `features/voice-consultation/model/useVoiceKnowledgeSearch.ts`，语音意图结构化抽取已下沉到 `features/voice-consultation/model/useVoiceIntentRecognition.ts`，语音标准目录匹配、结果记录 clone / 采纳埋点、L2 安全复核状态、L1 刚性阻断、L2 issue 执行动作和旧整页 fact-check 包装已分别下沉到 `features/voice-consultation/model/useVoiceCatalogMatching.ts`、`useVoiceResultRecord.ts`、`useVoiceSafetyReview.ts`、`useVoiceRigidBlock.ts`、`useSafetyIssueResolver.ts`、`useVoiceResultFactCheck.ts`；症状问诊和语音结果页共用的反馈草稿 / target 登记 / 本地反馈提交编排已下沉到 `features/feedback/model/useVoiceFeedback.ts`；结果页 scoped 样式原样外置到 `features/consultation-result/ui/ClinicalResultEditor.css`，SFC 继续保留模板、脚本和渠道编排；最终回写 payload 必须经 `features/clinical-result/recordConfirmedPayload.ts` 生成，页面只通过 `extra` 注入 pending 回执字段，不再手拼 `record-confirmed` 顶层结构；中性结果输入到可编辑诊断 / 治疗列表的初始化委托 `features/clinical-result/clinicalResultInitialization.ts`；语音诊断 / 治疗 LLM raw 结果到页面推荐项的映射委托 `features/clinical-result/clinicalResultAiMapping.ts`，页面只注入标准库匹配、字典推断、归一化和当前病历文本 | [src/components/VoiceConsultationNew.vue](src/components/VoiceConsultationNew.vue) |
| `features/differential-diagnosis/*` | 独立鉴别诊断小窗：`DifferentialDiagnosisModalPage.vue` 从当前患者上下文读取诊断、主诉、现病史，直接展示“鉴别排查确认”弹窗并调用 diagnosisChecklist prompt 生成 checklist；该入口不进入 `ConsultationPage.vue`、不展示共享结果页、不产生 PHIS 回写，只记录功能统计和保留医生辅助判断现场 | [src/features/differential-diagnosis](src/features/differential-diagnosis) |
| `ConsultationResultPage.vue` | 问诊共享结果页薄包装层：只负责把 `ClinicalResultInput`、渠道语义和 slot 附加动作转给当前共享结果页实现，不拥有业务状态机。真实实现已迁至 `features/consultation-result/ui`，旧 `src/components/ConsultationResultPage.vue` 已删除；当前仍转发到根级 `VoiceConsultationNew.vue`，等待后续抽出真正的 `ClinicalResultEditor` 主体。语音问诊和症状问诊都通过各自包装组件把初始快照适配到这里；最终回写请求会进入“等待 HIS 回执”状态，失败时保留当前页面供医生修正并重试 | [src/features/consultation-result/ui/ConsultationResultPage.vue](src/features/consultation-result/ui/ConsultationResultPage.vue) |
| `features/clinical-result/*` | 问诊结果页共享业务 helper，对外统一通过 `@features/clinical-result` barrel 暴露，页面层不直接依赖内部深路径：`clinicalResultAdapter.ts` 定义中性 `ClinicalResultInput` 并承接症状/语音入口到共享结果页的无 UI 适配；`clinicalResultLlmJsonParser.ts` 负责 LLM 文本到 JSON 对象 / 数组的宽容纯解析，症状问诊旧解析器路径仅兼容重导出，语音结果页诊断 / 治疗推荐解析也复用此口径；`clinicalResultAiRequest.ts` 负责 diagnosis、medication、exam、lab_test、procedure 推荐的 messages 与 trace config 规格构造，支持单路和多路治疗推荐规格，prompt 资产由调用方显式注入，trace 基础字段和具体 scene/title/action 可注入且默认保持语音问诊取值，页面仍负责 `chat` 调用与并发策略；`clinicalResultAiMapping.ts` 负责语音结果页 AI raw 诊断 / 治疗项到已匹配页面推荐项的纯转换、智能问诊 western 诊断 raw 数组按策略转换、智能问诊 western 治疗推荐 raw 数组按目标类型过滤转换，以及多路治疗响应解析失败隔离和合并，标准库匹配、catalog assessment、normalize、parser 与 parse-error 回调均由调用方注入；`clinicalResultInitialization.ts` 负责中性结果输入到可编辑诊断 / 治疗列表的初始化、匹配状态继承和默认勾选纯规则，通过参数注入标准库匹配、字典推断、归一化和当前病历文本；`clinicalResultTreatmentFields.ts` 只做 AI 数量别名归一和执行科室当前值到字典 key 的同步，执行科室真实值必须来自医生选择或 `useTreatmentHydration` 的 HIS 项目详情；`clinicalResultNarrative.ts` 负责推荐依据文案、条件性用药 / 患者已自行服药识别和默认勾选判断；`clinicalResultUsageFields.ts` 负责药品频次 / 用法候选过滤、关键字解析和字段展示文案，不持有搜索关键字 ref 或写回副作用；`clinicalResultAttributeOptions.ts` 负责药房、执行科室、部位、医保候选构造和过滤，不修改推荐项；`clinicalResultFeedback.ts` 负责诊断 / 治疗推荐反馈提交 payload 的标题、snapshot、targetType 和 recommendationType 纯构造；`recordConfirmedPayload.ts` 是症状问诊 / 语音问诊共用的 `record-confirmed` PHIS 回写契约唯一构造点，并承接诊断 key / 标准诊断 id 判断、orderList 原始字段读取、服务分类兜底、检验 jsonField / 皮试 / 检查标志等纯解析；`treatmentRequiredFields.ts` 负责用药、检查、检验、处置写入 `orderList` 前的必要字段纯校验，覆盖执行位置、医保限用、药品总量、用药天数、检查部位、检验 jsonField 和处置数量等当前控件值；`consultationSubmitPayload.ts` 负责 PHIS 提交前的已选治疗合并、库存不足提示文案和治疗方案摘要纯拼装；其余 helper 覆盖治疗标准库匹配展示、标准库候选搜索、手动匹配写入、诊断上下文 identity、治疗编辑器 key、推荐依据 tooltip key、疑似匹配名称等逻辑。症状问诊和语音问诊必须优先复用这里，页面层只保留选中门禁、toast、弹层开合和渠道专属编排 | [src/features/clinical-result](src/features/clinical-result) |
| `features/consultation-result/model/*` | 问诊共享结果页的轻状态与治疗模型 composable：`useClinicalResultChannelStrategy.ts` 管理 `voice/symptom` 渠道到日志类型、语音缓存开关、患者头展示和取消弹窗文案的无副作用派生；`useClinicalResultCancelController.ts` 管理放弃确认弹窗开合、提交中 / 等待 HIS 回执时的拦截提示和确认入口，反馈草稿清理 / 放弃日志 / `emit('cancel')` 由页面注入；`useClinicalResultIntentReset.ts` 管理新 `intentResult` 到来时的旧现场清理、病历字段回填和初始字段快照设置；`useClinicalResultWritebackPayload.ts` 管理最终回写前 `diagList` / `orderList` 的构造 resolver 组合，并把同一 resolver 暴露给必要字段校验；`useClinicalResultWritebackPreflight.ts` 管理最终回写前标准诊断、药品详情、库存、药房、执行科室、检查部位和必要字段门禁编排，页面仍负责 `complete_consultation`、PHIS payload、提交中状态、等待回执和日志；`useClinicalResultUserLogController.ts` 管理首版、最终和放弃三类用户日志的提交节奏、首版快照记忆、最终选择快照和可选变更摘要，页面仍注入快照构造、患者来源和区域化提交函数；`useWritebackFeedbackController.ts` 管理已命中 requestId 的 HIS 回执 success / failed 分发和默认提示，页面仍注入缓存持久化、最终日志、整页反馈弹窗和 toast；`useConsultationReferenceFeedbackListener.ts` 管理 `consultation-reference-feedback` 事件名、当前 `consultationId` 防串线和 Tauri listener 生命周期组合，命中后的 requestId 匹配、引用状态 map、toast、缓存和日志仍由页面 / controller 承接；`useClinicalResultPatientContext.ts` 管理患者姓名、性别、年龄、`idTet`、就诊锚点和 `consultationId` 派生；`useRecommendationFeedbackPopover.ts` 管理推荐反馈弹层当前打开 key、草稿读取、提交标签读取和关闭逻辑；`useReasonTooltipState.ts` 管理推荐依据 tooltip 当前打开 key、切换和关闭；`useDiagnosisSelection.ts` 管理诊断勾选集合、主诊断同步、诊断增删和替换后的 key 同步；`useRelatedDiagnosisDropdown.ts` 管理同类诊断下拉当前打开 key、候选列表、打开 / 关闭 / 切换和替换后收口；`useManualMatchState.ts` 管理治疗项手动匹配弹层 key 与搜索关键词缓存；`useMedicineUsageSearch.ts` 管理药品 frequency / route 搜索关键字缓存、当前值同步和重置；`useMedicineFieldEditing.ts` 管理药品字段激活、blur 收口、频次 / 用法 keyword 解析写回、总量输入和库存 warning 清理；`useTreatmentPharmacyResolution.ts` 管理药品候选药房收窄、默认药房、已选药房匹配、药房名称归一化和详情加载后的默认药房填充；`useTreatmentSelectionReadiness.ts` 管理治疗项选中前的药品详情、药房、执行科室、检查部位、必要字段和库存门禁编排；`useTreatmentSections.ts` 管理治疗推荐按类型展示分组、是否存在推荐和空状态文案派生；`useTreatmentEditorState.ts` 管理治疗编辑器展开集合、当前 active 字段 key 与字段 DOM focus 注册；`useTreatmentQuickSelector.ts` 管理药房 / 执行科室 / 部位 quick selector 的编辑器展开、二级选择器打开和输入框聚焦；`useSecondarySelector.ts` 管理治疗推荐二级搜索下拉（药房 / 执行科室 / 部位 / 医保）的展开 key 与 keyword 缓存；`useTreatmentAttributeSearch.ts` 管理药房 / 执行科室 / 部位 / 医保候选构造、搜索 keyword 读写和过滤列表派生；`useBodySiteOptions.ts` 负责检查项目部位选项落地到治疗推荐项；`useTreatmentGates.ts` 负责治疗项药房 / 执行科室 / 检查部位门禁与候选派生；`useMedicalDictionaries.ts` 统一加载治疗编辑所需 HIS 字典；`useTreatmentNormalization.ts` 统一治疗项字段归一化、HIS 默认频次 / 用法匹配和药品总量估算；`useTreatmentHydration.ts` 统一药品详情轮询、诊疗项目详情真实反填（执行科室、单位、处置默认数量）、检查部位补全和库存校验状态；`useWritebackStatus.ts` 管理最终回写 requestId、等待态、最近回执与按钮 / banner 文案派生。不保存反馈、不调用 PHIS 回写 / 区域化；toast 只允许通过调用方显式注入的 `notify` 触发。症状问诊和语音问诊页面只负责把外部点击事件、提交成功关闭、字段写回、缓存读写和渠道专属反馈接入 | [src/features/consultation-result/model](src/features/consultation-result/model) |
| `DiagnosisRecommendationCard.vue` | 单条诊断推荐卡片：现同时服务语音问诊与症状问诊。组件负责统一渲染名称、编码、置信度/匹配度、主诊断/已纳入状态、推荐依据 tooltip、可选“诊断鉴别”按钮和同类诊断切换；反馈按钮通过 `showFeedback` 控制是否启用，额外动作区与正文细节区通过插槽让不同页面注入各自能力；真实实现已迁至共享结果页功能域，旧 `src/components/DiagnosisRecommendationCard.vue` 兼容包装已删除 | [src/features/consultation-result/ui/DiagnosisRecommendationCard.vue](src/features/consultation-result/ui/DiagnosisRecommendationCard.vue) |
| `TreatmentRecommendationCard.vue` | 单条治疗推荐卡片壳：现同时服务语音问诊、症状问诊与独立诊疗方案推荐。组件负责渲染名称/规格、匹配状态、执行科室/发药药房 chip、候选标准项确认、AI 原建议、摘要文案，以及反馈 / 手动匹配 / 展开更多编辑等头部动作；独立诊疗方案页复用默认同款卡片样式，并通过插槽注入检查部位、手动匹配和属性选择器，不再维护第二套匹配列表样式。真实实现已迁至共享结果页功能域，旧 `src/components/TreatmentRecommendationCard.vue` 兼容包装已删除 | [src/features/consultation-result/ui/TreatmentRecommendationCard.vue](src/features/consultation-result/ui/TreatmentRecommendationCard.vue) |
| `FactCheckHighlight.vue` | 行内事实核查标注组件，展示 factChecker 返回的 issue 风险等级、问题和建议；真实实现已迁至 feedback 功能域，旧 `src/components/FactCheckHighlight.vue` 兼容包装已删除 | [src/features/feedback/ui/FactCheckHighlight.vue](src/features/feedback/ui/FactCheckHighlight.vue) |
| `FactCheckNotification.vue` / `FactCheckWidget.vue` | 事实核查通知和悬浮浮窗，展示 factChecker 审查开启、完成、问题数量和详情列表；真实实现已迁至 feedback 功能域，旧 `src/components/FactCheckNotification.vue` / `src/components/FactCheckWidget.vue` 兼容包装已删除 | [src/features/feedback/ui](src/features/feedback/ui) |
| `VoiceRecommendationFeedbackPopover.vue` | 语音结果页单条推荐反馈弹层：收集问题标签、反馈原因、是否已修正采用以及修正结果摘要；真实实现已迁至语音问诊功能域，旧 `src/components/VoiceRecommendationFeedbackPopover.vue` 兼容包装已删除 | [src/features/voice-consultation/ui/VoiceRecommendationFeedbackPopover.vue](src/features/voice-consultation/ui/VoiceRecommendationFeedbackPopover.vue) |
| `VoiceRecordFeedbackPopover.vue` | 语音结果页病例字段反馈弹层：展示主诉 / 现病史 / 既往史的 AI 原文、当前内容与差异摘要，并提交字段级反馈；真实实现已迁至语音问诊功能域，旧 `src/components/VoiceRecordFeedbackPopover.vue` 兼容包装已删除 | [src/features/voice-consultation/ui/VoiceRecordFeedbackPopover.vue](src/features/voice-consultation/ui/VoiceRecordFeedbackPopover.vue) |
| `VoiceRecordFieldEditor.vue` | 语音结果页病例字段受控编辑器：展示单个字段的标题、人工修改标记、反馈按钮、字段反馈弹层和 textarea；父页负责字段值、初始快照、反馈 key、草稿更新、提交、toast、日志和 PHIS 回写 | [src/features/voice-consultation/ui/VoiceRecordFieldEditor.vue](src/features/voice-consultation/ui/VoiceRecordFieldEditor.vue) |
| `VoiceSessionFeedbackBar.vue` | 语音结果页整页反馈浮层主体：在一键回写成功后弹出，收集 1-5 分评分、整体问题标签和点评；真实实现已迁至语音问诊功能域，旧 `src/components/VoiceSessionFeedbackBar.vue` 兼容包装已删除 | [src/features/voice-consultation/ui/VoiceSessionFeedbackBar.vue](src/features/voice-consultation/ui/VoiceSessionFeedbackBar.vue) |
| `TreatmentItemEditor.vue` / `MedicineUsageFieldSelector.vue` / `ManualMatchPicker.vue` / `RecAttributeChip.vue` | 共享结果页治疗项编辑、药品频次/用法选择、手动匹配和必填属性 chip；真实实现已迁至共享结果页功能域，对应旧 `src/components/*` 兼容包装已删除。组件本身只负责 UI 与事件分发，不承接归一化、库存校验或 HIS 回流逻辑 | [src/features/consultation-result/ui](src/features/consultation-result/ui) |
| `VoiceResultHeader.vue` | 语音结果页患者信息与确认/放弃操作头部；只负责展示和发出 `confirm/cancel` 事件，不承接结果记录、复核或回写逻辑；真实实现已迁至语音问诊功能域，旧 `src/components/VoiceResultHeader.vue` 兼容包装已删除 | [src/features/voice-consultation/ui/VoiceResultHeader.vue](src/features/voice-consultation/ui/VoiceResultHeader.vue) |
| `VoiceSafetyReviewPanel.vue` | 语音安全复核员提示面板（L2 柔性提醒）：展示异步 LLM 复核状态和非干扰提醒，支持展开详情、知晓和忽略；当父组件提供 `getActionLabel` 时额外显示"采纳建议"按钮（移除冲突药 / 补充化验），按钮触发 `apply` 事件；面板自身不感知 record，只负责 UI 与事件；真实实现已迁至语音问诊功能域，旧 `src/components/VoiceSafetyReviewPanel.vue` 兼容包装已删除 | [src/features/voice-consultation/ui/VoiceSafetyReviewPanel.vue](src/features/voice-consultation/ui/VoiceSafetyReviewPanel.vue) |
| `VoiceRigidBlockBanner.vue` | 语音刚性阻断条（L1 硬规则）：与 `VoiceSafetyReviewPanel` 并列展示，置于安全复核面板上方；仅渲染由 `useVoiceRigidBlock` 同步评估出的确定性告警，要求医生对每条 `block` 项二次确认；不调用 LLM、不发起网络请求；真实实现已迁至语音问诊功能域，旧 `src/components/VoiceRigidBlockBanner.vue` 兼容包装已删除 | [src/features/voice-consultation/ui/VoiceRigidBlockBanner.vue](src/features/voice-consultation/ui/VoiceRigidBlockBanner.vue) |
| `shared/composables/useOutsideInteraction.ts` | 通用 document 外部点击 / pointerdown 交互 composable：统一绑定和解绑全局事件，按 selector 或 element refs 判断是否点击在浮层锚点外部并触发关闭回调；不携带推荐、症状或反馈业务语义 | [src/shared/composables/useOutsideInteraction.ts](src/shared/composables/useOutsideInteraction.ts) |
| `shared/composables/useTauriEventListener.ts` | 通用 Tauri 事件监听生命周期 composable：统一在 mounted 阶段自动订阅 `listen`，或由调用方在需要保证时序时显式 `startListener()`；在 unmounted 阶段解绑，并集中处理订阅失败日志，可按调用方配置向外传播显式注册失败；不携带事件 payload 的业务过滤、PHIS 回执处理、下载进度处理或页面状态写入。`useEventListeners.ts` 的 App 级 Tauri 事件使用 `autoStart: false` 接入，保留原有显式 `registerAllListeners()` 时序 | [src/shared/composables/useTauriEventListener.ts](src/shared/composables/useTauriEventListener.ts) |
| `app/events/useReceptionController.ts` | App 级接诊状态机 controller：统一处理 `receive-patient`、自动静默接诊和 `show-patient-risks` 所需的 HIS 患者补全、过敏史 / 历史就诊摘要合并、风险胶囊状态、同患者并发接诊复用、患者切换时语音缓存和最小化入口清理；不注册 Tauri 事件、不处理 SDK handshake、不打开具体结果页、不提交 PHIS 回写 | [src/app/events/useReceptionController.ts](src/app/events/useReceptionController.ts) |
| `app/events/useSdkHandshakeController.ts` | App 级 SDK handshake controller：解析 `sdk-handshake` payload 中的 HIS origin、token、机构、租户、角色科室和 URT，初始化 / 重置 `HisService` 与 `HisAdapter`，缓存反馈 actor，并把 `orgCode / tenantId` 写入医学目录上下文；不注册 Tauri 事件、不读写患者上下文、不打开页面或提交 PHIS 回写 | [src/app/events/useSdkHandshakeController.ts](src/app/events/useSdkHandshakeController.ts) |
| `shared/composables/useTauriWindowEventListeners.ts` | 通用独立窗口事件监听生命周期 composable：统一批量注册当前 Tauri `Window` 实例上的 `appWindow.listen`，在 unmounted 阶段解绑，并集中处理注册失败日志；独立窗口仍显式 `await registerListeners()` 后再发送 ready 事件，避免主窗口提前投递 payload；不携带窗口 payload 状态写入、图表渲染或业务状态机 | [src/shared/composables/useTauriWindowEventListeners.ts](src/shared/composables/useTauriWindowEventListeners.ts) |
| `ReceptionCapsule.vue` | 接待胶囊（风险提示）；真实实现已迁至 reception-risk 功能域，旧 `src/components/ReceptionCapsule.vue` 已删除，App 通过 `@features/reception-risk` 公开入口消费 | [src/features/reception-risk/ui/ReceptionCapsule.vue](src/features/reception-risk/ui/ReceptionCapsule.vue) |
| `RiskAlertPanel.vue` / `RiskAlertBubble.vue` | 风险详情面板 / 气泡；真实实现已迁至 reception-risk 功能域，旧 `src/components/RiskAlertPanel.vue` / `src/components/RiskAlertBubble.vue` 已删除，`RiskItem` 类型由 `src/features/reception-risk/types.ts` 统一导出，避免业务代码从 UI 文件借类型 | [src/features/reception-risk/ui](src/features/reception-risk/ui) |
| `AnalyticsPanel.vue` | 数据分析看板，展示本地会话、反馈、推荐和操作统计，并导出使用报告；真实实现已迁至 analytics 功能域，旧 `src/components/AnalyticsPanel.vue` 已删除，App 通过 `@features/analytics` 公开入口消费 | [src/features/analytics/ui/AnalyticsPanel.vue](src/features/analytics/ui/AnalyticsPanel.vue) |
| `BodyPartSelector.vue` / `SystemCategorySelector.vue` | 症状问诊 UI 域：人体部位交互选症状和按系统分类选症状；真实实现已迁至 `features/symptom-consultation/ui`，旧 `src/components/*` 路径已删除，`ConsultationPage` 通过 `@features/symptom-consultation` 公开入口消费；本地症状库维护页已下线，模板维护改由 `floating-ball-server` 后台承接 | [src/features/symptom-consultation/ui](src/features/symptom-consultation/ui) |
| `MedicalCatalogCachePanel.vue` | 缓存管理独立视图：页面标题统一为“缓存管理”，当前只展示诊断 / 诊疗项目 / 药品等基础数据 SQLite 缓存数量、同步状态、数据库路径，并提供面板内刷新、手动同步和按目录 / 机构 / 租户 / 药房定向清理；真实实现已迁至 medical-catalog 功能域，旧 `src/components/MedicalCatalogCachePanel.vue` 已删除，App 通过 `@features/medical-catalog` 公开入口消费 | [src/features/medical-catalog/ui/MedicalCatalogCachePanel.vue](src/features/medical-catalog/ui/MedicalCatalogCachePanel.vue) |
| `HisIntegrationLogPanel.vue` | HIS 联调日志独立视图面板：筛选、查看详情、复制、导出、清空本地 JSONL 日志；真实实现已迁至 settings 功能域下的排障工具面板，旧 `src/components/HisIntegrationLogPanel.vue` 已删除，App 通过 `@features/settings` 公开入口消费 | [src/features/settings/ui/HisIntegrationLogPanel.vue](src/features/settings/ui/HisIntegrationLogPanel.vue) |
| `UpdateChecker.vue` / `ForceUpdateGate.vue` | 客户端更新与区域化强制更新门禁 UI：`UpdateChecker` 负责更新源配置、检查按钮、下载进度和安装重启动作编排；`ForceUpdateGate` 只展示强更版本要求并复用 `UpdateChecker forced`。真实实现已迁至 settings 功能域，旧 `src/components/UpdateChecker.vue` / `src/components/ForceUpdateGate.vue` 已删除，设置页和 App 强更门禁通过 `@features/settings` 公开入口消费 | [src/features/settings/ui](src/features/settings/ui) |
| `FeedbackSubmissionPanel.vue` | 通用问题反馈面板：区域化模式下承接工作区顶栏反馈入口，提供紧凑星级、问题标签、选填截图和补充说明；真实实现已迁至 feedback 功能域，旧 `src/components/FeedbackSubmissionPanel.vue` 已删除，App 通过 `@features/feedback` 公开入口消费 | [src/features/feedback/ui/FeedbackSubmissionPanel.vue](src/features/feedback/ui/FeedbackSubmissionPanel.vue) |
| `KnowledgeBasePanel.vue` / `KnowledgePanel.vue` | 知识库 UI 域：内置知识库检索面板、问诊页知识检索抽屉、搜索结果行和详情弹窗；真实实现已迁至 knowledge 功能域，旧 `src/components/Knowledge*.vue` 已删除，App 与问诊页通过 `@features/knowledge` 公开入口消费。智能问诊和语音问诊的批量检索分类词提取收敛到 `features/knowledge/lib/knowledgeSearchCategories.ts`，检索 loading / results / 面板开合收敛到 `features/knowledge/model/useKnowledgeSearchController.ts`；知识服务、配置判断、toast 和埋点仍由调用方注入。当前默认知识入口仍更偏向 `pmphai.ts` 生成的外部页面，内置面板作为保留备选通道 | [src/features/knowledge/ui](src/features/knowledge/ui) / [src/features/knowledge/lib](src/features/knowledge/lib) / [src/features/knowledge/model](src/features/knowledge/model) |
| `Toast.vue` | 消息提示；真实实现已迁至 `src/shared/ui/Toast.vue`，旧 `src/components/Toast.vue` 兼容包装已删除，全局 provider 直接使用 shared 实现 | [src/shared/ui/Toast.vue](src/shared/ui/Toast.vue) |
| `Icon.vue` | 通用图标封装真实实现已迁至 `src/shared/ui/Icon.vue`；旧 `src/components/Icon.vue` 兼容包装已删除。离线图标由 `main.ts` 注册 `src/icons/iconifyCollections.ts` 中的精简 Iconify 集合，避免把完整 `@iconify-json/*` 图标包打进产物 | [src/shared/ui/Icon.vue](src/shared/ui/Icon.vue) |

### 组件通信模式

**父子通信**:
- Props Down - 父组件通过 props 传递数据
- Events Up - 子组件通过 emit 触发事件

**跨组件通信**:
- `provide/inject` - Toast 提示功能
- 全局 ref 状态 - currentPatient, generatedRecord
- Pinia - `diagnosisPath` store 负责诊断路径缓存共享

---

## 常量 (Constants)

### `constants/windowSizes.ts` ✅

**文件**: [src/constants/windowSizes.ts](src/constants/windowSizes.ts)

**职责**: 窗口尺寸常量定义

**导出**:
```typescript
export const WINDOW_SIZES = {
  BALL: { width: 160, height: 160 },
  WORK: { width: 378, height: 449 },
  CHAT: { width: 420, height: 620 },
  DIAGNOSIS_PATH: { width: 972, height: 608 },
  CONSULTATION: { width: 1120, height: 760 },
  CAPSULE: { width: 360, height: 80 },
  CAPSULE_PROCESSING: { width: 360, height: 96 },
  CAPSULE_STOPPED: { width: 360, height: 140 },
  CAPSULE_EXPANDED: { width: 360, height: 248 },
  RISK_CARD: { width: 280, height: 92 },
  RISK_CARD_EXPANDED: { width: 280, height: 360 },
  VOICE_CONSULTATION: { width: 1080, height: 720 },
  HIS_LOG: { width: 980, height: 640 },
  MEDICAL_CACHE: { width: 980, height: 640 }
};

export type ViewType =
  | 'chat'
  | 'settings'
  | 'consultation'
  | 'risk-alert'
  | 'voice-interaction'
  | 'voice-consultation'
  | 'reception-capsule'
  | 'analytics'
  | 'his-log'
  | 'medical-cache'
  | 'knowledge-base';

export function getWindowSizeForView(view: ViewType): { width: number; height: number };
```

**用途**: 消除魔法数字，统一管理所有视图的窗口尺寸

`consultation` 现在既是 HIS 接诊后的默认业务入口，也是 `/api/consultation/assist` 的唯一主落点。

---

### `constants/animation.ts` ✅

**文件**: [src/constants/animation.ts](src/constants/animation.ts)

**职责**: 动画参数常量定义

**导出**:
```typescript
export const ANIMATION = {
  TRANSITION_MS: 300,              // 过渡动画时长
  MOVE_DEBOUNCE_MS: 500,           // 窗口移动防抖
  WINDOW_SIZE_WAIT_TIMEOUT: 1000,  // 窗口尺寸等待超时
  POSITION_VERIFY_DELAY: 50,       // 位置验证延迟
  SIZE_POLL_INTERVAL: 16,          // 尺寸轮询间隔（60fps）
};

export const MORPH_ORIGIN_DEFAULT = '80px 80px';

export function wait(ms: number): Promise<void>;
```

**用途**: 统一管理动画时长、防抖延迟、轮询参数

---

## 样式模块 (Styles)

### 样式文件组织

```
src/styles/
├── design-tokens.css       # 设计令牌（颜色、间距、字体）
├── global-overrides.css    # 全局覆盖
├── utilities.css           # 工具类
├── global.css              # 全局基础样式 ✅
├── layouts/
│   └── app-layout.css      # 应用布局样式 ✅
└── animations/
    └── morph.css           # 变形动画 ✅
```

### `styles/global.css` ✅

**职责**: 全局基础样式

**内容**:
- HTML/Body 重置
- 应用容器样式
- 滚动条样式
- 辅助功能（skip-link）

**行数**: 约 60 行

---

### `styles/layouts/app-layout.css` ✅

**职责**: 应用布局样式

**内容**:
- 状态层布局（ball-layer, assistant-layer）
- Assistant 容器（玻璃态设计）
- 工具栏样式
- 图标按钮样式

**行数**: 约 180 行

---

### `styles/animations/morph.css` ✅

**职责**: 变形动画

**内容**:
- Morph 过渡动画（悬浮球 ↔ 面板）
- GPU 加速优化（transform, opacity）
- 缩放比例定义

**行数**: 约 60 行

**动画参数**:
```css
/* 助手面板 */
.morph-enter-from.assistant-layer,
.morph-leave-to.assistant-layer {
  opacity: 0;
  transform: scale(0.35);  /* 从小球中心展开 */
}

/* 悬浮球 */
.morph-enter-from.ball-layer,
.morph-leave-to.ball-layer {
  opacity: 0;
  transform: scale(0.5);   /* 弹出效果 */
}
```

---

## 服务 (Services)

服务封装外部系统通信和数据处理。

| 服务 | 职责 | 文件 |
|------|------|------|
| `llm.ts` / `services/llm/*` | LLM facade 与底层客户端模块。`llm.ts` 保留 `chat/chatStream/chatFast/transcribeAudio/analyzePatientRisks/testLLMConnection` 公开 API 与区域化 trace 编排；`services/llm/types.ts` 定义消息、配置与重试类型，`config.ts` 解析本地/区域化配置，`retry.ts` 提供指数退避，`payload.ts` 负责 OpenAI 兼容 payload / 摘要工具，`localOpenAiClient.ts` 负责本地 OpenAI 兼容 chat / stream / transcription 协议细节。区域化模式仍通过 `regionalClient.ts` 签名代理，不在 LLM 模块内直接 `fetch /v1/*` | [src/services/llm.ts](src/services/llm.ts) / [src/services/llm](src/services/llm/types.ts) |
| `aliyunSpeech.ts` | 语音转写编排（DashScope + OpenAI 兼容降级） | [src/services/aliyunSpeech.ts](src/services/aliyunSpeech.ts) |
| `audioRecorder.ts` | Web Audio API 录音、音频输入设备枚举与首选设备回退 | [src/services/audioRecorder.ts](src/services/audioRecorder.ts) |
| `medicalData.ts` | 医疗数据目录加载、缓存恢复与匹配（诊断、药品、检查项）；运行期不再依赖本地 CSV 作为基础数据来源，而是优先恢复已有缓存，再按当前模式补同步：区域化模式恢复 `localStorage`/SQLite 中已有目录后继续走 mappings delta，本地模式恢复 SQLite 目录后再按有效 HIS 握手上下文增量同步。机构级检查/检验项目按 `orgCode + tenantId` 存储，药品目录按 `orgCode + tenantId + storeId` 分 scope 落库，多药房场景读取时对多个药房 scope 做并集聚合，避免再把药房主键误写成机构主键。语音问诊结果页拿到有效药房后，会显式按 active `idSto` 加载药品目录，再执行药品匹配；缓存管理页中的“基础数据缓存”面板支持在有效 HIS 握手上下文下触发一次忽略当日缓存的强制同步，不受区域化开关限制。同时负责根据 ICD-10 前三位类目码（如 `J06`）解析章节分组，用于推荐诊断分组展示。针对语音问诊结果页，还提供药品 / 诊疗项目的严格分档匹配能力：完全匹配直接确认，高相似候选只作为“待确认”建议，未命中则进入手动匹配。 | [src/services/medicalData.ts](src/services/medicalData.ts) |
| `hisService.ts` | HIS HTTP 调用封装（PHIS 形态默认实现）：统一处理鉴权头、POST/GET 请求，以及诊断/药品/诊疗项目目录与药品频次、用法等字典读取，供主问诊和语音问诊复用；诊断目录通过 `api/base.hiBdDieService/queryList` 按 1000 条/页循环同步，避免数万条诊断一次性拉取导致弱网超时；语音结果页药房列表也通过该服务调用 `api/phis.orgMedStoManageService/queryOrgSto`，并按 SDK 握手 `extra.urt.userRoleDepts` 中的 `deptId` 过滤可见范围；药品详情按候选发药药房轮询 `loadMedicinePro`，只有命中有效详情的药房才能作为药品默认药房并允许选中；检查项目详情匹配后通过 `api/phis.hiBdCliPacsPartService/queryExaPartAndWayList` 获取检查部位 / 方式候选，单候选自动回填；用药总量变更后通过 `api/phis.medicineInventoryService/checkInvEnough` 校验库存，库存不足时阻止药品回写；住院病历 AI 上下文只保留 PHIS `api/phis.aiInpatientEmrContextService/buildContext` 聚合接口，登记 / 诊断 / 医嘱 / 体温单等明细由后端裁剪后一次性返回，不再维护桌面端分散 RPC 回退。**业务方不应直接 import 本文件**：所有出站调用应通过 `services/his` 适配器层 | [src/services/hisService.ts](src/services/hisService.ts) |
| `services/his/HisAdapter.ts` | 厂商无关的 HIS 适配器接口契约：覆盖目录同步 / 字典 / 详情 / 检查部位 / 库存校验 / 患者信息 / 门诊病历引用 / 住院上下文场景。详情类和住院上下文均使用中性 DTO（`MedicineDetail` / `MedicalItemDetail` / `HisInpatient*`）。新厂商只需实现该接口并通过 `registerHisAdapterFactory(vendor, factory)` 注入，业务层无需改动 | [src/services/his/HisAdapter.ts](src/services/his/HisAdapter.ts) |
| `services/his/types.ts` | vendor-neutral DTO 定义：详情（`MedicineDetail` / `MedicalItemDetail`，诊疗项目详情包含 `defaultQuantity` 用于真实反填处置数量）+ 检查部位（`MedicalItemPartOption`）+ 目录（`DiagnosisCatalogEntry` / `MedicineCatalogEntry` / `MedicalItemCatalogEntry`）+ 字典（`DictionaryEntry`）+ 库存校验（`InventoryCheckRequest` / `InventoryCheckResult`）+ 患者信息与住院上下文（`HisPatientInfo` / `HisPatientHistory` / `HisInpatient*`）。业务方只读语义化字段（`productId` / `quantity` / `businessType` / `patientId` 等），不再泄漏 PHIS 命名（`idMedPro` / `amount` / `sdFrzBiz` / `idPi`）；厂商私有字段保留在 `raw` / `properties` 透传 | [src/services/his/types.ts](src/services/his/types.ts) |
| `services/his/PhisHisAdapter.ts` | 默认厂商实现：thin wrapper，把 `HisService` 类（PHIS 形态）暴露为 `HisAdapter` 接口；详情、检查部位、患者信息与门诊病历引用在此处把 PHIS 字段映射为中性 DTO，诊疗项目详情会把 `idDeptExec` 映射为 `executingDeptId`、`count/amount/quantity` 映射为 `defaultQuantity`，其中体温单会从 `detail` 半结构化文本提取血压、呼吸、血氧等生命体征，目录与字典方法仍直接透传，住院病历上下文直接通过 `buildContext` 聚合包进入业务层 | [src/services/his/PhisHisAdapter.ts](src/services/his/PhisHisAdapter.ts) |
| `services/his/registry.ts` | 适配器注册表与选择器：`getHisAdapter()` 是业务方唯一入口；选择优先级 `setActiveHisVendor` > `VITE_HIS_VENDOR` > `localStorage.HIS_VENDOR` > 默认 `phis`；handshake 时由 `useEventListeners` 调用 `resetHisAdapter` 清缓存 | [src/services/his/registry.ts](src/services/his/registry.ts) / [src/services/his/index.ts](src/services/his/index.ts) |
| `hisIntegrationLog.ts` | HIS 联调调用日志客户端：为 PHIS 出站请求生成 / 记录结构化日志，提供查询、清空和导出 Tauri 命令封装 | [src/services/hisIntegrationLog.ts](src/services/hisIntegrationLog.ts) |
| `diagnosisPath.ts` | 诊断路径数据构建与独立窗口事件载荷封装；优先通过 LLM 生成结构化推理链，再在前端校验并映射为 Sankey 节点、连线和说明文案，失败时回退本地兜底链路；载荷中补充 `supportingEvidence`、`counterEvidence`、`differentialPoints` 三段式解释字段，供窗口右侧说明面板直接渲染 | [src/services/diagnosisPath.ts](src/services/diagnosisPath.ts) |
| `reportInterpretation.ts` | 检验检查报告解读服务：接收 `taskId + query + patientContext`，在不扩展 HIS 入参的前提下从报告原文解析报告项目、日期/时间、门诊号、样本号、申请/检验时间与异常指标，创建独立窗口并等待 `report-interpretation:ready` 后投递 status/update 事件，构建检验/影像两类 prompt，调用 `llm.ts` 返回结构化解读结果，并封装为独立窗口消费的报告单式 payload；若 LLM 返回结构不完整，回退到可读的摘要型结构 | [src/services/reportInterpretation.ts](src/services/reportInterpretation.ts) |
| `feedback.ts` | 会话反馈服务；负责会话、推荐、反馈、性能指标的本地落库与区域化双写，同时把结构化操作日志转成区域化审计接口可消费的 `{ module, action, result, ... }` 载荷 | [src/services/feedback.ts](src/services/feedback.ts) |
| `voiceFeedback.ts` | 语音反馈服务；负责推荐项 / 病例字段 / 整页反馈 payload 组装、本地草稿恢复、病例字段差异摘要与待同步队列 | [src/services/voiceFeedback.ts](src/services/voiceFeedback.ts) |
| `aiTrace.ts` | 最近一次区域化 AI 调用链路上下文缓存；向反馈面板暴露 `traceId`、模型、场景、输入/输出摘要与耗时，并把 AI 代理调用按业务模块/动作回写到操作日志；区域化 AI trace 必须同时保留 `requestPayload/responsePayload` 完整业务出入参，供后台日志详情排障，凭据和语音原始音频不得进入 payload | [src/services/aiTrace.ts](src/services/aiTrace.ts) |
| `operationTracker.ts` | 结构化操作日志入口：白名单保留高价值业务事件，统一生成 `module/action/title/sourceModule/scene`，过滤 `collapse`、壳层导航等低价值噪声 | [src/services/operationTracker.ts](src/services/operationTracker.ts) |
| `featureUsageTracker.ts` | 区域化功能调用事件上报入口：按产品功能维度记录一次用户真实调用，批量写入远端 `/v1/client/feature-events/batch`；默认以本地队列事件自身生成 `idempotencyKey`，只对离线重试 / 接口重试去重，不把同一就诊的再次显式入口合并掉 | [src/services/featureUsageTracker.ts](src/services/featureUsageTracker.ts) |
| `themeService.ts` | 主题管理 | [src/services/themeService.ts](src/services/themeService.ts) |
| `pmphai.ts` | PMPHAI 集成 | [src/services/pmphai.ts](src/services/pmphai.ts) |
| `knowledgeBase.ts` | 知识库检索 | [src/services/knowledgeBase.ts](src/services/knowledgeBase.ts) |
| `types/consultationAssist.ts` | 主问诊灵活模式的动作类型、诊断路径候选类型与上下文结构定义，避免继续依赖历史 session 命名 | [src/types/consultationAssist.ts](src/types/consultationAssist.ts) |
| `types/reportInterpretation.ts` | 报告解读域类型：定义 `taskId/query/patient` 请求结构，以及独立窗口消费的结构化摘要、异常项、风险提示与患者上下文快照 | [src/types/reportInterpretation.ts](src/types/reportInterpretation.ts) |
| `templateService.ts` | 症状模板管理 | [src/services/templateService.ts](src/services/templateService.ts) |
| `factChecker.ts` | AI 防误防漏 / 审查能力；语音结果页只通过 `features/voice-consultation/model/useVoiceResultFactCheckState.ts`、`features/voice-consultation/model/useVoiceResultFactCheck.ts` 和 `features/voice-consultation/model/useVoiceSafetyReview.ts` 编排调用，不在组件内直接维护复核进度和 issue map | [src/services/factChecker.ts](src/services/factChecker.ts) |
| `safetyRules.ts` | L1 刚性安全复核规则引擎：纯本地、确定性、无网络的硬规则集合（抗生素过敏交叉、诊断-性别冲突、儿童禁用药、重复用药）；输入 `GeneratedRecord + PatientInfo`，输出 `RigidBlockAlert[]`；只暴露 `evaluateRigidSafetyRules`，不直接持有 UI 状态，由 `features/voice-consultation/model/useVoiceRigidBlock.ts` 包装为响应式 composable 后供 `VoiceRigidBlockBanner.vue` 渲染 | [src/services/safetyRules.ts](src/services/safetyRules.ts) |
| 患者长期记忆 | 当前仓库仅保留 `docs/patient-memory-*.drawio/png` 等历史规划图，未落地 `patientMemoryStore.ts`、`patientMemoryBackend.ts`、`patient_memory.rs` 或专用 SQLite migration。任何恢复该能力的工作必须先补架构 / API / 数据迁移文档，再实现前端 service、Rust command 和缓存管理 UI | `docs/patient-memory-architecture.drawio` / `docs/patient-memory-call-paths.png` |
| `useSafetyIssueResolver.ts` | L2 柔性提醒到 record 的执行层：把 `VoiceSafetyIssue` 解析为 `remove_medications` / `add_lab_tests` / `none` 动作计划，并在医生点击"采纳建议"时直接 mutate `record.medications` / `record.labTests`；通过 `getRecord/onRecordUpdated` 注入避免循环依赖，应用后自动重跑 L1 与 L2 复核；真实实现已迁至语音问诊功能域，旧路径只保留兼容 re-export | [src/features/voice-consultation/model/useSafetyIssueResolver.ts](src/features/voice-consultation/model/useSafetyIssueResolver.ts) |
| `promptGuard.ts` | Prompt 注入与泄漏保护 | [src/services/promptGuard.ts](src/services/promptGuard.ts) |
| `textGeneration.ts` | 主诉/现病史等文本生成辅助 | [src/services/textGeneration.ts](src/services/textGeneration.ts) |
| `reportGenerator.ts` | 使用报告导出 | [src/services/reportGenerator.ts](src/services/reportGenerator.ts) |
| `regionalClient.ts` / `services/regional/*` | 区域化核心客户端 facade 与内部模块。`regionalClient.ts` 只保留兼容导出；真实职责拆到 `services/regional/config.ts`（区域化开关与连接配置）、`device.ts`（设备编码）、`registration.ts`（终端注册与 token）、`httpClient.ts`（签名 HTTP 请求、服务端时间偏移校准、`SIG-401` 重签重试）、`bootstrap.ts`（bootstrap 缓存、初始化、心跳）、`realtime.ts`（SSE 与 WebSocket 签名 URL）、`speechUpload.ts`（语音上传 payload）。所有 `/v1/*` HTTP/SSE/WebSocket 出口仍必须经过签名模块，不允许业务代码直接 `fetch` 区域化接口 | [src/services/regionalClient.ts](src/services/regionalClient.ts) / [src/services/regional/index.ts](src/services/regional/index.ts) |
| `regionalRuntime.ts` | 区域化运行时编排：统一初始化、重连、远程 Prompt/模板/映射同步和审计上传启动/关闭；初始化成功后额外发送 `regional_runtime_initialized` 审计事件，方便直接在后台确认链路打通 | [src/services/regionalRuntime.ts](src/services/regionalRuntime.ts) |
| `userFeedback.ts` | 区域化问题反馈服务；负责图片编码、评分/说明校验、反馈 scope 元数据合并和调用远端 `/v1/client/feedbacks` 接口 | [src/services/userFeedback.ts](src/services/userFeedback.ts) |
| `consultationUserLog.ts` | 区域化运维用户日志服务；负责组装智能问诊/语音问诊首版与最终快照，语音问诊额外编码录音和 ASR 文本，并调用远端 `/v1/client/user-logs/consultations` 聚合到同一条问诊日志 | [src/services/consultationUserLog.ts](src/services/consultationUserLog.ts) |
| `promptOverride.ts` | 远程 Prompt 覆盖层：管理端发布的自定义 prompt 替换本地默认值 | [src/services/promptOverride.ts](src/services/promptOverride.ts) |
| `auditUploader.ts` | 审计事件批量上报：区域化模式下直接调用远端 `/v1/client/audit/events/batch`，本地只保留轻量离线队列用于失败重试；恢复遗留队列后立即补传，新事件入队后也会异步触发一次立即上报尝试；`operation` 事件会保留 `operationType/operationName/details`，并补齐 `module/action/result` 供服务端日志表查询；AI 调用类事件的 `details` 必须同时包含摘要与完整业务出入参，避免后台只能看到截断文本；不承担功能调用统计 | [src/services/auditUploader.ts](src/services/auditUploader.ts) |

### 当前模板/映射读取策略

1. `templateService.ts` 以本地 JSON 模板为主；区域化模式下优先从远程缓存读取，本地仍作为兜底。
2. `medicalData.ts` 的目录数据分两条链路：
  - 区域化模式下先恢复已存在的 `localStorage`/SQLite 缓存，再继续通过 `syncRemoteData()` 增量同步区域服务数据。
  - 本地模式下先恢复 SQLite 目录缓存，再通过 `hisService.ts` 同步 HIS 目录并持久化：诊断全局只同步一次，诊疗项目按 `orgCode + tenantId` 每天同步一次，药品按 `orgCode + tenantId + storeId` 每天同步一次；机构与租户标识来自 `sdk-handshake` 的握手上下文，药房 scope 来自当前可见药房集合；若握手缺少 `tk` 则禁止发起目录请求；若 HIS 目录不可用则保持当前缓存，不再回退本地 CSV。
   - 运行期可通过 `window.__medicalCatalogDebug__` 查看 SQLite 路径、同步状态、清理指定目录缓存并手动触发重同步，用于日常联调排查。
3. `catalog` 匹配归一化规则固定为：小写后去除空格、连字符、下划线（`/[\s_-]/g`），用于兼容 `tcm_diagnoses/tcm-diagnoses/tcm diagnoses` 等格式。
4. 西医推荐诊断的 UI 分组固定按 ICD-10 类目码前三位做章节归类；当编码无法解析到标准章节时，前端回退到"未分类/待确认"分组，避免丢失候选项。

### 区域化模式运行链路

当首启默认值或设置页/环境变量使 `REGIONAL_ENABLED=true`，并且已经配置 `REGIONAL_BASE_URL / REGIONAL_ORG_CODE` 时，应用启动流程扩展为：

```
main.ts mount
    ↓
isRegionalMode() === true ?
    ↓ Yes
initializeRegionalRuntime()
    ├─ initializeRegionalClient()
    │   ├─ registerDevice() → POST /v1/client/register
    │   ├─ getBootstrapConfig() → GET /v1/client/bootstrap
    │   ├─ stale token 时 clear auth cache 后自动重新 register
    │   └─ startHeartbeat() (30s interval)
    ↓
Promise.allSettled([
    syncRemotePrompts(),    → GET /v1/client/prompts/delta
    syncRemoteTemplates(),  → GET /v1/client/templates/delta
    syncRemoteData(),       → GET /v1/client/mappings/delta
])
    ↓
startAuditUploader() (startup flush + enqueue flush + 30s retry)
```

设置页保存区域化接入参数时，也复用同一条 `initializeRegionalRuntime() / reinitializeRegionalRuntime()` 链路即时生效，不要求重启应用；当前首启会先把默认值 `REGIONAL_ENABLED=true / REGIONAL_BASE_URL=<VITE_REGIONAL_BASE_URL 或 http://127.0.0.1:8080> / REGIONAL_ORG_CODE=<本地 VITE_REGIONAL_ORG_CODE 或 ORG001>` 写入本地存储。设备编码则首次优先写入当前机器 MAC 地址，若 MAC 暂不可读才生成本地兜底值；一旦本地已有 `REGIONAL_DEVICE_CODE`，后续启动不再重复探测 MAC。Windows 下 MAC 探测通过 `GetAdaptersAddresses` 直接读取网卡信息，不再启动 `getmac` / `ipconfig` 子进程，避免控制台窗口闪烁。

保存行为约束：

1. “保存参数”与“连通性校验”分离：即使 `floating-ball-server` 暂时不可达，接入参数也应先持久化成功。
2. 若后台可连通，设置页显示连接成功状态，并补发 `regional_connection_saved` 操作日志。
3. 若后台不可达或返回错误，设置页仍保留“参数已保存”的结果，但连接状态与 toast 需要尽量展示真实失败原因，如网络不可达、设备鉴权失败、机构编码未识别或服务端 500；不再把整个保存动作判成失败。

区域化模式下各服务的路由变化：

| 服务 | 本地模式 | 区域化模式 |
|------|----------|-----------|
| LLM Chat (stream) | 直连 apiUrl + apiKey | → SSE /v1/ai/chat (后端持有 apiKey) |
| LLM Chat (non-stream) | 直连 apiUrl + apiKey | → POST /v1/ai/chat |
| 语音转写 | 直连 Whisper | → POST /v1/ai/speech/transcribe（上传 base64 录音 + MIME/文件名元数据） |
| 阿里实时语音 | 直连 DashScope | → WebSocket /v1/ai/speech/realtime/ws（逐帧代理 PCM 音频，失败后降级 POST /v1/ai/speech/realtime 批量上传） |
| Prompt 来源 | 本地 prompts/index.ts | bootstrap + delta 覆盖 → 本地兜底 |
| 模板来源 | 本地 templates.json | delta 同步 → localStorage 缓存 → 本地兜底 |
| 医学数据 | 已有缓存 + HIS/区域服务目录 | 区域化：恢复 `localStorage`/SQLite 后继续 delta 同步；本地模式：恢复 SQLite 后再做 HIS 目录同步，诊断全局一次、诊疗项目/药品按机构每天同步；失败时保留当前缓存 |
| 操作日志 | 仅本地 SQLite | 本地写入 + auditUploader 批量上报 |
| Reviewer/PMPHAI/KB 配置 | localStorage | bootstrap 下发 |

客户端版本更新链路仍由 Tauri updater 执行安装与签名校验，settings 功能域下的 `UpdateChecker.vue` 只负责更新源配置、检查按钮、进度与安装动作编排，`ForceUpdateGate.vue` 只在强制更新时承接门禁展示并复用同一检查/安装 UI。区域化模式下若用户未手工配置内网更新源，`updateConfig.ts` 会从当前后端地址推导出：

- 正式内网：`{REGIONAL_BASE_URL}/v1/client/releases/production/latest.json`
- 测试内网：`{REGIONAL_BASE_URL}/v1/client/releases/testing/latest.json`

`floating-ball-server` 后台上传版本后生成 Tauri 兼容 `latest.json` 和公开下载地址；这些公开地址不携带设备令牌，避免 updater 下载阶段无法附带自定义鉴权头。内网部署允许使用 `http://` 更新源，`tauri.conf.json` 已通过 updater 的 `dangerous-insecure-transport-protocol` 开启非安全传输协议，运行时注入的 updater endpoint 同样继承该配置；安装包签名校验仍由 Tauri updater 强制执行。

### 当前本地桥接与知识库链路

1. `operationTracker.ts` 与 `feedback.ts` 负责本地操作追踪、会话统计和回溯；本地模式下 `logOperation()` 写入本地 SQLite。区域化模式下，`logOperation()` 不再落本地 SQLite，而是把操作日志规范化为 `{ module, action, result, operationType, operationName, details }` 后直接进入远端审计上传链路。AI 调用类 `details` 中的 `requestSummary/responseSummary` 仅用于摘要展示，完整排障必须读取 `requestPayload/responsePayload`。
1.1 `featureUsageTracker.ts` 负责辅诊功能统计事件；它与审计日志分离，只在真实用户功能调用时写一条业务事件，后台统计按该事件计数，不按 `operationTracker` 或 AI 代理日志行数计数。
2. `src-tauri/src/http_server.rs` 提供 `/api/consultation/*` 与 `/api/pmphai/*` 本地桥接能力。
3. `pmphai.ts` 优先经本地代理访问 PMPHAI，规避 WebView 跨域问题。
4. `AnalyticsPanel.vue` 当前读取本地统计与本地数据库查询结果。

### `audioRecorder.ts` 能力说明

- 统一封装麦克风流请求：优先 `navigator.mediaDevices.getUserMedia`，兼容 legacy `getUserMedia` 系列 API
- 提供麦克风错误归一化：将浏览器/系统异常映射为用户可理解提示
- 提供输入设备枚举、首选 `deviceId` 持久化、首开权限预热与设备失效回退，保证 `VoiceCapsule.vue` 与 `ChatPanel.vue` 复用同一套音频选择策略
- 为 `VoiceCapsule.vue` 与 `ChatPanel.vue` 提供一致的录音能力基座

### 语音转写网络策略

- `llm.ts` 中 `transcribeAudio` 负责 OpenAI 兼容批量转写，采用“后端优先，前端回退”策略：
  - 优先调用 Tauri Command（Rust `reqwest`）代理 `/audio/transcriptions`，规避 WebView CORS/ATS 限制
  - 若后端通道不可用，再回退到前端 `fetch` 直连
- `aliyunSpeech.ts` 中 `RealtimeSpeechService` 负责统一语音转写编排：
  - 默认采集 PCM 音频块并在 `finish()` 时统一转写
  - speech provider 为 `aliyun-dashscope` 时，优先走 Rust 后端代理的 DashScope WebSocket 实时识别
  - 区域化模式下，`aliyun-dashscope` 优先走 `floating-ball-server` 的 `/v1/ai/speech/realtime/ws` WebSocket 代理；WebSocket 启动失败时保留停止后批量转写兜底
  - speech provider 为 `openai-compatible` 时，不启用实时流式，统一走 `llm.ts/transcribeAudio` 的批量转写
  - `ChatPanel.vue` 与 `VoiceCapsule.vue` 共用同一套 speech config，不再分别读取互不一致的配置项
- 文本与语音支持独立配置域：
  - 文本模型使用 `OPENAI_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`
  - 语音转写使用独立的 speech provider / key / baseUrl / model；其中 OpenAI 兼容 speech provider 未填写 key 时可回退复用通用 LLM API Key
- 审查 AI（`factChecker.ts` -> `llm.ts/chat`）走独立的 `/chat/completions` 文本链路：
  - 配置项为 `REVIEWER_ENABLED`、`REVIEWER_API_KEY`、`REVIEWER_BASE_URL`、`REVIEWER_MODEL`、`REVIEWER_CHECK_EXAMINATION_ENABLED`
  - 若独立审查配置缺省，则回退到主模型配置
  - `checkExamination` 场景支持单独开关：区域化模式读取 `bootstrap.reviewer.checkExaminationEnabled`，本地模式读取 `REVIEWER_CHECK_EXAMINATION_ENABLED`；缺省时默认开启以兼容旧行为
  - 请求体仅发送 OpenAI 兼容标准字段（`model`、`messages`、`stream`），不在通用链路携带供应商私有字段，避免兼容网关返回 `400 Bad Request`
- 该策略主要用于解决 macOS 下 WebView 报错 `Load failed` 的语音转写失败场景

---

## 数据流

### 1. HIS 集成数据流

```
HIS 系统 (HTTP POST)
    ↓
Rust HTTP Server (src-tauri/src/http_server.rs)
    ↓
Tauri Event Emission (start-consultation, show-patient-risks)
    ↓
useEventListeners (监听事件)
    ↓
更新全局状态 (App.vue: currentPatient)
    ↓
navigation.openConsultation() (打开原症状问诊主流程)
    ↓
ConsultationPage.vue (渲染)
```

### 1.2 HIS 灵活模式数据流

```
HIS 医生站当前患者上下文
    ↓
医生通过 PHIS AI 按钮或附加入口点击目标动作
    ↓
Tauri Event / Deep Link / HTTP Bridge
    ↓
App.vue 更新 currentPatient + assist 上下文
    ↓
App.vue 写入目标动作 trigger
    ↓
ConsultationPage.vue 根据上下文决定：
    - 是否跳过症状选择
    - 是否直接进入病历详情页
    - 是否自动触发诊断 / 鉴别 / 用药 / 检查
    ↓
医生确认草稿 / 发起引用 / 继续编辑
    ↓
Tauri Command: complete_consultation 写入当前草稿或引用请求
    ↓
HIS 通过 WebSocket /api/consultation/events/ws 接收事件；必要时 fallback 到 GET /api/consultation/events/poll
    ↓
PHIS 保存成功 / 失败后调用 POST /api/consultation/reference-feedback
    ↓
floating-ball 保持当前问诊页面展开，并在同一运行期内更新页面状态与日志
```

### 1.3 检验检查报告解读流

```
HIS POST /api/report/interpret { taskId, query, patient? }
  ↓
Rust HTTP Server 记录 traceId 并发出 start-report-interpretation 事件
  ↓
useEventListeners.ts 读取当前接诊患者并转交显式 patient 入参
  ↓
App.vue / reportInterpretation.ts 创建 report-interpretation-window
  ↓
ReportInterpretationWindow.vue 注册 status/update listener 并向 main 发出 report-interpretation:ready
  ↓
reportInterpretation.ts 确认 ready 后投递生成中状态，并调用 LLM 生成结构化报告解读 payload
  ↓
ReportInterpretationWindow.vue 按报告单版式渲染报告元数据、异常项目、综合判断、建议与风险提示
```

---

### 1.1 区域化实时事件流（规划中，当前未启用）

```
docs/regionalization/*.md
    ↓
未来新增 realtime client / auth / ack 机制
    ↓
当前代码库尚未实现
```

---

### 2. 语音问诊数据流

```
用户点击语音按钮
    ↓
navigation.startVoiceInteraction()
    ↓
VoiceCapsule.vue (开始录音)
    ↓
audioRecorder.ts (麦克风兼容检测 + 采集 PCM16 音频)
    ↓
RealtimeSpeechService (优先 DashScope，可降级 OpenAI 兼容转写)
    ↓
区域化模式：优先通过 /v1/ai/speech/realtime/ws 逐帧发送 PCM；不可用时编码整段录音并上传 /v1/ai/speech/realtime
    ↓
voiceConsultation.handleVoiceStop() (停止录音)
    ↓
llm.ts (调用 LLM API，生成结构化病历)
    ↓
JSON 解析验证 (useVoiceConsultation.ts)
    ↓
VoiceConsultationNew.vue (右栏诊断/治疗 + 一键回写)
    ↓
buildRecordConfirmedPayload (src/features/clinical-result/recordConfirmedPayload.ts)
    ↓
Tauri Command: complete_consultation（resultType=record-confirmed）
    ↓
HIS 系统 (通过 HTTP GET /api/consultation/events/poll 获取)
```

---

### 3. 窗口状态流

```
用户操作触发
    ↓
navigation.openConsultation()
    ↓
更新 currentView.value = 'consultation'
    ↓
workMode.enterWorkMode() (进入工作模式)
    ↓
windowMgmt.resizeWorkWindow(1200×900) (调整窗口尺寸)
    ↓
windowMgmt.smartExpand(...) (智能边界检测)
    ↓
Tauri Window API (setSize, setPosition)
    ↓
UI 更新 (Vue 响应式系统)
    ↓
CSS Morph Animation (变形动画)
```

---

### 4. 事件监听流

```
应用启动
    ↓
App.vue onMounted
    ↓
eventListeners.registerAllListeners()
    ↓
并发注册所有监听器:
  - Deep Link (onOpenUrl)
  - HIS 事件 (listen('show-patient-risks'), listen('start-consultation'))
  - 窗口事件 (appWindow.listen('tauri://move'), listen('tauri://resize'))
  - 鼠标事件 (listen('hover-change'), listen('mouse-pos'))
    ↓
事件触发时调用对应 composable 方法
    ↓
App.vue onUnmounted
    ↓
eventListeners.unregisterAllListeners()
```

---

## 维护指南

### 前端文件结构规划

前端路径治理以 [docs/frontend-file-structure-plan.md](docs/frontend-file-structure-plan.md) 为迁移路线图，复用边界和设计模式以 [docs/frontend-reuse-architecture.md](docs/frontend-reuse-architecture.md) 为准。当前 `src/components`、`src/composables`、`src/services` 仍保留历史扁平结构，但新增业务代码应优先进入规划中的 `features/<feature>/ui|model|api|lib`、`entities/*`、`shared/*` 或 `services/<integration>`。

路径迁移遵循三条原则：

1. 先判断能力归属和复用模式，再建立公开入口和兼容 facade。
2. 高风险入口（`ConsultationPage.vue`、`VoiceConsultationNew.vue`、`useEventListeners.ts`）先收敛 controller / strategy / builder，再迁移入口路径；避免只把大文件切成更多无边界 helper。`useEventListeners.ts` 的接诊状态机归入 `app/events/useReceptionController.ts`，SDK handshake 初始化归入 `app/events/useSdkHandshakeController.ts`，事件文件继续作为 Tauri event hub。
3. 每次迁移必须同步更新 `CODE_MAP.md` 和规划文档中的映射关系，并至少执行前端构建验证。
4. 如果拆分后不能删除旧逻辑、减少重复规则或形成稳定复用接口，应暂停继续拆分，先回到复用架构规划重划边界。

### 添加新 Composable

1. 新业务 composable 默认放入 `src/features/<feature>/model/`；只有跨业务且不依赖 feature 的通用 composable 才放入 `src/shared/composables/`；历史 `src/composables/` 仅保留旧入口或兼容 facade。
2. 遵循命名规范：`use[功能名].ts`
3. 导出明确的接口：
   ```typescript
   export interface UseFeatureOptions {
     // 参数定义
   }

   export function useFeature(options: UseFeatureOptions) {
     // 实现
     return {
       // 导出 API
     };
   }
   ```
4. 添加 JSDoc 文档注释
5. 更新本文档的 [组合式函数](#组合式函数-composables) 章节或 [docs/frontend-file-structure-plan.md](docs/frontend-file-structure-plan.md) 对应功能域映射

### 添加新组件

1. 新业务组件默认放入 `src/features/<feature>/ui/`；只有真正跨业务、无领域语义的基础组件才放入 `src/shared/ui/`；历史 `src/components/` 仅保留旧入口或兼容 facade。
2. 明确定义 Props 和 Emits（使用 TypeScript）
3. 组件职责单一，避免过大
4. 更新本文档的 [组件](#组件-components) 章节或 [docs/frontend-file-structure-plan.md](docs/frontend-file-structure-plan.md) 对应功能域映射
5. 若组件会修改本地桥接行为、回写结构或窗口形态，再同步更新 `api.md` / `PRODUCT.md`

### 添加新常量

1. 在 `src/constants/` 创建或更新文件
2. 使用 TypeScript 类型定义
3. 提供工具函数（如 `getWindowSizeForView`）
4. 更新本文档的 [常量](#常量-constants) 章节

### macOS 媒体权限配置

语音录音功能在 macOS 依赖应用级权限声明，相关文件位于 `src-tauri/`：

- `Info.plist`：声明 `NSMicrophoneUsageDescription`
- `Entitlements.plist`：声明 `com.apple.security.device.audio-input`
- `tauri.conf.json`：在 `bundle.macOS` 显式引用上述两个文件

若缺少以上配置，WebView 可能无法暴露 `navigator.mediaDevices.getUserMedia`，导致前端录音入口不可用。

### 修改现有模块

1. 先阅读本文档了解当前职责
2. 确保修改符合模块的单一职责原则
3. 修改代码后同步更新本文档
4. 运行测试确保不影响其他模块
5. 若改动涉及 `/api/consultation/*` 或结果通道，必须同时核对 `api.md`

---

## 重构历史

### 2026-02-10 - 大规模模块化重构完成（历史记录）

**目标**: 将 App.vue 从上帝类（1548 行）重构为轻量级编排器（425 行）

**成果**:
- ✅ 代码减少 72.5%（1548 → 425 行）
- ✅ 创建 5 个 Composables（共 1,673 行）
- ✅ 创建 2 个常量文件
- ✅ 创建 3 个样式模块文件
- ✅ 架构从单体转向组合式模式

**具体变更**:

| 日期 | 变更 | 代码减少 | 创建文件 |
|------|------|---------|---------|
| 2026-02-10 | 创建 `constants/windowSizes.ts` | ~50 行 | ✅ |
| 2026-02-10 | 创建 `constants/animation.ts` | ~50 行 | ✅ |
| 2026-02-10 | 创建 `composables/useWindowManagement.ts` (430 行) | ~200 行 | ✅ |
| 2026-02-10 | 创建 `composables/useWorkMode.ts` (428 行) | ~243 行 | ✅ |
| 2026-02-10 | 创建 `styles/global.css` | ~60 行 | ✅ |
| 2026-02-10 | 创建 `styles/layouts/app-layout.css` | ~120 行 | ✅ |
| 2026-02-10 | 创建 `styles/animations/morph.css` | ~20 行 | ✅ |
| 2026-02-10 | 创建 `composables/useEventListeners.ts` (415 行) | ~230 行 | ✅ |
| 2026-02-10 | 创建 `composables/useNavigation.ts` (180 行) | ~70 行 | ✅ |
| 2026-02-10 | 创建 `composables/useVoiceConsultation.ts` (220 行) | ~130 行 | ✅ |

**总计**: App.vue 减少 **~1,123 行**（包括样式迁移）

### 架构改进

**重构前**:
```
App.vue (1548 行)
├── 窗口管理逻辑 (~200 行)
├── 工作模式逻辑 (~243 行)
├── 导航逻辑 (~70 行)
├── 语音问诊逻辑 (~130 行)
├── 事件监听逻辑 (~230 行)
├── 样式定义 (~200 行)
└── 其他逻辑 (~475 行)
```

**重构后**:
```
App.vue (425 行)
├── 状态声明 (~40 行)
├── Composables 初始化 (~90 行)
├── 辅助函数 (~50 行)
├── 生命周期钩子 (~100 行)
├── 模板 (~115 行)
└── 样式 (~30 行)

Composables / App controllers
├── app/shell/useWindowManagement.ts (~422 行)
├── app/shell/useWorkMode.ts (~422 行)
├── composables/useEventListeners.ts (~575 行)
├── app/events/useReceptionController.ts (~505 行)
├── app/events/useSdkHandshakeController.ts (~240 行)
├── composables/useVoiceConsultation.ts
└── app/navigation/useNavigation.ts

Constants (2 个)
├── windowSizes.ts
└── animation.ts

Styles (3 个)
├── global.css
├── layouts/app-layout.css
└── animations/morph.css
```

### 性能优化

- ⚡ 显示器信息缓存（避免重复查询）
- ⚡ 窗口移动防抖（500ms）
- ⚡ 窗口大小变化防抖（200ms）
- ⚡ GPU 加速动画（transform, opacity）
- ⚡ 统一事件监听管理（避免内存泄漏）

### 代码质量指标

| 指标 | 重构前 | 重构后 | 改进 |
|------|--------|--------|------|
| App.vue 代码行数 | 1,548 | 425 | ↓ 72.5% |
| 最大函数行数 | ~130 | ~40 | ↓ 69% |
| 模块数量 | 1 | 12 | 模块化 |
| Composables 复用性 | 0% | ~85% | 大幅提升 |
| 单元测试难度 | 极高 | 中等 | 易于测试 |

---

## 架构优势

### 1. 可维护性 ⭐⭐⭐⭐⭐

**问题定位更快**:
- 窗口问题 → 直接查看 `useWindowManagement.ts`
- 导航问题 → 直接查看 `useNavigation.ts`
- 语音问题 → 直接查看 `useVoiceConsultation.ts`

**修改更安全**:
- 修改窗口管理不影响语音问诊
- 修改导航逻辑不影响事件监听
- 模块边界清晰，减少意外副作用

### 2. 可扩展性 ⭐⭐⭐⭐⭐

**添加新功能**:
- 创建新 Composable，在 App.vue 中一行初始化
- 不影响现有代码结构

**示例**:
```typescript
// 添加新功能只需 3 步
// 1. 创建 composable
export function useNewFeature(options) { ... }

// 2. 在 App.vue 中初始化
const newFeature = useNewFeature({ ... });

// 3. 使用
await newFeature.doSomething();
```

### 3. 可测试性 ⭐⭐⭐⭐⭐

**Composables 可独立测试**:
```typescript
// 测试窗口管理
import { useWindowManagement } from '@app/shell/useWindowManagement';

describe('useWindowManagement', () => {
  it('should save window position', async () => {
    const { saveWindowPosition } = useWindowManagement({...});
    await saveWindowPosition();
    // 断言...
  });
});
```

### 4. 团队协作 ⭐⭐⭐⭐⭐

**并行开发**:
- 开发者 A：优化窗口管理（`useWindowManagement.ts`）
- 开发者 B：增强语音功能（`useVoiceConsultation.ts`）
- 开发者 C：添加新视图（新组件 + `useNavigation.ts`）
- 互不干扰，最后在 App.vue 中集成

### 5. 知识传递 ⭐⭐⭐⭐⭐

**新人友好**:
- 清晰的模块划分
- 每个 Composable 都有明确的职责
- 完整的架构文档
- 易于理解和上手

---

## 总结

本架构通过**组合式模式**实现了高度的**模块化**、**可维护性**和**可扩展性**。

**核心原则**:
- ✅ 单一职责
- ✅ 关注点分离
- ✅ 组合优于继承
- ✅ 轻量级优于重量级

**技术选型**:
- ✅ Vue 3 Composition API（无额外状态管理库）
- ✅ TypeScript（类型安全）
- ✅ Tauri 2.0（跨平台桌面应用）
- ✅ 模块化 CSS（设计系统）

**未来方向**:
- 持续优化 Composables 的复用性
- 添加单元测试覆盖
- 性能监控和优化
- 文档持续更新

---

**文档维护**: 任何架构级别的修改都必须同步更新此文档。

**最后更新**: 2026-02-10
