# 前端复用架构规划

> 状态：治理准则。它补充 `frontend-file-structure-plan.md`：后者回答“文件最终放哪里”，本文回答“哪些能力值得复用、如何复用，以及什么时候不该继续拆文件”。
>
> 适用范围：`floating-ball/src` 下 Vue 3 + TypeScript 前端代码，尤其是问诊、语音问诊、共享结果页、PHIS 回写、反馈、知识库与设置等持续演进模块。

## 背景

当前项目已经从原型期进入工程治理期。`ConsultationPage.vue`、`VoiceConsultationNew.vue` 等泥球文件仍然高风险，但项目风险已经不只是“文件太大”：

1. `features/*` 数量增加后，部分 helper 只完成物理拆分，尚未形成稳定的复用模型。
2. 旧 `components/`、`composables/` 与新 `features/` 并存，容易产生“同一能力两套入口”。
3. 语音问诊和智能问诊有大量相似能力，但不能简单互相依赖，否则会形成新的跨域耦合。
4. 继续按函数碎片化拆分，会降低大文件行数，却增加文件跳转成本和隐形依赖。

后续治理目标应从“拆掉大文件”升级为“沉淀稳定能力”。文件变多不是成果；复用边界清晰、调用方向稳定、页面只做编排，才是成果。

## 核心原则

1. **先能力建模，再拆文件**：每次重构先写出能力名称、输入、输出、状态归属、副作用归属，再决定是否新建文件。
2. **复用优先于搬家**：同一业务规则在两个以上入口出现时，优先沉淀为 feature/domain 能力；只有路径混乱但规则不重复时，才做纯迁移。
3. **少建 shared，多建 domain**：只有无业务语义的 UI、工具、基础 composable 进入 `shared/*`。诊断、治疗、问诊、反馈这类有医疗业务语义的能力应进入对应 feature 或未来 entities。
4. **页面保留编排权**：页面组件可以持有流程状态、toast、Tauri invoke、缓存清理和用户动作编排；`lib` 不允许偷偷持有副作用，`model` 的副作用必须通过依赖注入显式暴露。
5. **Barrel 是契约，不是垃圾桶**：`index.ts` 只暴露外部需要的稳定 API；内部 helper 不因方便就导出。
6. **一次只收敛一种复杂度**：不要在同一轮同时做路径迁移、模板抽取、状态机改造和视觉调整。
7. **删除兼容层要有证据**：每次删除旧路径 facade 前，用 `rg` 证明没有调用方，再构建验证。

## 层级模型

| 层级 | 放什么 | 不放什么 | 典型模式 |
| --- | --- | --- | --- |
| `app/*` | 应用壳层、视图注册、窗口/导航编排、全局 provider | 具体医疗业务规则、PHIS payload 拼装 | Shell / Registry / Provider |
| `features/<feature>/ui` | 业务 UI 组件、入口包装、领域组件 | 外部请求、复杂业务状态机、跨 feature 单例 | Presentational Component / Container Wrapper |
| `features/<feature>/model` | composable、局部状态机、可注入副作用编排 | Tauri invoke 直调、跨域全局 store、隐式 service 单例 | Composable Controller / State Machine / Strategy 注入 |
| `features/<feature>/lib` | 纯 mapper、parser、payload builder、规则判断 | Vue ref、toast、网络请求、缓存读写 | Pure Function / Adapter / Builder |
| `features/<feature>/api` | 功能域专属 API 包装 | UI 状态、通用基础设施实现 | Gateway / Repository Facade |
| `entities/*` | 稳定业务实体类型和跨 feature 纯转换 | 页面状态、接口调用、组件 | Entity Adapter / Value Object |
| `shared/*` | 无业务语义的基础 UI、通用 hooks、通用工具 | 诊断/治疗/问诊等领域语义 | Headless UI / Utility |
| `services/*` | HIS、LLM、regional、speech、storage 等外部适配 | 页面状态、toast、组件依赖 | Port Adapter / Gateway |

## 推荐设计模式

### 1. Adapter：入口数据统一

适用：语音问诊结果、智能问诊结果、PHIS 回执、LLM 原始输出进入共享结果页之前。

规则：

1. Adapter 只做输入格式到中性 DTO 的转换。
2. 不读取 Vue ref，不调用 toast，不触发请求。
3. 中性 DTO 必须保留关键身份字段，例如标准诊断 ID、匹配状态、`matchedItem.raw`。

