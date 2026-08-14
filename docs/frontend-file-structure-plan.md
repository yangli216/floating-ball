# 前端文件结构规划

> 状态：规划稿，作为后续路径迁移的目标结构与门禁依据。当前任务不做大规模文件搬迁。
>
> 适用范围：`floating-ball/src` 下 Vue 3 + TypeScript 前端代码。
>
> 配套准则：路径迁移前先阅读 [frontend-reuse-architecture.md](frontend-reuse-architecture.md)，先判断能力是否应复用、归属哪个层级，再决定文件是否移动或新增。

## 目标

1. 把“页面 / 业务功能 / 共享 UI / 外部适配”拆成稳定边界，降低 `components/`、`composables/`、`services/` 根目录继续膨胀的风险。
2. 保留当前可运行路径，通过分阶段迁移和兼容 facade 降低一次性改 import 的风险。
3. 让新增代码默认进入明确功能域，而不是继续追加到根级 `components/` 或 `services/`。
4. 对 `ConsultationPage.vue`、`VoiceConsultationNew.vue` 等高风险文件采用“先抽局部模块，再移动入口文件”的节奏。
5. 路径治理不以文件数量增加为目标；若一次拆分不能形成可复用能力、稳定 controller、adapter、builder 或可删除旧入口，应优先暂停并重划边界。

## 当前问题

1. `src/components/` 扁平放置 46 个 Vue 文件，混合了顶层页面、独立窗口、业务卡片、反馈弹层和基础控件。
2. `src/composables/` 同时包含应用壳层编排、问诊业务状态、治疗项字段辅助、语音链路等不同层级逻辑。
3. `src/services/` 混合外部基础设施适配（HIS、LLM、区域化、语音）、业务服务（诊断路径、报告解读、反馈）和数据目录服务。
4. 当前没有稳定路径别名，跨目录相对路径较多，大规模搬迁会引入高 import 风险。
5. `features/clinical-result/` 已经形成较好的业务域样板，但仍有大量结果页组件和 composable 留在根目录。

## 目标目录

```text
src/
├── app/                         # 应用壳层：启动、全局 provider、窗口/视图编排
│   ├── shell/                   # 悬浮球、工作区布局、视图切换壳
│   ├── navigation/              # 顶层视图导航与窗口尺寸策略
│   └── providers/               # Pinia、主题、全局事件等注入入口
├── features/                    # 业务功能域，每个域拥有自己的 ui/model/api/lib
│   ├── consultation-result/     # 智能问诊/语音问诊共享结果页
│   ├── symptom-consultation/    # 智能问诊主流程、症状采集、病历生成
│   ├── voice-consultation/      # 语音录制、意图识别、语音缓存与反馈编排
│   ├── diagnosis-path/          # 独立诊断路径窗口与推理链数据
│   ├── report-interpretation/   # 检验检查报告解读
│   ├── knowledge/               # PMPHAI/内置知识库入口
│   ├── settings/                # 设置页、更新配置、强更门禁、缓存管理入口
│   ├── feedback/                # 通用反馈、语音项级反馈与整页反馈
│   ├── medical-catalog/         # 医学目录缓存、匹配与调试面板
│   ├── reception-risk/          # 接诊风险提醒
│   └── analytics/               # 数据分析看板
├── entities/                    # 稳定业务实体类型、纯转换与无副作用实体展示
│   ├── patient/
│   ├── diagnosis/
│   ├── treatment/
│   ├── consultation/
│   └── medical-catalog/
├── shared/                      # 与业务无关或多域共用的基础能力
│   ├── ui/                      # Icon、Toast、LoadingSpinner、通用 selector/chip
│   ├── composables/             # 与具体业务无关的组合函数
│   ├── lib/                     # 纯工具函数
│   ├── styles/                  # 设计 token、全局样式、动画
│   └── types/                   # 框架/第三方补充类型
├── services/                    # 外部系统和运行时基础设施适配
│   ├── his/
│   ├── llm/
│   ├── regional/
│   ├── speech/
│   ├── telemetry/
│   └── storage/
├── stores/                      # Pinia store，仅放跨功能域权威状态
├── prompts/                     # LLM prompt 资产
├── assets/                      # 静态资源；医学种子数据逐步收敛到 assets/data
├── main.ts
└── vite-env.d.ts
```

## 功能域内部规范

每个 `features/<name>/` 只按需要创建子目录，不强求空目录：

```text
features/<name>/
├── ui/          # Vue 组件，只负责展示和局部交互
├── model/       # composable、状态机、缓存、领域状态
├── api/         # 该功能域自己的远端/本地调用封装
├── lib/         # 纯函数、适配器、mapper、校验
├── types.ts     # 功能域公开类型
└── index.ts     # 对外公开入口
```

约束：

1. 其他模块只能从 `features/<name>/index.ts` 或明确公开的路径导入，不能跨功能域读取内部 `model/lib/ui`。
2. `features/*` 可以依赖 `entities/*`、`shared/*`、`services/*`，但默认不直接依赖兄弟 feature。
3. `shared/*` 不允许依赖任何 feature。
4. `entities/*` 只放稳定实体类型、纯转换和无副作用实体展示组件；实体 UI 只能接收 props / slots，不能引入 Tauri API、网络请求、Toast、store 或问诊流程副作用。
5. `services/*` 只处理外部系统、协议、持久化、运行时能力，不持有页面 UI 状态。

## 当前文件迁移映射

### 应用壳层

| 当前路径 | 目标路径 | 迁移方式 |
| --- | --- | --- |
| `src/App.vue` | `src/app/AppShell.vue` 或保留入口薄壳 | 先抽壳层 composable 和 view registry，再考虑改名 |
| `src/main.ts` | `src/main.ts` + `src/app/providers/*` | 入口保持稳定，provider 逐步拆出 |
| `src/composables/useNavigation.ts` | `src/app/navigation/useNavigation.ts` | 已迁移并删除旧路径兼容 re-export |
| `src/composables/useWindowManagement.ts` | `src/app/shell/useWindowManagement.ts` | 已迁移并删除旧路径兼容 re-export，窗口行为改动仍需同步多显示器验证 |
| `src/composables/useWorkMode.ts` | `src/app/shell/useWorkMode.ts` | 已迁移并删除旧路径兼容 re-export |
| `src/composables/useEventListeners.ts` | `src/app/events/useEventListeners.ts` | 最后迁移，避免事件入口断链 |
| `useEventListeners.ts` 内 SDK handshake 解析 / HIS 初始化 | `src/app/events/useSdkHandshakeController.ts` | App 级 controller：解析 `sdk-handshake` payload 中的 `origin / emrAccessToken / orgCode / tenantId / userRoleDeptIds / urt`，初始化或重置 HIS 服务、反馈 actor 和医学目录上下文；事件 hub 继续持有 `sdk-handshake` 事件订阅 |

### 问诊与结果页

