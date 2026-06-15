# CODE_MAP.md

> 代码地图 -- AI 再入时的快速索引。按需阅读对应模块，避免全量扫描。
>
> **维护规则**：模块职责、文件路径、依赖关系发生变更时，必须同步更新本文件。

---

## 快速导航

| 我要做什么 | 该读哪里 |
|-----------|---------|
| 了解整体架构 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 规划前端复用边界 | [frontend-reuse-architecture.md](docs/frontend-reuse-architecture.md) + [frontend-file-structure-plan.md](docs/frontend-file-structure-plan.md) |
| 了解 HIS 接口契约 | [api.md](./api.md) + [http_server.rs](src-tauri/src/http_server.rs) |
| 了解产品/交互约束 | [PRODUCT.md](./PRODUCT.md) |
| 了解协作规则与禁令 | [AGENTS.md](./AGENTS.md) |
| 了解踩坑记录 | [RETRO.md](./RETRO.md) |
| 了解反复摇摆的设计决策 | [DECISION_DRIFT.md](./DECISION_DRIFT.md) |
| 修改问诊主流程 | [ConsultationPage.vue](src/components/ConsultationPage.vue) + [SymptomResultEntry.vue](src/features/symptom-consultation/ui/SymptomResultEntry.vue) + [features/symptom-consultation](src/features/symptom-consultation/index.ts)；患者文本读取、既往史解析、患者草稿/诊断预填、症状问诊必填校验、诊断 identity / AI 请求防串线、同类诊断候选 / 替换列表更新、病历草稿主诉 / 现病史拼装、中医诊断证候 / 治法映射、中医四诊 prompt / 报告文案、一般情况现病史片段、诊断展示分组、诊断 / 治疗事实核查编排、LLM JSON 宽容解析、医嘱文案生成、最终报告数据拼装、完成问诊推荐采纳 / 拒绝埋点编排、推荐反馈目标落库 / 注册、当前问诊 payload / 用户日志快照、PHIS 引用 key / 状态图 / 回执归一 / 引用展示判断优先改 [features/symptom-consultation](src/features/symptom-consultation/index.ts)；症状结果页只保留包装语义，诊断鉴别入口和 checklist 弹窗由共享结果页主体提供；western 诊断 raw 映射、AI 治疗推荐 raw 映射、`record-confirmed` 回写契约和 PHIS 提交治疗选择 / 库存提示 / 处理意见拼装优先改 [features/clinical-result](src/features/clinical-result)，页面统一从 `@features/clinical-result` 导入，避免语音问诊反向依赖智能问诊私有目录；结果页首版 / 诊毕 / 放弃用户日志提交节奏优先改 [useClinicalResultUserLogController.ts](src/features/consultation-result/model/useClinicalResultUserLogController.ts)；涉及结果页诊断/治疗推荐卡片辅助逻辑、标准库候选搜索或手动匹配写入时优先改 [features/clinical-result](src/features/clinical-result) |
| 修改窗口/动画行为 | [useWindowManagement.ts](src/app/shell/useWindowManagement.ts) + [useWorkMode.ts](src/app/shell/useWorkMode.ts) |
| 修改 LLM 调用 | [llm.ts](src/services/llm.ts)（公开 facade）+ [services/llm](src/services/llm/types.ts) + [prompts.ts](src/prompts/prompts.ts) |
| 修改语音问诊 | [VoiceCapsule.vue](src/features/voice-consultation/ui/VoiceCapsule.vue) + [VoiceConsultationNew.vue](src/components/VoiceConsultationNew.vue) + [ConsultationResultPage.vue](src/features/consultation-result/ui/ConsultationResultPage.vue) + [features/clinical-result](src/features/clinical-result) + [VoiceResultHeader.vue](src/features/voice-consultation/ui/VoiceResultHeader.vue) + [VoiceSafetyReviewPanel.vue](src/features/voice-consultation/ui/VoiceSafetyReviewPanel.vue) + [VoiceRecommendationFeedbackPopover.vue](src/features/voice-consultation/ui/VoiceRecommendationFeedbackPopover.vue) + [VoiceRecordFeedbackPopover.vue](src/features/voice-consultation/ui/VoiceRecordFeedbackPopover.vue) + [VoiceRecordFieldEditor.vue](src/features/voice-consultation/ui/VoiceRecordFieldEditor.vue) + [VoiceSessionFeedbackBar.vue](src/features/voice-consultation/ui/VoiceSessionFeedbackBar.vue) + [useVoiceEditorSnapshotPersistence.ts](src/features/voice-consultation/model/useVoiceEditorSnapshotPersistence.ts) + [useVoiceRecordFieldFeedbackState.ts](src/features/voice-consultation/model/useVoiceRecordFieldFeedbackState.ts) + [useVoiceResultFactCheckState.ts](src/features/voice-consultation/model/useVoiceResultFactCheckState.ts) + [useVoiceFeedbackActions.ts](src/features/voice-consultation/model/useVoiceFeedbackActions.ts) + [useVoiceKnowledgeSearch.ts](src/features/voice-consultation/model/useVoiceKnowledgeSearch.ts) + [useVoiceCatalogMatching.ts](src/features/voice-consultation/model/useVoiceCatalogMatching.ts) + [useVoiceResultRecord.ts](src/features/voice-consultation/model/useVoiceResultRecord.ts) + [useVoiceSafetyReview.ts](src/features/voice-consultation/model/useVoiceSafetyReview.ts) + [useVoiceRigidBlock.ts](src/features/voice-consultation/model/useVoiceRigidBlock.ts) + [useSafetyIssueResolver.ts](src/features/voice-consultation/model/useSafetyIssueResolver.ts) + [useVoiceResultFactCheck.ts](src/features/voice-consultation/model/useVoiceResultFactCheck.ts) + [useVoiceFeedback.ts](src/features/feedback/model/useVoiceFeedback.ts) + [useVoiceConsultation.ts](src/composables/useVoiceConsultation.ts) + [useVoiceIntentRecognition.ts](src/composables/useVoiceIntentRecognition.ts) + [safetyRules.ts](src/services/safetyRules.ts) + [voiceResult.ts](src/types/voiceResult.ts) + [prompts.ts](src/prompts/prompts.ts) + [aliyunSpeech.ts](src/services/aliyunSpeech.ts) + [speechConfig.ts](src/services/speechConfig.ts) + [audioRecorder.ts](src/services/audioRecorder.ts) + [voiceFeedback.ts](src/services/voiceFeedback.ts)；重点关注语音抽取契约是否覆盖病例草稿、explicit/inferred 来源标记、诊断/检查/药品结构化字段，以及推荐项反馈 / 整页评分 / 病例字段反馈的本地落库、前后对比快照和 payload 组装；共享结果页主体同时被症状问诊复用，推荐卡片 helper / 标准库匹配 helper / `record-confirmed` 回写 helper / 一键回写前治疗摘要 helper 统一从 `@features/clinical-result` 消费，反馈草稿 / target 登记 / 本地反馈提交统一从 `@features/feedback` 消费，语音侧只保留渠道初始化、缓存恢复、病例字段反馈状态、结果事实核查状态、标准目录匹配、安全复核、知识库轻包装与日志语义 |
| 修改独立鉴别诊断 | [DifferentialDiagnosisModalPage.vue](src/features/differential-diagnosis/ui/DifferentialDiagnosisModalPage.vue)；入口来自 `/api/consultation/assist` 的 `action: diffDx`，只打开“鉴别排查确认”小窗，不进入 `ConsultationPage.vue` 或共享结果页；基于当前患者上下文中的 `diagnosis/chiefComplaint/historyOfPresentIllness` 调用 diagnosisChecklist prompt，确认结果不写回 PHIS |
| 修改独立诊疗方案推荐 | [TreatmentPlanPage.vue](src/features/treatment-plan/ui/TreatmentPlanPage.vue) + [TreatmentPlanGroup.vue](src/features/treatment-plan/ui/TreatmentPlanGroup.vue) + [useTreatmentPlanRecommendations.ts](src/features/treatment-plan/model/useTreatmentPlanRecommendations.ts) + [useTreatmentPlanWriteback.ts](src/features/treatment-plan/model/useTreatmentPlanWriteback.ts) + [features/clinical-result](src/features/clinical-result) + [features/consultation-result](src/features/consultation-result)；入口来自 `/api/consultation/assist` 的 `action: treatment_plan`，只做四类治疗方案聚合清单，不进入 `ConsultationPage.vue`；AI 请求、标准库匹配、推荐项二次编辑、药品/项目 hydrate、库存校验和 `record-confirmed` 构造必须继续复用共享 clinical-result / consultation-result 能力 |
| 修改住院病历辅助生成 | [InpatientEmrPage.vue](src/features/inpatient-emr/ui/InpatientEmrPage.vue) + [useInpatientEmrGeneration.ts](src/features/inpatient-emr/model/useInpatientEmrGeneration.ts) + [inpatientEmrService.ts](src/features/inpatient-emr/api/inpatientEmrService.ts) + [inpatientEmrTemplate.ts](src/features/inpatient-emr/lib/inpatientEmrTemplate.ts) + [inpatientEmrPrompts.ts](src/features/inpatient-emr/lib/inpatientEmrPrompts.ts) + [services/his](src/services/his) + [http_server.rs](src-tauri/src/http_server.rs) + [sdk/med-hermes-sdk.js](sdk/med-hermes-sdk.js) + [sdk_test.html](docs/sdk_test.html) + [api.md](./api.md)；入口来自 `/api/inpatient/emr/generate` 或 `sdk.generateInpatientEmr(...)`，必须传 `admissionId + templateId + templateName + htmlContent`，小球切换为独立病历生成界面，按“患者信息 / 医嘱 / 体温单 / 解析病历 / AI 生成”步骤展示进度；入院记录可通过 `HisAdapter.fetchOutpatientVisitHistory` 拉取最近门诊就诊列表，PHIS 实现调用 `api/phis.clinicPatientService/queryVisitHistory` 映射列表；医生选中一次门诊就诊后，先由 `fetchOutpatientMedicalRecordDocuments` / `fetchOutpatientMedicalRecord` 对接 PHIS `api/otms.rpcEmrEditorLookService/getLookMedList` 获取该就诊下的门诊病历文书列表（`idHospital = idVis`，`idApp = 42`，`idTet` 来自握手或门诊记录），再按 `idMedrecdoc` 调用 `api/otms.rpcEmrEditorLookService/getMedContentLook` 获取 HTML 正文（`courseShow = 0`），带正文的门诊病历可与手填/语音补充要点共同作为入院记录生成依据；生成时必须从入院记录书写角度综合门诊病历、补充信息和住院上下文，不得原样搬运门诊主诉、现病史或正文；区域化模式下模板解析优先走后端 `/v1/client/inpatient-emr/templates/resolve` 并按 `templateId` 缓存，命中后直接使用后台字段提示词，只有后端不可用或未返回字段时才走本地未知字段 LLM 分类兜底；左侧只展示 AI 生成字段，字段提示词点击详情后展开；医生在病历预览中直接调整高亮 AI 字段，非 AI 字段只读且保留模板原始默认值（如页眉病历标题）；确认后通过 `record-confirmed` 结果通道把适合 AI 生成的 `{ [data-id]: 文本 }` `fieldValues` 回写给 HIS，不返回 `htmlContent`；收到 `reference-feedback` 成功回执后收起回小球 |
| 修改区域化后端接入 | [SettingsPanel.vue](src/components/SettingsPanel.vue) + [regionalClient.ts](src/services/regionalClient.ts)（兼容 facade）+ [services/regional](src/services/regional/index.ts) + [regionalRuntime.ts](src/services/regionalRuntime.ts) + [fetchTimeout.ts](src/shared/lib/fetchTimeout.ts) + [userFeedback.ts](src/services/userFeedback.ts) + [consultationUserLog.ts](src/services/consultationUserLog.ts) + [featureUsageTracker.ts](src/services/featureUsageTracker.ts) + [device.rs](src-tauri/src/commands/device.rs) |
| 修改诊断路径 | [DiagnosisPathWindow.vue](src/features/diagnosis-path/ui/DiagnosisPathWindow.vue) + [diagnosisPath.ts](src/services/diagnosisPath.ts) + [stores/diagnosisPath.ts](src/stores/diagnosisPath.ts) |
| 修改检验检查报告解读 | [ReportInterpretationWindow.vue](src/features/report-interpretation/ui/ReportInterpretationWindow.vue) + [reportInterpretation.ts](src/services/reportInterpretation.ts) + [reportInterpretation.ts](src/types/reportInterpretation.ts) + [useEventListeners.ts](src/composables/useEventListeners.ts) + [http_server.rs](src-tauri/src/http_server.rs) + [sdk/med-hermes-sdk.js](sdk/med-hermes-sdk.js) + [report-interpretation-test.html](web_project/public/report-interpretation-test.html) |
| 修改知识库 | [pmphai.ts](src/services/pmphai.ts)（主） / [KnowledgeBasePanel.vue](src/features/knowledge/ui/KnowledgeBasePanel.vue)（备） / [features/knowledge](src/features/knowledge)；智能问诊和语音问诊批量检索分类词提取优先改 [knowledgeSearchCategories.ts](src/features/knowledge/lib/knowledgeSearchCategories.ts)，检索 loading / results / 面板开合优先改 [useKnowledgeSearchController.ts](src/features/knowledge/model/useKnowledgeSearchController.ts)，PMPHAI 服务和埋点仍由调用方注入 |
| 修改设置面板 | [SettingsPanel.vue](src/components/SettingsPanel.vue) + [SettingsGeneralTab.vue](src/features/settings/ui/SettingsGeneralTab.vue) + [SettingsModelTab.vue](src/features/settings/ui/SettingsModelTab.vue) + [UpdateChecker.vue](src/features/settings/ui/UpdateChecker.vue) + [llm.ts](src/services/llm.ts) + [speechConfig.ts](src/services/speechConfig.ts) + [regionalClient.ts](src/services/regionalClient.ts)；通用设置/模型配置页签是受控 UI，保存、区域化重连、窗口置顶、连接测试和埋点仍在父面板；注意区域化模式下设置页隐藏“模型配置”页签 |
| 修改用户可见错误提示 | [errorMessages.ts](src/shared/lib/errorMessages.ts) + [App.vue](src/App.vue) + [services/regional](src/services/regional) + 具体业务入口；公共工具负责把网络、超时、后端 requestId、JSON/HTTP/上游异常归一为可操作文案，业务层只追加场景前缀 |
| 修改客户端更新源 | [UpdateChecker.vue](src/features/settings/ui/UpdateChecker.vue) + [ForceUpdateGate.vue](src/features/settings/ui/ForceUpdateGate.vue) + [updateConfig.ts](src/services/updateConfig.ts) + [lib.rs](src-tauri/src/lib.rs)；内网发布端见 `../floating-ball-server/modules/release` |
| 修改窗口尺寸记忆 | [useWindowManagement.ts](src/app/shell/useWindowManagement.ts) + [useNavigation.ts](src/app/navigation/useNavigation.ts) + [useEventListeners.ts](src/composables/useEventListeners.ts) + [windowSizes.ts](src/constants/windowSizes.ts) |
| 修改最小化/恢复语义 | [useMinimizedSessions.ts](src/composables/useMinimizedSessions.ts) + [App.vue](src/App.vue) + [useSymptomConsultationCache.ts](src/composables/useSymptomConsultationCache.ts) + [useVoiceConsultation.ts](src/composables/useVoiceConsultation.ts)；按 `idVis` 锚定，跨自然日过期；症状问诊状态由 `ConsultationPage.vue` 常驻 `v-show` 实例和症状问诊快照保留，收起/恢复/再次点击智能问诊不得复位内部页签；语音问诊整张病历快照走 `editorSnapshot` |
| 修改医学数据匹配 / HIS 出站标准服务 | [medicalData.ts](src/services/medicalData.ts) + [his/HisAdapter.ts](src/services/his/HisAdapter.ts) + [his/types.ts](src/services/his/types.ts) + [his/PhisHisAdapter.ts](src/services/his/PhisHisAdapter.ts) + [his/MockHisAdapter.ts](src/services/his/MockHisAdapter.ts) + [his/registry.ts](src/services/his/registry.ts) + [hisService.ts](src/services/hisService.ts) + [medical_catalog.rs](src-tauri/src/commands/medical_catalog.rs)；重点核对 SDK handshake 传入的 `orgCode / idTet` 是否进入缓存上下文，诊疗项目是否按机构+租户隔离，药品是否按机构+租户+药房 `storeId` 隔离，住院上下文是否使用 PHIS `idAdsn`（中性 `admissionId`）或 `patientId / inpatientVisitId / encounterId / inpatientNo` 锚定同患者多次住院，PHIS 住院诊断是否从登记信息 `diagList` 派生而不是单独维护第二条诊断服务，以及区域化开关不会阻断既有缓存恢复 |
| 测试 HIS 集成 | [mock-his.html](web_project/public/mock-his.html) + [report-interpretation-test.html](web_project/public/report-interpretation-test.html) + [sdk_test.html](docs/sdk_test.html)；`sdk_test.html` 覆盖住院病历生成请求联调，模板来源为 [mock_emr_tpl.txt](docs/mock_emr_tpl.txt)，用于验证 `sdk.generateInpatientEmr(...)` / `/api/inpatient/emr/generate` 能唤起桌面端分步骤生成界面 |

