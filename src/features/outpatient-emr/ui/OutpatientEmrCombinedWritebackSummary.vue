<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';

defineProps<{
  templateFieldCount: number;
  recordFieldCount: number;
  diagnosisCount: number;
  orderCount: number;
}>();
</script>

<template>
  <aside class="combined-summary" aria-label="本次合并回写范围">
    <span class="summary-icon"><Icon icon="lucide:merge" :size="17" /></span>
    <div class="summary-copy">
      <strong>一次确认，统一回写</strong>
      <span>动态模板字段与语音问诊中已选内容会合并为同一条 PHIS 请求</span>
    </div>
    <div class="summary-counts">
      <span>模板字段 <b>{{ templateFieldCount }}</b></span>
      <span>病历段 <b>{{ recordFieldCount }}</b></span>
      <span>诊断 <b>{{ diagnosisCount }}</b></span>
      <span>医嘱 <b>{{ orderCount }}</b></span>
    </div>
  </aside>
</template>

<style scoped>
.combined-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  color: #1e3a8a;
  background: #eff6ff;
}

.summary-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  color: #fff;
  background: #2563eb;
}

.summary-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.summary-copy strong { font-size: 13px; }
.summary-copy span { color: #475569; font-size: 12px; }

.summary-counts {
  display: flex;
  margin-left: auto;
  gap: 8px;
  white-space: nowrap;
}

.summary-counts span {
  padding: 5px 8px;
  border-radius: 7px;
  color: #475569;
  background: rgb(255 255 255 / 75%);
  font-size: 12px;
}

.summary-counts b { color: #1d4ed8; }

@media (max-width: 760px) {
  .combined-summary { align-items: flex-start; flex-wrap: wrap; }
  .summary-counts { width: 100%; margin-left: 44px; flex-wrap: wrap; }
}
</style>
