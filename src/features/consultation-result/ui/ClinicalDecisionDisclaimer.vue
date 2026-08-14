<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';
</script>

<template>
  <p class="clinical-decision-disclaimer" role="note">
    <Icon icon="lucide:info" size="14" aria-hidden="true" />
    <span>AI 内容仅供辅助参考，请结合患者实际情况完成临床判断并确认后回写。</span>
  </p>
</template>

<style scoped>
.clinical-decision-disclaimer {
  display: inline-flex;
  flex: 1 1 360px;
  align-items: center;
  gap: 6px;
  min-width: 240px;
  margin: 0 auto 0 0;
  color: var(--voice-text-muted, #475569);
  font-size: 12px;
  line-height: 1.45;
}

.clinical-decision-disclaimer :deep(svg) {
  flex: 0 0 auto;
  color: var(--voice-accent, #2b7fe3);
}
</style>