---

## 目录结构总览

当前结构是迁移前基线。复用边界、设计模式和“什么时候不该继续拆”见 [docs/frontend-reuse-architecture.md](docs/frontend-reuse-architecture.md)，目标结构与分阶段迁移规则见 [docs/frontend-file-structure-plan.md](docs/frontend-file-structure-plan.md)。新业务代码不再默认新增到根级 `components/`、`composables/`、`services/`；应优先按功能域落到 `features/<feature>/ui|model|api|lib`，通用 UI / 工具落到 `shared/*`，稳定实体类型落到 `entities/*`，外部系统适配继续落到 `services/<integration>`。

```
floating-ball/
├── src/                        # Vue 3 前端源码
│   ├── components/             # 历史扁平组件目录（当前 46 个 Vue 文件，逐步迁移到 features/shared）
│   ├── composables/            # 历史组合函数目录（逐步迁移到 app/features/shared）
│   ├── features/               # 功能域目录；当前已有 consultation-result、voice-consultation、feedback、symptom-consultation/lib 等
│   ├── services/               # 外部系统和运行时基础设施；HIS/LLM/regional 已先行分组
│   ├── stores/                 # 2 个 Pinia store
│   ├── types/                  # 历史类型目录（逐步拆到 entities/features/shared）
│   ├── constants/              # 配置常量
│   ├── icons/                  # Iconify 离线图标精简集合
│   ├── prompts/                # LLM 提示词（统一收敛到 prompts.ts）
│   ├── styles/                 # CSS 模块（设计令牌、布局、动画）
│   ├── assets/                 # 医学数据 CSV + 模板 JSON
│   ├── utils/                  # 工具函数
│   ├── App.vue                 # 根组件（编排层）
│   └── main.ts                 # 应用入口
├── src-tauri/                  # Rust 后端（Tauri 2.0）
│   └── src/
│       ├── main.rs             # Rust 入口
│       ├── lib.rs              # Tauri 命令 + 窗口管理
│       ├── http_server.rs      # HIS HTTP Bridge（Actix-web）
│       ├── aliyun_speech.rs    # 阿里云语音识别
│       ├── commands/           # 扩展命令模块
│       └── db/                 # 数据库模型
├── scripts/                    # 构建/发版脚本
└── docs/                       # 区域化文档（仅改造时读）
```

---

## 前端组件 (`src/components/`)

### 核心业务组件

