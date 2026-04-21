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
| 修改语音问诊 | [VoiceCapsule.vue](src/components/VoiceCapsule.vue) + [useVoiceConsultation.ts](src/composables/useVoiceConsultation.ts) + [useVoiceIntentRecognition.ts](src/composables/useVoiceIntentRecognition.ts) + [prompts.ts](src/prompts/prompts.ts) + [aliyunSpeech.ts](src/services/aliyunSpeech.ts) + [audioRecorder.ts](src/services/audioRecorder.ts) |
| 修改诊断路径 | [DiagnosisPathWindow.vue](src/components/DiagnosisPathWindow.vue) + [diagnosisPath.ts](src/services/diagnosisPath.ts) + [stores/diagnosisPath.ts](src/stores/diagnosisPath.ts) |
| 修改知识库 | [pmphai.ts](src/services/pmphai.ts)（主） / [KnowledgeBasePanel.vue](src/components/KnowledgeBasePanel.vue)（备） |
| 修改设置面板 | [SettingsPanel.vue](src/components/SettingsPanel.vue) |
| 修改 Windows 更新源 | [UpdateChecker.vue](src/components/UpdateChecker.vue) + [updateConfig.ts](src/services/updateConfig.ts) + [lib.rs](src-tauri/src/lib.rs) |
| 修改窗口尺寸记忆 | [useWindowManagement.ts](src/composables/useWindowManagement.ts) + [useNavigation.ts](src/composables/useNavigation.ts) + [useEventListeners.ts](src/composables/useEventListeners.ts) + [windowSizes.ts](src/constants/windowSizes.ts) |
| 修改医学数据匹配 | [medicalData.ts](src/services/medicalData.ts) + [src/assets/*.csv](src/assets/) |
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
| **ConsultationPage.vue** | ~6800 | 完整问诊 + 灵活模式的唯一落点：症状采集（3种模式）、动态表单、AI 推荐（诊断/用药/检查）、病历回写、HIS 引用闭环 | **已冻结**：禁止净增行数，新功能须先拆出 composable/子组件 |
| **SymptomManagement.vue** | ~2000 | 症状管理：关联症状建议、中西医切换 | 与 ConsultationPage 强耦合 |
| **DiagnosisPathWindow.vue** | ~980 | 独立窗口：诊断推理路径可视化（ECharts 图） | 有独立 Pinia 缓存，注意缓存 key 策略 |
| **VoiceConsultationResult.vue** | ~1200 | 语音转写后的结构化病历编辑器 | 与语音链路串联 |
| **VoiceCapsule.vue** | ~450 | 语音录制界面：音频采集(PCM16) + 流式传输 | 配合 audioRecorder + aliyunSpeech |

### 辅助功能组件

| 组件 | 行数 | 职责 |
|------|------|------|
| **SettingsPanel.vue** | ~1500 | LLM 配置、窗口行为、音频输入设备、自动更新、主题 |
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
| **Icon.vue** | ~60 | Iconify 图标包装 |
| **IconShowcase.vue** | ~350 | 图标展示（测试用） |

---

## Composables (`src/composables/`)

可复用逻辑层，从 App.vue 抽离的业务编排。

| 模块 | 行数 | 职责 | 关键导出 |
|------|------|------|---------|
| **useEventListeners.ts** | ~475 | 全局事件枢纽：HIS HTTP 事件、深链接、鼠标/窗口事件、Tauri 事件监听 | HIS 事件绑定、deep link 处理 |
| **useWindowManagement.ts** | ~422 | 窗口位置/尺寸/显示器管理 | `saveWindowPosition()`, `restoreWindowPosition()`, `smartExpand()`, `resizeWorkWindow()` |
| **useWorkMode.ts** | ~422 | 球体 <-> 工作面板的切换 | `enterWorkMode()`, `exitWork()`, `handleCollapse()` |
| **useVoiceConsultation.ts** | -- | 语音录制 -> 转写 -> 病历生成 | 录制控制、转写回调、结果提交 |
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
| **medicalData.ts** | ~600 | 医学数据加载与匹配（ICD-10 诊断/药品/检查项） | 模糊匹配 + 拼音支持 |
| **diagnosisPath.ts** | ~568 | 诊断推理路径生成 | ECharts 节点/连线数据，ICD-10 匹配 |
| **pmphai.ts** | ~806 | PMPHAI 医学知识库（主通道） | 向量搜索、列表搜索、文档检索、OAuth 令牌管理 |
| **textGeneration.ts** | ~281 | 主诉/现病史文本生成 | 症状数据 -> LLM -> 医学叙事文本 |

### 语音服务

| 服务 | 行数 | 职责 |
|------|------|------|
| **aliyunSpeech.ts** | ~275 | 阿里云实时语音识别（WebSocket 流式） |
| **audioRecorder.ts** | ~317 | 浏览器音频录制（Web Audio API, PCM16），并统一处理输入设备枚举、首选设备持久化和失效回退 |

### 辅助服务

| 服务 | 行数 | 职责 |
|------|------|------|
| **hisService.ts** | ~80 | 封装 Tauri HTTP 插件，绕过浏览器同源与 Cookie 限制，供前端直接调用 HIS 接口 |
| **factChecker.ts** | ~399 | AI 输出验证（医学指南核查） |
| **feedback.ts** | ~312 | 操作追踪与反馈 |
| **knowledgeBase.ts** | ~213 | 通用知识库 CRUD |
| **themeService.ts** | ~209 | 主题管理（深色/浅色模式） |
| **reportGenerator.ts** | ~152 | 最终报告生成 |
| **promptGuard.ts** | ~138 | 提示词注入防护 |
| **operationTracker.ts** | ~105 | 事件分析追踪 |
| **templateService.ts** | ~65 | 症状模板加载 |

**服务依赖**：
```
llm.ts <- factChecker.ts, diagnosisPath.ts, textGeneration.ts
medicalData.ts <- diagnosisPath.ts, ConsultationPage.vue
pmphai.ts (独立知识库服务)
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
| **http_server.rs** | ~831 | HIS HTTP Bridge（Actix-web, `127.0.0.1:8081`）：问诊启动/结果/引用回执/语音触发 |
| **aliyun_speech.rs** | ~326 | 阿里云语音 WebSocket + Token 刷新 |
| **main.rs** | ~6 | 入口，调用 `floating_ball_lib::run()` |
| **commands/** | -- | 扩展 Tauri 命令 |
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
| **medicines.csv** | 137 KB | 药品目录 |
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
  -> LLM 结构化病历 -> VoiceConsultationResult 编辑
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
| **VoiceConsultationResult.vue** | 11 | 从创建到完善经历多次迭代，事实核查/知识库/主题功能反复附加 | **横切关注点侵入**：事实核查、主题、知识库本不属于语音结果编辑，但被直接塞入而非组合注入 |
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