| 当前路径 | 目标路径 | 迁移方式 |
| --- | --- | --- |
| `src/features/clinical-result/*` | `src/features/consultation-result/lib/*` | 先保留当前目录，已通过 `src/features/clinical-result/index.ts` 收口对外导出；页面层统一从 `@features/clinical-result` 消费，后续移动物理目录时优先改 barrel，不再让页面依赖深路径 |
| `src/utils/recordConfirmedPayload.ts` | `src/features/clinical-result/recordConfirmedPayload.ts` | 已迁移；作为症状问诊 / 语音问诊共用的 `record-confirmed` PHIS 回写契约唯一构造点，并承接诊断 key / 标准诊断 id 判断、orderList 原始字段读取、服务分类兜底、jsonField / 皮试 / 检查标志等纯解析，不再放在无业务语义的 `utils` |
| `src/features/symptom-consultation/lib/consultationLlmJsonParser.ts` | `src/features/clinical-result/clinicalResultLlmJsonParser.ts` | 抽为问诊结果共享 LLM JSON 宽容解析器，症状侧旧路径保留 re-export 兼容；语音结果页诊断 / 治疗推荐解析改为复用同一套去 BOM、去 markdown fence、平衡括号候选扫描和错误包装 |
| `VoiceConsultationNew.vue` 内中性结果输入初始化诊断 / 治疗列表 | `src/features/clinical-result/clinicalResultInitialization.ts` | 结果页共享 helper：只抽 `ClinicalResultInput`/旧语音结果到可编辑 `Diagnosis[]` / `TreatmentRecommendation[]` 的纯映射、匹配状态继承和默认勾选规则；标准库匹配、频次/用法推断、归一化和推荐理由文案由页面注入 |
| `VoiceConsultationNew.vue` / `ConsultationPage.vue` 内诊断推荐和治疗推荐 prompt messages / trace config 构造 | `src/features/clinical-result/clinicalResultAiRequest.ts` | 结果页共享 helper：只抽 diagnosis、medication、exam、lab_test、procedure 的 system/user messages 与 trace 元数据规格；语音侧用多路规格，智能问诊 western 各推荐用单路规格；trace 基础字段和 scene/title/action 可由调用方注入，语音侧不传时保持原值；页面仍负责调用 `chat`、`Promise.allSettled` 并发、loading、错误处理、当前诊断防串线、日志、缓存和 PHIS 回写 |
| `VoiceConsultationNew.vue` / `ConsultationPage.vue` 内 western 诊断 / 治疗 LLM raw 结果到页面推荐项的映射 | `src/features/clinical-result/clinicalResultAiMapping.ts` | 结果页共享 helper：只抽 raw 诊断标准库匹配、raw 治疗标准库评估 / normalize 组合，以及治疗多路 allSettled 响应的逐路解析失败隔离与合并；智能问诊 western 诊断通过 mapper 策略保持 code 优先和未匹配清空临时 id，页面仍负责 LLM 请求、loading、当前诊断防串线、toast、事实核查、日志、缓存和 PHIS 回写 |
| `VoiceConsultationNew.vue` 内推荐依据文案 / 默认勾选判断 | `src/features/clinical-result/clinicalResultNarrative.ts` | 结果页共享 helper：只抽病历摘要、诊断依据、治疗依据、条件性用药、患者已自行服药和默认勾选判断；页面只传当前病历文本，不读取 Vue ref |
| `VoiceConsultationNew.vue` 内药品频次 / 用法字段展示和候选解析 | `src/features/clinical-result/clinicalResultUsageFields.ts` | 结果页共享 helper：只抽药品字段展示文案、频次 / 用法候选过滤、关键字解析和选项标签格式化；页面仍负责搜索关键字 ref、焦点状态和字段写回 |
| `VoiceConsultationNew.vue` 内药房 / 执行科室 / 部位 / 医保候选构造和过滤 | `src/features/clinical-result/clinicalResultAttributeOptions.ts` | 结果页共享 helper：只抽二级属性候选转换与过滤；页面仍负责搜索关键字 ref、选择写回、清空副作用、库存校验和 toast |
| `VoiceConsultationNew.vue` 内诊断上下文 identity / 治疗编辑器 key / 手动匹配搜索 key | `src/features/clinical-result/recommendationHelpers.ts` + `manualMatch.ts` | 结果页共享 helper：只抽稳定 key 构造，供语音问诊和后续共享结果编辑器复用；页面仍负责展开集合、搜索关键字 ref、焦点管理和手动匹配后的副作用 |
| `ConsultationPage.vue` / `VoiceConsultationNew.vue` 内推荐项反馈提交 payload | `src/features/clinical-result/clinicalResultFeedback.ts` | 结果页共享 helper：只抽诊断 / 治疗推荐反馈提交给 `useVoiceFeedback.submitRecommendationFeedback` 所需的 key、标题、snapshot、fallback target/recommendation type；页面仍负责提交时机、toast、弹层关闭和异常展示 |
| `src/composables/useVoiceFeedback.ts` | `src/features/feedback/model/useVoiceFeedback.ts` | 已迁移实现并保留旧路径 re-export；虽然保留 voice 命名兼容历史，但它已被症状问诊和语音结果页共用，归反馈域 model |
| `ConsultationPage.vue` / `VoiceConsultationNew.vue` 内推荐依据 tooltip 开合状态 | `src/features/consultation-result/model/useReasonTooltipState.ts` | 结果页共享 composable：只管理当前打开的推荐依据 key、切换和关闭；页面仍负责外部点击、手动匹配、刷新推荐等触发时机 |
| `VoiceConsultationNew.vue` 内结果页渠道派生 | `src/features/consultation-result/model/useClinicalResultChannelStrategy.ts` | 结果页共享 strategy：根据 `voice/symptom/chronic-refill` 派生日志类型、语音缓存开关、患者头展示、取消弹窗文案、偏好追踪 context 和诊断鉴别 trace context；页面仍负责缓存读写、日志提交、取消事件和 PHIS 回写。App 与症状问诊统一从 `ConsultationResultPage` 公开入口消费，根级实现只允许该 facade 引用 |
| `VoiceConsultationNew.vue` / 独立鉴别诊断窗口内 checklist 请求、解析与不匹配判断 | `src/features/clinical-result/api/diagnosisChecklistRequest.ts` + `src/features/clinical-result/diagnosisChecklist.ts` + `src/features/consultation-result/model/useClinicalResultDiagnosisChecklist.ts` | `clinical-result` 请求网关统一轻量模型与 Prompt，纯规则统一上下文 key、响应类型、条目归一、关键诊断不匹配判断和风险项映射；`consultation-result` controller 管理主诊断后台预取、会话缓存、并发复用、卡片状态、严重风险主动展开与弹窗状态。页面只注入 trace、错误文案与 toast；独立窗口保留自身折叠、watch 和窗口生命周期 |
| `VoiceConsultationNew.vue` 内放弃确认流程 | `src/features/consultation-result/model/useClinicalResultCancelController.ts` | 结果页共享 controller：只管理确认弹窗开合、提交中 / 等待 HIS 回执时的拦截提示和确认入口；页面通过 `onConfirm` 注入清反馈、放弃日志和 `emit('cancel')` |
| `ConsultationPage.vue` / `VoiceConsultationNew.vue` 内用户日志首版 / 诊毕 / 放弃提交节奏 | `src/features/consultation-result/model/useClinicalResultUserLogController.ts` | 结果页共享 controller：只管理首版快照记忆、首版 / 最终 / 放弃三态提交、最终选择快照和可选变更摘要；页面仍负责构造当前快照、患者来源、区域化提交函数、语音病例字段变更判断和反馈草稿清理 |
| `VoiceConsultationNew.vue` 内一键回写回执 success / failed 分支 | `src/features/consultation-result/model/useWritebackFeedbackController.ts` | 结果页共享 controller：只管理已命中 requestId 回执的成功 / 失败分发和默认提示；页面仍负责调用 `complete_consultation`、缓存持久化、最终日志、整页反馈弹窗和 toast 注入 |
| `VoiceConsultationNew.vue` 内 `diagList` / `orderList` 回写清单构造 | `src/features/consultation-result/model/useClinicalResultWritebackPayload.ts` | 结果页共享 payload controller：只组合 `features/clinical-result/recordConfirmedPayload.ts` 的纯 builder 与页面注入的字典 / 药房 / 患者上下文，生成一键回写所需诊断和医嘱清单；页面仍负责提交门禁、库存校验、Tauri invoke、toast、等待回执和用户日志 |
| `VoiceConsultationNew.vue` 内一键回写前标准诊断 / 药品 / 库存 / 药房 / 执行科室 / 部位校验 | `src/features/consultation-result/model/useClinicalResultWritebackPreflight.ts` | 结果页共享 preflight controller：只按既有顺序编排回写前置校验、打开缺失项选择器并返回可提交的已选治疗；页面仍负责提交中状态、PHIS payload、Tauri invoke、等待回执和用户日志 |
| `VoiceConsultationNew.vue` 内语音编辑快照节流写入 | `src/features/voice-consultation/model/useVoiceEditorSnapshotPersistence.ts` | 语音问诊专属 controller：只管理 editorSnapshot 的构建、600ms 节流写入、立即写入和 pending timer 清理；页面仍负责从缓存恢复快照时的诊断/治疗副作用、药房加载、库存校验和推荐登记 |
| `VoiceConsultationNew.vue` 内病例字段初始快照 / 修改判断 | `src/features/voice-consultation/model/useVoiceRecordFieldState.ts` | 共享结果页局部 controller：只管理病例字段初始快照、当前值读取和人工修改判断；字段反馈展示、草稿与提交链路已移除，页面仍负责用户日志和 PHIS 回写 |
| `VoiceConsultationNew.vue` 内诊断 / 治疗事实核查状态 | `src/features/voice-consultation/model/useVoiceResultFactCheckState.ts` | 语音问诊专属 controller：只管理诊断 / 治疗 fact-check 结果 Map、issue getter 和逐条核查循环；是否触发核查、当前病历文本、当前主诊断和 check 函数由页面注入，controller 不调用 toast、PHIS、缓存、日志或回写 |
| `VoiceConsultationNew.vue` 内推荐项 / 病例字段 / 整页反馈提交动作 | `src/features/voice-consultation/model/useVoiceFeedbackActions.ts` | 语音问诊专属 action controller：只编排反馈 payload 构造后的提交、成功 toast、反馈弹层关闭和整页反馈完成回调；页面仍负责草稿状态、推荐目标登记、日志、缓存、PHIS 回写和弹窗显示时机 |
| `src/composables/useVoiceKnowledgeSearch.ts` | `src/features/voice-consultation/model/useVoiceKnowledgeSearch.ts` | 已迁移实现并保留旧路径 re-export；语音侧只包装 GeneratedRecord 到 knowledge controller 的检索输入，PMPHAI 服务与埋点通过该语音 model 注入 |
| `ConsultationPage.vue` / `VoiceConsultationNew.vue` 内 `consultation-reference-feedback` 订阅与当前就诊过滤 | `src/features/consultation-result/model/useConsultationReferenceFeedbackListener.ts` | 结果页共享 listener：只管理事件名、调用方活跃门禁、`consultationId` 防串线和 Tauri 监听生命周期组合；页面仍负责 requestId 匹配、PHIS 回执状态写入、toast、缓存和日志 |
| `ConsultationPage.vue` / `VoiceConsultationNew.vue` 内推荐反馈弹层开合和草稿读取 | `src/features/consultation-result/model/useRecommendationFeedbackPopover.ts` | 结果页共享 composable：只管理当前打开的反馈 key、读取草稿、读取提交标签和关闭逻辑；页面仍负责调用反馈提交、toast、全局点击事件接入和渠道专属反馈 |
| `ConsultationPage.vue` / `VoiceConsultationNew.vue` 内手动匹配弹层开合 / 搜索关键词缓存 | `src/features/consultation-result/model/useManualMatchState.ts` | 已收敛到结果页共享 composable：只管理当前打开的治疗项手动匹配 key、每条推荐的搜索关键词和打开时默认关键词；页面仍负责标准库候选搜索、应用匹配、toast、门禁和库存后置校验 |
| `VoiceConsultationNew.vue` 内患者展示信息 / 就诊锚点派生 | `src/features/consultation-result/model/useClinicalResultPatientContext.ts` | 结果页共享 composable：只根据当前 patient 派生患者姓名、性别、年龄、`idTet`、就诊锚点和 `consultationId`；页面仍负责缓存、日志、PHIS payload 注入、患者切换副作用和展示组件 |
| `VoiceConsultationNew.vue` 内新 intentResult 到来时的现场重置 / 病历字段落地 | `src/features/consultation-result/model/useClinicalResultIntentReset.ts` | 结果页共享 lifecycle controller：只清理上一次结果页现场、回填病历字段、设置病例字段初始快照；页面仍负责诊断 / 治疗初始化、缓存 overlay、AI 请求、事实核查、用户日志和 PHIS 回写 |
| `VoiceConsultationNew.vue` 内诊断勾选集合 / 主诊断同步 | `src/features/consultation-result/model/useDiagnosisSelection.ts` | 结果页共享 composable：只管理诊断 key 集合、主诊断、切换主诊断、移除诊断、替换诊断后同步 key；页面仍负责 AI 请求、同类诊断下拉、治疗方案刷新和推荐反馈注册 |
| `ConsultationPage.vue` / `VoiceConsultationNew.vue` 内同类诊断下拉开合与替换状态 | `src/features/consultation-result/model/useRelatedDiagnosisDropdown.ts` | 结果页共享 composable：只管理当前打开诊断 key、候选列表、打开 / 关闭 / 切换和替换后的关闭；候选来源、诊断列表写回、选择状态同步、埋点、反馈注册和治疗刷新仍由页面注入 |
| `VoiceConsultationNew.vue` 内药品频次 / 用法搜索关键字状态 | `src/features/consultation-result/model/useMedicineUsageSearch.ts` | 结果页共享 composable：只管理 frequency / route 搜索关键字缓存、同步和重置；页面仍负责字段激活、字段写回、归一化和库存校验 |
| `VoiceConsultationNew.vue` 内治疗推荐分组 / 空状态文案 | `src/features/consultation-result/model/useTreatmentSections.ts` + `src/features/consultation-result/ui/TreatmentRecommendationSection.vue` | 结果页共享 composable 只根据治疗推荐列表、当前主诊断、刷新状态和上一版诊断 key 派生治疗分组、是否存在推荐和空状态文案；共享 UI 组件承载用药/检查/检验/处置四类推荐的卡片、手动匹配、主字段编辑和二级属性选择器，语音/智能结果页与独立诊疗方案页共用；页面仍负责 AI 请求、刷新按钮、治疗项选择、库存校验、toast 和 PHIS 回写 |
| `VoiceConsultationNew.vue` 内治疗项展开 / 当前编辑字段 / 字段 DOM focus 状态 | `src/features/consultation-result/model/useTreatmentEditorState.ts` | 结果页共享 composable：只管理展开的治疗项 key 集合、当前 active 字段 key、字段 DOM 注册和 focus；页面仍负责激活字段时的药品归一化、频次/用法关键词同步、blur 写回和库存校验 |
| `VoiceConsultationNew.vue` 内药品用法用量字段编辑事件 | `src/features/consultation-result/model/useMedicineFieldEditing.ts` | 结果页共享 controller：只编排字段激活、blur 收口、频次 / 用法 keyword 解析写回、总量输入与库存 warning 清理；页面仍负责治疗项选中门禁、二级属性选择、toast、AI 请求和 PHIS 回写 |
| `VoiceConsultationNew.vue` 内药品药房候选 / 默认 / 归一化解析 | `src/features/consultation-result/model/useTreatmentPharmacyResolution.ts` | 结果页共享 composable：只根据治疗项门禁和当前药房字典解析候选药房、默认药房、匹配药房、药房名称归一化与详情加载后的默认药房填充；页面仍负责库存校验、药房清空副作用、选中门禁、toast、药品详情拉取和 PHIS orderList 拼装 |
| `VoiceConsultationNew.vue` 内治疗项选中前置门禁 | `src/features/consultation-result/model/useTreatmentSelectionReadiness.ts` | 结果页共享 controller：只在推荐项选中前检查药品详情、药房、执行科室、检查部位和库存，并通过注入回调打开对应编辑入口 / 提示；页面仍负责确认匹配、手动匹配写入、最终 `selected` 修改、AI 请求和 PHIS 回写 |
| `VoiceConsultationNew.vue` 内药房 / 执行科室 / 部位 quick selector 打开与聚焦 | `src/features/consultation-result/model/useTreatmentQuickSelector.ts` | 结果页共享 composable：只负责阻止事件冒泡、展开治疗编辑器、打开指定二级选择器并聚焦对应输入框；页面仍负责候选过滤、字段写回、清空时取消选中、库存校验、toast 和 PHIS 回写 |
| `VoiceConsultationNew.vue` 内药房 / 执行科室 / 部位 / 医保候选过滤 | `src/features/consultation-result/model/useTreatmentAttributeSearch.ts` | 结果页共享 composable：只根据二级选择器 keyword、字典 options 和当前治疗项派生候选列表，并提供字段搜索 keyword 的薄包装；页面仍负责选择写回、清空副作用、取消选中、库存校验、toast 和 PHIS 回写 |
| `VoiceConsultationNew.vue` 内一键回写等待 / 回执状态 / banner 文案 | `src/features/consultation-result/model/useWritebackStatus.ts` | 结果页共享 composable：只管理当前 requestId、等待提示、最近回执和按钮 / banner 派生文案；页面仍负责 Tauri `listen`、`invoke('complete_consultation')`、成功/失败 toast、整页反馈弹窗和用户日志 |
| `VoiceConsultationNew.vue` 结果页样式块 | `src/features/consultation-result/ui/ClinicalResultEditor.css` | 先原样外置 scoped CSS，降低高风险 SFC 行数；不在本轮调整选择器、视觉表现或布局行为 |
| `src/components/ConsultationResultPage.vue` | `src/features/consultation-result/ui/ConsultationResultPage.vue` | 已迁移并删除旧路径；当前只是共享结果页薄包装，继续转发到根级 `VoiceConsultationNew.vue`，等待后续抽出 `ClinicalResultEditor` 主体 |
| `src/components/VoiceConsultationNew.vue` | `src/features/consultation-result/ui/ClinicalResultEditor.vue` + `src/features/voice-consultation/ui/VoiceResultEntry.vue` | 先抽共享编辑器，再保留语音入口包装 |
| `src/components/SymptomConsultationResultPage.vue` | `src/features/symptom-consultation/ui/SymptomResultEntry.vue` | 已迁移并删除旧路径；只负责症状问诊快照到中性结果输入的入口适配、诊断鉴别 slot 和返回动作转发，行为不变 |
| `SymptomConsultationResultPage.vue` 症状结果页附加动作样式 | `src/features/symptom-consultation/ui/SymptomConsultationResultPage.css` | 原样外置 scoped CSS，让症状结果页包装组件只保留入口适配和事件转发 |
| `src/components/DiagnosisRecommendationCard.vue` | `src/features/consultation-result/ui/DiagnosisRecommendationCard.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/TreatmentRecommendationCard.vue` | `src/features/consultation-result/ui/TreatmentRecommendationCard.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/TreatmentItemEditor.vue` | `src/features/consultation-result/ui/TreatmentItemEditor.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/ManualMatchPicker.vue` | `src/features/consultation-result/ui/ManualMatchPicker.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/MedicineUsageFieldSelector.vue` | `src/features/consultation-result/ui/MedicineUsageFieldSelector.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/RecAttributeChip.vue` | `src/features/consultation-result/ui/RecAttributeChip.vue` | 已迁移并删除旧路径兼容包装 |
| `src/composables/useMedicalDictionaries.ts` | `src/features/consultation-result/model/useMedicalDictionaries.ts` | 已迁移并删除旧路径兼容 re-export。统一加载结果页治疗编辑所需 HIS 字典 |
| `src/composables/useTreatmentGates.ts` | `src/features/consultation-result/model/useTreatmentGates.ts` | 已迁移并删除旧路径兼容 re-export。保持治疗项门禁判断与候选派生独立 |
| `src/composables/useTreatmentNormalization.ts` / `useTreatmentHydration.ts` | `src/features/consultation-result/model/*` | 已迁移并删除旧路径兼容 re-export。保持治疗归一化与药品详情 / 库存 hydration 分离，症状问诊和语音问诊都从结果域复用 |
| `src/composables/useBodySiteOptions.ts` | `src/features/consultation-result/model/useBodySiteOptions.ts` | 已迁移并删除旧路径兼容 re-export。与治疗项检查部位绑定 |
| `src/composables/useSecondarySelector.ts` | `src/features/consultation-result/model/useSecondarySelector.ts` | 已迁移并删除旧路径兼容 re-export。当前是治疗推荐二级选择器，不放 shared |