| 组件 | 行数 | 职责 | 注意事项 |
|------|------|------|---------|
| **ConsultationPage.vue** | ~3200 | 完整问诊 + 灵活模式的唯一落点：症状采集（3种模式）、动态表单、AI 推荐（诊断/用药/检查）、病历回写、HIS 引用闭环；症状系统分类筛选下拉状态已抽到 `features/symptom-consultation/model/useSymptomCategoryFilter.ts`，伴随症状勾选与推荐派生已抽到 `features/symptom-consultation/model/useCompanionSymptoms.ts`，症状选中 / 移除 / 表单初始化动作已抽到 `features/symptom-consultation/model/useSymptomSelectionController.ts`，症状采集组合状态已抽到 `features/symptom-consultation/model/useSymptomCollectionController.ts`，症状列表过滤 / 拼音搜索已抽到 `features/symptom-consultation/lib/symptomFiltering.ts`，症状表单初始化 / checkbox 互斥处理已抽到 `features/symptom-consultation/lib/symptomFormData.ts`，症状表单渲染计划已抽到 `features/symptom-consultation/lib/consultationRenderPlan.ts`，一般情况 / 中医四诊静态表单配置已抽到 `features/symptom-consultation/lib/consultationFormConfigs.ts`，症状问诊必填校验已抽到 `features/symptom-consultation/lib/consultationFormValidation.ts`，assist 快进展示文案 / banner 样式 / 功能统计 featureCode 映射已抽到 `features/symptom-consultation/lib/consultationAssistPresentation.ts`，assist 快进流程编排已抽到 `features/symptom-consultation/model/useConsultationAssistController.ts`，推荐区可见性 / 类型标签 / 置信度 class / 药品行内摘要已抽到 `features/symptom-consultation/lib/consultationRecommendationPresentation.ts`；治疗推荐通过共享 `useMedicalDictionaries` + `useTreatmentNormalization` + `useTreatmentGates` + `useTreatmentHydration` 与语音问诊保持同一份归一化口径（频次/用法/剂量/总量/天数 ↔ HIS 字典 + 药品详情轮询 + 库存校验），并在加载 HIS 药房字典后显式按 active storeIds 预热药品目录、在执行科室字典就绪后回填已有推荐的标准 key；药品卡选中后通过 `TreatmentItemEditor.vue` 的自管 `inline` 模式提供与语音侧一致的“一次剂量/频次/用法/总量”主编辑区，其余项目继续走紧凑编辑模式；每条推荐提供"手动匹配 / 重新匹配"入口，弹出共用 `ManualMatchPicker` 从标准库选择候选项，弹层 key 与搜索关键词缓存复用 `features/consultation-result/model/useManualMatchState.ts`；推荐依据 tooltip 开合状态复用 `features/consultation-result/model/useReasonTooltipState.ts`，同类诊断卡片内联下拉开合与候选状态复用 `features/consultation-result/model/useRelatedDiagnosisDropdown.ts`；药品发药药房与检查/检验执行科室通过共用 `RecAttributeChip.vue` chip+popover 选择器设置，未设置时不允许勾选；勾选药品时自动在候选药房中轮询 medicineDetail，并执行库存校验，任一失败则阻止勾选；页面 scoped 样式已原样外置到 `features/symptom-consultation/ui/ConsultationPage.css`；记录页底部操作区现拆分为最终“一键回写”和单独命名的 PHIS 批量引用入口，避免把最终 `complete_consultation` 与引用闭环混用；患者文本读取、既往史解析、患者草稿/诊断预填、诊断 identity / AI 请求防串线、同类诊断候选 / 替换列表更新、AI 诊断 / 治疗推荐原始结果映射、诊断展示分组、诊断 / 治疗事实核查编排、LLM JSON 宽容解析、医嘱文案生成、最终报告数据拼装、完成问诊推荐采纳 / 拒绝埋点编排、诊断/治疗推荐反馈目标落库 / 注册、当前问诊 payload、智能问诊用户日志快照、PHIS 引用 key / 状态图 / 回执归一 / 引用展示判断已开始抽到 `features/symptom-consultation`；`record-confirmed` 回写契约、PHIS 提交治疗选择 / 库存提示 / 处理意见拼装已改为复用 `features/clinical-result`，与语音问诊共用；诊断卡与治疗卡现已接入共用 recommendation feedback popover，提交链路复用 `useVoiceFeedback`，recommendationId 由本页注入的 `feedbackService.saveRecommendation` 结果回填登记；AI 结构化结果采用成功后覆盖、宽容 JSON 抽取和当前诊断上下文校验，避免请求失败或慢响应覆盖已有可用结果 | **已冻结**：禁止净增行数，新功能须先拆出 composable/子组件 |
| **DiagnosisPathWindow.vue** | ~980 | 独立窗口：诊断推理路径可视化（ECharts 图）；真实实现已迁至 `src/features/diagnosis-path/ui/DiagnosisPathWindow.vue`，旧 `src/components/DiagnosisPathWindow.vue` 已删除 | 有独立 Pinia 缓存，注意缓存 key 策略 |
| **ReportInterpretationWindow.vue** | -- | 独立窗口：检验检查报告 AI 解读结果；真实实现已迁至 `src/features/report-interpretation/ui/ReportInterpretationWindow.vue`，旧 `src/components/ReportInterpretationWindow.vue` 已删除 | 不进入问诊事件队列；只读展示；当前基线为单页报告单式纵向阅读版式，注意当前患者上下文、显式 patient 入参的合并规则，以及报告原文元数据/异常项解析不到时的占位展示 |
| **VoiceConsultationNew.vue** | ~3000 | 当前共享结果页实现载体：左侧病例正文编辑，右侧 AI 诊断/治疗推荐与一键回写；消费中性 `ClinicalResultInput`（兼容旧语音 `VoiceIntentResult`），语音抽取结果和症状问诊快照都先经 `features/clinical-result/clinicalResultAdapter.ts` 进入该组件；患者头展示复用 `@entities/patient` 的 `PatientHeader`；结果页 `voice/symptom` 渠道到日志类型、语音缓存开关、患者头展示和取消文案的派生复用 `features/consultation-result/model/useClinicalResultChannelStrategy.ts`，放弃确认弹窗和忙碌态拦截复用 `features/consultation-result/model/useClinicalResultCancelController.ts`，首版 / 诊毕 / 放弃用户日志提交节奏复用 `features/consultation-result/model/useClinicalResultUserLogController.ts`，一键回写回执 success / failed 分发复用 `features/consultation-result/model/useWritebackFeedbackController.ts`，`consultation-reference-feedback` 订阅和当前就诊过滤复用 `features/consultation-result/model/useConsultationReferenceFeedbackListener.ts`，同类诊断下拉状态复用 `features/consultation-result/model/useRelatedDiagnosisDropdown.ts`，语音 editorSnapshot 节流 / 立即持久化复用 `features/voice-consultation/model/useVoiceEditorSnapshotPersistence.ts`，病例字段初始快照 / 修改判断 / 字段反馈展示状态复用 `features/voice-consultation/model/useVoiceRecordFieldFeedbackState.ts`，诊断 / 治疗事实核查状态复用 `features/voice-consultation/model/useVoiceResultFactCheckState.ts`，推荐项 / 病例字段 / 整页反馈提交动作复用 `features/voice-consultation/model/useVoiceFeedbackActions.ts`；页面仍负责缓存恢复、反馈草稿清理、取消事件和 PHIS 回写，语音问诊与智能问诊结果页的诊断鉴别 checklist 弹窗统一在此共享主体内处理；中性输入到可编辑诊断 / 治疗列表的初始化复用 `features/clinical-result/clinicalResultInitialization.ts`，页面只注入标准库匹配、频次/用法推断、治疗归一化和当前病历文本，推荐依据文案 / 条件性用药 / 患者已自行服药 / 默认勾选判断复用 `features/clinical-result/clinicalResultNarrative.ts`，药品字段展示和频次 / 用法候选解析复用 `features/clinical-result/clinicalResultUsageFields.ts`，药房 / 执行科室 / 部位 / 医保候选构造和过滤复用 `features/clinical-result/clinicalResultAttributeOptions.ts`，诊断 key / 标准诊断 id 判断复用 `features/clinical-result/recordConfirmedPayload.ts`，诊断上下文 identity / 治疗编辑器 key 复用 `features/clinical-result/recommendationHelpers.ts`，手动匹配搜索 key 复用 `features/clinical-result/manualMatch.ts`，推荐反馈提交 payload 复用 `features/clinical-result/clinicalResultFeedback.ts`，推荐依据 tooltip 开合状态复用 `features/consultation-result/model/useReasonTooltipState.ts`，推荐反馈弹层开合 / 草稿读取复用 `features/consultation-result/model/useRecommendationFeedbackPopover.ts`，药品频次 / 用法搜索关键字状态复用 `features/consultation-result/model/useMedicineUsageSearch.ts`；药品频次/用法字段通过共用 `MedicineUsageFieldSelector` 组件接 HIS 字典，手动匹配标准库候选选择也抽取为共用 `ManualMatchPicker`；发药药房 / 执行科室门禁判定已与症状问诊收敛到共用 `useTreatmentGates`；结果页 scoped 样式已原样外置到 `features/consultation-result/ui/ClinicalResultEditor.css`；药房列表按 SDK 握手里的 `userRoleDepts` 过滤后从 HIS 动态加载；初始化时必须保留中性输入里的 `matchedItem/matchStatus/selected/manualMatched/药房/执行科室/部位`，只有缺匹配信息时才重新评估标准库；语义相同的 `intentResult` 重复传入时不得重置现场或重拉治疗方案；最终回写 payload 复用 `features/clinical-result/recordConfirmedPayload.ts`，页面只负责 pending 回执字段、等待态和反馈编排；同时编排推荐项反馈与整页评分入口，并在主诊断切换后只提示治疗方案需手动刷新、不自动重拉 | 推荐依据默认应折叠，避免右栏信息过载；hydration / 库存校验已迁移到共用 `useTreatmentHydration`，仅保留 `getCandidatePharmaciesForMedicine`（含失配 storeIds 警告日志）与 `ensureMedicineDefaultPharmacy` 这两段语音特有的本地副作用 |
| **DiagnosisRecommendationCard.vue** | ~250 | 单条诊断推荐卡片子组件；真实实现已迁至 `src/features/consultation-result/ui/DiagnosisRecommendationCard.vue`，旧 `src/components/DiagnosisRecommendationCard.vue` 兼容包装已删除。封装名称/编码/meta token、置信度/匹配度、推荐依据 tooltip、主诊断/移除动作、可选诊断鉴别按钮、同类诊断切换；反馈按钮可通过 `showFeedback=false` 关闭，额外动作与正文区域通过 `actions` / `body` 插槽扩展 | 不拥有诊断集合状态；语音侧与症状侧现都可直接挂接同一个推荐反馈 popover，避免再次复制反馈 UI |
| **TreatmentRecommendationCard.vue** | ~350 | 单条治疗推荐卡片壳组件；真实实现已迁至 `src/features/consultation-result/ui/TreatmentRecommendationCard.vue`，旧 `src/components/TreatmentRecommendationCard.vue` 兼容包装已删除。封装标题行、匹配状态、执行科室/药房 chip、候选标准项确认、摘要文案、反馈/手动匹配/展开按钮；支持 `title-prefix/title-meta/actions/body/manual-match/editor` 插槽和可关闭的反馈入口 | 当前仍是“半抽取”形态，secondary fields / 二级 selector 逻辑仍留在父级；但卡片骨架已不再只服务语音侧 |
| **VoiceRecommendationFeedbackPopover.vue** | -- | 单条诊断 / 治疗推荐反馈弹层；真实实现已迁至 `src/features/voice-consultation/ui/VoiceRecommendationFeedbackPopover.vue`，旧 `src/components/VoiceRecommendationFeedbackPopover.vue` 兼容包装已删除 | 输入问题标签、原因和最终处理动作 |
| **VoiceRecordFeedbackPopover.vue** | -- | 病例字段反馈弹层；真实实现已迁至 `src/features/voice-consultation/ui/VoiceRecordFeedbackPopover.vue`，旧 `src/components/VoiceRecordFeedbackPopover.vue` 兼容包装已删除 | 展示主诉 / 现病史 / 既往史的 AI 原文、医生当前值与前后差异，并提交字段级反馈 |
| **VoiceRecordFieldEditor.vue** | -- | 病例字段受控编辑器；展示字段标题、人工修改标记、反馈按钮、字段反馈弹层和 textarea，父页注入字段值、初始快照、反馈开合、草稿更新和提交回调 | 只做 UI 与事件分发，不提交反馈、不弹 toast、不写日志、不触发回写 |
| **VoiceSessionFeedbackBar.vue** | -- | 语音问诊整页反馈浮层主体；真实实现已迁至 `src/features/voice-consultation/ui/VoiceSessionFeedbackBar.vue`，旧 `src/components/VoiceSessionFeedbackBar.vue` 兼容包装已删除 | 回写成功后弹出，收集评分、点评、整体问题标签 |
| **VoiceCapsule.vue** | ~450 | 语音录制界面：音频采集(PCM16) + 流式传输；真实实现已迁至 `src/features/voice-consultation/ui/VoiceCapsule.vue`，旧 `src/components/VoiceCapsule.vue` 兼容包装已删除 | 配合 audioRecorder + aliyunSpeech |
| **TreatmentItemEditor.vue** | ~150 | 治疗项可编辑字段子组件；真实实现已迁至 `src/features/consultation-result/ui/TreatmentItemEditor.vue`，旧 `src/components/TreatmentItemEditor.vue` 兼容包装已删除。默认 `compact` 模式供症状问诊使用，`inline` 模式把语音侧药品“一次剂量 / 频次 / 用法 / 总量”四格主编辑区也收敛到同一组件 | 仅 UI，不做候选切换或归一化；业务侧需自行调用 `useTreatmentNormalization` |
| **MedicineUsageFieldSelector.vue** | ~340 | 药品频次/用法可搜索下拉子组件；真实实现已迁至 `src/features/consultation-result/ui/MedicineUsageFieldSelector.vue`，旧 `src/components/MedicineUsageFieldSelector.vue` 兼容包装已删除 | 已被语音侧和症状侧同时采用 |
| **ManualMatchPicker.vue** | ~180 | 手动匹配候选弹窗子组件；真实实现已迁至 `src/features/consultation-result/ui/ManualMatchPicker.vue`，旧 `src/components/ManualMatchPicker.vue` 兼容包装已删除。props 中性化为 `candidates: ManualMatchCandidate[]`，不绑定具体业务 | UI 不负责业务逻辑；语音侧需在 select 后调 `applyManualMatch` 跟进药房/执行科室门禁 |
| **RecAttributeChip.vue** | ~310 | 推荐项必填属性 chip+popover 子组件；真实实现已迁至 `src/features/consultation-result/ui/RecAttributeChip.vue`，旧 `src/components/RecAttributeChip.vue` 兼容包装已删除。props 中性化为 `options: AttrOption[]` + `valueText` + `missing`，不绑定具体业务 | 语音侧沉量较重（secondary-selector 从 editor 弹出），本组件供轻量包装 chip 复用 |

