# CODE_MAP.md

> 代码地图 -- AI 再入时的快速索引。按需阅读对应模块，避免全量扫描。
>
> **维护规则**：模块职责、文件路径、依赖关系发生变更时，必须同步更新本文件。

---

## 快速导航

| 我要做什么 | 该读哪里 |
|-----------|---------|
| 了解整体架构 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 了解 HIS 接口契约 | [api.md](./api.md) + [http_server.rs](src-tauri/src/http_server.rs) |
| 了解产品/交互约束 | [PRODUCT.md](./PRODUCT.md) |
| 了解协作规则与禁令 | [AGENTS.md](./AGENTS.md) |
| 了解踩坑记录 | [RETRO.md](./RETRO.md) |
| 修改问诊主流程 | [ConsultationPage.vue](src/components/ConsultationPage.vue) + [SymptomManagement.vue](src/components/SymptomManagement.vue) |
| 修改窗口/动画行为 | [useWindowManagement.ts](src/composables/useWindowManagement.ts) + [useWorkMode.ts](src/composables/useWorkMode.ts) |
| 修改 LLM 调用 | [llm.ts](src/services/llm.ts) + [prompts.ts](src/prompts/prompts.ts) |
| 修改语音问诊 | [VoiceCapsule.vue](src/components/VoiceCapsule.vue) + [VoiceConsultationNew.vue](src/components/VoiceConsultationNew.vue) + [VoiceResultHeader.vue](src/components/VoiceResultHeader.vue) + [VoiceSafetyReviewPanel.vue](src/components/VoiceSafetyReviewPanel.vue) + [VoiceRecommendationFeedbackPopover.vue](src/components/VoiceRecommendationFeedbackPopover.vue) + [VoiceRecordFeedbackPopover.vue](src/components/VoiceRecordFeedbackPopover.vue) + [VoiceSessionFeedbackBar.vue](src/components/VoiceSessionFeedbackBar.vue) + [useVoiceConsultation.ts](src/composables/useVoiceConsultation.ts) + [useVoiceIntentRecognition.ts](src/composables/useVoiceIntentRecognition.ts) + [useVoiceFeedback.ts](src/composables/useVoiceFeedback.ts) + [useVoiceResultRecord.ts](src/composables/useVoiceResultRecord.ts) + [useVoiceCatalogMatching.ts](src/composables/useVoiceCatalogMatching.ts) + [useVoiceResultFactCheck.ts](src/composables/useVoiceResultFactCheck.ts) + [useVoiceKnowledgeSearch.ts](src/composables/useVoiceKnowledgeSearch.ts) + [useVoiceSafetyReview.ts](src/composables/useVoiceSafetyReview.ts) + [VoiceRigidBlockBanner.vue](src/components/VoiceRigidBlockBanner.vue) + [useVoiceRigidBlock.ts](src/composables/useVoiceRigidBlock.ts) + [safetyRules.ts](src/services/safetyRules.ts) + [useSafetyIssueResolver.ts](src/composables/useSafetyIssueResolver.ts) + [patientMemoryStore.ts](src/services/patientMemoryStore.ts) + [patientMemoryBackend.ts](src/services/patientMemoryBackend.ts) + [patientMemoryTypes.ts](src/services/patientMemoryTypes.ts) + [commands/patient_memory.rs](src-tauri/src/commands/patient_memory.rs) + [migrations/002_patient_memory_schema.sql](src-tauri/migrations/002_patient_memory_schema.sql) + [voiceResult.ts](src/types/voiceResult.ts) + [prompts.ts](src/prompts/prompts.ts) + [aliyunSpeech.ts](src/services/aliyunSpeech.ts) + [speechConfig.ts](src/services/speechConfig.ts) + [audioRecorder.ts](src/services/audioRecorder.ts) + [voiceFeedback.ts](src/services/voiceFeedback.ts)；重点关注语音抽取契约是否覆盖病例草稿、explicit/inferred 来源标记、诊断/检查/药品结构化字段，以及推荐项反馈 / 整页评分 / 病例字段反馈的本地落库、前后对比快照和 payload 组装；结果记录状态、标准库匹配、事实复核、知识库搜索、安全复核员分别由 composable 承接 |
| 修改区域化后端接入 | [SettingsPanel.vue](src/components/SettingsPanel.vue) + [regionalClient.ts](src/services/regionalClient.ts) + [regionalRuntime.ts](src/services/regionalRuntime.ts) + [userFeedback.ts](src/services/userFeedback.ts) + [consultationUserLog.ts](src/services/consultationUserLog.ts) + [device.rs](src-tauri/src/commands/device.rs) |
| 修改诊断路径 | [DiagnosisPathWindow.vue](src/components/DiagnosisPathWindow.vue) + [diagnosisPath.ts](src/services/diagnosisPath.ts) + [stores/diagnosisPath.ts](src/stores/diagnosisPath.ts) |
| 修改知识库 | [pmphai.ts](src/services/pmphai.ts)（主） / [KnowledgeBasePanel.vue](src/components/KnowledgeBasePanel.vue)（备） |
| 修改设置面板 | [SettingsPanel.vue](src/components/SettingsPanel.vue) + [llm.ts](src/services/llm.ts) + [speechConfig.ts](src/services/speechConfig.ts) + [regionalClient.ts](src/services/regionalClient.ts)；注意区域化模式下设置页隐藏“模型配置”页签 |
| 修改客户端更新源 | [UpdateChecker.vue](src/components/UpdateChecker.vue) + [updateConfig.ts](src/services/updateConfig.ts) + [lib.rs](src-tauri/src/lib.rs)；内网发布端见 `../floating-ball-server/modules/release` |
| 修改窗口尺寸记忆 | [useWindowManagement.ts](src/composables/useWindowManagement.ts) + [useNavigation.ts](src/composables/useNavigation.ts) + [useEventListeners.ts](src/composables/useEventListeners.ts) + [windowSizes.ts](src/constants/windowSizes.ts) |
| 修改最小化/恢复语义 | [useMinimizedSessions.ts](src/composables/useMinimizedSessions.ts) + [App.vue](src/App.vue) + [useVoiceConsultation.ts](src/composables/useVoiceConsultation.ts)；按 `idVis` 锚定，跨自然日过期；语音问诊整张病历快照走 `editorSnapshot` |
| 修改医学数据匹配 | [medicalData.ts](src/services/medicalData.ts) + [his/HisAdapter.ts](src/services/his/HisAdapter.ts) + [his/PhisHisAdapter.ts](src/services/his/PhisHisAdapter.ts) + [his/registry.ts](src/services/his/registry.ts) + [hisService.ts](src/services/hisService.ts) + [medical_catalog.rs](src-tauri/src/commands/medical_catalog.rs) + [src/assets/*.csv](src/assets/) |
| 测试 HIS 集成 | [mock_his.html](./docs/mock_his.html) |

---

## 目录结构总览

```
floating-ball/
├── src/                        # Vue 3 前端源码
│   ├── components/             # 25 个 Vue 组件
│   ├── composables/            # 5 个可复用逻辑模块
│   ├── services/               # 15 个业务/外部服务
│   ├── stores/                 # 2 个 Pinia store
│   ├── types/                  # TypeScript 类型定义
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
| **ConsultationPage.vue** | ~6800 | 完整问诊 + 灵活模式的唯一落点：症状采集（3种模式）、动态表单、AI 推荐（诊断/用药/检查）、病历回写、HIS 引用闭环；治疗推荐通过共享 `useMedicalDictionaries` + `useTreatmentNormalization` + `useTreatmentGates` + `useTreatmentHydration` 与语音问诊保持同一份归一化口径（频次/用法/剂量/总量/天数 ↔ HIS 字典 + 药品详情轮询 + 库存校验），选中后通过 `TreatmentItemEditor.vue` 子组件提供与语音侧一致的频次/用法下拉与剂量/总量/天数/备注输入；每条推荐提供"手动匹配 / 重新匹配"入口，弹出共用 `ManualMatchPicker` 从标准库选择候选项；药品发药药房与检查/检验执行科室通过共用 `RecAttributeChip.vue` chip+popover 选择器设置，未设置时不允许勾选；勾选药品时自动在候选药房中轮询 medicineDetail，并执行库存校验，任一失败则阻止勾选 | **已冻结**：禁止净增行数，新功能须先拆出 composable/子组件 |
| **SymptomManagement.vue** | ~2000 | 症状管理：关联症状建议、中西医切换 | 与 ConsultationPage 强耦合 |
| **DiagnosisPathWindow.vue** | ~980 | 独立窗口：诊断推理路径可视化（ECharts 图） | 有独立 Pinia 缓存，注意缓存 key 策略 |
| **VoiceConsultationNew.vue** | ~2050 | 当前语音问诊主结果页：左侧病例正文编辑，右侧 AI 诊断/治疗推荐与一键回写；消费语音抽取阶段生成的病例草稿与结构化诊断/处方提示，药品频次/用法字段通过共用 `MedicineUsageFieldSelector` 组件接 HIS 字典，手动匹配标准库候选选择也抽取为共用 `ManualMatchPicker`；发药药房 / 执行科室门禁判定（`isPharmacyRequired/isExecDeptRequired/has*/get*Display/getCandidatePharmaciesForMedicine`）已与症状问诊收敛到共用 `useTreatmentGates`，仅保留 `ensureMedicineDefaultPharmacy`（依赖 `__medicineDetailLoaded` 后才设默认）这一个语音特有副作用；药房列表按 SDK 握手里的 `userRoleDepts` 过滤后从 HIS 动态加载；药品匹配确认和选中前会按候选药房轮询 `medicineDetail`，以首个有效详情药房作为默认药房，用药总量变更后还会校验默认药房库存；检查/检验在卡片头部展示执行科室，缺失时禁止选中并引导医生先设置；同时编排推荐项反馈与整页评分入口，并在主诊断切换后只提示治疗方案需手动刷新、不自动重拉 | 推荐依据默认应折叠，避免右栏信息过载；hydration / 库存校验已迁移到共用 `useTreatmentHydration`，仅保留 `getCandidatePharmaciesForMedicine`（含失配 storeIds 警告日志）与 `ensureMedicineDefaultPharmacy` 这两段语音特有的本地副作用 |
| **VoiceRecommendationFeedbackPopover.vue** | -- | 单条诊断 / 治疗推荐反馈弹层 | 输入问题标签、原因和最终处理动作 |
| **VoiceRecordFeedbackPopover.vue** | -- | 病例字段反馈弹层 | 展示主诉 / 现病史 / 既往史的 AI 原文、医生当前值与前后差异，并提交字段级反馈 |
| **VoiceSessionFeedbackBar.vue** | -- | 语音问诊整页反馈浮层主体 | 回写成功后弹出，收集评分、点评、整体问题标签 |
| **VoiceCapsule.vue** | ~450 | 语音录制界面：音频采集(PCM16) + 流式传输 | 配合 audioRecorder + aliyunSpeech |
| **TreatmentItemEditor.vue** | ~150 | 治疗项可编辑字段子组件：药品（频次/用法可搜索下拉、剂量/总量/天数/备注）；检查/检验/处置（数量、执行科室/部位只读、备注）。直接 mutate 传入 rec，频次/用法通过 `MedicineUsageFieldSelector` 同步更新文本与编码字段。供症状问诊与（后续）语音问诊共用 | 仅 UI，不做候选切换或归一化；业务侧需自行调用 `useTreatmentNormalization` |
| **MedicineUsageFieldSelector.vue** | ~340 | 药品频次/用法可搜索下拉子组件：点击展开 -> 关键字过滤 -> 选中候选写回 rec.frequency/frequencyKey 或 rec.route/routeKey；候选最多 8 条，当前值若不在结果中会作为首条置入；关键字匹配走 `normalizeUsageKeyword` 拼音/医保码 token；失焦时精确匹配或唯一过滤项自动确认，否则保留为自定义文本；可选 `v-model:open` 让父组件做“互斥展开”协调 | 已被语音侧和症状侧同时采用 |
| **ManualMatchPicker.vue** | ~180 | 手动匹配候选弹窗子组件：顶部标题/说明 + 关键字输入 + 候选列表（name + meta）；props 中性化为 `candidates: ManualMatchCandidate[]`，不绑定具体业务；调用方负责查询候选（药品/检查/检验/处置）与处理 select 后的 matchedItem 改写，供语音问诊与症状问诊共用 | UI 不负责业务逻辑；语音侧需在 select 后调 `applyManualMatch` 跟进药房/执行科室门禄 |
| **RecAttributeChip.vue** | ~310 | 推荐项必填属性 chip+popover 子组件：折叠态为单个小 chip（缺失时高亮警示色 + 显示 label），点击展开后下方弹出带关键字筛选的候选列表；props 中性化为 `options: AttrOption[]` + `valueText` + `missing`，不绑定具体业务；可选 `status` prop 用于内联展示"检测中…"或库存告警标签（红色徽标，悬停可见 message）；当前用于症状问诊的发药药房与执行科室设置 | 语音侧沉量较重（secondary-selector 从 editor 弹出），本组件供轻量包装 chip 复用 |

### 辅助功能组件

| 组件 | 行数 | 职责 |
|------|------|------|
| **SettingsPanel.vue** | ~2100 | 通用设置、紧凑主题选择、基础数据缓存管理入口、HIS 联调日志独立入口、区域化后端接入、语音 provider / 音频输入设备、自动更新；本地模式显示 LLM 配置，区域化模式隐藏模型配置页签 |
| **HisIntegrationLogPanel.vue** | -- | HIS 联调日志独立视图面板：筛选、查看详情、复制、导出、清空本地 JSONL 日志 |
| **MedicalCatalogCachePanel.vue** | -- | 基础数据缓存管理独立视图：查看 SQLite 缓存状态、同步状态、手动同步和清理 |
| **FeedbackSubmissionPanel.vue** | ~560 | 统一问题反馈面板（一键回写 + 右上角入口共用），紧凑星级 + 问题标签 + 选填截图 |
| **AnalyticsPanel.vue** | ~1200 | 数据分析看板（ECharts） |
| **KnowledgePanel.vue** | ~850 | PMPHAI 医学知识检索 |
| **BodyPartSelector.vue** | ~830 | 人体部位交互选症状（分性别） |
| **ChatPanel.vue** | ~670 | LLM 聊天界面（流式 + Markdown） |
| **KnowledgeBasePanel.vue** | ~560 | 内置知识库搜索（备选通道） |
| **FactCheckWidget.vue** | ~470 | AI 回答事实核查 |
| **ReceptionCapsule.vue** | ~370 | 患者接诊胶囊（快速信息展示） |
| **SystemCategorySelector.vue** | ~360 | 按系统分类选症状 |
| **UpdateChecker.vue** | ~330 | 应用自动更新检查/安装 |
| **RiskAlertBubble.vue** | ~315 | 风险提醒气泡 |
| **RiskAlertPanel.vue** | ~290 | 患者风险警报面板 |
| **FactCheckHighlight.vue** | ~306 | 行内事实核查标注 |
| **FactCheckNotification.vue** | ~250 | 事实核查通知 Toast |
| **KnowledgeDetailModal.vue** | ~380 | 知识文档详情弹窗 |
| **KnowledgeResultItem.vue** | ~170 | 知识搜索结果行 |
| **Toast.vue** | ~150 | 全局通知 |
| **LoadingSpinner.vue** | ~100 | 加载动画 |
| **Icon.vue** | ~60 | Iconify 图标包装；依赖 `src/icons/iconifyCollections.ts` 注册精简离线图标集合，新增图标时需同步该集合 |
| **IconShowcase.vue** | ~350 | 图标展示（测试用） |

---

## Composables (`src/composables/`)

可复用逻辑层，从 App.vue 抽离的业务编排。

| 模块 | 行数 | 职责 | 关键导出 |
|------|------|------|---------|
| **useEventListeners.ts** | ~475 | 全局事件枢纽：HIS HTTP 事件、深链接、鼠标/窗口事件、Tauri 事件监听；`start-voice-consultation` 会按目标患者判断是否恢复未提交语音缓存，同患者有缓存则恢复结果页，否则开启新语音会话；仅在已处于录音胶囊页时对重复请求做幂等处理 | HIS 事件绑定、deep link 处理 |
| **useWindowManagement.ts** | ~422 | 窗口位置/尺寸/显示器管理 | `saveWindowPosition()`, `restoreWindowPosition()`, `smartExpand()`, `resizeWorkWindow()` |
| **useWorkMode.ts** | ~422 | 球体 <-> 工作面板的切换 | `enterWorkMode()`, `exitWork()`, `handleCollapse()` |
| **useVoiceConsultation.ts** | -- | 语音录制 -> 转写 -> 病历生成；按 `consultationId` 缓存语音病例解析结果并支持重启后恢复未提交结果 | 录制控制、转写回调、结果提交 |
| **useVoiceIntentRecognition.ts** | -- | 语音结构化抽取：把医患对话整理成病例草稿、诊断/检查/药品提示，并保留 explicit/inferred 来源标记与处方核心字段，供 `VoiceConsultationNew.vue` 直接落地到可编辑结果页；同时在抽取后分流“条件性用药”和“患者已自行服用药”，避免误入当前处方候选 | LLM 抽取、结果结构校验、一次修复重试、目录匹配、结构归一、治疗项后处理 |
| **useMedicalDictionaries.ts** | ~145 | HIS 字典统一加载：频次 / 用法 / 发药药房 / 执行科室；纯数据加载，组件内自行处理副作用（药品目录预热、执行科室同步等）。语音问诊与症状问诊共用 | `frequencyOptions/routeOptions/pharmacyOptions/execDeptOptions` refs、`loadXxxOptions()` |
| **useTreatmentNormalization.ts** | ~290 | 治疗项归一化：把部分字段补齐为完整 `TreatmentRecommendation`，沿用 HIS 默认值（频次 / 用法 / 剂量 / 总量）+ 自动估算总量；通过 `ensurePharmacy`/`isExecDeptSatisfied` 回调向调用方注入业务侧副作用 | `normalize()`、`findFrequencyOptionByValue/findRouteOptionByValue`、`getFrequencyExecCount` |
| **useTreatmentGates.ts** | ~135 | 治疗项门禁逻辑：`isPharmacyRequired/isExecDeptRequired`、`hasRequiredPharmacy/hasRequiredExecDept`、`getCandidatePharmaciesForMedicine`（按药品 storeIds 收窄候选药房）、`ensurePharmacy`（默认取首个候选）。供症状问诊使用，输出可作为 `useTreatmentNormalization` 的 `ensurePharmacy/isExecDeptSatisfied` 注入 | 不做副作用（如 medicineDetail 轮询），如需库存校验在调用方处理 |
| **useSecondarySelector.ts** | ~125 | 治疗推荐二级搜索下拉（药房 / 执行科室 / 部位 / 医保）的统一状态：`activeKey + Record<key,string>` 关键字缓存，提供 `isOpen/open/close/closeAll/getKeyword/setKeyword/syncKeyword/handleInput/resolveFilterKeyword`，按 `getEditorKey(rec) + ':field'` 唯一寻址 | 仅状态管理，不做候选过滤；过滤词通过 `resolveFilterKeyword(keyword, currentValue)` 共享口径 |
| **useBodySiteOptions.ts** | ~65 | 检查项目（exam）部位选项落地：`applyMedicalItemPartOption(rec, option)` 把单个部位选项写入 `bodySite/bodySiteId/matchedItem.idPart + raw`；`applyMedicalItemPartOptions(rec, options)` 批量加载，优先匹配当前 partId，否则单选项时自动应用 | HIS 拉取（`his.fetchMedicalItemPartOptions`）由调用方完成，本 composable 不持副作用 |
| **useTreatmentHydration.ts** | ~310 | 抽自语音问诊的"药品详情轮询 + 库存校验"核心：`hydrateMatchedMedicineDetail`（在 `getCandidatePharmaciesForMedicine` 候选药房中依次拉取 `fetchMedicineProDetail`，回填 dose/freq/route/spec/totalUnit/pharmacy + 在 `matchedItem.raw` 上打 `__medicineDetailLoaded`）、`ensureMedicineSelectable`、`checkMedicineInventoryEnough` + warning/checking 状态映射。当前用于症状问诊；语音侧仍保留自身实现（含 exam part options / syncTreatmentExecDeptSelections 等专属副作用） | 注入 `notify`（症状侧映射到 `showToast` 'info'/'success'/'error'），不持有 UI 状态（quick selector、editor expansion 等由调用方处理） |
| **useNavigation.ts** | -- | 视图导航 | `openSettings()`, `openConsultation()`, `openChat()` 等 |

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
| **llm.ts** | ~444 | LLM API（OpenAI 兼容） | `chatStream()`, `chat()`, `analyzePatientRisks()`, `getLLMConfig()` |
| **medicalData.ts** | ~600 | 医学数据目录加载、SQLite 缓存与匹配（ICD-10 诊断/药品/检查项）；本地模式优先走 HISService，同步结果写入本地 SQLite，CSV 作为兜底数据源；同时暴露调试态查询/清理能力 | 模糊匹配 + 拼音支持 |
| **diagnosisPath.ts** | ~568 | 诊断推理路径生成 | ECharts 节点/连线数据，ICD-10 匹配 |
| **pmphai.ts** | ~806 | PMPHAI 医学知识库（主通道） | 向量搜索、列表搜索、文档检索、OAuth 令牌管理 |
| **textGeneration.ts** | ~281 | 主诉/现病史文本生成 | 症状数据 -> LLM -> 医学叙事文本 |

### 语音服务

| 服务 | 行数 | 职责 |
|------|------|------|
| **aliyunSpeech.ts** | ~275 | 语音转写编排：阿里云 DashScope 实时优先，兼容 OpenAI 风格批量转写兜底 |
| **speechConfig.ts** | -- | 统一管理语音转写 provider / API Key / Base URL / Model 配置，并兼容旧配置迁移 |
| **audioRecorder.ts** | ~317 | 浏览器音频录制（Web Audio API, PCM16），并统一处理输入设备枚举、首选设备持久化、首开权限预热和失效回退 |

### 辅助服务

| 服务 | 行数 | 职责 |
|------|------|------|
| **hisService.ts** | ~80 | @internal 底层 PHIS HTTP 客户端；仅供 `services/his/*` 包装使用。业务代码禁止跨层 import，必须走 [his](src/services/his/index.ts) 入口（业务调用 `getHisAdapter()`；SDK handshake 走 `getHisService()`）；底层 `post/get` 会写入 HIS 联调出站日志；封装检查项目部位 / 方式候选查询 |
| **hisIntegrationLog.ts** | -- | HIS 联调日志 Tauri 客户端：结构化记录、查询、清空、导出 Bridge / PHIS 调用流水 |
| **his/HisAdapter.ts** | ~120 | 厂商无关的 HIS 适配器接口契约，14 个方法分 5 组（会话 / 目录 / 字典 / 详情 / 检查部位）；新厂商接入只需实现本接口 |
| **his/types.ts** | ~140 | vendor-neutral DTO：详情（`MedicineDetail` / `MedicalItemDetail`）+ 检查部位（`MedicalItemPartOption`）+ 目录（`DiagnosisCatalogEntry` / `MedicineCatalogEntry` / `MedicalItemCatalogEntry`）+ 字典（`DictionaryEntry`）+ 库存（`InventoryCheckRequest` / `InventoryCheckResult`）；语义化字段命名，PHIS 私有字段统一通过 `raw` / `properties` 透传 |
| **his/PhisHisAdapter.ts** | ~120 | 默认厂商实现：thin wrapper 包装 `HisService` 类，详情与检查部位方法在此处把 PHIS 字段映射为中性 DTO |
| **his/MockHisAdapter.ts** | ~150 | 内置 mock 实现：不连接任何后端，返回固定样本数据。主要用于反向验证抽象是否充分 + 本地 demo / E2E；已在 registry 中预注册（vendor='mock'） |
| **his/registry.ts** | ~100 | 适配器注册表与选择器；`getHisAdapter()` 是业务方唯一入口；选择优先级 setActiveHisVendor > VITE_HIS_VENDOR > localStorage.HIS_VENDOR > 默认 phis |
| **his/index.ts** | ~30 | 公开入口：重出 adapter / 注册 API / 类型 |
| **medical_catalog.rs** | -- | 医学目录 SQLite 持久化命令：诊断全局缓存、诊疗项目/药品按机构缓存与同步状态管理，并提供调试态查看/清理命令 | 供 `medicalData.ts` 调用 |
| **factChecker.ts** | ~399 | AI 输出验证（医学指南核查） |
| **feedback.ts** | ~312 | 操作追踪与反馈 |
| **voiceFeedback.ts** | -- | 语音反馈 payload 组装、本地草稿、病例字段差异摘要与待同步队列；通过 `submitVoicePendingPayloadToBackend` 映射到统一 `/v1/client/feedbacks` |
| **aiTrace.ts** | ~200 | 最近一次 AI 调用链路上下文缓存 |
| **knowledgeBase.ts** | ~213 | 通用知识库 CRUD |
| **regionalClient.ts** | ~400 | 区域化核心客户端：设备 MAC 解析/设备编码持久化、终端注册、bootstrap 拉取、心跳、鉴权、SSE 代理；MAC 读取由 Tauri `device.rs` 提供，Windows 使用系统网卡 API，避免外部命令窗口闪烁 |
| **regionalRuntime.ts** | ~50 | 区域化运行时编排：统一初始化、重连、远程数据同步、审计上传启停 |
| **userFeedback.ts** | ~150 | 统一反馈提交服务（kind/severity/tags/hasCorrection），自动附加 doctor/org/dept actor 与 aiTrace |
| **consultationUserLog.ts** | -- | 运维用户日志上报服务：智能问诊/语音问诊首版 AI 内容与最终提交内容快照，按 `consultationId + consultationType` 聚合到后台用户日志模块 |
| **feedbackContext.ts** | ~80 | 反馈上下文：握手阶段缓存当前医生/机构/科室身份，供反馈提交回填 |
| **themeService.ts** | ~209 | 主题管理（深色/浅色模式） |
| **reportGenerator.ts** | ~152 | 最终报告生成 |
| **promptGuard.ts** | ~138 | 提示词注入防护 |
| **operationTracker.ts** | ~105 | 事件分析追踪 |
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
| **appState.ts** | 应用级状态类型 | `AppPatient`, `AppStore`, `ViewType` |
| **consultationAssist.ts** | 灵活模式类型 | `ConsultationAssistRequest`, `DiagnosisPathOption` |
| **feedback.ts** | 操作追踪类型 | `FeedbackEvent`, `SessionMetrics` |

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
| **http_server.rs** | ~831 | HIS HTTP Bridge（Actix-web, `127.0.0.1:8081`）：问诊启动/结果/引用回执/语音触发，并为入站联调请求生成 `traceId` 与结构化日志 |
| **aliyun_speech.rs** | ~326 | 阿里云语音 WebSocket + Token 刷新 |
| **main.rs** | ~6 | 入口，调用 `floating_ball_lib::run()` |
| **commands/** | -- | 扩展 Tauri 命令（反馈、医学目录、设备 MAC 读取等） |
| **db/** | -- | 数据库模型 |

### HTTP Server 端点摘要

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/consultation/start` | 启动完整问诊 |
| POST | `/api/consultation/assist` | 进入灵活模式 |
| GET | `/api/consultation/result` | 获取最新问诊结果 |
| POST | `/api/consultation/reference-feedback` | PHIS 引用回执 |
| POST | `/api/consultation/start-voice` | 触发语音问诊 |
| POST | `/api/patient/risks` | 患者风险数据 |

---

## 静态资源 (`src/assets/`)

| 文件 | 大小 | 用途 |
|------|------|------|
| **diagnoses.csv** | 2.2 MB | 西医诊断库（ICD-10, 2万+条） |
| **tcm-diagnoses.csv** | 46 KB | 中医诊断 |
| **tcm-syndromes.csv** | 107 KB | 中医证型 |
| **medicines.csv** | 137 KB | 历史药品文件；当前药品匹配不再使用 CSV，改用 HIS/SQLite 药房 scoped 目录 |
| **items.csv** | 6.5 KB | 检查检验项目 |
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
  -> LLM 生成主诉+现病史
  -> LLM 推荐诊断 -> medicalData.ts 匹配 ICD-10
  -> 医生确认 -> complete_consultation 命令
  -> lib.rs 存入 AppState
  -> HIS GET /api/consultation/result 轮询取结果
```

### 灵活模式流

```
HIS POST /api/consultation/assist {action: "diagnosis", chiefComplaint: "..."}
  -> 跳过症状采集 -> 直达诊断推荐页
  -> 医生点"引用诊断" -> reference-request 写入结果通道
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

### 反复摇摆的设计决策（改动前必须先对齐）

以下设计点在历史上反复变更，说明团队/AI对这些问题的理解尚未稳定。在这些区域做改动前，先和人确认当前立场：

| 决策点 | 摇摆历史 | 当前状态 | 改动前问 |
|--------|---------|---------|---------|
| **业务AI vs 审核AI 是否分离** | 最初统一 -> 拆分独立配置 -> 增加开关 -> 默认关闭 | 可选独立审核AI，默认关闭 | "审核AI走独立模型还是复用业务模型？" |
| **思考模式(reasoning)开关** | 默认开 -> 发现响应太慢 -> 默认关 | 默认关闭，用户可手动开 | "当前场景是否需要思考模式？" |
| **中西医数据模型** | 最初只有西医 -> 加中医诊断 -> ID冲突修复 -> 中药不匹配药品库 | 中西医各自独立数据源和模板 | "改动涉及中医还是西医？数据源是否隔离？" |
| **事实核查的植入方式** | 独立组件 -> 嵌入问诊页 -> 嵌入语音结果 -> 嵌入聊天 | 多处嵌入，缺少统一组合机制 | "事实核查是页面级还是全局级？" |
| **症状选择入口** | 单一列表 -> +部位选择 -> +系统分类 -> +搜索 -> +自定义录入 | 三种模式并行 + 自定义兜底 | "新的选择方式是替代还是新增？" |

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