当前落点：

- `features/consultation-result/model/useClinicalResultChannelStrategy.ts`
- `features/clinical-result/clinicalResultAdapter.ts`
- `features/clinical-result/clinicalResultAiMapping.ts`
- `features/symptom-consultation/lib/consultationDiagnosisMapping.ts`

### 2. Builder：PHIS 与日志 payload 收口

适用：`record-confirmed`、PHIS 引用、用户日志、反馈 payload。

规则：

1. Builder 接收显式输入，返回结构化对象。
2. Builder 不做提交、不弹 toast、不读取缓存。
3. 所有 PHIS 主键字段必须在 Builder 边界校验来源，展示 key 和回写主键不能混用。

当前落点：

- `features/clinical-result/recordConfirmedPayload.ts`
- `features/clinical-result/consultationSubmitPayload.ts`
- `features/symptom-consultation/lib/consultationPayloadBuilders.ts`
- `features/symptom-consultation/lib/consultationReference.ts`

### 3. Strategy：差异行为注入

适用：同一结果页在语音问诊和智能问诊中共享主体，但缓存、日志、取消、诊毕语义不同。

规则：

1. 共享主体不直接判断所有渠道分支。
2. 渠道差异通过 strategy/options 注入，例如 `channel`、`onCancel`、`buildUserLogSnapshot`、`cachePolicy`。
3. 当 `if channel === ...` 超过 3 处，应考虑抽成策略对象。

优先候选：

- 结果页取消 / 放弃 / 诊毕语义
- 语音缓存与智能问诊缓存恢复策略
- 推荐刷新策略
- 一键回写成功后的反馈触发策略

当前第一刀：

- `features/consultation-result/model/useClinicalResultChannelStrategy.ts` 只收敛 `channel -> userLogType / voiceCache / patientHeader / cancelDialog` 这类无副作用派生；真正的缓存读写、日志提交、`emit('cancel')` 和 Tauri 回写仍留在页面编排层。
- `features/consultation-result/model/useClinicalResultCancelController.ts` 只管理结果页放弃确认弹窗、提交中 / 等待 HIS 回执时的拦截和提示注入；真正的反馈草稿清理、放弃日志提交和 `emit('cancel')` 通过 `onConfirm` 注入。
- `features/consultation-result/model/useClinicalResultUserLogController.ts` 只管理首版、最终和放弃三类用户日志快照的提交节奏、首版快照记忆、最终选择快照和可选变更摘要；页面仍通过 options 注入 `buildSnapshot`、患者上下文、提交函数和语音病例字段变更判断。
- `features/consultation-result/model/useWritebackFeedbackController.ts` 只管理一键回写回执被 `useWritebackStatus` 接受后的 success / failed 分发和默认提示；页面仍通过 options 注入成功后的缓存持久化、用户日志、整页反馈弹窗，以及失败提示展示。
- `features/consultation-result/model/useConsultationReferenceFeedbackListener.ts` 只管理 `consultation-reference-feedback` 事件名、当前 `consultationId` 防串线和 Tauri 监听生命周期接入；页面仍通过 options 注入当前就诊 ID 解析和回执后的业务状态写入。

### 4. Composable Controller：组合多个轻状态

适用：治疗卡片、推荐反馈、二级选择器这类“一个 UI 区域包含多个小状态机”的场景。

规则：

1. 先把 setup 状态收敛成 controller，再抽模板组件。
2. controller 只暴露 UI 所需的稳定接口，不暴露内部 ref 全家桶。
3. controller 不应直接 import 单例 service；需要副作用时通过 options 注入。

优先候选：

- `useTreatmentRecommendationCardController`
- `useClinicalResultEditorController`
- `useConsultationWorkflowController`

### 5. Headless UI：高复用交互外壳

适用：popover、selector、chip、反馈弹层、搜索候选列表。

规则：

1. 无业务文案和业务数据结构时才进入 `shared/ui`。
2. 有诊断/治疗/问诊语义时留在 feature UI。
3. Headless 组件只管理交互结构，业务渲染通过 slot 注入。

当前候选：

