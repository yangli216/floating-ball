<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';

import ChatPanel from '@/components/ChatPanel.vue';
import SettingsPanel from '@/components/SettingsPanel.vue';
import ConsultationPage from '@/components/ConsultationPage.vue';
import { ConsultationResultPage } from '@features/consultation-result';
import { DiagnosisPathWindow } from '@features/diagnosis-path';
import { DifferentialDiagnosisModalPage } from '@features/differential-diagnosis';
import { FeedbackSubmissionPanel } from '@features/feedback';
import { InpatientEmrPage } from '@features/inpatient-emr';
import { KnowledgeBasePanel } from '@features/knowledge';
import { MedicalCatalogCachePanel } from '@features/medical-catalog';
import { OutpatientFollowUpPage } from '@features/outpatient-follow-up';
import { PatientMemoryWorkspace } from '@features/patient-memory';
import { ReceptionCapsule } from '@features/reception';
import { ChronicRefillConfirmationPage, RiskAlertPanel } from '@features/reception-risk';
import { ReportInterpretationWindow, ReportInterpretationWorkspace } from '@features/report-interpretation';
import { ForceUpdateGate, HisIntegrationLogPanel } from '@features/settings';
import { TreatmentPlanPage } from '@features/treatment-plan';
import { VoiceCapsule } from '@features/voice-consultation';
import type { AppPatient } from '@/types/appState';

const page = new URLSearchParams(window.location.search).get('page') || 'chat';

const patient: AppPatient = {
  identity: { patientId: 'P-AUDIT-001', visitId: 'V-AUDIT-001', tetId: 'T-AUDIT-001' },
  demographics: {
    patientName: '审查患者', genderCode: 'F', genderText: '女', ageText: '58岁', ageYears: 58,
  },
  clinical: {
    chiefComplaint: '反复头晕伴乏力3天',
    historyOfPresentIllness: '3天前无明显诱因出现头晕，久站时加重，伴乏力，无胸痛、晕厥。',
    pastMedicalHistory: '高血压病史8年，规律服药。',
    allergyHistory: '青霉素过敏，既往出现皮疹。',
    currentMedicationHistory: '氨氯地平片 5mg 每日一次。',
    familyHistory: '父亲有高血压病史。',
    diagnosis: '原发性高血压',
    currentVitalSigns: { systolicBloodPressure: 158, diastolicBloodPressure: 96, heartRate: 84 },
  },
  patientId: 'P-AUDIT-001', visitId: 'V-AUDIT-001', idPi: 'P-AUDIT-001', idVis: 'V-AUDIT-001', idTet: 'T-AUDIT-001',
  patientName: '审查患者', naPi: '审查患者', genderCode: 'F', genderText: '女', sdSexText: '女', ageText: '58岁', ageYears: 58,
  chiefComplaint: '反复头晕伴乏力3天',
  historyOfPresentIllness: '3天前无明显诱因出现头晕，久站时加重，伴乏力，无胸痛、晕厥。',
  pastMedicalHistory: '高血压病史8年，规律服药。',
  allergyHistory: '青霉素过敏，既往出现皮疹。',
  currentMedicationHistory: '氨氯地平片 5mg 每日一次。',
  familyHistory: '父亲有高血压病史。',
  diagnosis: '原发性高血压',
};

const riskItems = [
  { level: 1 as const, category: 'allergy', content: '青霉素过敏：处方前需核对交叉过敏风险' },
  { level: 2 as const, category: 'vital', content: '血压 158/96 mmHg，建议复测并评估控制情况' },
  { level: 3 as const, category: 'chronic', content: '高血压长期用药，需核对依从性与近期调整' },
];