### 辅助功能组件

| 组件 | 行数 | 职责 |
|------|------|------|
| **SettingsPanel.vue** | ~890 | 设置页根级历史入口和 shell：负责 tab 编排、当前设置 snapshot 汇总、真实保存策略、toast、埋点、区域化重连和窗口置顶副作用；通用设置页签已抽为受控 UI `features/settings/ui/SettingsGeneralTab.vue`，模型配置页签已抽为受控 UI `features/settings/ui/SettingsModelTab.vue`，音频输入设备枚举/权限探测/devicechange 刷新已下沉到 `features/settings/model/useSettingsAudioInput.ts`，语音接诊录音目录选择已下沉到 `features/settings/model/useSettingsVoiceRecordingDirectory.ts`，保存快照/dirty 状态/Cmd+S 监听已下沉到 `features/settings/model/useSettingsSaveState.ts`，底部保存状态条已抽为 `features/settings/ui/SettingsSaveBar.vue` |
| **HisIntegrationLogPanel.vue** | -- | HIS 联调日志独立视图面板：筛选、查看详情、复制、导出、清空本地 JSONL 日志；真实实现已迁至 `src/features/settings/ui/HisIntegrationLogPanel.vue`，旧 `src/components/HisIntegrationLogPanel.vue` 已删除 |
| **MedicalCatalogCachePanel.vue** | -- | 缓存管理独立视图：当前负责诊断 / 诊疗项目 / 药品等基础目录缓存状态、同步和按目录 / 机构 / 租户 / 药房清理；真实实现已迁至 `src/features/medical-catalog/ui/MedicalCatalogCachePanel.vue`，旧 `src/components/MedicalCatalogCachePanel.vue` 已删除 |
| **FeedbackSubmissionPanel.vue** | ~560 | 统一问题反馈面板（一键回写 + 右上角入口共用），紧凑星级 + 问题标签 + 选填截图；真实实现已迁至 `src/features/feedback/ui/FeedbackSubmissionPanel.vue`，旧 `src/components/FeedbackSubmissionPanel.vue` 已删除 |
| **AnalyticsPanel.vue** | ~1200 | 数据分析看板（ECharts）；真实实现已迁至 `src/features/analytics/ui/AnalyticsPanel.vue`，旧 `src/components/AnalyticsPanel.vue` 已删除，App 通过 `@features/analytics` 公开入口消费 |
| **KnowledgePanel.vue** | ~850 | PMPHAI 医学知识检索；真实实现已迁至 `src/features/knowledge/ui/KnowledgePanel.vue`，旧 `src/components/KnowledgePanel.vue` 已删除 |
| **BodyPartSelector.vue** | ~830 | 人体部位交互选症状（分性别）；真实实现已迁至 `src/features/symptom-consultation/ui/BodyPartSelector.vue`，旧 `src/components/BodyPartSelector.vue` 已删除 |
| **ChatPanel.vue** | ~670 | LLM 聊天界面（流式 + Markdown） |
| **KnowledgeBasePanel.vue** | ~560 | 内置知识库搜索（备选通道）；真实实现已迁至 `src/features/knowledge/ui/KnowledgeBasePanel.vue`，旧 `src/components/KnowledgeBasePanel.vue` 已删除 |
| **FactCheckWidget.vue** | ~470 | AI 回答事实核查浮窗；真实实现已迁至 `src/features/feedback/ui/FactCheckWidget.vue`，旧 `src/components/FactCheckWidget.vue` 兼容包装已删除 |
| **ReceptionCapsule.vue** | ~370 | 患者接诊胶囊（快速信息展示）；真实实现已迁至 `src/features/reception-risk/ui/ReceptionCapsule.vue`，旧 `src/components/ReceptionCapsule.vue` 已删除 |
| **SystemCategorySelector.vue** | ~360 | 按系统分类选症状；真实实现已迁至 `src/features/symptom-consultation/ui/SystemCategorySelector.vue`，旧 `src/components/SystemCategorySelector.vue` 已删除 |
| **UpdateChecker.vue** | ~330 | 应用自动更新检查/安装；真实实现已迁至 `src/features/settings/ui/UpdateChecker.vue`，旧 `src/components/UpdateChecker.vue` 已删除，设置页和强更门禁通过 `@features/settings` 公开入口消费 |
| **ForceUpdateGate.vue** | ~130 | 区域化强制更新门禁，只展示版本要求并嵌入 `UpdateChecker` 执行检查、下载和重启；真实实现已迁至 `src/features/settings/ui/ForceUpdateGate.vue`，旧 `src/components/ForceUpdateGate.vue` 已删除，App 通过 `@features/settings` 异步消费 |
| **RiskAlertBubble.vue** | ~315 | 风险提醒气泡；真实实现已迁至 `src/features/reception-risk/ui/RiskAlertBubble.vue`，旧 `src/components/RiskAlertBubble.vue` 已删除 |
| **RiskAlertPanel.vue** | ~290 | 患者风险警报面板；真实实现已迁至 `src/features/reception-risk/ui/RiskAlertPanel.vue`，旧 `src/components/RiskAlertPanel.vue` 已删除；`RiskItem` 类型从 `@features/reception-risk` 导入 |
| **FactCheckHighlight.vue** | ~306 | 行内事实核查标注；真实实现已迁至 `src/features/feedback/ui/FactCheckHighlight.vue`，旧 `src/components/FactCheckHighlight.vue` 兼容包装已删除 |
| **FactCheckNotification.vue** | ~250 | 事实核查通知 Toast；真实实现已迁至 `src/features/feedback/ui/FactCheckNotification.vue`，旧 `src/components/FactCheckNotification.vue` 兼容包装已删除 |
| **KnowledgeDetailModal.vue** | ~380 | 知识文档详情弹窗；真实实现已迁至 `src/features/knowledge/ui/KnowledgeDetailModal.vue`，旧 `src/components/KnowledgeDetailModal.vue` 已删除 |
| **KnowledgeResultItem.vue** | ~170 | 知识搜索结果行；真实实现已迁至 `src/features/knowledge/ui/KnowledgeResultItem.vue`，旧 `src/components/KnowledgeResultItem.vue` 已删除 |
| **Toast.vue** | ~150 | 全局通知；真实实现已迁至 `src/shared/ui/Toast.vue`，旧 `src/components/Toast.vue` 兼容包装已删除，全局 provider 直接使用 shared 实现 |
| **LoadingSpinner.vue** | ~100 | 通用加载动画；真实实现已迁至 `src/shared/ui/LoadingSpinner.vue`，旧 `src/components/LoadingSpinner.vue` 兼容包装已删除 |
| **Icon.vue** | ~60 | 通用 Iconify 图标包装；真实实现已迁至 `src/shared/ui/Icon.vue`，旧 `src/components/Icon.vue` 兼容包装已删除；依赖 `src/icons/iconifyCollections.ts` 注册精简离线图标集合，新增图标时需同步该集合 |
| **IconShowcase.vue** | ~350 | 图标展示（测试用）；真实实现已迁至 `src/shared/ui/IconShowcase.vue`，旧 `src/components/IconShowcase.vue` 已删除，不进入业务功能域 |

