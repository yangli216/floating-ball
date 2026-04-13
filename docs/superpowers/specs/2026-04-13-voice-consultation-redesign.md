# 语音问诊重构设计

## 背景

现有语音问诊实现（VoiceConsultationPage.vue，20000+行）偏离了原始需求：
- 界面未基于现有智能问诊（ConsultationPage）的布局
- 流程过于复杂（三阶段），组件臃肿
- 医生口述治疗方案的优先匹配逻辑不够突出

原始需求核心：语音录制 → 意图识别 → 自动填充到类似智能问诊的界面 → 医生确认/编辑 → 提交。特别强调：**医生口述了治疗方案时，优先基于口述内容进行项目匹配**。

## 整体流程

```
VoiceCapsule(360x80, 录音)
  → ASR 实时转写
  → 录音停止
  → useVoiceIntentRecognition (意图识别 + 医疗数据匹配)
  → VoiceConsultationNew(1080x720, 病历编辑页)
  → complete_consultation → HIS
```

## 组件设计

### 新建: VoiceConsultationNew.vue

目标行数: 500-800行。

**Props:**
```typescript
interface Props {
  initialPatientData?: Patient;
  intentResult: VoiceIntentResult;  // 来自 useVoiceIntentRecognition
}
```

**Emits:**
```typescript
defineEmits<{
  close: [];
}>();
```

### 页面布局

全宽两栏，1080x720，参考 ConsultationPage 的 record 视图样式。

**顶部: 患者信息栏**
- 复用 ConsultationPage 的 patient-header 样式
- 显示: 姓名、性别、年龄、身份证号、联系电话
- 右侧操作按钮: "确认提交"（一键回写到 PHIS）

**左栏: 主诉与病史（可编辑）**

| 区域 | 数据来源 | 交互 |
|------|---------|------|
| 主诉 (Chief Complaint) | `intentResult.chiefComplaint` | 可编辑文本输入 |
| 现病史 (HPI) | `intentResult.historyOfPresentIllness` | 可编辑多行文本区 |
| 既往史 (Past History) | `intentResult.pastMedicalHistory` | 可编辑文本输入 |

**右栏: 诊断与治疗方案**

| 区域 | 说明 |
|------|------|
| 初步诊断 | 诊断列表（可选中/取消）+ "AI推荐诊断"按钮 |
| 治疗方案 | 分四类显示: 药品、检查、检验、处置 |

### 治疗方案交互（核心逻辑）

这是本次重构的关键差异点：**医生口述优先**。

#### 情况 A：医生语音中说了治疗方案

`intentResult.treatments` 不为空时：

1. 页面打开即显示已匹配的项目，按类型分组（药品/检查/检验/处置）
2. 每项显示：
   - 匹配成功：项目名称 + 规格 + 用法用量，默认勾选，绿色状态
   - 匹配失败：原始口述文本 + 警告标识，医生可手动搜索替换
3. 药品额外显示：dosage、frequency、usage（来自意图识别提取）
4. 诊断区域仍显示"AI推荐诊断"按钮，供医生补充

#### 情况 B：医生语音中没有说治疗方案

`intentResult.treatments` 为空时：

1. 治疗方案区域显示空状态 + "AI推荐诊断"按钮（醒目）
2. 点击"AI推荐诊断" → 调用 `DiagnosisRecommendationPrompt`（入参: 主诉、现病史、患者信息）→ 显示 2-3 个诊断建议
3. 医生选中一个诊断 → 出现"AI推荐治疗方案"按钮
4. 点击"AI推荐治疗方案" → 调用 `TreatmentRecommendationPrompt`（入参: 已选诊断、主诉、患者信息）→ 显示药品推荐列表
5. 医生勾选需要的项目

#### 混合情况

医生口述了部分治疗（比如只说了药品没说检查）：

- 已口述的部分直接显示匹配结果（默认勾选）
- 未覆盖的类别：如果已有选中诊断，该类别显示"AI推荐"按钮；如果没有诊断，走情况B的完整流程（先推荐诊断再推荐治疗）
- AI推荐治疗时只补充未覆盖的类别，不覆盖已口述的内容

### AI 推荐调用