const visits = [
  {
    visitId: 'V-HIS-001', visitTime: Date.now() - 86_400_000, deptName: '全科门诊',
    chiefComplaint: '头晕3天', presentIllness: '活动后头晕加重', diagnoses: ['原发性高血压'],
    medications: ['苯磺酸氨氯地平片'],
    reportedApplications: [
      { applicationId: 'LAB-001', applicationGroupId: 'LAB-G-001', name: '血常规', type: 'lab' as const, status: 'reported' as const, requestedAt: '2026-07-21 09:10:00' },
      { applicationId: 'LAB-002', applicationGroupId: 'LAB-G-001', name: 'C反应蛋白', type: 'lab' as const, status: 'reported' as const, requestedAt: '2026-07-21 09:10:00' },
    ],
  },
];

const followUpContext = {
  followUpEligible: true,
  source: { visitId: 'V-HIS-001', visitTime: '2026-07-21 09:00:00', documentTitle: '全科门诊病历' },
  currentDiagnosis: '原发性高血压',
  medicalRecordText: '患者反复头晕3天，既往高血压8年。查体：BP 158/96mmHg。',
  labReports: [
    {
      reportId: 'R-LAB-001', reportGroupId: 'RG-001', reportTime: '2026-07-21 10:20:00', reportName: '血常规 + CRP',
      applications: [{ applicationId: 'LAB-001', applicationName: '血常规' }, { applicationId: 'LAB-002', applicationName: 'C反应蛋白' }],
      items: [
        { itemName: '白细胞计数', result: '11.2', unit: '×10^9/L', referenceRange: '3.5–9.5', abnormal: true, direction: 'up' as const },
        { itemName: '血红蛋白', result: '132', unit: 'g/L', referenceRange: '115–150', abnormal: false, direction: 'normal' as const },
      ],
    },
  ],
  examReports: [
    { reportId: 'R-EXAM-001', reportTime: '2026-07-21 11:00:00', examName: '心电图', finding: '窦性心律', conclusion: '未见明显异常' },
  ],
};

const clinicalResult = {
  chiefComplaint: '反复头晕伴乏力3天',
  historyOfPresentIllness: '3天前出现头晕，久站加重，伴乏力，无胸痛、晕厥。',
  pastMedicalHistory: '高血压8年。',
  allergyHistory: '青霉素过敏。',
  currentMedicationHistory: '氨氯地平片 5mg qd。',
  familyHistory: '父亲有高血压。',
  symptoms: ['头晕', '乏力'], negativeSymptoms: ['胸痛', '晕厥'],
  diagnoses: [
    { name: '原发性高血压', code: 'I10.x00', confidence: 0.88, reason: '既往病史及当前血压升高', matchedItem: { id: 'D-I10', code: 'I10.x00', name: '原发性高血压' } },
    { name: '头晕', code: 'R42.x00', confidence: 0.62, reason: '当前主要症状', matchedItem: { id: 'D-R42', code: 'R42.x00', name: '头晕' } },
  ],
  treatments: [
    { type: 'medicine' as const, name: '苯磺酸氨氯地平片', reason: '继续控制血压', dosage: '5mg', frequency: '每日一次', route: '口服', quantity: 14, unit: '片', matchedItem: { id: 'M-001', name: '苯磺酸氨氯地平片', spec: '5mg×14片' } },
    { type: 'examination' as const, name: '动态血压监测', reason: '评估全天血压波动', matchedItem: { id: 'E-001', name: '动态血压监测' } },
    { type: 'labTest' as const, name: '肾功能', reason: '评估靶器官风险', matchedItem: { id: 'L-001', name: '肾功能' } },
  ],
  treatmentPlan: '建议复测血压，完善动态血压及肾功能评估。',
  healthEducation: '低盐饮食，规律服药，记录家庭血压。',
  recommendationPolicy: { autoFetchTreatments: false, allowTreatmentRefresh: false },
  generation: { status: 'complete' as const, readySections: ['record_core', 'history_context', 'diagnoses', 'recommendation_plan', 'record_extra'] },
};

