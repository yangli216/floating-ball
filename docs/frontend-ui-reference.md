# 前端 UI 参考文档

> 状态：当前运行态参考。本文只记录 UI 入口、窗口形态和主要组件归属；架构边界以 `ARCHITECTURE.md`、`CODE_MAP.md`、`docs/frontend-reuse-architecture.md` 和 `docs/frontend-file-structure-plan.md` 为准。
>
> 注意：旧根级 `src/components/*` 中大量业务组件已经迁入 `features/*`、`entities/*`、`shared/*`。新增 UI 时不要按旧截图路径追加文件。

---

## 应用形态

应用由 `src/App.vue` 编排，主窗口有两类形态：

1. **Ball 模式**：悬浮球待机态，标准尺寸来自 `WINDOW_SIZES.BALL`。
2. **Work 模式**：工作面板态，具体窗口尺寸由 `src/constants/windowSizes.ts` 的 `getWindowSizeForView()` 决定。

窗口尺寸基线：

| 视图 | 当前入口 | 标准尺寸 |
| --- | --- | --- |
| `chat` | `src/components/ChatPanel.vue` | 920 x 360 |
| `settings` | `src/components/SettingsPanel.vue` | 378 x 449 |
| `analytics` | `src/features/analytics/ui/AnalyticsPanel.vue` | 378 x 449 |
| `knowledge-base` | `src/features/knowledge/ui/KnowledgeBasePanel.vue` | 378 x 449 |
| `risk-alert` | `src/features/reception-risk/ui/RiskAlertPanel.vue` | 378 x 449 |
| `consultation` | `src/components/ConsultationPage.vue` | 1080 x 720 |
| `voice-consultation` | `src/components/VoiceConsultationNew.vue` | 1080 x 720 |
| `symptom-manage` | `src/features/symptom-consultation/ui/SymptomManagement.vue` | 1080 x 720 |
| `voice-interaction` | `src/features/voice-consultation/ui/VoiceCapsule.vue` | 360 x 80 / 96 / 140 / 248 |
| `reception-capsule` | `src/features/reception-risk/ui/ReceptionCapsule.vue` | 280 x 92，展开最高 520 |
| `his-log` | `src/features/settings/ui/HisIntegrationLogPanel.vue` | 980 x 640 |
| `medical-cache` | `src/features/medical-catalog/ui/MedicalCatalogCachePanel.vue` | 980 x 640 |

---

## 顶层容器

`assistant-container` 的工具栏和圆角由 `App.vue` 控制：

- `chat`：无顶部工具栏，容器圆角为 8px。
- `risk-alert` / `voice-interaction` / `reception-capsule`：无顶部工具栏。
- `reception-capsule`：透明背景、无边框阴影，圆角为 16px。
- 其他工作视图：默认 20px 圆角，并显示工具栏。

工具栏右侧当前包含：

- 灵活触发：有当前患者且不在 `consultation` 视图时显示。
- 知识库：进入内置知识库。
- 问题反馈：打开通用反馈弹层。
- 收起：进入最小化 / 胶囊 / 小球逻辑。

---

## 主要 UI 入口

### 聊天

- 入口：`src/components/ChatPanel.vue`
- 职责：LLM 对话、Markdown 展示、聊天录音转写入口、事实核查展示入口。
- 相关 UI：`src/features/feedback/ui/FactCheckWidget.vue`、`FactCheckHighlight.vue`、`FactCheckNotification.vue`。

### 设置

- 入口：`src/components/SettingsPanel.vue`
- 职责：设置页 shell、tab 编排、保存策略、toast、埋点、区域化重连和窗口置顶副作用。
- 已拆 UI：`src/features/settings/ui/SettingsGeneralTab.vue`、`SettingsModelTab.vue`、`SettingsSaveBar.vue`、`UpdateChecker.vue`、`ForceUpdateGate.vue`。
- 已拆 model：`src/features/settings/model/useSettingsAudioInput.ts`、`useSettingsVoiceRecordingDirectory.ts`、`useSettingsSaveState.ts`。

### 智能问诊