- `RecAttributeChip.vue` 暂留 `features/consultation-result/ui`，因为它仍有治疗推荐语义。
- 通用搜索下拉若未来服务多个领域，可再抽 `shared/ui/SearchCombobox.vue`。
- `shared/composables/useOutsideInteraction.ts` 管理 document 级 click / pointerdown 生命周期和“点到指定 selector / element 外部时触发关闭”的无业务交互规则；具体关闭推荐依据、反馈弹层、症状分类下拉等动作仍留在页面或 feature model。
- `shared/composables/useTauriEventListener.ts` 管理 Tauri `listen` 的 mounted 订阅、显式启动订阅、unmounted 解绑、订阅失败日志和可选失败传播；事件 payload 的业务过滤、状态写入、toast 和 PHIS 回执处理仍留在调用方。
- `shared/composables/useTauriWindowEventListeners.ts` 管理独立窗口 `appWindow.listen` 的批量注册、卸载解绑和注册失败日志；调用方显式 `await registerListeners()` 后再发送 ready 事件，避免主窗口提前投递 payload。

## 当前能力归属图

| 能力 | 权威归属 | 可复用对象 | 不应复用的部分 |
| --- | --- | --- | --- |
| 问诊结果中性输入 | `features/clinical-result` | 语音结果、症状结果到 `ClinicalResultInput` 的 Adapter | 具体页面缓存、取消/诊毕语义 |
| 临床结果基础契约 | `features/clinical-result/clinicalResultContract.ts` | `ClinicalResultInput`、诊断和治疗中性结构；语音、症状、复诊配药等渠道共同依赖 | ASR、语音缓存、具体页面状态、渠道命名 |
| LLM JSON 宽容解析 | `features/clinical-result/clinicalResultLlmJsonParser.ts` | 症状问诊、语音结果页等 LLM 文本响应到 JSON 对象 / 数组的纯解析 | LLM 请求、错误 toast、日志、页面状态覆盖 |
| AI 推荐请求规格 | `features/clinical-result/clinicalResultAiRequest.ts` | 语音 / 症状诊断推荐和 medication / exam / lab / procedure 治疗推荐的 prompt messages 与 trace config 纯构造；支持单路和多路治疗推荐规格，trace 基础字段和具体 scene/title/action 可由调用方注入，默认保持语音问诊取值 | `chat()` 调用、并发策略、loading、错误处理、状态覆盖、日志、缓存、PHIS 回写 |
| AI 推荐 raw 映射 | `features/clinical-result/clinicalResultAiMapping.ts` | 语音结果页诊断 / 治疗 LLM raw 结果到标准诊断和治疗推荐的纯转换；智能问诊 western 诊断 raw 数组复用同一 mapper，并通过 lookup/未匹配 ID 策略保持原行为；智能问诊 western 治疗推荐 raw 数组按目标类型过滤并转换为治疗推荐项；治疗多路响应按 allSettled 结果解析、单路失败隔离并合并，标准库匹配与归一化由调用方注入 | LLM 请求、loading、当前诊断防串线、toast、事实核查、日志、缓存、PHIS 回写 |
| 诊断/治疗推荐卡片与分组 | `features/consultation-result` | 单条卡片 UI、用药/检查/检验/处置推荐分组、推荐依据、反馈入口、手动匹配入口、治疗项主字段与二级属性编辑模板 | LLM 请求、推荐刷新、toast、PHIS 提交 |
| 结果页渠道策略 | `features/consultation-result/model/useClinicalResultChannelStrategy.ts` | `voice/symptom` 渠道到日志类型、语音缓存开关、患者头展示和取消文案的派生 | 缓存读写、日志提交、取消事件、诊毕清理 |
| 结果页取消流程 | `features/consultation-result/model/useClinicalResultCancelController.ts` | 放弃确认弹窗开合、提交中 / 等待回执时的拦截提示、确认动作编排入口 | 清理反馈草稿、提交放弃日志、`emit('cancel')` |
| 结果页用户日志三态 | `features/consultation-result/model/useClinicalResultUserLogController.ts` | 首版 / 诊毕 / 放弃日志提交节奏、首版快照记忆、最终选择快照、语音可选变更摘要 | 病历字段读取、患者来源解析、区域化提交实现、反馈草稿清理 |
| 回写回执结果分发 | `features/consultation-result/model/useWritebackFeedbackController.ts` | 已命中 requestId 的 HIS 回执 success / failed 分发、默认提示文案 | `complete_consultation` 调用、PHIS payload、缓存持久化、用户日志、整页反馈弹窗 |
| 回写清单 resolver | `features/consultation-result/model/useClinicalResultWritebackPayload.ts` | 基于已选诊断 / 治疗推荐生成 PHIS `diagList` 和 `orderList`，统一执行科室、药房、频次和用法解析注入 | 提交门禁、`complete_consultation` 调用、toast、等待回执状态、缓存、用户日志 |
| 回写前置门禁 | `features/consultation-result/model/useClinicalResultWritebackPreflight.ts` | 诊断标准库匹配、药品详情、库存、药房、执行科室和检查部位的一键回写前校验编排 | `complete_consultation` 调用、PHIS payload 构造、等待回执状态、缓存、用户日志、提交中状态 |
| PHIS 回执监听入口 | `features/consultation-result/model/useConsultationReferenceFeedbackListener.ts` | `consultation-reference-feedback` 事件名、`consultationId` 防串线、Tauri listener 生命周期组合 | requestId 匹配、引用状态 map、toast、缓存、日志 |
| 结果页患者上下文派生 | `features/consultation-result/model/useClinicalResultPatientContext.ts` | 患者姓名、性别、年龄、`idTet`、就诊锚点和 `consultationId` 派生 | HIS 患者补全、患者切换、缓存、日志、PHIS payload 拼装、导航 |
| 结果页 intent 初始化重置 | `features/consultation-result/model/useClinicalResultIntentReset.ts` | 新 `intentResult` 进入时的旧现场清理、病历字段回填和初始字段快照设置 | AI 请求、缓存 overlay、事实核查、推荐注册、PHIS 回写 |
| 同类诊断下拉状态 | `features/consultation-result/model/useRelatedDiagnosisDropdown.ts` | 当前打开诊断 key、同类候选列表、打开 / 关闭 / 切换和替换后的收口 | 候选来源、诊断列表写回、选择状态同步、埋点、治疗刷新、反馈注册 |
| 治疗推荐展示分组 | `features/consultation-result/model/useTreatmentSections.ts` + `features/consultation-result/ui/TreatmentRecommendationSection.vue` | 按类型生成治疗推荐展示分组、是否存在推荐、空状态文案，并用同一分组组件承载用药/检查/检验/处置的卡片、编辑器、手动匹配和二级属性选择器 | AI 请求、刷新方案、治疗项选中、库存校验、toast、PHIS 回写 |
| 药品编辑字段事件 | `features/consultation-result/model/useMedicineFieldEditing.ts` | 用法用量字段激活、blur 收口、频次 / 用法 keyword 解析写回和总量输入事件 | 治疗项选中、打开二级属性、AI 请求、toast、PHIS 回写 |
| 治疗药房解析 | `features/consultation-result/model/useTreatmentPharmacyResolution.ts` | 药品候选药房收窄、默认药房、已选药房匹配和药房名称归一化 | 库存校验、选中门禁、toast、PHIS orderList 拼装、药品详情拉取 |
| 治疗选中前置校验 | `features/consultation-result/model/useTreatmentSelectionReadiness.ts` | 选中前的药品可用性、药房、执行科室、检查部位和库存门禁编排 | 修改 `selected`、手动匹配写入、推荐刷新、PHIS 回写 |
| 治疗 quick selector 打开 | `features/consultation-result/model/useTreatmentQuickSelector.ts` | 展开治疗编辑器、打开药房 / 执行科室 / 部位二级选择器并聚焦输入框 | 候选过滤、字段写回、清空副作用、库存校验、toast、PHIS 回写 |
| 治疗二级属性搜索过滤 | `features/consultation-result/model/useTreatmentAttributeSearch.ts` | 药房 / 执行科室 / 部位 / 医保候选构造、搜索关键字读写和过滤列表派生 | 字段写回、清空副作用、取消选中、库存校验、toast、PHIS 回写 |
| 治疗归一化/门禁/hydration | `features/consultation-result/model` | 频次/用法、药房/执行科室门禁、药品详情轮询、库存状态 | 选中按钮的 toast、最终提交 |
| PHIS 最终回写 payload | `features/clinical-result/recordConfirmedPayload.ts` | 语音问诊和智能问诊一键回写 | Tauri invoke、等待回执、成功后反馈弹窗 |
| PHIS 引用闭环 | `features/symptom-consultation/lib/consultationReference.ts` | 引用 key、状态 map、回执归一 | HTTP Bridge 调用、页面即时状态写入 |
| 症状采集 controller | `features/symptom-consultation/model/useSymptomCollectionController.ts` | 组合症状分类筛选、伴随症状、症状选择、过滤结果、渲染计划和表单 key 同步，形成 `useSymptomCollectionController` 入口 | 模板远端同步、动态症状 AI 生成、症状问诊缓存恢复、生成病历、AI 推荐、PHIS 引用/回写 |
| 症状问诊表单渲染计划 | `features/symptom-consultation/lib/consultationRenderPlan.ts` | 选中症状、问诊模式和当前 formData 到 renderList、需初始化配置 key、需清理配置 key 的纯计划 | formData 写入/删除、toast、问诊模式切换、AI 请求、PHIS 回写 |
| 症状问诊选症 controller | `features/symptom-consultation/model/useSymptomSelectionController.ts` | `selectedSymptoms` / `formData` 的选中、取消、移除、清空和模板表单初始化动作；最大症状数量、toast、埋点和伴随症状清理由调用方注入 | 症状过滤、动态模板生成、AI 请求、缓存持久化、PHIS 引用/回写、最终报告 |
| 症状问诊静态表单配置 | `features/symptom-consultation/lib/consultationFormConfigs.ts` | 一般情况问诊和中医四诊的表单配置常量，供渲染、初始化和文案生成复用同一份字段定义 | 问诊模式切换、formData 读写、toast、AI 请求、PHIS 回写 |
| 症状问诊表单校验 | `features/symptom-consultation/lib/consultationFormValidation.ts` | 选中症状 + formData + 患者信息到必填错误列表、错误 key map、首个错误 DOM id 的纯校验；适用人群判断由页面注入 | toast、埋点、DOM 滚动、生成病历、AI 请求 |
| 智能问诊 assist 快进展示 | `features/symptom-consultation/lib/consultationAssistPresentation.ts` | assist action 到标签、banner 文案、banner tone / style 和 feature usage code 的纯映射 | 快进流程、前置门禁、AI 请求、toast、`trackFeatureUsage` 调用、自动触发消费 |
| 智能问诊 assist 快进流程 | `features/symptom-consultation/model/useConsultationAssistController.ts` | assist action 的前置病历/诊断上下文保障、按类型触发诊断/用药/检查/检验/处置/鉴别清单拉取，以及成功后埋点入口编排；AI 请求、toast、视图切换、预填、埋点和自动触发消费均通过 options 注入 | LLM 请求实现、PHIS 引用/回写、缓存读写、推荐解析、事实核查、全局 service 单例 |
| 智能问诊推荐区展示派生 | `features/symptom-consultation/lib/consultationRecommendationPresentation.ts` | assist focus 下治疗推荐可见列表、其他治疗项过滤、诊断 / 治疗卡显示判断、类型标签、置信度 class、药品行内摘要 | 推荐请求、选中门禁、标准库查询、toast、PHIS 回写、推荐状态修改 |
| 推荐反馈 payload | `features/clinical-result/clinicalResultFeedback.ts` | 诊断/治疗推荐项反馈提交数据 | 弹层开合、保存接口调用、toast |
| document 外部点击关闭 | `shared/composables/useOutsideInteraction.ts` | 推荐依据 tooltip、推荐反馈弹层、症状分类下拉等无业务 DOM 外部点击关闭规则 | 具体业务状态、文案、推荐/症状数据结构 |
| Tauri 事件监听生命周期 | `shared/composables/useTauriEventListener.ts` | `listen` 自动 / 显式订阅、解绑、订阅失败日志、显式注册失败传播 | 事件 payload 业务过滤、页面状态写入、PHIS 回执处理 |
| Tauri Window 事件监听生命周期 | `shared/composables/useTauriWindowEventListeners.ts` | 独立窗口 `appWindow.listen` 批量注册、解绑、注册失败日志 | ready 事件发送、payload 状态写入、图表渲染、窗口业务状态 |
| App 接诊状态机 | `app/events/useReceptionController.ts` | `receive-patient` / 自动静默接诊 / `show-patient-risks` 的患者补全、统一 flow token、风险能力降级、风险胶囊状态、并发接诊防抖、患者切换清理 | Tauri 事件注册、SDK handshake、问诊 / 语音结果页导航、PHIS 回写 |
| 接诊 session 状态 | `features/reception/model/useReceptionSessionController.ts` | App 生命周期内的局部 `status / risks / opportunities / executing` 状态、患者展示信息派生、报告复诊上下文派生和显式状态 action | HIS / LLM 请求、窗口调整、导航、toast、第二份患者资料、把流程上下文写入 `patient.raw`、Pinia 全局状态 |
| 门诊场景路由 | `features/reception/model/useOutpatientScenarioRouter.ts` | `ReceptionOpportunity` 执行、语音缓存优先、报告复诊和普通录音的统一 Strategy；生成、上下文查询、导航和提示均通过 options 注入 | Tauri 事件注册、患者补全、风险评估、直接 import HIS / LLM 单例、PHIS 回写 |
| SDK handshake 初始化 | `app/events/useSdkHandshakeController.ts` | HIS origin/token、机构/租户、角色科室和 URT 解析，HIS 服务 / adapter / feedback actor / 医学目录上下文初始化 | Tauri 事件注册、患者上下文、页面导航、PHIS 回写 |
| 结果页反馈编排 | `features/feedback/model/useVoiceFeedback.ts` | 症状问诊和语音结果页共用的推荐 target 登记、推荐反馈 / 病例字段反馈 / 整页评分草稿状态、提交到本地反馈服务和 voice feedback backend payload 队列 | 弹层 UI、toast、PHIS 回写、用户日志、AI 请求、结果页关闭 |
| 语音意图结构化抽取 | `features/voice-consultation/model/useVoiceIntentRecognition.ts` | 录音文本到病例草稿、诊断提示和治疗提示的 LLM 抽取、JSON 结构校验 / 一次修复、标准目录匹配、条件性用药和患者自服药分流 | 录音控制、语音缓存恢复、结果页 UI、PHIS 回写、窗口切换、诊毕 / 放弃语义 |
| 语音问诊缓存 | `features/voice-consultation/model/voiceConsultationCache.ts` | 按患者就诊锚点生成语音问诊缓存 key、读写原始 intent 结果、跨自然日失效、清理和 editorSnapshot 增量合并 | 录音控制、LLM 抽取、结果页恢复副作用、窗口切换、PHIS 回写、诊毕 / 放弃语义 |
| 语音编辑快照持久化 | `features/voice-consultation/model/useVoiceEditorSnapshotPersistence.ts` | editorSnapshot 构建触发、600ms 节流写入、立即写入、pending timer 清理 | 快照恢复、诊断/治疗副作用、药房加载、库存校验、推荐登记、PHIS 回写 |
| 语音病例字段反馈状态 | `features/voice-consultation/model/useVoiceRecordFieldFeedbackState.ts` | 主诉 / 现病史 / 既往史 / 家族史的初始快照、当前值读取、人工修改判断、字段反馈 key、草稿读取和已提交标签 | 字段反馈提交、toast、用户日志、弹层开合、缓存、PHIS 回写 |
| 语音结果事实核查状态 | `features/voice-consultation/model/useVoiceResultFactCheckState.ts` | 诊断 / 治疗 fact-check 结果 Map、issue getter 和逐条核查循环 | 触发时机、病历文本来源、当前主诊断、toast、日志、缓存、PHIS 回写 |
| 语音反馈提交动作 | `features/voice-consultation/model/useVoiceFeedbackActions.ts` | 推荐项反馈、病例字段反馈、整页反馈的提交编排、成功提示、弹层关闭和完成回调注入 | 草稿状态、推荐目标登记、PHIS 回写、缓存读写、用户日志、AI 请求 |
| 语音知识库检索编排 | `features/voice-consultation/model/useVoiceKnowledgeSearch.ts` | 语音生成病历到知识库分类检索的轻包装，复用 knowledge controller 并注入 PMPHAI / 埋点 / 错误记录 | 知识库结果 UI、PMPHAI 服务实现、问诊页知识库状态、PHIS 回写 |
| 语音标准目录匹配 | `features/voice-consultation/model/useVoiceCatalogMatching.ts` | 语音生成病历中的诊断、药品、检查、检验和处置标准目录匹配，以及组合检查项拆分后的重新匹配 | 结果页 UI、治疗推荐编辑、PHIS 回写、缓存、toast、用户日志 |
| 语音结果记录状态 | `features/voice-consultation/model/useVoiceResultRecord.ts` | 语音生成病历的当前记录 / 原始记录 clone、字段编辑埋点和最终采纳埋点 | 缓存恢复、PHIS 回写、结果页关闭、反馈提交、AI 请求 |
| 语音安全复核状态 | `features/voice-consultation/model/useVoiceSafetyReview.ts` | 语音结果页 L2 柔性安全复核的状态、issue 派生、运行复核、知晓和忽略动作 | 安全面板 UI、刚性阻断、PHIS 回写、缓存、最终提交门禁 |
| 语音刚性阻断状态 | `features/voice-consultation/model/useVoiceRigidBlock.ts` | L1 本地确定性安全规则的告警状态、二次确认状态、重新评估和重置 | LLM 复核、PHIS 回写、结果页提交、面板 UI、缓存 |
| 语音安全 issue 执行动作 | `features/voice-consultation/model/useSafetyIssueResolver.ts` | L2 柔性提醒到本地 record 的 remove medication / add lab test 动作计划与应用 | issue 状态持有、LLM 复核、PHIS 回写、toast、用户日志 |
| 语音整页事实核查旧包装 | `features/voice-consultation/model/useVoiceResultFactCheck.ts` | 旧整页病例、诊断、药品、检查 fact-check widget 状态和进度包装 | 新结果页诊断/治疗卡片核查状态、PHIS 回写、缓存、用户日志 |
| 知识库检索分类 Builder | `features/knowledge/lib/knowledgeSearchCategories.ts` | 从诊断、药品、检查和治疗推荐项中纯提取 PMPHAI 批量检索分类词，并统计批量结果数量；供智能问诊和语音问诊复用同一口径 | PMPHAI 请求、配置判断、loading、toast、埋点、知识面板开合 |
| 知识库检索状态 Controller | `features/knowledge/model/useKnowledgeSearchController.ts` | 批量检索 loading、结果 map、hasResults、面板开合、诊断/分类检索流程和单项搜索面板定位；PMPHAI 调用、配置判断和埋点通过 options 注入 | 具体知识服务单例、toast 文案、问诊/语音数据来源、缓存恢复策略 |
| 语音录制/转写 | `features/voice-consultation` + `services/speech` | 录音 UI、speech provider 基础设施 | 智能问诊主流程 |
| 症状采集 | `features/symptom-consultation` | 症状过滤、模板表单、伴随症状推荐 | 语音问诊结果页 |
| 患者上下文 | 未来 `entities/patient`，当前 `utils/patientContext.ts` | 患者标识、性别年龄、就诊锚点解析 | 页面视图状态、缓存清理 |
| HIS/LLM/Regional | `services/*` | 外部协议与适配器 | UI 状态、业务流程分支 |

