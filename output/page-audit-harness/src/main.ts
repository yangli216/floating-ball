import { createApp } from 'vue';
import { addCollection } from '@iconify/vue/offline';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { iconifyCollections } from '@/icons/iconifyCollections';
import AuditApp from './AuditApp.vue';

import '@/styles/design-tokens.css';
import '@/styles/global-overrides.css';
import '@/styles/utilities.css';
import '@/styles/global.css';
import '@/styles/layouts/app-layout.css';
import '@/styles/animations/morph.css';
import './audit.css';

iconifyCollections.forEach((collection) => addCollection(collection as never));

mockWindows('main', 'diagnosis-path', 'report-interpretation');

const mockHisLogs = [
  {
    id: 'audit-log-1',
    traceId: 'trace-audit-001',
    direction: 'inbound',
    operation: 'consultation.receive',
    path: '/api/consultation/receive',
    status: 'success',
    httpStatus: 200,
    businessCode: '0',
    durationMs: 42,
    createdAt: Date.now() - 180_000,
    patientId: 'P-AUDIT-001',
    consultationId: 'V-AUDIT-001',
    requestId: 'req-audit-001',
    requestSummary: { patient: '已脱敏', source: 'page-audit' },
    responseSummary: { accepted: true },
  },
  {
    id: 'audit-log-2',
    traceId: 'trace-audit-002',
    direction: 'outbound',
    operation: 'record.confirmed',
    path: '/phis/record-confirmed',
    status: 'business_error',
    httpStatus: 200,
    businessCode: 'CATALOG_MISMATCH',
    durationMs: 318,
    createdAt: Date.now() - 90_000,
    patientId: 'P-AUDIT-001',
    consultationId: 'V-AUDIT-001',
    requestId: 'req-audit-002',
    requestSummary: { diagnosisCount: 1, orderCount: 3 },
    responseSummary: { message: '标准目录待确认' },
  },
];

const diagnosisPathPayload = {
  patientName: '审查患者', diagnosisName: '原发性高血压', diagnosisCode: 'I10.x00', diagnosisRate: '88%',
  chapterTitle: '循环系统疾病', chapterRange: 'I00–I99',
  summary: '既往高血压病史与当前血压升高共同支持原发性高血压，仍需排除继发性因素。',
  rationale: '关键事实经诊断章节归类、支持证据与鉴别诊断三层汇总。',
  supportingEvidence: ['高血压病史8年', '当前血压 158/96 mmHg', '长期使用氨氯地平'],
  counterEvidence: ['本次头晕不能仅由血压升高解释', '尚缺少动态血压与肾功能结果'],
  differentialPoints: ['继发性高血压：结合肾功能及内分泌检查', '体位性低血压：核对卧立位血压'],
  facts: ['58岁', '反复头晕伴乏力3天', '血压 158/96 mmHg', '高血压病史8年'],
  alternatives: [
    { name: '体位性低血压', code: 'I95.1', rate: '42%', rationale: '久站加重，需查卧立位血压' },
    { name: '继发性高血压', code: 'I15.9', rate: '28%', rationale: '仍需排除肾性及内分泌因素' },
  ],
  nodes: [
    { name: '58岁', depth: 0 }, { name: '反复头晕伴乏力3天', depth: 0 }, { name: '血压 158/96 mmHg', depth: 0 },
    { name: '支持证据', depth: 1 }, { name: '循环系统疾病', depth: 1 },
    { name: '原发性高血压（I10.x00）', depth: 2 }, { name: '体位性低血压（I95.1）', depth: 2 }, { name: '继发性高血压（I15.9）', depth: 2 },
  ],
  links: [
    { source: '58岁', target: '循环系统疾病', value: 30 },
    { source: '反复头晕伴乏力3天', target: '支持证据', value: 58 },
    { source: '血压 158/96 mmHg', target: '支持证据', value: 88 },
    { source: '支持证据', target: '原发性高血压（I10.x00）', value: 88 },
    { source: '循环系统疾病', target: '原发性高血压（I10.x00）', value: 70 },
    { source: '支持证据', target: '体位性低血压（I95.1）', value: 42 },
    { source: '循环系统疾病', target: '继发性高血压（I15.9）', value: 28 },
  ],
  generatedAt: '2026-07-22 10:30:00',
};

