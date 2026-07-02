# 统一临床结果内核首个里程碑 TODO

> 范围：路线图迭代 1「止血与质量基线」与迭代 2「统一临床结果内核」的第一轮可交付切片。
>
> 原则：本轮不改变诊断、治疗推荐、药品定稿或 PHIS 回写契约；先统一入口、类型与渠道派生，再继续迁移结果页实现。

## 基线

- `src/components/VoiceConsultationNew.vue`：2698 行，仍是共享结果页主体实现。
- `src/components/ConsultationPage.vue`：2434 行，只允许拆分和缩减。
- `src/App.vue`：1351 行，只保留应用编排，不新增业务逻辑。
- 智能问诊已经通过 `SymptomResultEntry -> ConsultationResultPage` 进入共享结果页。
- 语音问诊与复诊配药仍由 `App.vue` 直接引用 `VoiceConsultationNew.vue`，绕过 `features/consultation-result` 公开入口。
- `useClinicalResultChannelStrategy` 已覆盖日志类型、语音缓存、患者头和取消文案，但偏好追踪与诊断鉴别 trace 仍在页面按渠道分支。

## 本轮任务

### 文档与护栏

- [x] 记录真实文件规模、现有复用链路和本轮非目标。
- [x] 在 `ARCHITECTURE.md` 明确共享结果页唯一公开入口和依赖方向。
- [x] 在 `CODE_MAP.md` 更新结果页定位说明。
- [x] 增加架构测试，禁止 `App.vue`、症状问诊等业务入口直接引用根级结果页实现。

### 中性契约

- [x] 将 `ClinicalResultChannel` 下沉到 `features/clinical-result` 中性契约。
- [x] `ConsultationResultPage` 使用统一 channel 类型，并补齐语音轮次参数透传。
- [x] `App.vue` 改为只通过 `@features/consultation-result` 公开入口渲染结果页。

### 渠道 Strategy

- [x] 将推荐偏好 tracking context 收口到 `useClinicalResultChannelStrategy`。
- [x] 将诊断鉴别 trace context 收口到 `useClinicalResultChannelStrategy`。
- [x] 清除结果页主体内对 `props.channel === 'symptom'` 的散落判断。
- [x] 为 `voice / symptom / chronic-refill / undefined` 补充单元测试。

### 验证

- [x] `yarn type-check`
- [x] `yarn test:unit`（37 个文件、132 个测试通过）
- [x] `yarn build`
- [x] `cargo check`
- [x] `git diff --check`

## 非目标

1. 本轮不移动 `VoiceConsultationNew.vue` 的物理路径；先让所有调用方经过 feature 公开入口，后续再把实现迁入 `features/consultation-result/ui`。
2. 本轮不修改 `complete_consultation`、`record-confirmed` 或 `/api/consultation/*` 契约，因此不更新 `api.md`。
3. 本轮不统一语音专属反馈与安全复核 UI，不改变缓存清理、诊毕、放弃或回执后的产品语义。
4. 本轮不新增 Pinia store，不调整主窗口几何和 Tauri capability。

## 完成定义

1. App、智能问诊和复诊配药都只从 `@features/consultation-result` 消费结果页入口。
2. 渠道类型由 `features/clinical-result` 定义，页面不再各自复制联合类型。
3. 渠道相关的无副作用派生由 Strategy 统一提供，结果页主体不再散落 symptom/voice 判断。
4. 架构护栏与 Strategy 单测通过，完整前端与 Rust 最小质量门禁通过。

---

## 第二切片：诊断鉴别 Controller

> 目标：删除共享结果页与独立鉴别诊断窗口中重复的 checklist 解析和诊断不匹配判断；共享结果页只注入 LLM 请求、trace 与提示副作用。

### 文档与边界

- [x] 在架构与代码地图中声明 checklist 纯规则和结果页 controller 的权威归属。
- [x] 保持独立鉴别诊断窗口与共享结果页的窗口形态、入口和产品语义不变。

### 纯规则与 Controller

- [x] 新增 `features/clinical-result/diagnosisChecklist.ts`，统一响应类型、条目归一、关键不匹配判断和风险项映射。
- [x] 独立鉴别诊断窗口改用共享纯规则，删除重复实现。
- [x] 新增 `features/consultation-result/model/useClinicalResultDiagnosisChecklist.ts`，管理弹窗状态、请求生命周期、空态和错误态。
- [x] `VoiceConsultationNew.vue` 只保留 Prompt/LLM 请求与渠道 trace 注入。

### 测试与验证

- [x] checklist 纯规则单元测试。
- [x] checklist controller 成功、空结果、关键不匹配、异常和迟到响应路径单元测试。
- [x] `yarn type-check`
- [x] `yarn test:unit`（39 个文件、141 个测试通过）
- [x] `yarn build`
- [x] `cargo check`
- [x] `git diff --check`
