<template>
  <div
    class="quality-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="回写前病历质控"
  >
    <section class="quality-dialog">
      <header class="quality-head">
        <div>
          <span>回写前质控</span>
          <strong>发现 {{ issues.length }} 项需确认的风险</strong>
        </div>
        <button
          class="icon-btn"
          type="button"
          title="关闭"
          :disabled="isWritingBack"
          @click="$emit('cancel')"
        >
          <Icon icon="lucide:x" :size="18" />
        </button>
      </header>

      <main class="quality-body">
        <p class="quality-intro">
          医生已在预览中确认病历内容；以下为回写前自动质控提醒。请返回预览修改，或确认风险可接受后继续回写。
        </p>

        <div class="issue-summary">
          <span class="summary-pill is-high">
            高风险 {{ highRiskCount }}
          </span>
          <span class="summary-pill is-medium">
            提醒 {{ mediumRiskCount }}
          </span>
        </div>

        <div class="issue-list">
          <article
            v-for="issue in issues"
            :key="issue.id"
            class="issue-item"
            :class="`is-${issue.severity}`"
          >
            <span class="issue-icon">
              <Icon :icon="issue.severity === 'high' ? 'lucide:triangle-alert' : 'lucide:info'" :size="16" />
            </span>
            <div class="issue-copy">
              <div class="issue-title-row">
                <strong>{{ issue.title }}</strong>
                <small>{{ issue.severity === 'high' ? '高风险' : '提醒' }}</small>
              </div>
              <p>{{ issue.description }}</p>
            </div>
          </article>
        </div>

        <div
          v-if="writebackMessage"
          class="quality-status"
          :class="`is-${writebackStatus}`"
        >
          <Icon :icon="writebackStatus === 'error' ? 'lucide:triangle-alert' : 'lucide:info'" :size="15" />
          <span>{{ writebackMessage }}</span>
        </div>
      </main>

      <footer class="quality-footer">
        <button
          class="ghost-btn"
          type="button"
          :disabled="isWritingBack"
          @click="$emit('cancel')"
        >
          返回预览修改
        </button>
        <button
          class="primary-btn"
          type="button"
          :disabled="isWritingBack"
          @click="$emit('confirm')"
        >
          <Icon icon="lucide:send-horizontal" :size="16" />
          <span>{{ isWritingBack ? '发送中' : '确认继续回写' }}</span>
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import type { InpatientEmrQualityIssue } from '../types';

const props = defineProps<{
  issues: InpatientEmrQualityIssue[];
  isWritingBack: boolean;
  writebackStatus: 'idle' | 'pending' | 'success' | 'error';
  writebackMessage: string;
}>();

defineEmits<{
  cancel: [];
  confirm: [];
}>();

const highRiskCount = computed(() => props.issues.filter((issue) => issue.severity === 'high').length);
const mediumRiskCount = computed(() => props.issues.filter((issue) => issue.severity === 'medium').length);
</script>

<style scoped>
.quality-overlay {
  position: absolute;
  inset: 0;
  z-index: 24;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(15, 31, 37, 0.3);
  backdrop-filter: blur(7px);
}

.quality-dialog {
  width: min(620px, 100%);
  max-height: min(680px, calc(100vh - 44px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  border-radius: 8px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(101, 125, 134, 0.22);
  box-shadow: 0 26px 70px rgba(12, 28, 34, 0.24);
}

.quality-head,
.quality-footer,
.issue-summary,
.issue-item,
.issue-title-row,
.quality-status {
  display: flex;
  align-items: center;
}

.quality-head {
  justify-content: space-between;
  gap: 12px;
}

.quality-head div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.quality-head span {
  color: #b64b22;
  font-size: 12px;
  font-weight: 800;
}

.quality-head strong {
  color: #1d2b32;
  font-size: 18px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: transparent;
  color: #31505a;
  cursor: pointer;
}

.icon-btn:disabled {
  color: #8a989e;
  cursor: not-allowed;
}

.quality-body {
  min-height: 0;
  display: grid;
  gap: 12px;
  overflow: hidden;
}

.quality-intro {
  margin: 0;
  color: #52666d;
  font-size: 13px;
  line-height: 1.6;
}

.issue-summary {
  gap: 8px;
}

.summary-pill {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 800;
}

.summary-pill.is-high {
  color: #9e2f18;
  background: #fff0ec;
  border: 1px solid #f5c6ba;
}

.summary-pill.is-medium {
  color: #8a5b0a;
  background: #fff7df;
  border: 1px solid #ead18b;
}

.issue-list {
  min-height: 0;
  display: grid;
  gap: 8px;
  overflow: auto;
  padding-right: 4px;
}

.issue-item {
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 7px;
  border: 1px solid rgba(100, 121, 129, 0.16);
  background: #f7fafb;
}

.issue-item.is-high {
  border-color: #f0b8aa;
  background: #fff6f3;
}

.issue-item.is-medium {
  border-color: #e8d49a;
  background: #fffaf0;
}

.issue-icon {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: #a04a20;
  background: rgba(255, 255, 255, 0.72);
}

.issue-copy {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.issue-title-row {
  gap: 8px;
}

.issue-title-row strong {
  min-width: 0;
  color: #203940;
  font-size: 14px;
}

.issue-title-row small {
  flex: none;
  color: #7d8a8f;
  font-size: 12px;
}

.issue-copy p {
  margin: 0;
  color: #52666d;
  font-size: 13px;
  line-height: 1.5;
}

.quality-status {
  gap: 7px;
  padding: 9px 10px;
  border-radius: 7px;
  font-size: 13px;
  color: #31505a;
  background: #f1f6f7;
  border: 1px solid rgba(101, 125, 134, 0.18);
}

.quality-status.is-success {
  color: #0d7566;
  background: #ecfbf6;
  border-color: #bfe7dc;
}

.quality-status.is-error {
  color: #9e2f18;
  background: #fff0ec;
  border-color: #f0b8aa;
}

.quality-status.is-pending {
  color: #1f6682;
  background: #eef8fc;
  border-color: #b9ddea;
}

.quality-footer {
  justify-content: flex-end;
  gap: 10px;
}

.ghost-btn,
.primary-btn {
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 7px;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.ghost-btn {
  color: #31505a;
  background: #f5f8f9;
  border: 1px solid rgba(99, 119, 126, 0.18);
}

.primary-btn {
  color: white;
  background: #12806f;
  border: 1px solid rgba(16, 115, 100, 0.22);
  box-shadow: 0 8px 20px rgba(18, 128, 111, 0.2);
}

.ghost-btn:disabled,
.primary-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

@media (max-width: 680px) {
  .quality-overlay {
    padding: 14px;
  }

  .quality-dialog {
    max-height: calc(100vh - 28px);
  }
}
</style>