### Entities

| 当前路径 | 目标路径 | 迁移方式 |
| --- | --- | --- |
| `src/components/PatientHeader.vue` | `src/entities/patient/ui/PatientHeader.vue` | 已迁移并删除旧路径；作为患者实体无副作用展示组件，被智能问诊和语音问诊通过 `@entities/patient` 共用；患者上下文/头像解析工具暂保留 `utils`，后续按实体转换治理再迁 |

### 智能问诊

| 当前路径 | 目标路径 | 迁移方式 |
| --- | --- | --- |
| `src/components/ConsultationPage.vue` | `src/features/symptom-consultation/ui/ConsultationPage.vue` | 高风险，最后迁移；先继续拆子模块 |
| `ConsultationPage.vue` 症状问诊页面样式块 | `src/features/symptom-consultation/ui/ConsultationPage.css` | 原样外置 scoped CSS，降低冻结 SFC 行数；不在本轮调整选择器、视觉表现、布局行为或问诊状态机 |
| `ConsultationPage.vue` 内症状系统分类筛选下拉状态 | `src/features/symptom-consultation/model/useSymptomCategoryFilter.ts` | 只抽已选分类、下拉开合、按钮文案、系统分类 options 和外部点击关闭判断；页面仍负责症状过滤、模板数据和 DOM 事件注册 |
| `ConsultationPage.vue` 内伴随症状勾选 / 推荐派生 | `src/features/symptom-consultation/model/useCompanionSymptoms.ts` | 只抽伴随症状选中集合、名称派生、按关联表生成推荐、升级为详细问诊时移除；页面仍负责展示、`selectSymptom`、病历正文拼接和模板数据来源 |
| `ConsultationPage.vue` 内症状选中 / 移除 / 表单初始化动作 | `src/features/symptom-consultation/model/useSymptomSelectionController.ts` | 症状采集 controller 第一刀：只管理 `selectedSymptoms` / `formData` 的选中、取消、移除、清空和 `buildInitialSymptomFormData` 初始化；toast、埋点和伴随症状升级清理均由页面通过 options 注入，AI、PHIS、缓存和最终报告流程不进入 controller |
| `ConsultationPage.vue` 内症状采集组合状态 | `src/features/symptom-consultation/model/useSymptomCollectionController.ts` | 症状采集 controller 第二刀：组合分类筛选、伴随症状、症状选中、filteredSymptoms、renderPlan/renderList 与表单 key 同步；模板加载/远端同步、动态症状 AI 生成、缓存恢复、生成病历、PHIS 回写仍留在页面 |
| `ConsultationPage.vue` 内症状列表过滤 / 拼音搜索 | `src/features/symptom-consultation/lib/symptomFiltering.ts` | 只抽系统分类过滤、适用性别过滤、名称 / 拼音 / 首字母搜索纯函数；页面仍负责当前搜索词、分类状态、患者性别和模板列表 |
| `ConsultationPage.vue` 内症状表单初始化 / checkbox 互斥处理 | `src/features/symptom-consultation/lib/symptomFormData.ts` | 只抽模板字段默认值构造、字段 key 兼容和 checkbox mutualExclusions 数组处理；页面仍负责选择/取消症状、formData 写入时机和 toast |
| `ConsultationPage.vue` 内症状表单渲染计划 | `src/features/symptom-consultation/lib/consultationRenderPlan.ts` | 只抽选中症状、问诊模式和当前 formData 到 renderList、需初始化配置 key、需清理配置 key 的纯计划；页面仍负责真正写入 / 删除 formData |
| `ConsultationPage.vue` 内一般情况 / 中医四诊静态表单配置 | `src/features/symptom-consultation/lib/consultationFormConfigs.ts` | 只保存一般情况问诊和中医四诊的模板配置常量；页面仍负责按问诊模式挂载配置、初始化 formData、触发 prompt / 报告文案生成 |
| `ConsultationPage.vue` 内症状问诊必填校验 | `src/features/symptom-consultation/lib/consultationFormValidation.ts` | 只抽选中症状、表单数据、患者信息到必填错误列表、错误 key map 和首个错误 DOM id 的纯校验；适用人群判断由页面注入，页面仍负责 toast、埋点、滚动和生成病历流程 |
| `ConsultationPage.vue` 内 assist 快进展示 / 功能统计映射 | `src/features/symptom-consultation/lib/consultationAssistPresentation.ts` | 只抽 assist action 到标签、banner 文案、banner tone / 样式和 feature usage code 的纯映射；页面仍负责快进流程、前置门禁、AI 请求、toast、埋点提交和自动触发消费 |
| `ConsultationPage.vue` 内 assist 快进流程编排 | `src/features/symptom-consultation/model/useConsultationAssistController.ts` | 只抽 assist action 到“先确保病历草稿 / 诊断上下文，再按类型拉取诊断、用药、检查、检验、处置或鉴别清单”的流程编排；页面继续注入 AI 请求函数、toast、埋点、视图切换、预填和自动触发消费，不在 controller 内直接调用 LLM、PHIS、Tauri invoke、缓存或全局 service |
| `ConsultationPage.vue` 内推荐区展示派生 | `src/features/symptom-consultation/lib/consultationRecommendationPresentation.ts` | 只抽 assist focus 下治疗推荐可见列表、其他治疗项过滤、诊断 / 治疗卡显示判断、治疗类型标签、诊断置信度 class 和药品行内摘要；页面仍负责推荐请求、选中门禁、标准库归一化注入和卡片交互 |
| `ConsultationPage.vue` 内患者文本读取 / 当前问诊 payload 拼装 | `src/features/symptom-consultation/lib/consultationPatientText.ts` + `src/features/symptom-consultation/lib/consultationPayloadBuilders.ts` | 高风险治理第一刀：只抽纯函数和显式输入的数据拼装，通过 `src/features/symptom-consultation/index.ts` 公开，不移动页面入口、不改交互状态机 |
| `ConsultationPage.vue` 内患者草稿 / 诊断预填 | `src/features/symptom-consultation/lib/consultationPrefill.ts` | 高风险治理第二刀：从患者上下文推导预填主诉、现病史和当前诊断；页面仍负责写入 ref、调用标准诊断库和 toast |
| `ConsultationPage.vue` 内 PHIS 引用 key / 状态图 / 回执归一 / 引用展示判断 | `src/features/symptom-consultation/lib/consultationReference.ts` | 高风险治理第三/四刀：只抽引用项类型、key 构造、状态 map 更新、pending/feedback 归一、按钮文案和治疗类型映射；页面仍负责 Tauri invoke、toast、日志和当前工作流状态写入 |
| `ConsultationPage.vue` 内诊断 identity / AI 请求防串线判断 | `src/features/symptom-consultation/lib/consultationDiagnosisContext.ts` | 高风险治理第五刀：只抽诊断 identity、当前诊断上下文匹配、请求序号与诊断上下文是否过期的纯判断；页面仍负责发起请求、写入推荐结果和日志 |
| `ConsultationPage.vue` 内同类诊断候选 / 替换列表更新 | `src/features/symptom-consultation/lib/consultationDiagnosisSwap.ts` | 高风险治理第十七/十八刀：只抽根据诊断类型选择同类候选、排除当前诊断、按原诊断 identity 生成替换后的诊断列表和判断选中诊断是否同步更新；页面仍负责埋点、ref 写入和下拉开合状态 |
| `ConsultationPage.vue` 内 AI 诊断原始结果映射 | `src/features/clinical-result/clinicalResultAiMapping.ts` + `src/features/symptom-consultation/lib/consultationDiagnosisMapping.ts` | western 诊断 raw 标准库匹配已收敛到结果页共享 mapper，并通过 lookup/未匹配 id 策略保持智能问诊原行为；症状域 helper 继续负责中医证候 / 治法匹配、伪码补齐和置信度排序；标准库匹配函数由页面显式注入 |
| `ConsultationPage.vue` 内中医四诊 prompt / 报告文案拼装 | `src/features/symptom-consultation/lib/consultationTcmSigns.ts` | 只抽四诊配置 sections + formData 到 AI prompt 文本和最终报告四诊文本的纯格式化；页面仍负责读取当前问诊模式、formData ref 和写入 generatedRecord |
| `ConsultationPage.vue` 内一般情况现病史片段拼装 | `src/features/symptom-consultation/lib/consultationGeneralCondition.ts` | 只抽精神 / 睡眠 / 食欲 / 二便 / 体重到现病史片段的纯格式化，保持“二便正常”合并和无效值过滤；页面仍负责判断当前问诊模式和追加到 hpiParts |
| `ConsultationPage.vue` 内病历草稿主诉 / 现病史整体拼装 | `src/features/symptom-consultation/lib/consultationGeneratedRecord.ts` | 只抽选中症状、表单数据、一般情况、四诊和伴随症状到 generatedRecord 草稿的纯拼装；症状字段文本生成、一般情况和四诊 formatter 由调用方注入，页面仍负责写入 ref 和触发后续 AI |
| `ConsultationPage.vue` 内诊断展示分组 | `src/features/symptom-consultation/lib/consultationDiagnosisGrouping.ts` | 高风险治理第十一刀：只抽中医单组与西医 ICD10 分组、未知组兜底和分组排序；ICD10 分类查询函数由页面显式注入 |
| `ConsultationPage.vue` 内诊断 / 治疗事实核查编排 | `src/features/symptom-consultation/model/consultationFactCheck.ts` | 高风险治理第十二/十三刀：抽诊断与治疗事实核查的启用判断、逐条检查、进度回调和 issue 合并；检查函数和页面状态写入通过参数注入 |
| `ConsultationPage.vue` 内医嘱文案生成 | `src/features/symptom-consultation/lib/consultationMedicalAdvice.ts` | 高风险治理第十四刀：只抽西医 / 中医默认医嘱文案和中药煎服法追加规则；页面仍负责读取当前模式和治疗推荐选中状态 |
| `ConsultationPage.vue` 内最终报告数据拼装 | `src/features/symptom-consultation/lib/consultationFinalRecord.ts` | 高风险治理第十五刀：只抽已选治疗快照、TCM 治则治法和 `FinalRecord` 对象拼装；页面仍负责 toast、埋点和视图切换 |
| `ConsultationPage.vue` 内完成问诊推荐采纳 / 拒绝埋点编排 | `src/features/symptom-consultation/model/consultationCompletionTracking.ts` | 高风险治理第十六刀：抽最终报告生成前诊断和治疗推荐采纳/拒绝反馈、表单提交统计；埋点函数由页面注入，不直接 import operationTracker |
| `ConsultationPage.vue` / `VoiceConsultationNew.vue` 内 PHIS 提交治疗选择 / 库存提示 / 处理意见拼装 | `src/features/clinical-result/consultationSubmitPayload.ts` | 高风险治理第十九刀后改为结果页共享 helper：只抽已选治疗合并、库存不足文案、按治疗类型拼装处理意见摘要；页面仍负责门禁校验、toast、标准 PHIS payload builder 和 Tauri invoke |
| `ConsultationPage.vue` 内 AI 治疗推荐原始结果映射 | `src/features/clinical-result/clinicalResultAiMapping.ts` | 已从症状私有 helper 收敛为结果页共享 mapper：只抽 LLM 原始推荐项到 `TreatmentRecommendation[]` 的过滤、标准库匹配注入和归一化注入；页面仍负责 LLM 请求、错误态、反馈落库和事实核查 |
| `ConsultationPage.vue` 内推荐反馈目标落库 / 注册 | `src/features/symptom-consultation/model/recommendationFeedbackRegistration.ts` | 高风险治理第七/八刀：抽诊断推荐与四路治疗推荐的 `feedbackService.saveRecommendation` 与 `registerExternalRecommendationTarget` 编排；副作用通过参数显式注入，不进入纯 `lib` |
| `ConsultationPage.vue` 内 LLM JSON 宽容解析 | `src/features/symptom-consultation/lib/consultationLlmJsonParser.ts` | 高风险治理第九刀：抽去 BOM / markdown fence / 平衡括号候选扫描 / JSON parse 错误包装；保持纯函数，页面继续负责日志和错误态 |
| `src/components/SymptomManagement.vue` | - | 本地症状库维护入口已下线，模板维护由后台承接；旧路径与迁移后的 `features/symptom-consultation/ui/SymptomManagement.vue` 均不再保留 |
| `src/components/BodyPartSelector.vue` | `src/features/symptom-consultation/ui/BodyPartSelector.vue` | 已迁移并删除旧路径；`ConsultationPage` 通过 `@features/symptom-consultation` 公开入口消费 |
| `src/components/SystemCategorySelector.vue` | `src/features/symptom-consultation/ui/SystemCategorySelector.vue` | 已迁移并删除旧路径；`ConsultationPage` 通过 `@features/symptom-consultation` 公开入口消费 |
| `src/composables/useSymptomConsultationCache.ts` | `src/features/symptom-consultation/model/useSymptomConsultationCache.ts` | 先 re-export，避免 App/页面双改 |
| `src/services/textGeneration.ts` | `src/features/symptom-consultation/api/textGeneration.ts` | 若仍只服务智能问诊，则迁入 feature |
| `src/services/templateService.ts` | `src/features/symptom-consultation/api/templateService.ts` | 与症状模板管理一起迁移 |

