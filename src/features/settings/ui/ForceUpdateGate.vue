<template>
  <div class="force-update-gate">
    <div class="gate-content">
      <div class="force-update-header">
        <div class="icon-circle">
          <Icon icon="lucide:arrow-up-circle" size="32" class="update-icon" />
        </div>
        <div class="title-section">
          <div class="force-update-title">需要更新后继续使用</div>
          <div class="force-update-subtitle">
            {{ state.message || '当前客户端版本过低，请升级到所需的最低版本后继续使用。' }}
          </div>
        </div>
        <div class="force-update-channel">{{ state.channelLabel }}</div>
      </div>

      <div class="force-update-meta">
        <div class="meta-item">
          <span class="meta-label">当前版本</span>
          <strong class="meta-value">{{ state.currentVersion || 'unknown' }}</strong>
        </div>
        <div class="meta-item">
          <span class="meta-label">最低要求</span>
          <strong class="meta-value">{{ state.minSupportedVersion || state.latestVersion || '--' }}</strong>
        </div>
        <div class="meta-item">
          <span class="meta-label">最新版本</span>
          <strong class="meta-value">{{ state.latestVersion || '--' }}</strong>
        </div>
      </div>

      <div class="update-section">
        <UpdateChecker forced />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import UpdateChecker from './UpdateChecker.vue';
import Icon from '@shared/ui/Icon.vue';
import type { ForceUpdateState } from '@services/updatePolicy';

defineProps<{
  state: ForceUpdateState;
}>();
</script>

<style scoped>
.force-update-gate {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 32px 24px;
  background: var(--color-background-white, #fff);
  color: var(--color-text-primary, #0f172a);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gate-content {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
}

.force-update-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  margin-bottom: 32px;
  position: relative;
}

.icon-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(8, 145, 178, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.update-icon {
  color: var(--color-primary, #0891B2);
}

.title-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.force-update-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-strong, #0f172a);
}

.force-update-subtitle {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-muted, #475569);
  max-width: 400px;
}

.force-update-channel {
  position: absolute;
  top: 0;
  right: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(29, 158, 117, 0.12);
  color: #13795b;
  font-size: 12px;
  font-weight: 600;
}

.force-update-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 32px;
  background: var(--color-background-gray, #f8fafc);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--color-border-light, #e2e8f0);
}

.meta-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.meta-item:not(:last-child) {
  border-right: 1px dashed var(--color-border-light, #cbd5e1);
}

.meta-label {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  font-weight: 500;
}

.meta-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-strong, #0f172a);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.update-section {
  width: 100%;
}

@media (max-width: 640px) {
  .force-update-gate {
    padding: 24px 16px;
  }

  .force-update-meta {
    gap: 8px;
    padding: 16px 12px;
  }
  
  .meta-value {
    font-size: 14px;
  }
}
</style>