const patientMemoryBrief = {
  memoryId: 'MEM-AUDIT-001', memoryVersion: 7, patientId: 'P-AUDIT-001', patientName: '审查患者', patientGender: '女', patientAge: '58岁',
  qualityStatus: 'conflicted' as const, conflictCount: 2, lastSyncTime: '2026-07-22 09:20:00',
  allergies: [
    { factId: 'F-A1', factType: 'allergy' as const, name: '青霉素过敏', status: 'active' as const, confidence: 'confirmed' as const, evidenceText: '2024年门诊过敏史：皮疹', origin: 'his', lastObservedAt: '2026-07-21 09:00:00' },
  ],
  chronicConditions: [
    { factId: 'F-C1', factType: 'chronic_condition' as const, name: '原发性高血压', status: 'active' as const, confidence: 'structured' as const, evidenceText: '连续8年诊断记录', origin: 'his', lastObservedAt: '2026-07-21 09:00:00' },
  ],
  recentDiagnoses: [
    { factId: 'F-D1', factType: 'diagnosis' as const, name: '头晕', status: 'active' as const, confidence: 'structured' as const, evidenceText: '本次门诊主诉', origin: 'outpatient_record', lastObservedAt: '2026-07-21 09:00:00' },
  ],
  recentMedications: [
    { factId: 'F-M1', factType: 'medication' as const, name: '苯磺酸氨氯地平片', valueText: '5mg 每日一次', status: 'active' as const, confidence: 'structured' as const, origin: 'visit_summary', lastObservedAt: '2026-07-21 09:00:00' },
  ],
  otherFacts: [
    { factId: 'F-V1', factType: 'vital' as const, name: '血压', valueText: '158/96 mmHg', status: 'active' as const, confidence: 'structured' as const, origin: 'his', lastObservedAt: '2026-07-21 09:05:00' },
    { factId: 'F-L1', factType: 'lab_result' as const, name: '白细胞计数', valueText: '11.2 ×10^9/L', status: 'active' as const, confidence: 'structured' as const, origin: 'lab_report', lastObservedAt: '2026-07-21 10:20:00' },
  ],
};

const chronicCandidate = {
  diagnosis: '原发性高血压', diagnoses: ['原发性高血压'], diagnosisGroups: ['高血压'],
  medications: ['苯磺酸氨氯地平片'], chronicVisitCount: 4, chronicVisits: visits,
  diagnosisEvidenceText: '近4次门诊均记录原发性高血压',
  medicationEvidenceText: '最近处方：苯磺酸氨氯地平片 5mg qd',
  evidenceText: '历史慢病诊断与处方连续',
};

const inpatientRequest = {
  admissionId: 'ADM-AUDIT-001', templateId: 'TPL-ADMISSION-001', templateName: '入院记录',
  htmlContent: '<section><h2>入院记录</h2><p data-field="chiefComplaint">主诉：{{chiefComplaint}}</p><p data-field="historyOfPresentIllness">现病史：{{historyOfPresentIllness}}</p></section>',
  recordTime: '2026-07-22 09:30:00',
  patient,
};

const forceUpdateState = {
  required: true, channel: 'testing' as const, channelLabel: '测试环境', currentVersion: '1.2.97', minSupportedVersion: '1.3.20', latestVersion: '1.3.24',
  message: '当前版本不再满足区域平台安全策略，请升级后继续使用。',
  policy: { channel: 'testing', latestVersion: '1.3.24', minSupportedVersion: '1.3.20', forceUpdate: true, notes: '修复患者上下文隔离与回写审计问题。' },
};