### 语音问诊

| 当前路径 | 目标路径 | 迁移方式 |
| --- | --- | --- |
| `src/components/VoiceCapsule.vue` | `src/features/voice-consultation/ui/VoiceCapsule.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/VoiceResultHeader.vue` | `src/features/voice-consultation/ui/VoiceResultHeader.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/VoiceSafetyReviewPanel.vue` | `src/features/voice-consultation/ui/VoiceSafetyReviewPanel.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/VoiceRigidBlockBanner.vue` | `src/features/voice-consultation/ui/VoiceRigidBlockBanner.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/VoiceRecommendationFeedbackPopover.vue` / `VoiceSessionFeedbackBar.vue` | `src/features/voice-consultation/ui/*` | 已迁移并删除旧路径兼容包装；病例字段级 `VoiceRecordFeedbackPopover.vue` 因无实际使用且遮挡正文已删除，不再迁移或恢复 |
| `VoiceConsultationNew.vue` 内主诉 / 现病史 / 既往史字段编辑重复模板 | `src/features/voice-consultation/ui/VoiceRecordFieldEditor.vue` | 共享结果页受控 UI：文档态展示原文事实标记，表单态展示 textarea；字段级反馈按钮、悬浮弹层及其父页草稿/提交接线已移除 |
| `src/composables/useVoice*.ts` | `src/features/voice-consultation/model/*` | 先迁移低耦合 hooks，再迁移主 `useVoiceConsultation`；`useVoiceKnowledgeSearch.ts`、`useVoiceCatalogMatching.ts`、`useVoiceResultRecord.ts`、`useVoiceSafetyReview.ts`、`useVoiceRigidBlock.ts`、`useVoiceResultFactCheck.ts`、`useVoiceIntentRecognition.ts` 已完成实现迁移并保留 re-export 兼容入口 |
| `src/composables/useVoiceConsultation.ts` 内语音缓存读写 | `src/features/voice-consultation/model/voiceConsultationCache.ts` | 只抽 `VOICE_CONSULTATION_CACHE_V1`、就诊锚点 key、跨自然日失效、读写/清理 base entry 和 editorSnapshot 增量合并；主 `useVoiceConsultation` 继续负责录音、LLM、窗口、toast、取消/错误结果写回 |
| `src/composables/useSafetyIssueResolver.ts` | `src/features/voice-consultation/model/useSafetyIssueResolver.ts` | 已迁移实现并保留旧路径 re-export；它是语音安全复核 issue 到本地 record 修改的执行层，暂不归入 shared |
| `src/services/voiceFeedback.ts` | `src/features/voice-consultation/api/voiceFeedback.ts` 或 `features/feedback/api` | 视反馈域拆分结果决定 |
| `src/services/aliyunSpeech.ts` | `src/services/speech/aliyunSpeech.ts` | 外部语音基础设施，归 services |
| `src/services/audioRecorder.ts` | `src/services/speech/audioRecorder.ts` | 浏览器录音基础设施 |
| `src/services/speechConfig.ts` | `src/services/speech/config.ts` | 语音 provider 配置 |

