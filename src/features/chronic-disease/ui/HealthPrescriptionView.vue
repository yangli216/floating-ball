<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { formatUserFacingError } from '@shared/lib/errorMessages';
import { saveChronicArtifactSnapshot } from '../api/chronicDiseaseApi';
import { generateHealthPrescriptionDraft } from '../api/healthPrescriptionService';
import { buildHealthPrescriptionSnapshotRequest } from '../lib/chronicArtifactSnapshot';
import type {
  ChronicDiseaseWindowPayload,
  HealthPrescriptionDraft,
  HealthPrescriptionSuggestion,
  PrescriptionSuggestionCategory,
} from '../types';

const props = defineProps<{
  payload: ChronicDiseaseWindowPayload;
}>();

const generating = ref(false);
const draft = ref<HealthPrescriptionDraft | null>(null);
const errorMessage = ref('');
const doctorNotes = ref('');
const doctorName = ref(props.payload.summary.doctorName || '');
const savingSnapshot = ref(false);
const savedMessage = ref('');
const pendingRequestId = ref('');

const categoryLabels: Record<PrescriptionSuggestionCategory, string> = {
  test: '检查检验',
  'medicine-review': '用药复核',
  lifestyle: '生活方式',
};

const groupedSuggestions = computed(() => {
  const groups = new Map<PrescriptionSuggestionCategory, HealthPrescriptionSuggestion[]>();
  (draft.value?.suggestions || []).forEach((item) => {
    groups.set(item.category, [...(groups.get(item.category) || []), item]);
  });
  return Array.from(groups.entries());
});

const acceptedCount = computed(() => draft.value?.suggestions.filter((item) => item.accepted).length || 0);
const acceptedSignature = computed(() => (
  draft.value?.suggestions.filter((item) => item.accepted).map((item) => item.id).sort().join('|') || ''
));
const latestPressure = computed(() => {
  const points = props.payload.summary.bloodPressurePoints;
  return points[points.length - 1];
});
const latestGlucose = computed(() => {
  const points = props.payload.summary.bloodGlucosePoints;
  return points[points.length - 1];
});
const medicationSummaryText = computed(() => (
  props.payload.summary.recentMedicationSummaries
  || props.payload.summary.recentMedicationNames
).join('、') || '待核实');

async function generate(): Promise<void> {
  generating.value = true;
  errorMessage.value = '';
  try {
    draft.value = await generateHealthPrescriptionDraft(props.payload.summary);
    savedMessage.value = '';
    pendingRequestId.value = '';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '健康处方草稿生成失败。';
  } finally {
    generating.value = false;
  }
}

function toggle(item: HealthPrescriptionSuggestion): void {
  item.accepted = !item.accepted;
}

watch([acceptedSignature, doctorNotes, doctorName], () => {
  pendingRequestId.value = '';
  savedMessage.value = '';
});

async function printPrescription(): Promise<void> {
  if (!draft.value || acceptedCount.value === 0) {
    errorMessage.value = '请至少采纳一项建议后再打印。';
    return;
  }
  if (!doctorName.value.trim()) {
    errorMessage.value = '请填写打印医生姓名。';
    return;
  }

  savingSnapshot.value = true;
  errorMessage.value = '';
  savedMessage.value = '';
  pendingRequestId.value ||= crypto.randomUUID();

  try {
    const response = await saveChronicArtifactSnapshot(buildHealthPrescriptionSnapshotRequest({
      requestId: pendingRequestId.value,
      payload: props.payload,
      draft: draft.value,
      doctorName: doctorName.value,
      doctorNotes: doctorNotes.value,
    }));
    savedMessage.value = `已留痕：${response.snapshotId}`;
    pendingRequestId.value = '';
    await nextTick();
    window.print();
  } catch (error) {
    errorMessage.value = formatUserFacingError(error, {
      fallback: '健康处方留痕失败，尚未进入打印。',
    });
  } finally {
    savingSnapshot.value = false;
  }
}
</script>