- 入口：`src/components/ConsultationPage.vue`
- 样式：`src/features/symptom-consultation/ui/ConsultationPage.css`
- 职责：完整症状问诊和 HIS assist 灵活模式唯一落点。
- 相关 UI：`BodyPartSelector.vue`、`SystemCategorySelector.vue`、`SymptomResultEntry.vue` 位于 `src/features/symptom-consultation/ui/`。
- 相关 model / lib：症状采集、assist 快进、表单校验、病历草稿、诊断分组、PHIS 引用状态等位于 `src/features/symptom-consultation/`。
- 约束：新 UI 区块不得继续堆进根页面，应先形成 `features/symptom-consultation/ui|model|lib` 边界。

### 语音问诊结果页

- 入口：`src/components/VoiceConsultationNew.vue`
- 样式：`src/features/consultation-result/ui/ClinicalResultEditor.css`
- 职责：当前共享结果页实现载体，承载语音问诊和症状问诊结果编辑、一键回写、反馈、推荐刷新和回执等待。
- 语音专属 UI：`src/features/voice-consultation/ui/`
- 结果页共享 UI：`src/features/consultation-result/ui/`
- 结果页共享 model：`src/features/consultation-result/model/`
- PHIS 回写纯构造：`src/features/clinical-result/recordConfirmedPayload.ts`

### 语音录制胶囊

- 入口：`src/features/voice-consultation/ui/VoiceCapsule.vue`
- 职责：录音、停止、处理态展示。
- 尺寸：由 `getVoiceInteractionWindowSize()` 根据 `recording / processing / stopped / expanded` 决定。

### 接诊风险

- 接诊胶囊：`src/features/reception-risk/ui/ReceptionCapsule.vue`
- 风险面板：`src/features/reception-risk/ui/RiskAlertPanel.vue`
- 风险气泡：`src/features/reception-risk/ui/RiskAlertBubble.vue`
- 类型：`src/features/reception-risk/types.ts`
- 状态机：`src/app/events/useReceptionController.ts`

### 知识库

- 内置面板：`src/features/knowledge/ui/KnowledgeBasePanel.vue`
- 问诊页抽屉：`src/features/knowledge/ui/KnowledgePanel.vue`
- 搜索结果和详情：`KnowledgeResultItem.vue`、`KnowledgeDetailModal.vue`
- 检索 controller：`src/features/knowledge/model/useKnowledgeSearchController.ts`
- 查询词提取：`src/features/knowledge/lib/knowledgeSearchCategories.ts`

### 工具页

- 数据分析：`src/features/analytics/ui/AnalyticsPanel.vue`
- 症状库维护：`src/features/symptom-consultation/ui/SymptomManagement.vue`
- HIS 联调日志：`src/features/settings/ui/HisIntegrationLogPanel.vue`
- 缓存管理：`src/features/medical-catalog/ui/MedicalCatalogCachePanel.vue`
- 诊断路径独立窗口：`src/features/diagnosis-path/ui/DiagnosisPathWindow.vue`
- 报告解读独立窗口：`src/features/report-interpretation/ui/ReportInterpretationWindow.vue`

---

## 通用 UI

通用 UI 已从旧 `src/components/*` 收敛到 `src/shared/ui/*`：

| 组件 | 当前路径 |
| --- | --- |
| Icon | `src/shared/ui/Icon.vue` |
| Toast | `src/shared/ui/Toast.vue` |
| LoadingSpinner | `src/shared/ui/LoadingSpinner.vue` |
| IconShowcase | `src/shared/ui/IconShowcase.vue` |

患者头部是实体 UI，不放 `shared`：

| 组件 | 当前路径 |
| --- | --- |
| PatientHeader | `src/entities/patient/ui/PatientHeader.vue` |

---

## 样式与 Token

全局设计 token 定义在 `src/styles/design-tokens.css`。

页面级样式当前已外置：

| 样式 | 当前路径 |
| --- | --- |
| 智能问诊主页面 | `src/features/symptom-consultation/ui/ConsultationPage.css` |
| 症状结果入口附加动作 | `src/features/symptom-consultation/ui/SymptomConsultationResultPage.css` |
| 共享结果页主体 | `src/features/consultation-result/ui/ClinicalResultEditor.css` |

样式治理原则：

1. 页面 SFC 样式外置时，先原样迁移，不顺手改视觉。
2. 新功能 UI 优先进入对应 `features/<feature>/ui`。
3. 无业务语义、跨域复用的 UI 才进入 `shared/ui`。
4. 患者、诊断、治疗等业务实体展示优先进入 `entities/*` 或对应 feature，不要提前泛化到 shared。