复用现有 prompts.ts 中的 Prompt：

| 功能 | Prompt | 入参 |
|------|--------|------|
| 诊断推荐 | `DiagnosisRecommendationPrompt` | patientName, gender, age, chiefComplaint, historyOfPresentIllness |
| 治疗推荐 | `TreatmentRecommendationPrompt` | patientName, gender, age, diagnosisName, diagnosisCode, chiefComplaint |

推荐结果需经过 `medicalDataService` 匹配本地数据库，确保有标准编码。

## 提交流程

完全复用现有 API，不做任何修改。

**提交方式: 一键回写**

调用 `invoke('complete_consultation', { result })` ，payload 结构：

```typescript
{
  consultationId: string;       // 患者ID
  timestamp: number;
  resultType: 'batch';          // 批量回写
  requestId: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  diagnosisList: Array<{
    name: string;
    code: string;
    isTCM?: boolean;
  }>;
  medications: Array<{
    name: string;
    spec?: string;
    usage?: string;
    idMedPro?: string;          // 匹配到的药品库ID
  }>;
  examinations: Array<{
    name: string;
    idCli?: string;
  }>;
  labTests: Array<{
    name: string;
    idCli?: string;
  }>;
  procedures: Array<{
    name: string;
    idCli?: string;
  }>;
  treatmentPlan: string;        // 文本摘要
}
```

HIS 通过 `GET /api/consultation/result` 获取结果。

## 路由与视图变更

### ViewType

保留 `voice-consultation`，映射到新组件。

### App.vue 变更

1. 删除 `VoiceConsultationPage` 的 import 和渲染
2. 新增 `VoiceConsultationNew` 的 import 和渲染
3. VoiceCapsule 停止录音后的回调中：
   - 调用 `useVoiceIntentRecognition.processTranscript(transcribedText)`
   - 识别成功 → 保存 intentResult → 切换到 `voice-consultation` 视图
   - 识别失败 → 显示错误 toast，留在当前状态

### windowSizes.ts

无变更。`voice-consultation` 已配置为 1080x720。

## 删除清单

| 文件 | 原因 |
|------|------|
| `src/components/VoiceConsultationPage.vue` | 20000+行旧实现，完全替换 |

### 保留清单（复用不修改）

| 文件 | 用途 |
|------|------|
| `src/components/VoiceCapsule.vue` | 录音组件 |
| `src/composables/useVoiceIntentRecognition.ts` | 意图识别逻辑 |
| `src/prompts/voiceIntentPrompts.ts` | 意图识别 Prompt |
| `src/prompts/prompts.ts` | 诊断/治疗推荐 Prompt |
| `src/services/medicalData.ts` | 医疗数据匹配 |
| `src/services/aliyunSpeech.ts` | ASR 服务 |
| `src/types/consultation.ts` | 类型定义 |

## 状态管理

VoiceConsultationNew 内部状态（均为组件局部 ref）：

```typescript
// 病历字段（从 intentResult 初始化，可编辑）
chiefComplaint: ref<string>
historyOfPresentIllness: ref<string>
pastMedicalHistory: ref<string>

// 诊断
diagnoses: ref<Diagnosis[]>              // AI推荐的诊断列表
selectedDiagnosis: ref<Diagnosis | null> // 医生选中的诊断

// 治疗方案（四类独立管理）
medications: ref<TreatmentRecommendation[]>
examinations: ref<TreatmentRecommendation[]>
labTests: ref<TreatmentRecommendation[]>
procedures: ref<TreatmentRecommendation[]>

// UI 状态
isRecommendingDiagnosis: ref<boolean>
isRecommendingTreatment: ref<boolean>
```

初始化逻辑：
1. 从 `intentResult` 填充 chiefComplaint、historyOfPresentIllness、pastMedicalHistory
2. 将 `intentResult.treatments` 按 type 分组填入 medications/examinations/labTests/procedures
3. 匹配成功的项目默认 `selected: true`

## 不在范围内

- 中医诊断/治疗流程（本次仅处理西医）
- 打印/报告预览功能
- 引用状态回执（referenceStatus）的完整轮询
- VoiceCapsule 组件的任何修改
- 语音实时转写的 UI 改动