## 需要收敛而不是继续拆碎的区域

### 共享结果页

目标不是继续把 `VoiceConsultationNew.vue` 随机拆小，而是形成三个稳定层：

1. `ClinicalResultEditor`：结果页容器，接收中性输入和渠道 strategy。
2. `clinical-result` lib：DTO、payload、mapper、纯规则。
3. `consultation-result` model/ui：治疗编辑、诊断选择、手动匹配、反馈弹层等可复用 UI 状态与组件。

后续顺序：

1. 先定义 `ClinicalResultChannelStrategy` 类型草案，并从无副作用派生开始接入。
2. 再把取消/回写/缓存/日志这些渠道差异从结果页主体中参数化。用户日志优先抽成三态 controller，回写回执优先抽成结果分发 controller，页面只注入快照构造、提交副作用和渠道后置动作。
3. 最后再移动 `VoiceConsultationNew.vue` 到 feature 入口，旧路径保留 wrapper。

### 智能问诊主流程

`ConsultationPage.vue` 不宜继续只按函数名拆。应先划分为四个 controller：

1. `useSymptomCollectionController`：症状筛选、选择、动态表单。
2. `useConsultationAssistController`：灵活模式 assist 快进入口的前置上下文保障与按类型触发编排，只通过 options 调用页面现有 AI、toast、埋点和消费动作。
3. `useConsultationRecommendationController`：诊断/治疗 AI 请求、解析、事实核查、反馈注册。
4. `useConsultationReferenceController`：PHIS 引用请求、回执、状态 map。
5. `useConsultationCompletionController`：最终病历、医嘱、提交、日志。