### 独立功能

| 当前路径 | 目标路径 | 迁移方式 |
| --- | --- | --- |
| `src/components/DiagnosisPathWindow.vue` | `src/features/diagnosis-path/ui/DiagnosisPathWindow.vue` | 已迁移并删除旧路径；service/store 暂保留原路径，独立窗口 UI 通过 `@features/diagnosis-path` 消费 |
| `src/services/diagnosisPath.ts` | `src/features/diagnosis-path/api/diagnosisPath.ts` | 保留 facade 直到调用方切完 |
| `src/stores/diagnosisPath.ts` | `src/features/diagnosis-path/model/diagnosisPathStore.ts` 或保留 `stores/` | 若仍跨窗口权威状态，可保留 stores |
| `src/components/ReportInterpretationWindow.vue` | `src/features/report-interpretation/ui/ReportInterpretationWindow.vue` | 已迁移并删除旧路径；report service/types 暂保留原路径，独立窗口 UI 通过 `@features/report-interpretation` 消费 |
| `src/services/reportInterpretation.ts` | `src/features/report-interpretation/api/reportInterpretation.ts` | 功能域服务 |
| `src/types/reportInterpretation.ts` | `src/features/report-interpretation/types.ts` | 功能域类型 |
| `src/components/Knowledge*.vue` | `src/features/knowledge/ui/*` | 已迁移并删除旧路径；App 与问诊页通过 `@features/knowledge` 公开入口消费，知识服务仍保留在 `services/*` |
| 智能问诊 / 语音问诊内知识库批量检索分类词提取 | `src/features/knowledge/lib/knowledgeSearchCategories.ts` | 只抽 diagnoses / medications / examinations 三类查询词提取、单项搜索类型派生和批量结果数量统计；智能问诊和语音问诊仍各自负责 PMPHAI 调用、loading、toast、面板开合和埋点 |
| 智能问诊 / 语音问诊知识库检索状态 | `src/features/knowledge/model/useKnowledgeSearchController.ts` | 抽批量检索 loading、结果 map、hasResults、面板开合、按诊断/分类检索和单项检索定位；知识服务、配置判断、埋点和错误记录通过 options 注入，调用方继续决定从何处取诊断/治疗/病例数据 |
| `src/services/pmphai.ts` / `knowledgeBase.ts` | `src/features/knowledge/api/*` | 若作为外部知识服务，也可保留 `services/knowledge` facade |
| `src/components/SettingsPanel.vue` | `src/features/settings/ui/SettingsPanel.vue` | 大文件，先拆页签子组件 |
| `SettingsPanel.vue` 内音频输入设备选择 / 权限探测 / devicechange 刷新 | `src/features/settings/model/useSettingsAudioInput.ts` | SettingsPanel 拆分第一刀：抽麦克风设备枚举、保存值回填、权限自动探测、刷新状态和错误文案；父组件仍负责保存时调用 `setPreferredAudioInputDeviceId`、toast、埋点和页面 UI |
| `SettingsPanel.vue` 内语音接诊录音目录选择 | `src/features/settings/model/useSettingsVoiceRecordingDirectory.ts` | SettingsPanel 拆分第一刀：抽目录值、选择中状态、Tauri 目录选择和默认目录恢复；成功/失败提示由父组件通过 notify 注入，保持点击后即时写入原语义 |
| `SettingsPanel.vue` 底部保存条 | `src/features/settings/ui/SettingsSaveBar.vue` | SettingsPanel 拆分第二刀：纯展示保存状态、快捷键提示和保存按钮，只通过 `save` 事件回调父组件 |
| `SettingsPanel.vue` 内保存快照 / dirty 状态 / Cmd/Ctrl+S 快捷保存 | `src/features/settings/model/useSettingsSaveState.ts` | SettingsPanel 拆分第三刀：父组件继续汇总当前设置 snapshot 和执行真实保存；controller 只管理已加载标记、上次保存快照、保存条文案、显示条件和快捷键监听 |
| `SettingsPanel.vue` 通用设置页签 | `src/features/settings/ui/SettingsGeneralTab.vue` | SettingsPanel 拆分第四刀：抽界面主题、窗口置顶、区域化接入、音频设置和工具入口的受控 UI；父组件继续持有 setTheme、区域化连接测试、音频刷新、目录选择、toast、埋点和对外 emit |
| `src/components/MedicalCatalogCachePanel.vue` | `src/features/medical-catalog/ui/MedicalCatalogCachePanel.vue` | 已迁移并删除旧路径；App 通过 `@features/medical-catalog` 公开入口消费 |
| `src/components/HisIntegrationLogPanel.vue` | `src/features/settings/ui/HisIntegrationLogPanel.vue` | 已迁移并删除旧路径；作为设置/排障工具面板，App 通过 `@features/settings` 公开入口消费 |
| `src/components/UpdateChecker.vue` | `src/features/settings/ui/UpdateChecker.vue` | 已迁移并删除旧路径；作为设置页“关于版本”和强更门禁共用的更新检查/安装 UI，服务契约仍保留在 `services/updateConfig.ts` 与 `services/updatePolicy.ts` |
| `src/components/ForceUpdateGate.vue` | `src/features/settings/ui/ForceUpdateGate.vue` | 已迁移并删除旧路径；作为区域化强制更新门禁 UI，App 通过 `@features/settings` 公开入口异步消费 |
| `src/components/FeedbackSubmissionPanel.vue` | `src/features/feedback/ui/FeedbackSubmissionPanel.vue` | 已迁移并删除旧路径；通用问题反馈入口归入 feedback 域，App 通过 `@features/feedback` 公开入口消费 |
| `src/components/ReceptionCapsule.vue` / `Risk*.vue` | `src/features/reception-risk/ui/*` + `types.ts` | 已迁移并删除旧路径；`RiskItem` 类型由 `features/reception-risk/types.ts` 统一导出，App / 事件监听不再从 UI 文件借类型 |
| `src/components/FactCheckWidget.vue` / `FactCheckNotification.vue` | `src/features/feedback/ui/*` | 已迁移并删除旧路径兼容包装；事实核查反馈展示归入 feedback 域，调用方直接从 `@features/feedback` 或 feature UI 入口导入 |

### Shared 与基础设施