<template>
  <div class="prescription-view">
    <div class="patient-strip">
      <strong>{{ payload.summary.name }}</strong>
      <span>{{ payload.summary.gender }} · {{ payload.summary.ageText }}</span>
      <span>{{ payload.summary.diseaseTags.map((item) => item.label).join(' · ') || '慢病信息待核实' }}</span>
      <span class="data-time">数据截至 {{ payload.summary.latestDataAt ? new Date(payload.summary.latestDataAt).toLocaleString('zh-CN') : '待核实' }}</span>
    </div>

    <div class="prescription-layout">
      <aside class="evidence-panel">
        <p class="eyebrow">Patient evidence</p>
        <h2>患者证据</h2>
        <dl>
          <div>
            <dt>最近血压</dt>
            <dd v-if="payload.summary.bloodPressurePoints.length">
              {{ latestPressure?.systolic }}/{{ latestPressure?.diastolic }} mmHg
            </dd>
            <dd v-else>暂无有效记录</dd>
          </div>
          <div>
            <dt>最近血糖</dt>
            <dd v-if="payload.summary.bloodGlucosePoints.length">
              {{ latestGlucose?.value }} mmol/L
            </dd>
            <dd v-else>暂无有效记录</dd>
          </div>
          <div>
            <dt>当前诊断</dt>
            <dd>{{ payload.summary.diagnosisText }}</dd>
          </div>
          <div>
            <dt>近期用药事实</dt>
            <dd>{{ medicationSummaryText }}</dd>
          </div>
        </dl>
        <p class="source-note">只使用当前可追溯患者事实；缺失项保持“待核实”。</p>
      </aside>

      <main class="prescription-main">
        <div class="main-heading">
          <div>
            <p class="eyebrow">Doctor-confirmed draft</p>
            <h2>AI 辅助健康处方草稿</h2>
            <span>默认不采纳，由医生逐项确认。</span>
          </div>
          <button type="button" class="generate-button" :disabled="generating" @click="generate">
            <Icon :icon="generating ? 'lucide:loader-circle' : 'lucide:sparkles'" size="17" :class="{ spinning: generating }" />
            {{ generating ? '正在生成…' : draft ? '重新生成草稿' : '生成 AI 草稿' }}
          </button>
        </div>

        <div v-if="errorMessage" class="error-state">{{ errorMessage }}</div>

        <div v-if="!draft && !generating" class="empty-state">
          <Icon icon="lucide:clipboard-plus" size="34" />
          <strong>尚未生成健康处方草稿</strong>
          <span>AI 将基于当前患者证据提出检查检验、用药复核和生活方式建议。</span>
        </div>

        <template v-if="draft">
          <div class="draft-summary">
            <Icon :icon="draft.source === 'ai' ? 'lucide:sparkles' : 'lucide:shield-check'" size="18" />
            <span>{{ draft.summary }}</span>
            <small>{{ draft.source === 'ai' ? 'AI 草稿' : '受控降级草稿' }}</small>
          </div>

          <section v-for="[category, items] in groupedSuggestions" :key="category" class="suggestion-section">
            <header>
              <h3>{{ categoryLabels[category] }}</h3>
              <span>{{ items.filter((item) => item.accepted).length }}/{{ items.length }} 已采纳</span>
            </header>
            <button
              v-for="item in items"
              :key="item.id"
              type="button"
              class="suggestion-item"
              :class="{ accepted: item.accepted }"
              :aria-pressed="item.accepted"
              @click="toggle(item)"
            >
              <span class="check-box"><Icon v-if="item.accepted" icon="lucide:check" size="14" /></span>
              <span class="suggestion-copy">
                <strong>{{ item.title }}</strong>
                <span>{{ item.detail }}</span>
                <small>依据：{{ item.reason }}</small>
              </span>
            </button>
          </section>

          <label class="notes-field">
            医生确认与个体化补充
            <textarea v-model="doctorNotes" rows="4" maxlength="1000" placeholder="记录医生确认后的可执行内容" />
          </label>
          <label class="doctor-name-field">
            打印医生
            <input v-model="doctorName" maxlength="64" placeholder="请输入医生姓名" />
          </label>

          <div class="safety-note">
            <Icon icon="lucide:shield-alert" size="17" />
            {{ draft.safetyNote }}
          </div>
        </template>
      </main>
    </div>

    <footer class="window-footer">
      <span v-if="errorMessage" class="error-footer">{{ errorMessage }}</span>
      <span v-else-if="savedMessage" class="saved-footer">{{ savedMessage }}</span>
      <span v-else>{{ draft ? `已采纳 ${acceptedCount} 项；打印前将保存确认快照` : '等待生成草稿' }}</span>
      <button type="button" class="primary-button" :disabled="!draft || acceptedCount === 0 || !doctorName.trim() || savingSnapshot" @click="printPrescription">
        <Icon :icon="savingSnapshot ? 'lucide:loader-circle' : 'lucide:printer'" size="17" :class="{ spinning: savingSnapshot }" />
        {{ savingSnapshot ? '正在留痕…' : '存档并打印' }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.prescription-view { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; background: #fff; }
.patient-strip { min-height: 50px; padding: 8px 16px; display: flex; align-items: center; gap: 9px; color: #64748b; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
.patient-strip strong { color: #1e293b; font-size: 14px; }
.data-time { margin-left: auto; color: #94a3b8; }
.prescription-layout { min-height: 0; display: grid; grid-template-columns: 260px minmax(0, 1fr); overflow: hidden; }
.evidence-panel { padding: 20px; overflow-y: auto; background: #f8fafc; border-right: 1px solid #e2e8f0; }
.eyebrow { margin: 0 0 4px; color: #64748b; font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
.evidence-panel h2, .main-heading h2 { margin: 0; color: #1e293b; font-size: 17px; }
.evidence-panel dl { margin: 16px 0; }
.evidence-panel dl > div { padding: 11px 0; border-bottom: 1px solid #e2e8f0; }
.evidence-panel dt { color: #64748b; font-size: 10px; }
.evidence-panel dd { margin: 4px 0 0; color: #1e293b; font-size: 11px; line-height: 1.5; }
.source-note { color: #94a3b8; font-size: 9px; line-height: 1.6; }
.prescription-main { min-width: 0; padding: 20px; overflow-y: auto; }
.main-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.main-heading span { display: block; margin-top: 4px; color: #64748b; font-size: 10px; }
.generate-button { min-height: 36px; padding: 8px 12px; display: inline-flex; align-items: center; gap: 6px; color: #fff; background: #2b7fe3; border: 1px solid #2b7fe3; border-radius: 6px; }
.empty-state { min-height: 280px; display: grid; place-content: center; justify-items: center; gap: 8px; color: #94a3b8; text-align: center; }
.empty-state strong { color: #475569; font-size: 14px; }
.empty-state span { max-width: 360px; font-size: 11px; line-height: 1.6; }
.draft-summary { margin: 16px 0; padding: 11px; display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; align-items: start; color: #1d4ed8; background: #eff6ff; border-radius: 7px; font-size: 11px; line-height: 1.6; }
.draft-summary small { color: #64748b; font-size: 9px; }
.suggestion-section { margin-top: 16px; }
.suggestion-section header { margin-bottom: 7px; display: flex; align-items: center; justify-content: space-between; }
.suggestion-section h3 { margin: 0; color: #334155; font-size: 13px; }
.suggestion-section header span { color: #64748b; font-size: 9px; }
.suggestion-item { width: 100%; padding: 11px; margin-bottom: 7px; display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 9px; color: #334155; text-align: left; background: #fff; border: 1px solid #e2e8f0; border-radius: 7px; }
.suggestion-item.accepted { background: #f0fdf4; border-color: #86efac; }
.check-box { width: 18px; height: 18px; display: grid; place-items: center; color: #fff; border: 1px solid #94a3b8; border-radius: 4px; }
.accepted .check-box { background: #10b981; border-color: #10b981; }
.suggestion-copy { min-width: 0; display: grid; gap: 4px; }
.suggestion-copy strong { font-size: 12px; }
.suggestion-copy span { color: #475569; font-size: 10px; line-height: 1.5; }
.suggestion-copy small { color: #94a3b8; font-size: 9px; line-height: 1.5; }
.notes-field { margin-top: 18px; display: grid; gap: 6px; color: #475569; font-size: 11px; font-weight: 650; }
.notes-field textarea { padding: 9px; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 6px; resize: vertical; line-height: 1.6; }
.doctor-name-field { margin-top: 12px; display: flex; align-items: center; gap: 8px; color: #475569; font-size: 11px; font-weight: 650; }
.doctor-name-field input { width: 180px; padding: 8px 9px; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 6px; }
.safety-note { margin-top: 12px; padding: 9px 10px; display: flex; align-items: flex-start; gap: 6px; color: #92400e; background: #fffbeb; border-radius: 6px; font-size: 10px; line-height: 1.5; }
.error-state { margin-top: 14px; padding: 10px; color: #b91c1c; background: #fef2f2; border-radius: 6px; font-size: 11px; }
.window-footer { min-height: 60px; padding: 10px 16px; display: flex; align-items: center; justify-content: flex-end; gap: 10px; color: #64748b; border-top: 1px solid #e2e8f0; font-size: 10px; }
.window-footer > span { margin-right: auto; }
.error-footer { color: #b91c1c; }
.saved-footer { color: #047857; }
.primary-button { min-height: 36px; padding: 8px 15px; display: inline-flex; align-items: center; gap: 6px; color: #fff; background: #2b7fe3; border: 1px solid #2b7fe3; border-radius: 6px; }
button:disabled { opacity: 0.55; cursor: not-allowed; }
.spinning { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media print {
  .generate-button, .window-footer { display: none !important; }
  .prescription-layout { display: block; overflow: visible; }
  .evidence-panel, .prescription-main { overflow: visible; border: 0; }
  .prescription-view { height: auto; }
}
</style>