每个 controller 内部再复用现有 `lib` 纯函数。这样能减少页面面条代码，而不是只把面条剪短。

### 语音问诊

语音问诊应拆成“采集”和“结果”两个上下文：

1. `voice-consultation` 保留录音、ASR、语音缓存、语音专属反馈。
2. 结果编辑、治疗归一化、PHIS 回写继续走 `consultation-result` / `clinical-result`。
3. 语音安全复核可作为 voice 专属 controller，但确定性规则引擎继续放在 service 或未来 `entities/safety`。

### 设置与基础设施

`SettingsPanel.vue`、`medicalData.ts`、`hisService.ts` 已超过舒适区，但它们不应被拆成无边界小文件：

1. 设置页按 tab/section 拆 UI，配置读写通过 settings model 汇总；音频输入设备选择和语音录音目录先抽为 `features/settings/model/useSettingsAudioInput.ts` 与 `useSettingsVoiceRecordingDirectory.ts`，分别承接设备枚举 / 权限探测 / devicechange 刷新和目录选择状态；保存快照、dirty 状态和 Cmd/Ctrl+S 监听抽为 `useSettingsSaveState.ts`，通用设置页签抽为受控 UI `features/settings/ui/SettingsGeneralTab.vue`，模型配置页签抽为受控 UI `features/settings/ui/SettingsModelTab.vue`，但当前设置 snapshot 汇总和真实保存动作仍留在父页，避免 controller 或展示组件反向持有区域化重连、toast、窗口置顶、埋点等副作用。
2. `medicalData.ts` 按 Catalog Repository、Matcher、Cache Scope 三类能力拆，而不是按函数随意拆。
3. `hisService.ts` 继续向 `services/his/HisAdapter` 收敛，业务代码不得直接依赖 PHIS 私有实现。