const reportWindowPayload = {
  requestId: 'REPORT-AUDIT-001', taskId: 'inspectReport', reportKindLabel: '检验报告',
  patientSummary: '审查患者 · 女 · 58岁 · 高血压病史8年',
  patient: { patientId: 'P-AUDIT-001', patientName: '审查患者', genderText: '女', ageText: '58岁', diagnosis: '原发性高血压' },
  reportMeta: { reportTitle: '血常规 + C反应蛋白', reportDate: '2026-07-21 10:20', outpatientNo: 'AUDIT-001', submitDoctor: '审查医生' },
  abnormalItems: [
    { name: '白细胞计数', result: '11.2 ×10^9/L', direction: 'up', referenceRange: '3.5–9.5', meaning: '轻度升高，结合感染症状判断', urgency: 'medium' },
    { name: 'C反应蛋白', result: '18 mg/L', direction: 'up', referenceRange: '0–8', meaning: '提示存在炎症反应', urgency: 'medium' },
  ],
  abnormalAssessmentComplete: true,
  sourceQuery: '白细胞 11.2×10^9/L，CRP 18mg/L，其余项目未见明显异常。',
  summary: '白细胞与 C 反应蛋白轻度升高，提示近期可能存在炎症反应。',
  conclusion: '当前结果需结合发热、咳嗽等症状判断，暂未见需要紧急处理的指标。',
  keyPoints: [
    { title: '炎症指标轻度升高', detail: '建议结合症状、体温和病程复查。', urgency: 'medium' },
    { title: '其余血常规项目稳定', detail: '血红蛋白与血小板未见明显异常。', urgency: 'low' },
  ],
  sections: [
    { title: '临床意义', content: '轻度升高常见于近期感染或非特异性炎症反应。' },
    { title: '结合病史', content: '患者以头晕为主诉，需核对是否同时存在发热或呼吸道症状。' },
  ],
  recommendations: ['询问发热、咳嗽等感染相关症状', '必要时 3–5 天复查血常规与 CRP'],
  cautions: ['若出现高热、气促或意识改变，应及时进一步评估'],
  followUpAssessment: { actionability: 'observe', summary: '当前以观察和复查为主。', problems: [], medicationIntents: [] },
  generatedAt: '2026-07-22 10:31:00',
};

mockIPC((cmd, args) => {
  if (cmd === 'list_his_integration_logs') return mockHisLogs;
  if (cmd === 'get_medical_catalog_debug_state') {
    return {
      dbPath: '/audit/medical-catalog.db',
      diagnosisCount: 3286,
      itemCount: 1458,
      medicineCount: 6821,
      syncStates: [
        { catalogType: 'diagnoses', orgCode: 'AUDIT', lastSyncAt: Date.now() - 3_600_000 },
        { catalogType: 'items', orgCode: 'AUDIT', lastSyncAt: Date.now() - 3_300_000 },
        { catalogType: 'medicines', orgCode: 'AUDIT', lastSyncAt: Date.now() - 3_000_000 },
      ],
    };
  }
  if (cmd === 'load_medical_catalog_snapshot') {
    return { diagnoses: [], items: [], medicines: [], syncStates: [] };
  }
  if (cmd === 'get_device_mac_address') return 'AUDIT-DEVICE';
  if (cmd === 'plugin:app|version') return '1.2.97';
  if (cmd === 'plugin:event|listen') {
    const eventArgs = args as { event?: string; handler?: number };
    const payload = eventArgs.event === 'diagnosis-path:update'
      ? diagnosisPathPayload
      : eventArgs.event === 'report-interpretation:update'
        ? reportWindowPayload
        : undefined;
    if (payload && typeof eventArgs.handler === 'number') {
      window.setTimeout(() => {
        window.__TAURI_INTERNALS__.runCallback(eventArgs.handler!, {
          id: 1,
          event: eventArgs.event,
          payload,
        });
      }, 80);
    }
    return 1;
  }
  if (cmd === 'plugin:event|unlisten') return null;
  if (cmd.startsWith('plugin:store|')) return null;
  if (cmd.startsWith('plugin:dialog|')) return false;
  return null;
});

const app = createApp(AuditApp);
app.provide('showToast', (message: string) => console.info('[page-audit toast]', message));
app.mount('#app');