| 当前路径 | 目标路径 | 迁移方式 |
| --- | --- | --- |
| `src/components/Icon.vue` | `src/shared/ui/Icon.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/Toast.vue` | `src/shared/ui/Toast.vue` | 已迁移并删除旧路径兼容包装；全局 provider 直接使用 shared 实现 |
| `src/components/LoadingSpinner.vue` | `src/shared/ui/LoadingSpinner.vue` | 已迁移并删除旧路径兼容包装 |
| `src/components/IconShowcase.vue` | `src/shared/ui/IconShowcase.vue` | 已迁移并删除旧路径；仅作为通用 Icon 开发检视页面，不进入业务功能域 |
| `src/components/FactCheckHighlight.vue` | `src/features/feedback/ui/FactCheckHighlight.vue` | 已迁移并删除旧路径兼容包装；事实核查 issue 语义归入 feedback 域 |
| `ConsultationPage.vue` / `VoiceConsultationNew.vue` 内 document 点击外部关闭浮层监听 | `src/shared/composables/useOutsideInteraction.ts` | 通用 composable：只管理 document 级 click / pointerdown 生命周期、selector / element 外部命中判断和回调触发；页面仍负责关闭推荐依据、推荐反馈弹层、症状分类下拉等具体业务状态 |
| `ConsultationPage.vue` / `VoiceConsultationNew.vue` / `UpdateChecker.vue` / `useEventListeners.ts` 内 Tauri 事件订阅 / 解绑样板 | `src/shared/composables/useTauriEventListener.ts` | 通用 composable：只管理 Tauri `listen` 的 mounted 自动订阅、必要时显式启动订阅、unmounted 解绑、订阅失败日志和可选失败传播；调用方仍负责事件名、payload 过滤、PHIS 回执状态写入、下载进度、toast 和接诊状态机；`useEventListeners.ts` 的 App 级事件通过 `autoStart: false` 显式接入，并按原 `registerAllListeners()` 顺序批量启动；Deep Link 与 window.listen 仍由原入口管理 |
| `DiagnosisPathWindow.vue` / `ReportInterpretationWindow.vue` 内独立窗口 `appWindow.listen` 批量注册 / 解绑样板 | `src/shared/composables/useTauriWindowEventListeners.ts` | 通用 composable：只管理当前 window 上多个事件 listener 的显式注册、unmounted 解绑和注册失败日志；窗口仍负责 `await registerListeners()` 后发送 ready 事件、payload 状态写入、图表渲染和关闭行为 |
| `src/utils/*` | `src/shared/lib/*` 或 `src/entities/*/lib` | 纯通用工具入 shared，业务实体转换入 entities |
| `src/types/*` | `src/entities/*` / `features/*/types.ts` / `shared/types` | 按使用域拆分 |
| `src/styles/*` | `src/shared/styles/*` | 最后迁移，避免 CSS import 波动 |
| `src/services/his/*` | `src/services/his/*` | 已具备清晰基础设施边界，暂不迁 |
| `src/services/llm/*` | `src/services/llm/*` | 已具备清晰基础设施边界，暂不迁 |
| `useEventListeners.ts` 内接诊状态机 | `src/app/events/useReceptionController.ts` | App 级 controller：编排 `receive-patient` / 自动静默接诊 / `show-patient-risks` 所需的 HIS 患者补全、风险胶囊状态、并发接诊防抖和患者切换时语音现场清理；事件 hub 继续持有 Tauri 事件名、SDK handshake、deep link、window listen 和导航编排 |
| `src/services/regional/*` | `src/services/regional/*` | 已具备清晰基础设施边界，暂不迁 |
| `src/services/regionalClient.ts` / `llm.ts` | 兼容 facade | 保留，直到所有调用方切到新入口 |

## 路径别名策略

已在 `vite.config.ts`、`tsconfig.json`、`tsconfig.node.json` 中统一以下别名：

```json
{
  "paths": {
    "@/*": ["src/*"],
    "@app/*": ["src/app/*"],
    "@features/*": ["src/features/*"],
    "@entities/*": ["src/entities/*"],
    "@shared/*": ["src/shared/*"],
    "@services/*": ["src/services/*"]
  }
}
```

规则：

1. 新代码优先使用别名导入，不继续制造多层 `../../`。
2. 同一 feature 内部可用相对路径，跨 feature 必须走公开入口。
3. 别名配置必须一次性同步 Vite、TypeScript 和文档；不得只改其中一处。
4. `@app/*`、`@entities/*`、`@shared/*` 对应目录可以在后续迁移阶段逐步创建；在目录真实落地前只作为规划保留，不新增空目录占位。

## 迁移阶段

### Phase 0：建立迁移护栏

1. 更新文档和协作规则。（已完成）
2. 增加路径别名。（已完成）
3. 禁止新增文件继续落到根级 `components/`、`composables/`、`services/`，除非是兼容 facade。（已完成）
4. 每个被迁移的功能域先创建 `index.ts` 公开入口。

验证：`yarn build`、`git diff --check`。

### Phase 1：迁移低风险 shared UI

`Icon.vue`、`Toast.vue`、`LoadingSpinner.vue` 已迁到 `src/shared/ui`，旧 `src/components/*` 兼容包装已删除。后续继续迁移纯展示类组件和部分纯工具，每次迁移 3-5 个文件，优先全局替换 import 后删除旧入口。

验证：`yarn build`，必要时检查相关页面渲染。

### Phase 2：完成共享结果页域

以当前 `features/clinical-result` 为样板，迁移共享结果页组件、治疗项归一化 hooks、手动匹配和推荐卡片。目标是让智能问诊和语音问诊共享结果页的代码都在 `features/consultation-result` 内闭环。

验证：

1. `yarn build`
2. 智能问诊生成病历后，置信度、诊断鉴别、已勾选治疗项仍在。
3. 语音问诊缓存恢复、一键回写、放弃流程仍在。

### Phase 3：拆分语音问诊域

把语音录制、语音缓存、意图识别、语音反馈、安全复核迁到 `features/voice-consultation`；`services/speech` 只放音频和转写基础设施。

验证：语音录制 -> 转写 -> 结果页 -> 回写完整链路。

### Phase 4：拆分智能问诊域

在不扩大 `ConsultationPage.vue` 的前提下，先抽 `model/lib/api/ui` 子模块，再移动入口文件。该阶段不允许单纯移动大文件后继续在大文件内堆逻辑。

当前第一批高风险治理范围：