## 反模式

1. **文件变多但调用关系更深**：一次重构后需要跨 5 个文件才能读懂一个按钮行为，说明边界失败。
2. **Barrel 导出一切**：`index.ts` 成为大杂烩，会让内部实现失去封装。
3. **shared 过早泛化**：只有一个业务场景使用的组件，不应因为“看起来通用”进入 shared。
4. **helper 持有隐式副作用**：纯函数文件里出现 toast、invoke、service 单例、Vue ref，必须退回重划边界。
5. **页面只剩胶水但无语义**：页面层可以编排业务流程。过度抽象导致页面无法读懂流程，也不是好设计。
6. **跨 feature 深路径 import**：从兄弟 feature 的 `model/lib/ui` 直接 import 内部文件，会让迁移失去意义。

## 后续治理路线

### Phase A：复用规则固化

1. 本文档进入 `ARCHITECTURE.md`、`CODE_MAP.md`、`AGENTS.md` 的必读路径。
2. 后续每次重构说明必须写清楚“本次沉淀的能力是什么”，不能只写“减少了多少行”。
3. 对新 helper 做“纯函数 / controller / adapter / builder / strategy”分类。

### Phase B：结果页能力收敛

1. 建立 `ClinicalResultChannelStrategy` 草案。
2. 收敛结果页取消、回写等待、日志、反馈触发等渠道差异。
3. 再抽 `ClinicalResultEditor`，避免把当前 `VoiceConsultationNew.vue` 直接搬成新位置的大文件。

### Phase C：问诊 controller 化

1. 从 `ConsultationPage.vue` 中抽 controller，而不是继续追加零散 helper。
2. controller 只组合现有纯函数和注入副作用，不直接沉淀为全局 store。
3. 每个 controller 完成后，再评估是否移动入口文件。

### Phase D：旧 facade 清理与文件数收敛

1. 对已稳定迁移的旧 `components/*`、`composables/*` wrapper 建清理清单。
2. 用 `rg` 证明无旧调用后再删除 wrapper。
3. 删除比新增更重要：每轮治理尽量减少一个过期入口或重复 helper。

## 每次重构前检查

1. 这个能力是否已经在 `features/clinical-result`、`features/consultation-result`、`features/symptom-consultation` 或 `features/voice-consultation` 存在？
2. 它是纯规则、UI 状态、外部适配、入口 strategy，还是页面流程编排？
3. 是否真的跨两个以上场景复用？如果不是，先留在 feature 内，不进 shared。
4. 是否会改变问诊、语音、PHIS 回写行为？如果会，必须补 `PRODUCT.md` / `api.md` / 手测记录。
5. 是否能删除旧逻辑或旧入口？如果只能新增，必须说明为什么短期需要兼容层。