const pageTitle = computed(() => ({
  chat: '智医助理', settings: '系统设置', consultation: '智能问诊', 'clinical-result': '问诊结果',
  'risk-alert': '风险提示', 'reception-capsule': '接诊风险胶囊', 'chronic-refill': '复诊配药确认',
  'treatment-plan': '诊疗方案', 'outpatient-follow-up': '门诊复诊', 'report-workspace': '报告助手',
  'patient-memory': '患者健康画像', 'inpatient-emr': '住院病历生成', 'differential-diagnosis': '鉴别诊断',
  'knowledge-base': '知识库检索', 'his-log': 'HIS 联调日志', 'medical-cache': '缓存管理',
  'diagnosis-path': '诊断推理路径', 'report-window': '单报告解读', 'voice-capsule': '语音采集',
  'force-update': '强制升级', feedback: '问题反馈', 'floating-ball': '悬浮球',
}[page] || page));

const standalone = computed(() => ['diagnosis-path', 'report-window', 'voice-capsule', 'risk-alert', 'reception-capsule', 'differential-diagnosis', 'floating-ball'].includes(page));
</script>

<template>
  <main :class="['audit-stage', { 'audit-standalone': standalone }]" :data-audit-page="page">
    <div v-if="page === 'floating-ball'" class="audit-floating-ball">
      <div class="audit-floating-ball__orb"><img src="/robot-avatar.png" alt="智医助理" /></div>
    </div>

    <DiagnosisPathWindow v-else-if="page === 'diagnosis-path'" />
    <ReportInterpretationWindow v-else-if="page === 'report-window'" />
    <VoiceCapsule v-else-if="page === 'voice-capsule'" :processing="false" />
    <RiskAlertPanel v-else-if="page === 'risk-alert'" patient-name="审查患者" gender="F" :age="58" :risks="riskItems" />
    <ReceptionCapsule
      v-else-if="page === 'reception-capsule'"
      patient-name="审查患者" gender="F" :age="58" :risks="riskItems"
      :chronic-refill-candidate="chronicCandidate" :outpatient-follow-up-context="followUpContext"
      patient-memory-status="ready" :patient-memory-brief="patientMemoryBrief"
    />
    <DifferentialDiagnosisModalPage v-else-if="page === 'differential-diagnosis'" :patient="patient" />

    <section v-else class="audit-shell">
      <div class="audit-shell__body">
        <ChatPanel v-if="page === 'chat'" />
        <SettingsPanel v-else-if="page === 'settings'" />
        <ConsultationPage v-else-if="page === 'consultation'" :initial-patient-data="patient" :active="true" />
        <ConsultationResultPage v-else-if="page === 'clinical-result'" :initial-patient-data="patient" :intent-result="clinicalResult" intent-source="llm" channel="voice" consultation-round-id="ROUND-AUDIT-001" />
        <ChronicRefillConfirmationPage v-else-if="page === 'chronic-refill'" :patient="patient" :candidate="chronicCandidate" />
        <TreatmentPlanPage v-else-if="page === 'treatment-plan'" :patient="patient" />
        <OutpatientFollowUpPage v-else-if="page === 'outpatient-follow-up'" :patient="patient" :context="followUpContext" />
        <ReportInterpretationWorkspace v-else-if="page === 'report-workspace'" :patient="patient" :visits="visits" :follow-up-context="followUpContext" />
        <PatientMemoryWorkspace v-else-if="page === 'patient-memory'" :patient="patient" :brief="patientMemoryBrief" />
        <InpatientEmrPage v-else-if="page === 'inpatient-emr'" :request="inpatientRequest" :active="false" />
        <KnowledgeBasePanel v-else-if="page === 'knowledge-base'" search-keyword="高血压" />
        <HisIntegrationLogPanel v-else-if="page === 'his-log'" />
        <MedicalCatalogCachePanel v-else-if="page === 'medical-cache'" />
        <ForceUpdateGate v-else-if="page === 'force-update'" :state="forceUpdateState" />
        <FeedbackSubmissionPanel v-else-if="page === 'feedback'" variant="dialog" source-module="page-audit" consultation-id="V-AUDIT-001" />
        <div v-else class="audit-unknown">未知页面：{{ page }}</div>
      </div>
    </section>
    <span class="audit-watermark">{{ pageTitle }} · 脱敏审查构建</span>
  </main>
</template>