1. `features/symptom-consultation/lib/consultationPatientText.ts`：只负责从患者 / 病历记录对象读取文本、过滤“既往门诊记录”类摘要、解析既往史等无副作用逻辑。
2. `features/symptom-consultation/lib/consultationPayloadBuilders.ts`：只负责根据显式传入的病历、诊断、治疗推荐和解析器构造当前医疗 payload、摘要和用户日志快照。
3. `features/symptom-consultation/lib/consultationPrefill.ts`：只负责从患者上下文和当前草稿/诊断状态推导预填动作，不能直接改 Vue ref，也不能访问标准库服务。
4. `features/symptom-consultation/lib/consultationReference.ts`：只负责 PHIS 引用项、引用 key、引用状态 map、回执 payload、引用按钮文案和治疗类型到引用 action 的纯转换；不能调用 `invoke`、`feedbackService`、`showToast` 或修改 Vue ref。
5. `features/symptom-consultation/lib/consultationDiagnosisContext.ts`：只负责诊断身份字符串和“当前请求是否仍属于当前诊断”的纯判断；不能读取 Vue ref，也不能调用 LLM、toast 或日志服务。
6. `features/symptom-consultation/lib/consultationDiagnosisSwap.ts`：只负责同类诊断候选过滤和替换数据变换，必须通过显式参数接收诊断 identity 函数和标准库候选查询函数；不能读取 Vue ref、调用 `trackRecommendationAction` 或直接访问 `medicalDataService`。
7. `features/symptom-consultation/lib/consultationDiagnosisMapping.ts`：只负责智能问诊中医诊断的证候 / 治法匹配和诊断排序，以及 western 分支对共享 raw 诊断 mapper 的策略化调用；西医/中医标准库匹配函数必须由页面显式注入，不能直接访问 `medicalDataService`、Vue ref 或日志服务。
8. `features/symptom-consultation/lib/consultationDiagnosisGrouping.ts`：只负责把诊断列表转换为展示分组；ICD10 分类查询函数必须由页面显式注入，不能直接访问 `medicalDataService`、Vue ref 或折叠状态。
9. `features/symptom-consultation/lib/consultationTcmSigns.ts`：只负责中医四诊表单值到 AI prompt 文本和最终报告四诊文本的纯格式化；不能读取 Vue ref、调用 LLM、写入 generatedRecord 或访问 toast/PHIS。
9a. `features/symptom-consultation/lib/consultationGeneralCondition.ts`：只负责一般情况表单值到现病史片段的纯格式化；不能读取 Vue ref、生成完整病历、调用 LLM、toast 或 PHIS。
9b. `features/symptom-consultation/lib/consultationGeneratedRecord.ts`：只负责把选中症状、表单数据、一般情况、四诊和伴随症状拼成 generatedRecord 草稿；症状字段文本生成、一般情况和四诊 formatter 必须由调用方注入，不能读取 Vue ref、调用 LLM、toast、PHIS 或提交日志。
9c. `features/symptom-consultation/lib/consultationFormValidation.ts`：只负责根据显式传入的选中症状、formData、患者信息和 `isFieldApplicable` 判断生成必填错误列表、错误 key map 和首个错误 DOM id；不能读取 Vue ref、操作 DOM、弹 toast、埋点、生成病历或触发 AI。
9d. `features/symptom-consultation/lib/consultationFormConfigs.ts`：只保存一般情况问诊和中医四诊表单配置常量；不能读取 / 写入 formData、决定问诊模式、弹 toast、调用 LLM 或触发 PHIS。
9e. `features/symptom-consultation/lib/consultationRenderPlan.ts`：只负责根据选中症状、问诊模式、当前 formData 和注入的中医四诊 / 一般情况配置生成表单渲染计划；不能写入或删除 formData，不能读取 Vue ref、toast、AI 或 PHIS。
9f. `features/symptom-consultation/lib/consultationAssistPresentation.ts`：只负责 assist 快进入口的展示标签、提示文案、banner tone / 样式和功能统计 featureCode 映射；不能触发快进流程、调用 `trackFeatureUsage`、toast、AI、PHIS 或读取 Vue ref。
9g. `features/symptom-consultation/model/useConsultationAssistController.ts`：只负责 assist 快进的前置上下文保障与按类型调用页面注入动作；不能直接 import `chat`、`invoke`、`feedbackService`、`medicalDataService`、`trackFeatureUsage`、toast、缓存或 PHIS/HIS service。
9g. `features/symptom-consultation/lib/consultationRecommendationPresentation.ts`：只负责智能问诊结果区的纯展示派生，包括按 assist focus 过滤治疗推荐、卡片可见性、类型标签、置信度 class 和药品行内摘要；不能读取 Vue ref、触发 AI、toast、PHIS、标准库查询或改变推荐项选中状态。
9h. `features/symptom-consultation/model/consultationFactCheck.ts`：允许编排事实核查这类副作用，但必须通过依赖注入接收 `isReviewerEnabled`、检查函数、进度更新、结果写入和 issue 合并函数；不能直接 import `factChecker`、toast 或 Vue ref。
10. `features/clinical-result/clinicalResultAiMapping.ts`：只负责把 LLM 原始诊断 / 治疗推荐数组转换成标准诊断或治疗推荐项，并隔离多路治疗响应解析失败；诊断 lookup 顺序和未匹配 id 处理必须由调用方显式选择，标准库匹配函数、catalog assessment、归一化函数、JSON parser 和 parse-error 回调必须由页面显式注入，不能直接访问 `medicalDataService`、HIS 字典、Vue ref、toast、缓存或 PHIS。
11. `features/symptom-consultation/model/recommendationFeedbackRegistration.ts`：允许编排诊断 / 治疗推荐反馈落库这类副作用，但必须通过依赖注入接收 `saveRecommendation`、`recordMetric`、`registerTarget`、`getRecommendationKey`，不能直接 import 单例服务或 Vue ref。
12. `features/clinical-result/clinicalResultLlmJsonParser.ts`：只负责 LLM 文本到 JSON 候选的纯解析；不能打印日志、弹 toast、调用 LLM、读写 Vue ref 或吞掉解析异常。`features/symptom-consultation/lib/consultationLlmJsonParser.ts` 仅保留兼容 re-export，不能继续新增实现。
12a0. `features/clinical-result/clinicalResultAiRequest.ts`：只负责诊断 / 治疗推荐 LLM 请求的 messages 和 trace config 规格构造，包含单路和多路治疗推荐规格；prompt 资产必须由调用方显式传入，trace 基础字段和具体 scene/title/action 可由调用方注入但默认保持语音问诊取值；不能调用 `chat`、读取 Vue ref、改 loading、写日志、处理错误、覆盖页面状态、读写缓存或触发 PHIS 回写。
12a00. `features/clinical-result/clinicalResultContract.ts`：定义渠道无关的 `ClinicalResultInput`、诊断与治疗基础契约；语音问诊可以保留兼容类型别名，但共享结果和复诊功能不得反向 import `features/voice-consultation` 的结果类型。
12a. `features/clinical-result/clinicalResultAiMapping.ts`：只负责把语音结果页 LLM raw 诊断 / 治疗项转换为已匹配的 `Diagnosis[]` / `TreatmentRecommendation[]`，把智能问诊 western 诊断 raw 数组按策略转换为 `Diagnosis[]`，把智能问诊单路治疗 raw 数组按目标类型过滤并转换为 `TreatmentRecommendation[]`，以及把多路 `Promise.allSettled` 治疗响应解析合并为治疗推荐列表；标准库匹配、catalog assessment、normalize、JSON parser 和 parse-error 回调必须由调用方注入，不能调用 LLM、toast、日志、缓存、事实核查、PHIS 回写或读取 Vue ref。
13. `features/symptom-consultation/lib/consultationMedicalAdvice.ts`：只负责根据显式传入的问诊模式和是否含中药处方生成默认医嘱文本；不能读取 Vue ref、治疗推荐列表或患者上下文。
14. `features/symptom-consultation/lib/consultationFinalRecord.ts`：只负责根据显式传入的患者、病历草稿、诊断、治疗推荐和医嘱生成最终报告对象；不能触发埋点、toast、PHIS 引用或视图切换。
15. `features/symptom-consultation/model/consultationCompletionTracking.ts`：允许编排完成问诊时的推荐采纳 / 拒绝反馈和生成最终报告统计，但必须通过参数接收 `trackRecommendationAction`、`trackFormSubmit` 和诊断 identity 函数；不能直接 import `operationTracker`、`feedbackService` 或 Vue ref。
16. `features/clinical-result/consultationSubmitPayload.ts`：只负责 PHIS 提交前的已选治疗合并、库存不足提示文案和处理意见摘要纯拼装；智能问诊和语音问诊共同复用，不能调用 `invoke`、toast、库存校验、`buildRecordConfirmedPayload` 或读取 Vue ref。
17. `features/clinical-result/clinicalResultInitialization.ts`：只负责中性结果输入到可编辑诊断 / 治疗列表的初始化、匹配状态继承和默认勾选纯规则；标准库匹配、频次 / 用法推断、治疗归一化和推荐理由文案必须由调用方显式注入，不能读取 Vue ref、HIS 字典、toast、缓存或 Tauri invoke。
18. `features/clinical-result/clinicalResultNarrative.ts`：只负责结果页推荐依据和治疗默认勾选相关的纯文本/规则判断；当前病历文本必须由调用方显式传入，不能读取 Vue ref、缓存、LLM、toast 或标准库服务。
19. `features/clinical-result/clinicalResultUsageFields.ts`：只负责药品频次 / 用法字段的展示和候选解析纯逻辑；候选列表、当前搜索关键字、归一化后的治疗项必须由调用方显式传入，不能读取 Vue ref、修改治疗项、弹 toast 或触发库存校验。
20. `features/clinical-result/clinicalResultAttributeOptions.ts`：只负责药房 / 执行科室 / 部位 / 医保候选转换和过滤；候选源、搜索关键字、当前值必须由调用方显式传入，不能修改推荐项、打开弹层、弹 toast、读取 Vue ref 或触发库存校验。
21. `features/clinical-result/clinicalResultFeedback.ts`：只负责推荐项反馈 key、target/recommendation 类型映射、snapshot 和 submit payload 纯构造；不能保存反馈、读写草稿、访问区域化接口、读取 Vue ref 或弹 toast。
22. `features/consultation-result/model/useRecommendationFeedbackPopover.ts`：只负责推荐项反馈弹层的打开 key、草稿读取、提交标签读取和关闭；不能调用反馈提交接口、toast、PHIS、缓存或文档事件监听。
23. `features/consultation-result/model/useClinicalResultPatientContext.ts`：只负责从 patient 派生结果页展示姓名、性别、年龄、`idTet`、就诊锚点和 `consultationId`；不能补全患者信息、切换患者、读写缓存、提交日志、拼装 PHIS payload、弹 toast 或触发页面导航。
23a. `features/consultation-result/model/useClinicalResultIntentReset.ts`：只负责新 intentResult 到来时的旧现场清理、病历字段回填和初始字段快照设置；不能触发 AI 请求、缓存 overlay、事实核查、推荐注册、用户日志或 PHIS 回写。
24. `features/consultation-result/model/useDiagnosisSelection.ts`：只负责诊断勾选集合、主诊断同步、增删选择和诊断替换后的 key 同步；不能触发治疗方案刷新、AI 请求、toast、反馈注册、同类诊断搜索或 PHIS 回写。
25. `features/consultation-result/model/useRelatedDiagnosisDropdown.ts`：只负责同类诊断下拉的打开 key、候选列表、打开 / 关闭 / 切换和替换后收口；候选来源由页面注入，不能修改诊断列表、同步选择状态、触发埋点、刷新治疗、注册反馈或 PHIS 回写。
26. `features/consultation-result/model/useManualMatchState.ts`：只负责治疗项手动匹配弹层 key、搜索关键词缓存和打开时默认关键词；不能访问标准库服务、修改治疗项、应用匹配、触发库存校验、打开二级选择器或弹 toast。
27. `features/consultation-result/model/useMedicineUsageSearch.ts`：只负责药品 frequency / route 搜索关键字缓存、当前值同步和重置；不能修改治疗项、解析字典结果、触发库存校验、打开编辑器或弹 toast。
28. `features/consultation-result/model/useTreatmentSections.ts`：只负责治疗推荐分组、是否存在推荐和空状态文案派生；不能改变治疗项选中、触发 AI 刷新、归一化治疗、校验库存、打开编辑器、提交反馈或 PHIS 回写。
29. `features/consultation-result/model/useTreatmentEditorState.ts`：只负责治疗编辑器展开集合、active field key、字段 DOM 注册、focus 和 active 清理；不能归一化治疗项、同步频次/用法关键词、写回字段、触发库存校验、打开二级选择器或弹 toast。
30. `features/consultation-result/model/useMedicineFieldEditing.ts`：只负责药品用法用量字段激活、blur 收口、频次 / 用法 keyword 解析写回、总量输入和库存 warning 清理；不能改变治疗项选中、打开二级属性、触发 AI 刷新、弹 toast、提交反馈或 PHIS 回写。
31. `features/consultation-result/model/useTreatmentPharmacyResolution.ts`：只负责药品候选药房收窄、默认药房、匹配药房和药房名称归一化；不能触发库存校验、改变治疗项选中、清空字段、弹 toast、拉取药品详情或提交 PHIS 回写。
32. `features/consultation-result/model/useTreatmentSelectionReadiness.ts`：只负责治疗项选中前的药品详情、药房、执行科室、检查部位和库存门禁编排；不能修改 `selected`、应用手动匹配、刷新 AI 推荐、提交反馈或 PHIS 回写。
33. `features/consultation-result/model/useTreatmentQuickSelector.ts`：只负责治疗项 quick selector 的展开编辑器、打开二级选择器和输入框聚焦；不能过滤候选、修改治疗项、清空字段、取消选中、触发库存校验、弹 toast、提交反馈或 PHIS 回写。
34. `features/consultation-result/model/useTreatmentAttributeSearch.ts`：只负责治疗项药房 / 执行科室 / 部位 / 医保候选构造、搜索 keyword 读写和过滤列表派生；不能修改治疗项、清空字段、取消选中、触发库存校验、弹 toast、提交反馈或 PHIS 回写。
35. `features/consultation-result/model/useWritebackStatus.ts`：只负责一键回写等待态、requestId 匹配、回执 payload 归一和按钮 / banner 文案派生；不能监听 Tauri 事件、调用 `invoke`、弹 toast、提交日志、打开反馈弹窗或清理缓存。
35a. `features/consultation-result/model/useClinicalResultWritebackPayload.ts`：只负责根据已选诊断、主诊断、患者 `idTet`、已选治疗和注入的字典 / 药房解析函数生成 `diagList` / `orderList`；不能做提交门禁、库存校验、调用 `invoke`、弹 toast、提交日志、打开反馈弹窗或清理缓存。
35b. `features/consultation-result/model/useClinicalResultWritebackPreflight.ts`：只负责一键回写前的标准诊断匹配、药品详情、库存、药房、执行科室和检查部位门禁编排，并通过注入回调打开对应选择器 / 提示；不能构造 PHIS payload、调用 `invoke`、修改提交中状态、提交日志、等待回执、清理缓存或改写治疗选择。
36. `features/consultation-result/model/useConsultationReferenceFeedbackListener.ts`：只负责订阅 `consultation-reference-feedback`、按调用方活跃门禁和当前 `consultationId` 过滤旧患者回执并把命中的 payload 交回页面；不能匹配 requestId、修改引用状态 map、弹 toast、提交日志或清理缓存。
33. `features/voice-consultation/model/useVoiceEditorSnapshotPersistence.ts`：只负责语音结果页 editorSnapshot 的节流 / 立即持久化和 timer 清理；快照内容由页面通过 getter 显式提供，不能读取治疗/诊断 Vue ref、恢复快照、触发药房加载、库存校验、推荐登记、PHIS 回写或用户日志提交。
34. `features/voice-consultation/model/useVoiceRecordFieldState.ts`：只负责共享结果页病例字段初始快照、当前值读取和人工修改判断；字段反馈 UI、草稿与提交已移除，用户日志变更标记、缓存和 PHIS 回写仍由页面编排。
35. `features/voice-consultation/model/useVoiceResultFactCheckState.ts`：只负责语音结果页诊断 / 治疗事实核查的结果 Map、issue getter 和逐条核查循环；检查启用判断、病历文本、当前诊断名和 check 函数必须由页面显式注入，不能调用 toast、PHIS、缓存、日志、用户反馈或一键回写。
35a. `features/voice-consultation/model/useVoiceFeedbackActions.ts`：只负责语音结果页推荐项反馈和整页反馈的提交动作编排；提交函数、弹层关闭、toast、整页完成回调必须由页面显式注入，不能处理病例字段反馈、读取缓存、提交用户日志、调用 PHIS 回写、触发 AI 或登记推荐目标。
35b. `features/voice-consultation/model/useVoiceKnowledgeSearch.ts`：只负责语音生成病历到 knowledge controller 的检索输入转换、PMPHAI 服务注入和操作埋点注入；不能处理语音缓存、结果页回写、PHIS、病例字段反馈或智能问诊知识库状态。
35c. `features/voice-consultation/model/useVoiceCatalogMatching.ts`：只负责语音生成病历到本地标准诊断 / 药品 / 检查 / 检验 / 处置目录的匹配和组合检查项防御性拆分；不能处理结果页 UI、治疗选择、库存校验、PHIS 回写、缓存、toast 或用户日志。
35d. `features/voice-consultation/model/useVoiceResultRecord.ts`：只负责语音结果当前记录 / 原始记录 clone、字段编辑埋点和最终采纳埋点；不能负责缓存恢复、PHIS 回写、结果页关闭、反馈提交或 AI 请求。
35e. `features/voice-consultation/model/useVoiceSafetyReview.ts`：只负责语音结果页 L2 柔性安全复核的状态、issue 派生、运行复核、知晓和忽略动作；不能处理面板 UI、刚性阻断、PHIS 回写、缓存清理或最终提交门禁。
35f. `features/voice-consultation/model/useVoiceRigidBlock.ts`：只负责 L1 本地确定性安全规则的告警状态、二次确认状态、重新评估和重置；不能调用 LLM、PHIS 回写、缓存、结果页提交或面板 UI。
35g. `features/voice-consultation/model/useSafetyIssueResolver.ts`：只负责 L2 安全 issue 到本地 record 的动作计划和应用；不能持有 issue 状态、调用 LLM、PHIS 回写、toast、缓存或用户日志。
35h. `features/voice-consultation/model/useVoiceResultFactCheck.ts`：只负责旧整页病例 / 诊断 / 药品 / 检查 fact-check widget 状态和进度包装；不能处理新结果页推荐卡片核查状态、PHIS 回写、缓存、反馈或用户日志。
35i. `features/feedback/model/useVoiceFeedback.ts`：只负责症状问诊和语音结果页共用的推荐 target 登记、推荐反馈 / 整页评分草稿状态、提交到本地反馈服务和 voice feedback backend payload 队列；病例字段反馈已退出运行时编排，旧 payload 仅保留历史兼容。不能弹 toast、提交用户日志、调用 PHIS 回写、触发 AI、关闭结果页或处理一键回写回执。
35j. `features/voice-consultation/model/useVoiceIntentRecognition.ts`：只负责录音文本到病例草稿、诊断提示和治疗提示的 LLM 抽取、JSON 结构校验 / 一次修复、标准目录匹配、结构归一和治疗项后处理；不能处理录音控制、语音缓存恢复、结果页 UI、PHIS 回写、窗口切换、诊毕 / 放弃语义或最终用户日志。
35k. `features/voice-consultation/model/voiceConsultationCache.ts`：只负责语音问诊 localStorage 缓存 key、跨自然日失效、base entry 读写 / 清理和 editorSnapshot 增量合并；不能触发 LLM、toast、窗口切换、结果页恢复副作用、PHIS 回写、诊毕 / 放弃语义或最终用户日志。
36. `src/app/events/useReceptionController.ts`：只负责 App 级接诊状态机，包括 HIS 患者补全、统一 reception flow token、同患者并发接诊复用、跨患者接诊拒绝、风险评估失败降级、患者切换时语音缓存 / 最小化入口清理、风险胶囊加载和自动接诊 guard；所有异步状态写入必须先验证 token 仍有效；不能注册 Tauri 事件、处理 SDK handshake、打开具体问诊结果页、提交 PHIS 回写或保存问诊/语音业务缓存。
36a. `features/reception/model/useReceptionSessionController.ts`：只负责接诊胶囊局部状态、`ReceptionOpportunity` 集合和患者展示 / 报告复诊上下文派生；必须以 `currentPatient` ref 作为唯一患者来源，通过显式 action 修改 `status / risks / opportunities / executingOpportunity`，不能调用 HIS、LLM、toast、导航、窗口 API、把流程上下文写入 `patient.raw` 或新增 Pinia store。
36b. `features/reception/model/useOutpatientScenarioRouter.ts`：只负责 `ReceptionOpportunity` 的执行策略，以及语音入口在缓存恢复 / 报告复诊 / 普通录音之间的分流；外部查询、病历生成、患者上下文合并、导航、toast 和错误记录必须通过 options 或方法参数注入，不能注册 Tauri 事件、直接调用 HIS / LLM 单例或补全患者。
36c. `features/reception/ui/ReceptionCapsule.vue`：只负责接诊 session 的患者摘要、风险列表和 opportunity 操作展示；风险规则与病历生成继续由 `features/reception-risk` 提供，组件不得直接调用 HIS、LLM 或导航。
36d. `features/reception/lib/receptionPatientSummary.ts`：只负责接诊 payload 到患者草稿、埋点身份摘要，以及 HIS 过敏史 / 既往史到统一患者上下文的纯转换；不能获取 HIS adapter、读取 Vue ref、触发风险评估、toast、导航或缓存清理。
34. `src/app/events/useSdkHandshakeController.ts`：只负责 SDK handshake payload 解析、HIS 服务单例初始化 / 重置、HisAdapter 重置、反馈 actor 缓存和 `medicalDataService.setCatalogContext`；不能注册 Tauri 事件、读写患者上下文、打开页面、提交 PHIS 回写或触发问诊 / 语音业务状态。
35. `ConsultationPage.vue` 继续持有页面状态、toast、PHIS 引用请求、缓存清理和事件处理；不得把副作用藏进 `lib`。

