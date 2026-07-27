<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';
import type {
  AnnualAssessmentDraft,
  AnnualAssessmentEvidenceState,
  AnnualAssessmentPriority,
} from '../types';

defineProps<{
  draft: AnnualAssessmentDraft;
}>();

const evidenceLabels: Record<AnnualAssessmentEvidenceState, string> = {
  supported: '有证据',
  insufficient: '待核实',
};

const priorityLabels: Record<AnnualAssessmentPriority, string> = {
  routine: '常规复核',
  attention: '优先关注',
};
</script>

<template>
  <article class="assessment-result">
    <div class="result-summary">
      <span class="summary-icon"><Icon :icon="draft.source === 'ai' ? 'lucide:sparkles' : 'lucide:shield-check'" size="18" /></span>
      <div>
        <strong>{{ draft.overallSummary }}</strong>
        <span>{{ draft.source === 'ai' ? 'AI 评估草稿' : '受控降级评估' }} · 生成于 {{ new Date(draft.generatedAt).toLocaleString('zh-CN') }}</span>
      </div>
    </div>

    <div class="section-grid">
      <section v-for="section in draft.sections" :key="section.key" class="assessment-section">
        <header class="section-heading">
          <div>
            <h3>{{ section.title }}</h3>
            <p>{{ section.summary }}</p>
          </div>
          <span>{{ section.findings.length }} 项</span>
        </header>

        <div class="finding-list">
          <div
            v-for="item in section.findings"
            :key="`${item.content}:${item.evidence}`"
            class="finding-item"
            :class="{ attention: item.priority === 'attention' }"
          >
            <div class="finding-status">
              <span :class="item.evidenceState">{{ evidenceLabels[item.evidenceState] }}</span>
              <small>{{ priorityLabels[item.priority] }}</small>
            </div>
            <p>{{ item.content }}</p>
            <span class="finding-evidence">依据：{{ item.evidence }}</span>
          </div>
        </div>
      </section>
    </div>

    <div class="review-grid">
      <section class="review-card missing-card">
        <h3><Icon icon="lucide:circle-help" size="16" /> 待补齐资料</h3>
        <ul>
          <li v-for="item in draft.missingData" :key="item">{{ item }}</li>
        </ul>
      </section>
      <section class="review-card">
        <h3><Icon icon="lucide:clipboard-check" size="16" /> 医生确认重点</h3>
        <ul>
          <li v-for="item in draft.doctorReviewPoints" :key="item">{{ item }}</li>
        </ul>
      </section>
    </div>

    <div class="safety-note">
      <Icon icon="lucide:shield-alert" size="17" />
      <span>{{ draft.safetyNote }}</span>
    </div>
  </article>
</template>

<style scoped>
.assessment-result { display: grid; gap: 14px; }
.result-summary {
  padding: 13px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 9px;
}
.summary-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #fff;
  background: #2563eb;
  border-radius: 8px;
}
.result-summary strong { display: block; color: #1e3a8a; font-size: 12px; line-height: 1.65; }
.result-summary span { display: block; margin-top: 4px; color: #64748b; font-size: 9px; }
.section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.assessment-section { min-width: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 9px; }
.section-heading {
  padding: 12px 13px 10px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #e2e8f0;
}
.section-heading h3 { margin: 0; color: #1e293b; font-size: 13px; }
.section-heading p { margin: 4px 0 0; color: #64748b; font-size: 9px; line-height: 1.5; }
.section-heading > span {
  flex: 0 0 auto;
  padding: 3px 7px;
  color: #475569;
  background: #f1f5f9;
  border-radius: 999px;
  font-size: 8px;
}
.finding-list { display: grid; }
.finding-item { padding: 11px 13px; border-top: 1px dashed #e2e8f0; }
.finding-item:first-child { border-top: 0; }
.finding-item.attention { background: #fffdf5; }
.finding-status { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.finding-status > span { padding: 2px 6px; border-radius: 999px; font-size: 8px; }
.finding-status .supported { color: #047857; background: #d1fae5; }
.finding-status .insufficient { color: #b45309; background: #fef3c7; }
.finding-status small { color: #94a3b8; font-size: 8px; }
.finding-item p { margin: 7px 0 4px; color: #334155; font-size: 10px; line-height: 1.65; }
.finding-evidence { color: #94a3b8; font-size: 8px; line-height: 1.5; }
.review-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.review-card { padding: 13px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 9px; }
.review-card h3 { margin: 0 0 8px; display: flex; align-items: center; gap: 6px; color: #334155; font-size: 12px; }
.review-card ul { margin: 0; padding-left: 18px; color: #475569; font-size: 9px; line-height: 1.8; }
.missing-card { background: #fffaf0; border-color: #fde68a; }
.missing-card h3 { color: #92400e; }
.safety-note {
  padding: 10px 12px;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: #92400e;
  background: #fffbeb;
  border-radius: 8px;
  font-size: 9px;
  line-height: 1.6;
}
.safety-note :deep(svg) { flex: 0 0 auto; }

@media (max-width: 980px) {
  .section-grid, .review-grid { grid-template-columns: 1fr; }
}

@media print {
  .section-grid, .review-grid { grid-template-columns: 1fr 1fr; break-inside: auto; }
  .assessment-section, .review-card { break-inside: avoid; }
}
</style>