---

## Composables (`src/composables/`)

可复用逻辑层，从 App.vue 抽离的业务编排。

| 模块 | 行数 | 职责 | 关键导出 |
|------|------|------|---------|
| **useEventListeners.ts** | ~575 | 全局事件枢纽：HIS HTTP 事件、深链接、鼠标/窗口事件、Tauri 事件监听；`start-voice-consultation` 会按目标患者判断是否恢复未提交语音缓存，同患者有缓存则恢复结果页，否则开启新语音会话；仅在已处于录音胶囊页时对重复请求做幂等处理；App 级 Tauri 事件注册/解绑样板已复用 `shared/composables/useTauriEventListener.ts` 并按原顺序批量显式启动，接诊状态机已下沉到 `app/events/useReceptionController.ts`，SDK handshake 初始化已下沉到 `app/events/useSdkHandshakeController.ts` | HIS 事件绑定、deep link 处理、window 事件和事件分发；后续继续按事件域拆 controller |
| **useReceptionController.ts** | ~505 | App 级接诊状态机，位于 `src/app/events/useReceptionController.ts`；处理 HIS 患者补全、过敏史 / 历史就诊摘要合并、同患者并发接诊复用、自动静默接诊 guard、患者切换时语音缓存 / 最小化入口清理，以及风险胶囊加载 | 不注册 Tauri 事件、不处理 SDK handshake、不打开具体问诊 / 语音结果页、不提交 PHIS 回写 |
| **useSdkHandshakeController.ts** | ~240 | App 级 SDK handshake controller，位于 `src/app/events/useSdkHandshakeController.ts`；解析 handshake payload 的 HIS origin/token、机构/租户、角色科室和 URT，初始化 / 重置 HIS 服务与反馈 actor，并同步医学目录上下文 | 不注册 Tauri 事件、不读写患者上下文、不打开页面、不提交 PHIS 回写 |
| **useWindowManagement.ts** | ~422 | 窗口位置/尺寸/显示器管理；真实实现已迁至 `src/app/shell/useWindowManagement.ts`，旧 `src/composables/useWindowManagement.ts` 兼容 re-export 已删除 | `saveWindowPosition()`, `restoreWindowPosition()`, `smartExpand()`, `resizeWorkWindow()` |
| **useWorkMode.ts** | ~422 | 球体 <-> 工作面板的切换；真实实现已迁至 `src/app/shell/useWorkMode.ts`，旧 `src/composables/useWorkMode.ts` 兼容 re-export 已删除 | `enterWorkMode()`, `exitWork()`, `handleCollapse()` |
| **useSymptomConsultationCache.ts** | -- | 智能问诊未结束现场缓存；按就诊锚点保存内部页面、症状/表单、病历草稿、诊断/推荐和引用状态；诊毕/放弃清理，跨自然日失效 | `read/write/clear` 快照 |
| **useConsultationRecordDraftGeneration.ts** | -- | 智能问诊病历草稿生成 controller：先用 `consultationRecordAiDraft.ts` 构造基层全科模板风格的 LLM 请求并解析 JSON 主诉/现病史，失败时退回 `consultationGeneratedRecord.ts` 本地规则草稿 | `generateRecordDraft()`, `buildLocalDraft()` |
| **useVoiceConsultation.ts** | -- | 语音录制 -> 转写 -> 病历生成；按 `consultationId` 缓存语音病例解析结果并支持重启后恢复未提交结果；缓存 key、跨自然日失效、base entry 读写 / 清理和 editorSnapshot 增量合并已抽到 `src/features/voice-consultation/model/voiceConsultationCache.ts` | 录制控制、转写回调、结果提交、窗口切换、toast、取消/错误结果写回 |
| **useVoiceIntentRecognition.ts** | -- | 语音结构化抽取：真实实现位于 `src/features/voice-consultation/model/useVoiceIntentRecognition.ts`，旧 `src/composables/useVoiceIntentRecognition.ts` 仅保留兼容 re-export；把医患对话整理成病例草稿、诊断/检查/药品提示，并保留 explicit/inferred 来源标记与处方核心字段，供 `VoiceConsultationNew.vue` 直接落地到可编辑结果页；同时在抽取后分流“条件性用药”和“患者已自行服用药”，避免误入当前处方候选；LLM JSON 候选抽取复用 `features/clinical-result/clinicalResultLlmJsonParser.ts`，结构校验与一次修复流程留在语音域 model | LLM 抽取、结果结构校验、一次修复重试、目录匹配、结构归一、治疗项后处理；不处理缓存恢复、PHIS 回写、窗口切换或诊毕 / 放弃 |
| **clinicalResultLlmJsonParser.ts** | -- | 问诊结果共享 LLM JSON 宽容解析器：真实实现位于 `src/features/clinical-result/clinicalResultLlmJsonParser.ts`；症状问诊旧 `consultationLlmJsonParser.ts` 仅兼容重导出，语音结果页诊断 / 治疗推荐解析复用同一套去 BOM、markdown fence、平衡括号候选扫描和错误包装 | 不调用 LLM、不弹 toast、不写日志、不读写 Vue ref 或页面状态 |
| **clinicalResultAiRequest.ts** | -- | 问诊结果共享 AI 请求规格 helper：真实实现位于 `src/features/clinical-result/clinicalResultAiRequest.ts`；构造 diagnosis、medication、exam、lab_test、procedure 推荐的 chat messages 与 trace config，支持单路和多路治疗推荐规格；prompt 资产由调用方注入，trace 基础字段和具体 scene/title/action 可注入且默认保持语音问诊取值 | 不调用 `chat`、不改 loading、不处理错误、不写日志、不读写 Vue ref / 缓存 / PHIS |
| **clinicalResultAiMapping.ts** | -- | 问诊结果共享 AI raw 映射 helper：真实实现位于 `src/features/clinical-result/clinicalResultAiMapping.ts`；把语音结果页诊断 raw 标准库匹配、治疗 raw catalog assessment / normalize 组合、多路治疗响应解析失败隔离和合并，以及智能问诊 western 诊断 raw 策略化匹配、western 治疗 raw 数组按目标类型过滤转换从页面中抽离，匹配 / normalize / parser / parse-error 回调由页面注入 | 不调用 LLM、不弹 toast、不写日志、不读写 Vue ref、不触发事实核查 / 缓存 / PHIS |
| **clinicalResultTreatmentFields.ts** | -- | 问诊结果共享治疗字段归一 helper：真实实现位于 `src/features/clinical-result/clinicalResultTreatmentFields.ts`；把 AI raw 中的 `quantity/count/amount` 等数量别名归一到 `totalQty/totalUnit`，并提供执行科室当前值到标准 key 的同步函数，供语音问诊、智能问诊和独立诊疗方案复用；执行科室本身必须来自医生选择或 HIS 项目详情 hydrate，不从 AI raw 反填 | 纯函数，不调用 HIS、不改选中态、不弹 toast、不触发 hydrate / 库存 / PHIS |
| **treatmentRequiredFields.ts** | -- | 问诊结果共享治疗项必要字段校验 helper：真实实现位于 `src/features/clinical-result/treatmentRequiredFields.ts`；按用药、检查、检验、处置分别校验 `record-confirmed.orderList` 必需字段，并可复用 `useClinicalResultWritebackPayload` 暴露的 order resolver 保持校验口径与最终 payload 一致；执行科室、医保限用、药品总量等被医生清空时只认当前控件空值，不从匹配元数据或默认值补回 | 纯函数，不调用 HIS、不 hydrate、不弹 toast、不打开编辑器、不修改治疗项 |
| **useMedicalDictionaries.ts** | ~145 | HIS 字典统一加载：真实实现已迁至 `src/features/consultation-result/model/useMedicalDictionaries.ts`，旧 `src/composables/useMedicalDictionaries.ts` 兼容 re-export 已删除；负责频次 / 用法 / 发药药房 / 执行科室数据加载，不携带页面特有副作用，调用方需在 `loadPharmacyOptions/loadAllDictionaries` 之后自行补药品目录预热、执行科室 key 同步等后置动作。语音问诊与症状问诊共用 | `frequencyOptions/routeOptions/pharmacyOptions/execDeptOptions` refs、`loadXxxOptions()` |
| **useTreatmentNormalization.ts** | ~290 | 治疗项归一化：真实实现已迁至 `src/features/consultation-result/model/useTreatmentNormalization.ts`，旧 `src/composables/useTreatmentNormalization.ts` 兼容 re-export 已删除；把部分字段补齐为完整 `TreatmentRecommendation`，沿用 HIS 默认值（频次 / 用法 / 剂量 / 总量）+ 自动估算总量；通过 `ensurePharmacy`/`isExecDeptSatisfied` 回调向调用方注入业务侧副作用 | `normalize()`、`findFrequencyOptionByValue/findRouteOptionByValue`、`getFrequencyExecCount` |
| **useTreatmentGates.ts** | ~135 | 治疗项门禁逻辑：真实实现已迁至 `src/features/consultation-result/model/useTreatmentGates.ts`，旧 `src/composables/useTreatmentGates.ts` 兼容 re-export 已删除；`isPharmacyRequired/isExecDeptRequired`、`hasRequiredPharmacy/hasRequiredExecDept`、`getCandidatePharmaciesForMedicine`（按药品 storeIds 收窄候选药房）、`ensurePharmacy`（默认取首个候选）；执行科室必填覆盖检查、检验和处置，必填判断只认当前已选 `execDept`，医生清空后不再从 `matchedItem` 或 raw 兜底显示 | 不做副作用（如 medicineDetail 轮询），如需库存校验在调用方处理 |
| **useDiagnosisSelection.ts** | ~100 | 诊断推荐选择状态：真实实现位于 `src/features/consultation-result/model/useDiagnosisSelection.ts`；管理诊断勾选集合、主诊断、替换诊断后 key 同步和移除时兜底主诊断 | 只做状态规则，不触发治疗刷新、AI 请求、toast、反馈注册或 PHIS 回写 |
| **useManualMatchState.ts** | ~80 | 治疗推荐手动匹配弹层状态：真实实现位于 `src/features/consultation-result/model/useManualMatchState.ts`；管理当前打开的手动匹配 key、每条推荐的搜索关键词和打开时默认关键词 | 只做 UI 状态，不访问标准库、不应用匹配、不触发药房/执行科室/库存后置动作 |
| **useClinicalResultPatientContext.ts** | ~55 | 结果页患者展示 / 就诊锚点派生：真实实现位于 `src/features/consultation-result/model/useClinicalResultPatientContext.ts`；根据当前 patient 派生姓名、性别、年龄、`idTet`、anchorId 和 `consultationId` | 不补全患者、不切换患者、不读写缓存、不拼装 PHIS payload |
| **useClinicalResultIntentReset.ts** | -- | 结果页 intent 初始化重置：真实实现位于 `src/features/consultation-result/model/useClinicalResultIntentReset.ts`；新 `intentResult` 到来时清理上一次结果页现场、回填病历字段并设置病例字段初始快照 | 不触发 AI 请求、不叠加缓存快照、不事实核查、不注册推荐、不提交用户日志或 PHIS 回写 |
| **useClinicalResultWritebackPayload.ts** | -- | 结果页最终回写清单 controller：真实实现位于 `src/features/consultation-result/model/useClinicalResultWritebackPayload.ts`；组合已选诊断 / 治疗推荐生成 `diagList` 与 `orderList`，复用 `features/clinical-result/recordConfirmedPayload.ts` 的纯 builder，并导出同一份 order resolver 供提交前必要字段校验复用 | 不调用 `complete_consultation`、不做库存校验、不弹 toast、不提交日志、不清缓存 |
| **useClinicalResultWritebackPreflight.ts** | -- | 结果页最终回写前置门禁 controller：真实实现位于 `src/features/consultation-result/model/useClinicalResultWritebackPreflight.ts`；按既有顺序编排标准诊断匹配、药品详情、库存、药房、执行科室、检查部位和治疗项必要字段校验，并返回可提交的已选治疗 | 不调用 `complete_consultation`、不构造 PHIS payload、不改提交状态、不提交日志、不清缓存、不改写治疗选择 |
| **useVoiceFeedbackActions.ts** | -- | 语音结果页反馈提交动作 controller：真实实现位于 `src/features/voice-consultation/model/useVoiceFeedbackActions.ts`；编排诊断 / 治疗推荐反馈、病例字段反馈和整页反馈的提交、成功 toast、弹层关闭与完成回调 | 不读取缓存、不提交用户日志、不调用 PHIS 回写、不触发 AI、不登记推荐目标 |
| **useVoiceFeedback.ts** | -- | 症状问诊和语音结果页共用反馈编排：真实实现位于 `src/features/feedback/model/useVoiceFeedback.ts`；管理推荐 target 登记、推荐 / 病例字段 / 整页反馈草稿、提交本地 feedbackService 和 voice feedback backend payload 队列 | 不弹 toast、不提交用户日志、不调用 PHIS 回写、不触发 AI、不关闭结果页 |
| **useSecondarySelector.ts** | ~125 | 治疗推荐二级搜索下拉（药房 / 执行科室 / 部位 / 医保）的统一状态：真实实现已迁至 `src/features/consultation-result/model/useSecondarySelector.ts`，旧 `src/composables/useSecondarySelector.ts` 兼容 re-export 已删除；按 `getEditorKey(rec) + ':field'` 唯一寻址 | 仅状态管理，不做候选过滤；过滤词通过 `resolveFilterKeyword(keyword, currentValue)` 共享口径 |
| **useTreatmentSections.ts** | ~70 | 治疗推荐展示派生：真实实现位于 `src/features/consultation-result/model/useTreatmentSections.ts`；按治疗类型生成展示分组、是否存在推荐和空状态文案 | 不触发 AI 刷新、不改变治疗项选中、不校验库存、不提交反馈或 PHIS 回写 |
| **useTreatmentEditorState.ts** | ~100 | 治疗项编辑器轻状态：真实实现位于 `src/features/consultation-result/model/useTreatmentEditorState.ts`；管理展开的治疗项 key 集合、当前 active 字段 key、字段 DOM 注册与 focus | 不归一化治疗项、不写回字段、不触发库存/字典/二级选择器副作用 |
| **useMedicineFieldEditing.ts** | -- | 药品用法用量字段编辑 controller：真实实现位于 `src/features/consultation-result/model/useMedicineFieldEditing.ts`；编排字段激活、blur 收口、频次 / 用法 keyword 解析写回、总量输入和库存 warning 清理 | 不改变治疗项选中、不打开二级属性、不触发 AI 请求、不弹 toast、不提交 PHIS 回写 |
| **useTreatmentPharmacyResolution.ts** | -- | 治疗药房解析：真实实现位于 `src/features/consultation-result/model/useTreatmentPharmacyResolution.ts`；统一药品候选药房收窄、默认药房、已选药房匹配、药房名称归一化和详情加载后的默认药房填充 | 不触发库存校验、不改变治疗项选中、不清空字段、不弹 toast、不拉取药品详情、不提交 PHIS 回写 |
| **useTreatmentSelectionReadiness.ts** | -- | 治疗项选中前置校验：真实实现位于 `src/features/consultation-result/model/useTreatmentSelectionReadiness.ts`；统一药品详情、药房、执行科室、检查部位、治疗项必要字段和库存门禁，并通过注入回调打开对应编辑入口 / 提示 | 不修改 `selected`、不应用手动匹配、不刷新 AI、不提交 PHIS 回写 |
| **useTreatmentQuickSelector.ts** | ~45 | 治疗项 quick selector 打开编排：真实实现位于 `src/features/consultation-result/model/useTreatmentQuickSelector.ts`；封装展开治疗编辑器、打开药房 / 执行科室 / 部位二级选择器并聚焦输入框 | 不过滤候选、不写回字段、不清空字段、不校验库存、不弹 toast |
| **useTreatmentAttributeSearch.ts** | -- | 治疗项二级属性候选搜索：真实实现位于 `src/features/consultation-result/model/useTreatmentAttributeSearch.ts`；统一药房 / 执行科室 / 部位 / 医保的 keyword 读写、候选构造和过滤列表派生 | 不写回字段、不清空字段、不取消选中、不触发库存校验、不弹 toast、不提交 PHIS 回写 |
| **useWritebackStatus.ts** | ~90 | 最终一键回写等待态：真实实现位于 `src/features/consultation-result/model/useWritebackStatus.ts`；管理 pending requestId、等待提示、最近回执、按钮文案和 banner 文案，供共享结果页入口复用 | 不监听 Tauri 事件、不调用 `invoke`、不弹 toast、不提交日志；页面负责成功/失败后的业务副作用 |
| **useConsultationReferenceFeedbackListener.ts** | -- | PHIS 回执事件入口：真实实现位于 `src/features/consultation-result/model/useConsultationReferenceFeedbackListener.ts`；管理 `consultation-reference-feedback` 事件名、当前 `consultationId` 防串线和 Tauri listener 生命周期组合，供语音问诊和智能问诊复用 | 不做 requestId 匹配、不写引用状态 map、不弹 toast、不提交日志、不清缓存 |
| **useBodySiteOptions.ts** | ~65 | 检查项目（exam）部位选项落地：真实实现已迁至 `src/features/consultation-result/model/useBodySiteOptions.ts`，旧 `src/composables/useBodySiteOptions.ts` 兼容 re-export 已删除；`applyMedicalItemPartOption(rec, option)` 把单个部位选项写入 `bodySite/bodySiteId/matchedItem.idPart + raw`；`applyMedicalItemPartOptions(rec, options)` 批量加载，优先匹配当前 partId，否则单选项时自动应用 | HIS 拉取（`his.fetchMedicalItemPartOptions`）由调用方完成，本 composable 不持副作用 |
| **useTreatmentHydration.ts** | ~310 | 真实实现已迁至 `src/features/consultation-result/model/useTreatmentHydration.ts`，旧 `src/composables/useTreatmentHydration.ts` 兼容 re-export 已删除；抽自语音问诊的"药品详情轮询 + 库存校验"核心：`hydrateMatchedMedicineDetail`（在 `getCandidatePharmaciesForMedicine` 候选药房中依次拉取 `fetchMedicineProDetail`，回填 dose/freq/route/spec/totalUnit/pharmacy + 在 `matchedItem.raw` 上打 `__medicineDetailLoaded`）、`ensureMedicineSelectable`、`checkMedicineInventoryEnough` + warning/checking 状态映射。语音问诊与症状问诊共用；非药品详情 / 检查部位仍由调用方编排 | 注入 `notify`，不持有 UI 状态（quick selector、editor expansion 等由调用方处理） |
| **useOutsideInteraction.ts** | -- | 通用 document 外部点击 / pointerdown 生命周期 composable，位于 `src/shared/composables/useOutsideInteraction.ts`；按 selector 或 element refs 判断点击是否落在浮层锚点外部，并调用注入的关闭回调 | 不包含推荐、症状、反馈业务状态；页面或 feature model 自行决定关闭哪些浮层 |
| **useTauriEventListener.ts** | -- | 通用 Tauri `listen` 生命周期 composable，位于 `src/shared/composables/useTauriEventListener.ts`；支持 mounted 自动订阅或显式 `startListener()`，unmounted 阶段统一解绑，统一输出订阅失败日志，并可在显式注册链路中传播失败 | 不包含事件 payload 业务过滤、PHIS 回执处理、下载进度、toast 或页面状态写入 |
| **useTauriWindowEventListeners.ts** | -- | 通用独立窗口 `appWindow.listen` 生命周期 composable，位于 `src/shared/composables/useTauriWindowEventListeners.ts`；支持批量显式 `registerListeners()`、unmounted 统一解绑和注册失败日志，当前用于诊断路径窗口与报告解读窗口 | 不发送 ready 事件、不写 payload 状态、不渲染图表、不处理窗口业务状态 |
| **useNavigation.ts** | -- | 视图导航；真实实现已迁至 `src/app/navigation/useNavigation.ts`，旧 `src/composables/useNavigation.ts` 兼容 re-export 已删除 | `openSettings()`, `openConsultation()`, `openChat()` 等 |