验证：完整智能问诊、灵活模式、诊断鉴别、PHIS 引用、一键回写。

### Phase 5：独立功能域迁移

迁移诊断路径、报告解读、知识库、设置、缓存管理、风险提醒、分析看板等相对独立功能。每个功能域迁移后更新 `CODE_MAP.md`。

验证：按功能域手测清单 + `yarn build`。

### Phase 6：清理兼容 facade

当所有调用方都切到新入口后，删除旧路径 facade 和过期文档引用。每次删除前用 `rg` 确认无旧 import。

验证：`yarn build`、`cargo check`、`git diff --check`。

## 新文件落点规则

1. 新业务页面：放 `features/<feature>/ui`。
2. 新业务状态 / composable：放 `features/<feature>/model`。
3. 新业务纯转换 / mapper / parser：放 `features/<feature>/lib`。
4. 新通用展示组件：放 `shared/ui`。
5. 新通用纯函数：放 `shared/lib`。
6. 新稳定业务实体类型：放 `entities/<entity>`。
7. 新外部系统适配：放 `services/<integration>`。
8. 根级 `components/`、`composables/`、`services/` 只允许保留历史入口或兼容 facade，不再作为新增默认目录。

## 每次路径迁移检查清单

1. 先更新规划文档或 `CODE_MAP.md` 中对应路径。
2. 先迁低耦合文件，再迁高风险入口。
3. 对高频引用模块，优先建立新入口并保留旧 facade。
4. 使用 `rg 'from .{1,3}(\\.\\./)+' src` 抽查新增深层相对路径。
5. 使用 `rg "<旧文件名>|<旧路径>" src ARCHITECTURE.md CODE_MAP.md AGENTS.md PRODUCT.md` 清理过期引用。
6. 至少执行 `yarn build`；涉及 Tauri 事件、窗口、HTTP Bridge 或 Rust 命令时补 `cargo check`。
7. 交付说明必须列出迁移范围、旧路径是否保留、是否存在未迁移兼容层。
