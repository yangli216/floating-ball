# 架构文档 (ARCHITECTURE.md)

> **最后更新**: 2026-03-23
>
> **重要**: 此文档是项目架构的唯一真实来源。任何架构级别的代码修改都必须同步更新此文档。

## 目录

- [概述](#概述)
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

当前代码库**尚未落地独立医生登录态**，仍以本地配置和本地桥接链路为主：

1. LLM / 审查模型 / PMPHAI 等凭据主要通过设置页和本地存储管理。
2. HIS 联调通过本地 HTTP Bridge 完成，不依赖独立登录态。
3. `docs/regionalization/*.md` 中关于 `auth.ts`、`regionalClient.ts`、`AuthGate.vue` 的设计尚未进入当前实现。

### 前端分层设计

1. 当前设置与凭据状态通过 `localStorage`、`consultationConfig` store、本地 Tauri Store 管理，其中“通用 LLM”和“语音转写”配置分域存储，避免同一组 Audio 字段误导到不同 provider。
2. 本地 HIS 对接入口由 `src-tauri/src/http_server.rs` 提供。
3. 若未来引入真实登录态，应新增专用文档章节并在 `AGENTS.md` / `api.md` 中同步说明。
4. Windows 内网更新源采用本地配置驱动：测试环境地址、正式环境地址和当前生效环境保存在 `localStorage`，前端只负责展示与选择，真正的 updater endpoint 在 Rust 侧通过 `updater_builder()` 运行时注入。
5. 主窗口的聊天、设置、问诊等可调整工作视图会将用户最后一次手动调整后的窗口尺寸写入 `.settings.dat`，再次打开对应视图时优先恢复该尺寸。
6. 通用设置页新增音频输入设备配置，首选麦克风 `deviceId` 保存在 `localStorage`；聊天录音和语音接诊共用同一配置，若指定设备不存在则自动回退到系统默认输入设备。设置页首次进入时会按权限状态自动补做一次设备列表预热，尽量避免初次枚举不完整、必须手动刷新后才看到全部麦克风。
7. 语音转写配置与通用 LLM 配置分离：本地模式下默认 provider 为阿里云 DashScope，`VoiceCapsule.vue` 实时语音和 `ChatPanel.vue` 录音转写共用同一套 speech config；若切换到 OpenAI 兼容 provider，则统一降级为批量转写链路。

### 与主流程关系

1. 现阶段所有问诊、语音、session 回写能力都以本地模式为主。
2. 未来若接入区域后端，应确保不破坏当前本地桥接链路和医生使用路径。
3. 登录态设计在当前版本不是前置依赖，不能假定仓库内已有 `auth store` 或受保护 API 基座。
6. `LLM` 调用默认走 `/v1/ai/chat`；仅当后端不可用且配置了兼容模型时才回退直连（过渡策略）。

---

## 应用入口 (App.vue)

### 当前状态

**代码行数**: 约 723 行（当前以编排职责为主，未重新收敛回单体逻辑）

**职责**: 轻量级应用编排器

### 交互目标（2026-03 设计约束）

1. 保留 `ConsultationPage.vue` 现有症状问诊主链路，支持完整走完既有流程。
2. 原灵活模式入口已完全并入 `ConsultationPage.vue`，作为“主问诊内嵌灵活模式”存在；项目内不再保留独立 `consultation-session` 小窗实现。
3. `/api/consultation/assist` 与桌面端附加入口仍然保留，但其目标变为“打开 `ConsultationPage` 指定阶段”。当 HIS 已传入 `chiefComplaint/historyOfPresentIllness` 时，页面应直接跳过症状选择，进入病历详情与 AI 推荐阶段。
4. 灵活模式下的推荐诊断 / 诊断鉴别 / 推荐用药 / 推荐检查 / 推荐检验 / 推荐处置，必须继续复用 `ConsultationPage.vue` 现有的诊断生成、标准库匹配、诊断路径与方案联动逻辑，不允许维护第二套轻量推荐口径。
5. 各模块的“确认”和“引用”语义必须拆分：主诉/现病史回写可以直接更新医生站草稿；诊断鉴别确认只记日志，不修改病历；推荐诊断、推荐用药、推荐检查等的“引用”才真正进入 PHIS 保存闭环。
6. 灵活模式必须实现前置门禁：`diagnosis` 入口要求已有主诉和现病史；`differential` / `medication` / `examination` / `lab_test` / `procedure` 入口要求已有主诉、现病史和当前诊断；若条件不足，页面需要给出明确提示并停留在可继续补全信息的位置。
7. `mock_his.html` 作为联调页时，除继续轮询 `/api/consultation/result` 获取草稿外，还必须支持“引用请求 -> PHIS 保存成功/失败 -> 回执 floating-ball”的完整闭环。
8. `POST /api/consultation/reference-feedback` 成为 PHIS 引用回执入口。floating-ball 发起引用后应继续停留在当前 `ConsultationPage`，医生可继续完成本次问诊；收到回执后，必须更新当前问诊页状态、记录日志、标注已引用或失败原因。当前实现仍以内存状态为主，而不是落盘恢复。
9. `/api/consultation/result` 需要兼容返回“病历草稿写回”、“引用请求发起”、“PHIS 引用回执”三类结果；联调页或 HIS 轮询时仍需校验 `consultationId` 与当前患者一致，避免旧结果提前命中。
10. 针对推荐诊断的重复引用，需要区分“同一诊断重复点击”和“更换为新诊断引用”；前者应提示已成功引用，后者应允许 PHIS 进入诊断修改流程并通过回执反馈最终结果。
11. 后端内部仍沿用 `start-consultation-session` 这个 Tauri 事件名承接 `/api/consultation/assist` 的兼容分发，但前端唯一落点已经是 `navigation.openConsultation()` + `ConsultationPage` 灵活模式，不再存在独立 session 小窗视图。
12. `ConsultationPage.vue` 里的推荐诊断必须保持单选，并以当前选中诊断作为引用对象；推荐用药、检查、检验、处置则保留多选，并在各自分组级提供一次引入所选项的入口。对暂不支持 PHIS 引用的推荐项，应作为只读处置建议单独展示，避免被误当作检查项提交。

### 代码结构

```vue
<script setup lang="ts">
// 1. 导入声明 (~30 行)
import { useWindowManagement } from "./composables/useWindowManagement";
import { useWorkMode } from "./composables/useWorkMode";
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
const isHovered = ref(false);          // 是否悬停
const isFocused = ref(false);          // 是否聚焦
const transitioning = ref(false);      // 是否正在过渡动画

// 视图状态
const currentView = ref<ViewType>('chat');  // 当前视图
const hoveredBtnIndex = ref(-1);            // 悬停的按钮索引
const consultationAssistTrigger = ref(...);  // 灵活模式自动触发请求

// 业务状态
const currentPatient = ref<AppPatient | null>(null);      // 当前患者
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

---

## 组合式函数 (Composables)

Composables 是架构的核心，封装可复用的业务逻辑。

### `useWindowManagement.ts` ✅

**文件**: [src/composables/useWindowManagement.ts](src/composables/useWindowManagement.ts)

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

**文件**: [src/composables/useWorkMode.ts](src/composables/useWorkMode.ts)

**行数**: 429 行

**职责**: 工作模式（展开/收起）切换逻辑

**核心功能**:
- ✅ 进入工作模式（小球展开为面板，支持动态尺寸）
- ✅ 退出工作模式（面板收起为小球，平滑动画）
- ✅ 计算变形动画原点（基于小球位置）
- ✅ 管理过渡状态（防止动画冲突）
- ✅ 智能收起逻辑（问诊→胶囊 or 完全退出）
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

**文件**: [src/composables/useNavigation.ts](src/composables/useNavigation.ts)

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
  openSymptomManagement: () => Promise<void>,
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

### `useVoiceConsultation.ts` ✅

**文件**: [src/composables/useVoiceConsultation.ts](src/composables/useVoiceConsultation.ts)

**行数**: 262 行

**职责**: 语音问诊完整业务流程

**核心功能**:
- ✅ 处理语音停止事件（转录 + LLM 生成）
- ✅ 当实时转写为空时，自动使用音频文件兜底转写
- ✅ LLM 病历生成（结构化 JSON）
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
  cancelVoiceResult: () => Promise<void>
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

### `useEventListeners.ts` ✅

**文件**: [src/composables/useEventListeners.ts](src/composables/useEventListeners.ts)

**行数**: 475 行

**职责**: 统一管理所有 Tauri 事件监听

**核心功能**:
- ✅ Deep Link 单点监听（仅在 `useEventListeners` 注册）
- ✅ HIS 集成事件监听
  - `show-patient-risks` - 患者风险提示
  - `start-consultation` - 开始问诊
  - `start-consultation-session` - HIS 灵活模式 / assist 兼容事件（当前默认打开 `ConsultationPage` 并写入自动触发上下文）
  - `stop-consultation` - 停止问诊
  - `start-voice-consultation` - 语音问诊
- ✅ 鼠标事件监听
  - `hover-change` - 悬停状态
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
| `SettingsPanel.vue` | 系统设置（含文本/音频模型配置、音频输入设备选择） | [src/components/SettingsPanel.vue](src/components/SettingsPanel.vue) |
| `ConsultationPage.vue` | 完整症状问诊主链路，同时承接新的“内嵌灵活模式”；支持根据 `/assist` 上下文直接跳过症状采集进入病历详情页，继续复用现有推荐诊断、诊断鉴别、推荐用药、推荐检查与诊断路径能力，并负责处理 PHIS 引用闭环的页面状态；诊断保持单选引用，推荐方案支持多选后分组批量引入 | [src/components/ConsultationPage.vue](src/components/ConsultationPage.vue) |
| `DiagnosisPathWindow.vue` | 独立诊断推理路径窗口，使用 ECharts Sankey 展示患者事实、章节归类、证据汇聚与诊断去向；默认提供更宽画布，并按容器尺寸动态计算 Sankey 的布局盒子，用对称留白实现“适应屏幕并居中”的默认视图，再开放滚轮缩放、平移与节点拖动；点击入口后窗口先显示 loading 动画，并按“检查缓存 -> 生成推理链 -> 渲染图表”的阶段更新提示，若生成超时或渲染失败会切换到明确错误态；正文容器在收到 payload 后保持挂载，loading 改为遮罩层，避免 `chartEl` 尚未挂载时误判渲染成功；开窗后的 `show/focus` 调用采用 best-effort 非阻塞方式，避免 Tauri 原生命令卡住整个推理链；右侧说明面板采用“支持证据 / 反证提醒 / 鉴别要点”三段式，未返回结构化分段时回退显示整体 rationale | [src/components/DiagnosisPathWindow.vue](src/components/DiagnosisPathWindow.vue) |
| `VoiceCapsule.vue` | 语音录制胶囊 | [src/components/VoiceCapsule.vue](src/components/VoiceCapsule.vue) |
| `VoiceConsultationResult.vue` | 语音结果编辑 | [src/components/VoiceConsultationResult.vue](src/components/VoiceConsultationResult.vue) |
| `ReceptionCapsule.vue` | 接待胶囊（风险提示） | [src/components/ReceptionCapsule.vue](src/components/ReceptionCapsule.vue) |
| `RiskAlertPanel.vue` | 风险详情面板 | [src/components/RiskAlertPanel.vue](src/components/RiskAlertPanel.vue) |
| `AnalyticsPanel.vue` | 数据分析 | [src/components/AnalyticsPanel.vue](src/components/AnalyticsPanel.vue) |
| `SymptomManagement.vue` | 症状库维护 | [src/components/SymptomManagement.vue](src/components/SymptomManagement.vue) |
| `KnowledgeBasePanel.vue` | 内置知识库检索面板；当前保留但不是默认知识入口，默认入口更偏向 `pmphai.ts` 生成的外部页面 | [src/components/KnowledgeBasePanel.vue](src/components/KnowledgeBasePanel.vue) |
| `Toast.vue` | 消息提示 | [src/components/Toast.vue](src/components/Toast.vue) |
| `Icon.vue` | 图标封装 | [src/components/Icon.vue](src/components/Icon.vue) |

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
  WORK: { width: 420, height: 560 },
  SESSION: { width: 400, height: 760 },
  DIAGNOSIS_PATH: { width: 1080, height: 760 },
  CONSULTATION: { width: 1200, height: 900 },
  CAPSULE: { width: 360, height: 80 },
  CAPSULE_EXPANDED: { width: 360, height: 400 },
  RESULT: { width: 1200, height: 900 },
  SYMPTOM_MANAGE: { width: 1200, height: 900 }
};

export type ViewType =
  | 'chat'
  | 'settings'
  | 'consultation'
  | 'risk-alert'
  | 'voice-interaction'
  | 'voice-result'
  | 'reception-capsule'
  | 'analytics'
  | 'symptom-manage'
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
| `llm.ts` | LLM API 通信（OpenAI 兼容） | [src/services/llm.ts](src/services/llm.ts) |
| `aliyunSpeech.ts` | 语音转写编排（DashScope + OpenAI 兼容降级） | [src/services/aliyunSpeech.ts](src/services/aliyunSpeech.ts) |
| `audioRecorder.ts` | Web Audio API 录音、音频输入设备枚举与首选设备回退 | [src/services/audioRecorder.ts](src/services/audioRecorder.ts) |
| `medicalData.ts` | 医疗数据匹配（诊断、药品、检查项）；同时负责根据 ICD-10 前三位类目码（如 `J06`）解析章节分组，用于推荐诊断分组展示 | [src/services/medicalData.ts](src/services/medicalData.ts) |
| `diagnosisPath.ts` | 诊断路径数据构建与独立窗口事件载荷封装；优先通过 LLM 生成结构化推理链，再在前端校验并映射为 Sankey 节点、连线和说明文案，失败时回退本地兜底链路；载荷中补充 `supportingEvidence`、`counterEvidence`、`differentialPoints` 三段式解释字段，供窗口右侧说明面板直接渲染 | [src/services/diagnosisPath.ts](src/services/diagnosisPath.ts) |
| `feedback.ts` | 会话反馈服务 | [src/services/feedback.ts](src/services/feedback.ts) |
| `operationTracker.ts` | 操作追踪和分析 | [src/services/operationTracker.ts](src/services/operationTracker.ts) |
| `themeService.ts` | 主题管理 | [src/services/themeService.ts](src/services/themeService.ts) |
| `pmphai.ts` | PMPHAI 集成 | [src/services/pmphai.ts](src/services/pmphai.ts) |
| `knowledgeBase.ts` | 知识库检索 | [src/services/knowledgeBase.ts](src/services/knowledgeBase.ts) |
| `types/consultationAssist.ts` | 主问诊灵活模式的动作类型、诊断路径候选类型与上下文结构定义，避免继续依赖历史 session 命名 | [src/types/consultationAssist.ts](src/types/consultationAssist.ts) |
| `templateService.ts` | 症状模板管理 | [src/services/templateService.ts](src/services/templateService.ts) |
| `factChecker.ts` | AI 防误防漏 / 审查能力 | [src/services/factChecker.ts](src/services/factChecker.ts) |
| `promptGuard.ts` | Prompt 注入与泄漏保护 | [src/services/promptGuard.ts](src/services/promptGuard.ts) |
| `textGeneration.ts` | 主诉/现病史等文本生成辅助 | [src/services/textGeneration.ts](src/services/textGeneration.ts) |
| `reportGenerator.ts` | 使用报告导出 | [src/services/reportGenerator.ts](src/services/reportGenerator.ts) |
| `regionalClient.ts` | 区域化核心客户端：终端注册、bootstrap 配置拉取、心跳、JWT 鉴权、SSE 流式代理 | [src/services/regionalClient.ts](src/services/regionalClient.ts) |
| `promptOverride.ts` | 远程 Prompt 覆盖层：管理端发布的自定义 prompt 替换本地默认值 | [src/services/promptOverride.ts](src/services/promptOverride.ts) |
| `auditUploader.ts` | 审计事件批量上报：离线队列 + 定时刷盘到区域平台 | [src/services/auditUploader.ts](src/services/auditUploader.ts) |

### 当前模板/映射读取策略

1. `templateService.ts` 以本地 JSON 模板为主；区域化模式下优先从远程缓存读取，本地仍作为兜底。
2. `medicalData.ts` 以本地 CSV / JSON 目录数据为主；区域化模式下可通过 `syncRemoteData()` 增量同步远程数据。
3. `catalog` 匹配归一化规则固定为：小写后去除空格、连字符、下划线（`/[\s_-]/g`），用于兼容 `tcm_diagnoses/tcm-diagnoses/tcm diagnoses` 等格式。
4. 西医推荐诊断的 UI 分组固定按 ICD-10 类目码前三位做章节归类；当编码无法解析到标准章节时，前端回退到"未分类/待确认"分组，避免丢失候选项。

### 区域化模式运行链路

当 `REGIONAL_ENABLED=true` 时，应用启动流程扩展为：

```
main.ts mount
    ↓
isRegionalMode() === true ?
    ↓ Yes
initializeRegionalClient()
    ├─ registerDevice() → POST /v1/client/register
    ├─ getBootstrapConfig() → GET /v1/client/bootstrap
    └─ startHeartbeat() (30s interval)
    ↓
Promise.allSettled([
    syncRemotePrompts(),    → GET /v1/client/prompts/delta
    syncRemoteTemplates(),  → GET /v1/client/templates/delta
    syncRemoteData(),       → GET /v1/client/mappings/delta
])
    ↓
startAuditUploader() (30s batch upload)
```

区域化模式下各服务的路由变化：

| 服务 | 本地模式 | 区域化模式 |
|------|----------|-----------|
| LLM Chat (stream) | 直连 apiUrl + apiKey | → SSE /v1/ai/chat (后端持有 apiKey) |
| LLM Chat (non-stream) | 直连 apiUrl + apiKey | → POST /v1/ai/chat |
| 语音转写 | 直连 Whisper | → POST /v1/ai/speech/transcribe |
| 阿里实时语音 | 直连 DashScope | → POST /v1/ai/speech/realtime |
| Prompt 来源 | 本地 prompts/index.ts | bootstrap + delta 覆盖 → 本地兜底 |
| 模板来源 | 本地 templates.json | delta 同步 → localStorage 缓存 → 本地兜底 |
| 医学数据 | 本地 CSV/JSON | delta 同步 → localStorage 缓存 → 本地兜底 |
| 操作日志 | 仅本地 SQLite | 本地写入 + auditUploader 批量上报 |
| Reviewer/PMPHAI/KB 配置 | localStorage | bootstrap 下发 |

### 当前本地桥接与知识库链路

1. `operationTracker.ts` 与 `feedback.ts` 负责本地操作追踪、会话统计和回溯。
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
  - speech provider 为 `openai-compatible` 时，不启用实时流式，统一走 `llm.ts/transcribeAudio` 的批量转写
  - `ChatPanel.vue` 与 `VoiceCapsule.vue` 共用同一套 speech config，不再分别读取互不一致的配置项
- 文本与语音支持独立配置域：
  - 文本模型使用 `OPENAI_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`
  - 语音转写使用独立的 speech provider / key / baseUrl / model；其中 OpenAI 兼容 speech provider 未填写 key 时可回退复用通用 LLM API Key
- 审查 AI（`factChecker.ts` -> `llm.ts/chat`）走独立的 `/chat/completions` 文本链路：
  - 配置项为 `REVIEWER_ENABLED`、`REVIEWER_API_KEY`、`REVIEWER_BASE_URL`、`REVIEWER_MODEL`
  - 若独立审查配置缺省，则回退到主模型配置
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
HIS 通过 GET /api/consultation/result 拉取草稿或引用请求
    ↓
PHIS 保存成功 / 失败后调用 POST /api/consultation/reference-feedback
    ↓
floating-ball 保持当前问诊页面展开，并在同一运行期内更新页面状态与日志
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
voiceConsultation.handleVoiceStop() (停止录音)
    ↓
llm.ts (调用 LLM API，生成结构化病历)
    ↓
JSON 解析验证 (useVoiceConsultation.ts)
    ↓
更新 generatedRecord (App.vue)
    ↓
VoiceConsultationResult.vue (编辑确认)
    ↓
voiceConsultation.handleResultConfirm()
    ↓
Tauri Command: complete_consultation
    ↓
HIS 系统 (通过 HTTP GET /api/consultation/result 获取)
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

### 添加新 Composable

1. 在 `src/composables/` 创建文件（使用 TypeScript）
2. 遵循命名规范：`use[功能名].ts`
3. 导出明确的接口：
   ```typescript
   export interface [功能名]Options {
     // 参数定义
   }

   export function use[功能名](options: [功能名]Options) {
     // 实现
     return {
       // 导出 API
     };
   }
   ```
4. 添加 JSDoc 文档注释
5. 更新本文档的 [组合式函数](#组合式函数-composables) 章节

### 添加新组件

1. 在 `src/components/` 创建 Vue 单文件组件
2. 明确定义 Props 和 Emits（使用 TypeScript）
3. 组件职责单一，避免过大
4. 更新本文档的 [组件](#组件-components) 章节
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

Composables (5 个)
├── useWindowManagement.ts (430 行)
├── useWorkMode.ts (428 行)
├── useEventListeners.ts (415 行)
├── useVoiceConsultation.ts (220 行)
└── useNavigation.ts (180 行)

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
import { useWindowManagement } from '@/composables/useWindowManagement';

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
