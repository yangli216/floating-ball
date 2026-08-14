<script setup lang="ts">
import type { Diagnosis } from '@/types/consultation';

defineProps<{ diagnoses: Diagnosis[] }>();
</script>

<template>
  <section v-if="diagnoses.length" class="diagnosis-differential-list">
    <div class="diagnosis-differential-head">
      <strong>待鉴别方向</strong>
      <span>需补充信息后再判断，不参与回写</span>
    </div>
    <article v-for="diagnosis in diagnoses" :key="`${diagnosis.code}-${diagnosis.name}`">
      <div>
        <strong>{{ diagnosis.name }}</strong>
        <span v-if="diagnosis.rate">{{ diagnosis.rate }}</span>
      </div>
      <p>{{ diagnosis.rationale || '当前证据不足，建议结合进一步问诊、查体或检查确认。' }}</p>
      <p v-if="diagnosis.missingInformation" class="missing-information">仍需确认：{{ diagnosis.missingInformation }}</p>
    </article>
  </section>
</template>

<style scoped>
.diagnosis-differential-list { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--voice-border); }
.diagnosis-differential-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.diagnosis-differential-head strong { color: var(--voice-text); font-size: 13px; }
.diagnosis-differential-head span { color: var(--voice-text-muted); font-size: 12px; }
article { padding: 9px 10px; border: 1px solid var(--voice-border); border-radius: 9px; background: var(--voice-surface-soft); }
article + article { margin-top: 7px; }
article > div { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
article strong { color: var(--voice-text); font-size: 13px; }
article span { color: #9a6200; font-size: 12px; }
article p { margin: 5px 0 0; color: var(--voice-text-muted); font-size: 12px; line-height: 1.5; }
.missing-information { color: #9a6200; }
</style>