**依赖链**：
```
useWindowManagement (基础) <- useWorkMode (依赖位置管理)
useWorkMode <- useNavigation (视图切换在工作模式内)
useEventListeners (全局事件) -> 触发 useNavigation & useWorkMode
```

---

## Services (`src/services/`)

外部通信、数据转换、业务逻辑层。

### 核心服务

| 服务 | 行数 | 职责 | 关键接口 |
|------|------|------|---------|
| **llm.ts + services/llm/** | facade 333 + 子模块 420 | LLM API facade 与底层 OpenAI 兼容客户端：`llm.ts` 保留公开 API 和区域化 trace 编排；`services/llm/config.ts` 解析本地/区域化配置，`retry.ts` 提供指数退避，`payload.ts` 负责消息 payload / 摘要，`localOpenAiClient.ts` 负责本地 chat / stream / transcription 协议细节 | `chatStream()`, `chat()`, `chatFast()`, `transcribeAudio()`, `analyzePatientRisks()`, `getLLMConfig()` |
| **medicalData.ts** | ~600 | 医学数据目录加载、缓存恢复与匹配（ICD-10 诊断/药品/检查项）；运行期不再依赖本地 CSV 作为数据来源，而是优先恢复已有 SQLite / localStorage 缓存，再按模式补同步：本地模式优先走 HISService 并把结果写入本地 SQLite，区域化模式继续走远端 delta；诊疗项目缓存按机构+租户隔离，药品缓存按机构+租户+药房 `storeId` 隔离，并保留 `storeIds` 用于当前药房集合并集匹配；同时暴露调试态查询/清理能力 | 模糊匹配 + 拼音支持 |
| **diagnosisPath.ts** | ~568 | 诊断推理路径生成 | ECharts 节点/连线数据，ICD-10 匹配 |
| **pmphai.ts** | ~806 | PMPHAI 医学知识库（主通道） | 向量搜索、列表搜索、文档检索、OAuth 令牌管理 |
| **textGeneration.ts** | ~281 | 症状字段文本规则兜底 | 症状字段 -> 本地主诉/现病史片段；当前作为 AI 病历草稿失败时的兜底，不直接调用 LLM |

### 语音服务

| 服务 | 行数 | 职责 |
|------|------|------|
| **aliyunSpeech.ts** | ~275 | 语音转写编排：阿里云 DashScope 实时优先，兼容 OpenAI 风格批量转写兜底 |
| **speechConfig.ts** | -- | 统一管理语音转写 provider / API Key / Base URL / Model 配置，并兼容旧配置迁移 |
| **audioRecorder.ts** | ~317 | 浏览器音频录制（Web Audio API, PCM16），并统一处理输入设备枚举、首选设备持久化、首开权限预热和失效回退 |

### 辅助服务

| 服务 | 行数 | 职责 |
|------|------|------|
| **hisService.ts** | ~80 | @internal 底层 PHIS HTTP 客户端；仅供 `services/his/*` 包装使用。业务代码禁止跨层 import，必须走 [his](src/services/his/index.ts) 入口（业务调用 `getHisAdapter()`；SDK handshake 走 `getHisService()`）；底层 `post/get` 会写入 HIS 联调出站日志；诊断目录按 1000 条/页循环同步，避免弱网下一次性拉取数万条超时；封装检查项目部位 / 方式候选查询 |
| **hisIntegrationLog.ts** | -- | HIS 联调日志 Tauri 客户端：结构化记录、查询、清空、导出 Bridge / PHIS 调用流水 |
| **his/HisAdapter.ts** | ~120 | 厂商无关的 HIS 适配器接口契约，14 个方法分 5 组（会话 / 目录 / 字典 / 详情 / 检查部位）；新厂商接入只需实现本接口 |
| **his/types.ts** | ~140 | vendor-neutral DTO：详情（`MedicineDetail` / `MedicalItemDetail`）+ 检查部位（`MedicalItemPartOption`）+ 目录（`DiagnosisCatalogEntry` / `MedicineCatalogEntry` / `MedicalItemCatalogEntry`）+ 字典（`DictionaryEntry`）+ 库存（`InventoryCheckRequest` / `InventoryCheckResult`）；语义化字段命名，PHIS 私有字段统一通过 `raw` / `properties` 透传 |
| **his/PhisHisAdapter.ts** | ~120 | 默认厂商实现：thin wrapper 包装 `HisService` 类，详情与检查部位方法在此处把 PHIS 字段映射为中性 DTO |
| **his/MockHisAdapter.ts** | ~150 | 内置 mock 实现：不连接任何后端，返回固定样本数据。主要用于反向验证抽象是否充分 + 本地 demo / E2E；已在 registry 中预注册（vendor='mock'） |
| **his/registry.ts** | ~100 | 适配器注册表与选择器；`getHisAdapter()` 是业务方唯一入口；选择优先级 setActiveHisVendor > VITE_HIS_VENDOR > localStorage.HIS_VENDOR > 默认 phis |
| **his/index.ts** | ~30 | 公开入口：重出 adapter / 注册 API / 类型 |
| **medical_catalog.rs** | -- | 医学目录 SQLite 持久化命令：诊断全局缓存、诊疗项目按机构+租户缓存、药品按机构+租户+药房缓存与同步状态管理，并提供调试态查看/清理命令 | 供 `medicalData.ts` 调用 |
| **factChecker.ts** | ~399 | AI 输出验证（医学指南核查） |
| **feedback.ts** | ~312 | 反馈与结构化操作日志落库/双写：把前端事件转换为区域化审计需要的 `module/action/result/details` 载荷 |
| **featureUsageTracker.ts / featureUsageEntryTracker.ts** | -- | 辅诊功能调用统计事件入口：区域化模式下按产品功能维度向 `/v1/client/feature-events/batch` 上报一次真实用户调用，默认用本地队列事件自身 `idempotencyKey` 支持离线/重试去重；`featureUsageEntryTracker.ts` 归一 HIS Bridge 的完整问诊、语音问诊和独立辅助入口计数，同一就诊再次显式触发入口按新调用计数，与 `operationTracker.ts` 的审计日志和 `consultationUserLog.ts` 的运维日志分离 |
| **voiceFeedback.ts** | -- | 语音反馈 payload 组装、本地草稿、病例字段差异摘要与待同步队列；通过 `submitVoicePendingPayloadToBackend` 映射到统一 `/v1/client/feedbacks` |
| **aiTrace.ts** | ~200 | AI 调用链路缓存 + AI 代理结构化日志桥：补齐 traceId、scene、sourceModule 以及业务发起方 |
| **knowledgeBase.ts** | ~213 | 通用知识库 CRUD |
| **regionalClient.ts + services/regional/** | facade 32 + 子模块 994 | 区域化核心客户端 facade 与内部模块：`regionalClient.ts` 保留兼容导出；`services/regional/config.ts` 管理开关/连接配置，`device.ts` 负责 MAC/兜底设备编码，`registration.ts` 负责终端注册和 token，`httpClient.ts` 负责签名 HTTP 请求、服务端时间偏移校准、请求超时和 `SIG-401` 重签重试，`bootstrap.ts` 负责 bootstrap 缓存/初始化/心跳，`realtime.ts` 负责 SSE 与 WebSocket 签名 URL，`speechUpload.ts` 负责语音上传 payload；所有 `/v1/*` 出口必须继续经过签名模块 |
| **regionalRuntime.ts** | ~50 | 区域化运行时编排：统一初始化、重连、远程数据同步、审计上传启停 |
| **userFeedback.ts** | ~150 | 统一反馈提交服务（kind/severity/tags/hasCorrection），自动附加 doctor/org/dept actor 与 aiTrace |
| **consultationUserLog.ts** | -- | 运维用户日志上报服务：智能问诊/语音问诊首版 AI 内容与最终提交内容快照，按 `consultationId + consultationType` 聚合到后台用户日志模块 |
| **feedbackContext.ts** | ~80 | 反馈上下文：握手阶段缓存当前医生/机构/科室身份，供反馈提交回填 |
| **themeService.ts** | ~209 | 主题管理（深色/浅色模式） |
| **reportGenerator.ts** | ~152 | 最终报告生成 |
| **promptGuard.ts** | ~138 | 提示词注入防护 |
| **operationTracker.ts** | ~105 | 结构化操作日志白名单入口：过滤低价值 UI 噪声，只保留能定位业务路径的导航、提交、接诊、风险、反馈等事件 |
| **templateService.ts** | ~65 | 症状模板加载 |

**服务依赖**：
```
llm.ts <- factChecker.ts, diagnosisPath.ts, textGeneration.ts
his/HisAdapter.ts -> his/PhisHisAdapter.ts -> hisService.ts
his/registry.ts -> his/PhisHisAdapter.ts
his/index.ts -> medicalData.ts
his/index.ts -> VoiceConsultationNew.vue
hisService.ts -> medicalData.ts
medical_catalog.rs -> medicalData.ts
medicalData.ts <- diagnosisPath.ts, ConsultationPage.vue
pmphai.ts (独立知识库服务)
speechConfig.ts -> aliyunSpeech.ts, ChatPanel.vue, SettingsPanel.vue
aliyunSpeech.ts <- audioRecorder.ts (音频流)
```

---

## Stores (`src/stores/`)

Pinia 跨组件共享状态（仅两个，新增需人工审批）。

| Store | 职责 | 关键状态 |
|-------|------|---------|
| **consultationConfig.ts** | 问诊模式/患者状态 | `patientInfo`, `consultationMode`, `selectedDiagnosis`, `generatedRecord` |
| **diagnosisPath.ts** | 诊断路径缓存（跨窗口共享） | `diagnosisPathCache`（按患者+目标诊断键控） |

---

## Types (`src/types/`)

| 文件 | 职责 | 关键接口 |
|------|------|---------|
| **consultation.ts** | 问诊域类型 | `Diagnosis`, `Patient`, `TreatmentRecommendation`, `FinalRecord` |
| **appState.ts** | 应用级状态类型 | `PatientContext`, `AppPatient`, `AppStore`, `ViewType` |
| **patientContext.ts** | 统一患者上下文类型 | `PatientContext` 及 identity / demographics / clinical 子结构 |
| **consultationAssist.ts** | 灵活模式类型 | `ConsultationAssistRequest`, `DiagnosisPathOption` |
| **reportInterpretation.ts** | 报告解读域类型 | `ReportInterpretationRequest`, `ReportInterpretationPayload`, `ReportInterpretationPatientContext` |
| **feedback.ts** | 操作追踪类型 | `FeedbackEvent`, `SessionMetrics` |

## 患者上下文约束

1. `src/composables/useEventListeners.ts` 是唯一 App 级 HIS 事件入口；患者补全、自动接诊 guard 与风险胶囊写入由 `src/app/events/useReceptionController.ts` 统一承接。
2. 外部事件（接诊、风险、问诊、语音）只允许提供患者主键和场景字段；标准患者基本信息与就诊历史必须通过 `HisAdapter.fetchPatientInfo/fetchPatientHistory` 获取。
3. UI / AI prompt / 日志 / 缓存读取患者信息时，统一走 `PatientContext` 或对应 helper，不再各自做别名兼容。

---

## Constants (`src/constants/`)

| 文件 | 职责 |
|------|------|
| **windowSizes.ts** | 各视图窗口尺寸（chat: 900x600, consultation: 1200x900, voice: 360x80 等） |
| **animation.ts** | 动画时长、缓动、窗口尺寸容差阈值 |
| **consultationConfig.ts** | 问诊 UI 配置 |

---

## Rust 后端 (`src-tauri/src/`)

| 文件 | 行数 | 职责 |
|------|------|------|
| **lib.rs** | ~390 | Tauri 初始化、窗口命令（拖拽/位置/毛玻璃）、AppState 共享状态 |
| **http_server.rs** | ~831 | HIS Bridge（Actix-web, `127.0.0.1:8081`）：REST 命令、WebSocket 事件订阅、长轮询兜底、引用回执、语音触发、报告解读触发，并为入站联调请求生成 `traceId` 与结构化日志 |
| **aliyun_speech.rs** | ~326 | 阿里云语音 WebSocket + Token 刷新 |
| **main.rs** | ~6 | 入口，调用 `floating_ball_lib::run()` |
| **commands/** | -- | 扩展 Tauri 命令（反馈、医学目录、设备 MAC 读取等） |
| **db/** | -- | 数据库模型 |

### HTTP Server 端点摘要

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/consultation/start` | 启动完整问诊 |
| POST | `/api/consultation/assist` | 进入灵活模式 |
| POST | `/api/inpatient/emr/generate` | 住院病历辅助生成 |
| GET | `/api/consultation/events/ws` | WebSocket 实时订阅问诊事件 envelope，支持 `after` 补发 |
| GET | `/api/consultation/events/poll` | 长轮询兜底获取问诊事件 envelope，支持 `after` 游标 |
| POST | `/api/consultation/reference-feedback` | PHIS 引用回执 |
| POST | `/api/consultation/start-voice` | 触发语音问诊 |
| POST | `/api/patient/risks` | 患者风险数据 |

---

## 静态资源 (`src/assets/`)

| 文件 | 大小 | 用途 |
|------|------|------|
| **diagnoses.csv** | 2.2 MB | 历史诊断资产；基础数据运行时不再直接从该 CSV 加载 |
| **tcm-diagnoses.csv** | 46 KB | 历史中医诊断资产；基础数据运行时不再直接从该 CSV 加载 |
| **tcm-syndromes.csv** | 107 KB | 历史中医证型资产；基础数据运行时不再直接从该 CSV 加载 |
| **medicines.csv** | 137 KB | 历史药品资产；基础数据运行时不再直接从该 CSV 加载 |
| **items.csv** | 6.5 KB | 历史诊疗项目资产；基础数据运行时不再直接从该 CSV 加载 |
| **templates.json** | 731 KB | 西医症状表单模板（动态字段） |
| **tcm-templates.json** | 187 KB | 中医症状模板 |
| **symptom-associations.json** | 23 KB | 症状关联推荐数据 |

---

## 核心数据流

### 完整问诊流

```
HIS POST /api/consultation/start
  -> http_server.rs 解析患者数据
  -> emit "start-consultation" 事件
  -> useEventListeners.ts 接收
  -> App.vue enterWorkMode() -> 打开 ConsultationPage
  -> 医生选症状(3种模式) -> 填表单(templates.json)
  -> LLM 按基层全科模板风格生成主诉+现病史（失败退回本地规则草稿）
  -> LLM 推荐诊断 -> medicalData.ts 匹配 ICD-10
  -> 医生确认 -> complete_consultation 命令
  -> lib.rs 存入 AppState
  -> HIS WebSocket /api/consultation/events/ws 订阅事件，失败时 GET /api/consultation/events/poll 兜底
```

### 灵活模式流

```
HIS POST /api/consultation/assist {action: "suggestedDx", chiefComplaint: "..."}
  -> 跳过症状采集 -> 直达诊断推荐页
  -> 进入共享结果页 -> 医生确认诊断 / 勾选治疗项
  -> 点击一键回写 -> record-confirmed 写入结果通道
  -> HIS 处理后调 reference-feedback -> 页面即时更新
```

### 语音问诊流

```
触发(HTTP/深链接) -> VoiceCapsule 录音(PCM16)
  -> audioRecorder.ts 采集 -> aliyunSpeech.ts 流式传输
  -> 实时转写文本
  -> LLM 结构化病历 -> VoiceConsultationNew 编辑 + 一键回写（record-confirmed）
  -> 确认 -> 写入同一结果通道
```

---

## 变更热点与设计隐患

> 基于 git 历史（122 commits, 2025-01 至今）的变更频率分析。
> 高频变更往往指向抽象不足、职责模糊或业务理解偏差。改动这些区域时务必先理解根因。

### 一级热点（>30 次变更，结构性风险）

| 文件 | 变更次数 | 变更模式 | 根因诊断 | 改动前必读 |
|------|---------|---------|---------|-----------|
| **ConsultationPage.vue** | 38 | 不断堆砌新功能（中医、关联症状、事实核查、防误漏、灵活模式），间歇性重构文本生成逻辑 | **上帝组件**：完整问诊+灵活模式+诊断+用药+检查+引用闭环全塞在一个文件。"不开第二套窗口"的产品决策导致功能只进不出 | RETRO-002, AGENTS.md 棘轮表 |
| **App.vue** | 33 | 反复加入再抽离业务逻辑（语音、窗口位置、事件监听），一次大重构后稳定 | **曾经的上帝类**：已通过 composable 拆分治理，但每次新增入口级功能（语音、风险提醒、深链接）仍会先落到这里 | RETRO-001, AGENTS.md 硬约束 #2 |

### 二级热点（15-30 次变更，关注演进方向）

| 文件 | 变更次数 | 变更模式 | 根因诊断 |
|------|---------|---------|---------|
| **SettingsPanel.vue** | 20 | 不断新增配置项（LLM多模型、审核AI独立配置、主题、自动更新、模板维护），样式反复调整 | **配置膨胀**：每新增一个外部集成就加一坨设置 UI，缺少配置分组/分页抽象。将来应考虑按功能域拆分设置子面板 |
| **llm.ts** | 17 | 流式解析改了多次，审核AI配置拆分又合并，思考模式开关反复 | **LLM 策略未收敛**：业务AI vs 审核AI 是否分离、思考模式是否启用、流式 vs 非流式——这些决策反复摇摆说明 LLM 调用策略的抽象层级不够，混杂了"如何调用"和"调用谁" |

### 三级热点（8-14 次变更，值得留意）

| 文件 | 变更次数 | 变更模式 | 根因诊断 |
|------|---------|---------|---------|
| **VoiceConsultationResult.vue（已删除）** | 11 | 从创建到完善经历多次迭代，事实核查/知识库/主题功能反复附加；2025 年统一 record-confirmed 链路时连同空 `final-report` 路径一并删除 | **横切关注点侵入**（保留作为反面教材） |
| **ChatPanel.vue** | 11 | 主题样式反复、prompt 注入防护附加、演示场景打磨 | 基本稳定，变更多为样式和安全加固，非结构问题 |
| **SystemCategorySelector.vue** | 9 | 从创建到加搜索框到模板管理，持续补功能 | 症状选择的三种模式（常见/部位/系统）各自独立演进，缺少统一的"症状选择策略"抽象 |
| **http_server.rs** | 8 | 每新增一个 HIS 交互场景就加端点（语音、风险、灵活模式） | 基本健康，但端点增长要同步 api.md（已有硬约束） |

### 模块级变更密度

| 模块 | 文件触碰总次数 | 平均每文件 | 解读 |
|------|-------------|-----------|------|
| src/components/ | 152 | 6.1 | 变更最密集，UI 层承担了过多业务决策 |
| src/ (根) | 61 | -- | 主要是 App.vue 拖高 |
| src/services/ | 55 | 3.7 | 相对健康，服务层职责较清晰 |
| src-tauri/ | 38 | -- | Rust 侧变更集中在 http_server.rs 和 lib.rs |
| src/composables/ | 23 | 4.6 | 新拆出的模块，变更主要是初始建设期 |
| src/stores/ | 4 | 2.0 | 最稳定，状态管理边界清晰 |

### 反复摇摆的设计决策

-> 见 [DECISION_DRIFT.md](./DECISION_DRIFT.md)。

本文件只保留代码热点和模块地图；历史上反复推翻、拆分又合并、默认值来回调整的设计决策统一记录到 `DECISION_DRIFT.md`。在这些区域改动前，先确认当前立场。

---

## 变更时的更新义务

本文件需要在以下情况同步更新：

1. **新增/删除/重命名**组件、composable、service、store 文件
2. **模块职责变更**（如功能从一个文件迁移到另一个）
3. **依赖关系变更**（如服务间调用关系改变）
4. **HTTP 端点增减**
5. **数据流路径变更**
6. **静态资源增减**

> 参考 [AGENTS.md 文档更新矩阵](./AGENTS.md) 中的完整更新规则。
