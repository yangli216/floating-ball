<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';
import type { ChronicRefillReviewOption, ChronicRefillReviewPlan } from '@/types/consultation';

defineProps<{
  plan: ChronicRefillReviewPlan;
  selections: Record<string, string>;
  expanded: boolean;
  reviewedCount: number;
  treatmentReviewTriggered: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'toggle', value: boolean): void;
  (event: 'select', itemId: string, option: ChronicRefillReviewOption): void;
}>();
</script>

<template>
  <section class="refill-review-anchor" @click.stop>
    <button
      class="refill-review-trigger"
      type="button"
      :aria-expanded="expanded"
      @click.stop="emit('toggle', !expanded)"
    >
      <Icon icon="lucide:clipboard-check" size="14" aria-hidden="true" />
      <span>复诊参考</span>
      <span class="refill-review-trigger-count">{{ plan.items.length }}项</span>
    </button>

    <section
      v-if="expanded"
      class="refill-review-popover"
      role="dialog"
      aria-label="慢病复诊核查参考"
      tabindex="-1"
      @keydown.esc.stop="emit('toggle', false)"
    >
      <header class="refill-review-head">
        <div class="refill-review-title">
          <strong>复诊核查参考</strong>
          <span>可选 · 已处理 {{ reviewedCount }}/{{ plan.items.length }}</span>
        </div>
        <button class="refill-review-close" type="button" title="关闭" aria-label="关闭慢病复诊核查" @click.stop="emit('toggle', false)">
          <Icon icon="lucide:x" size="17" aria-hidden="true" />
        </button>
      </header>

      <div class="refill-review-body">
        <p
          class="refill-review-guide"
          :title="plan.summary || '按需核查当前用药、病情控制和相关不适。'"
        >
          {{ plan.summary || '按需核查当前用药、病情控制和相关不适。' }}
        </p>
        <p v-if="treatmentReviewTriggered" class="refill-review-warning">
          <Icon icon="lucide:triangle-alert" size="14" />
          已发现可能影响续方的情况，药品需由医生重新核查并选择。
        </p>

        <div class="refill-review-list">
          <article v-for="item in plan.items" :key="item.id" class="refill-review-item">
            <div class="refill-review-item-head">
              <strong>{{ item.question }}</strong>
              <span
                v-if="item.basis"
                class="refill-review-basis-help"
                :title="`核查依据：${item.basis}`"
                aria-label="查看核查依据"
              >
                <Icon icon="lucide:circle-help" size="13" aria-hidden="true" />
              </span>
            </div>
            <p v-if="item.description" class="refill-review-description" :title="item.description">
              {{ item.description }}
            </p>
            <div class="refill-review-options">
              <button
                v-for="option in item.options"
                :key="option.value"
                type="button"
                :class="['refill-review-option', { selected: selections[item.id] === option.value }]"
                :disabled="disabled"
                @click="emit('select', item.id, option)"
              >
                <Icon v-if="selections[item.id] === option.value" icon="lucide:check" size="13" />
                <span>{{ option.label }}</span>
                <small v-if="item.recommendedValue === option.value && !selections[item.id]">建议</small>
              </button>
            </div>
          </article>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.refill-review-anchor { position: relative; display: inline-flex; }
.refill-review-trigger { min-height: 30px; padding: 4px 9px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid #bfdbfe; border-radius: 9px; color: #1d4ed8; background: #eff6ff; cursor: pointer; white-space: nowrap; }
.refill-review-trigger:hover { border-color: #93c5fd; background: #dbeafe; }
.refill-review-trigger-count { min-width: 27px; padding: 1px 5px; border-radius: 999px; background: rgba(255, 255, 255, 0.75); font-size: 10px; text-align: center; }
.refill-review-popover { position: absolute; top: calc(100% + 8px); right: 0; z-index: 40; width: min(500px, 52vw); max-height: min(430px, 55vh); display: flex; flex-direction: column; border: 1px solid #bfdbfe; border-radius: 11px; background: var(--voice-surface); box-shadow: 0 14px 32px rgba(15, 23, 42, 0.18); cursor: default; overflow: hidden; }
.refill-review-head { padding: 9px 11px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--voice-border); background: #f8fbff; }
.refill-review-title { min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.refill-review-head strong { color: var(--voice-text); font-size: 15px; }
.refill-review-title span { color: var(--voice-text-muted); font-size: 11px; white-space: nowrap; }
.refill-review-close { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; border: 0; border-radius: 7px; color: var(--voice-text-muted); background: transparent; cursor: pointer; }
.refill-review-close:hover { color: var(--voice-text); background: var(--voice-surface-muted); }
.refill-review-body { min-height: 0; padding: 0 12px 6px; overflow-y: auto; }
.refill-review-guide { margin: 8px 0 4px; color: var(--voice-text-muted); font-size: 11.5px; line-height: 1.45; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.refill-review-warning { margin: 7px 0 2px; padding: 6px 8px; display: flex; align-items: center; gap: 5px; border-radius: 7px; color: #9a3412; background: #fff7ed; font-size: 11.5px; }
.refill-review-list { display: flex; flex-direction: column; }
.refill-review-item { padding: 9px 0; border-bottom: 1px solid var(--voice-border); }
.refill-review-item:last-child { border-bottom: 0; }
.refill-review-item-head { display: flex; align-items: center; gap: 5px; color: var(--voice-text); font-size: 13px; line-height: 1.4; }
.refill-review-item-head strong { min-width: 0; }
.refill-review-basis-help { display: inline-flex; flex: 0 0 auto; color: var(--voice-text-muted); cursor: help; }
.refill-review-description { margin: 3px 0 0; color: var(--voice-text-muted); font-size: 11.5px; line-height: 1.4; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.refill-review-options { margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 5px; }
.refill-review-option { min-height: 27px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 3px; border: 1px solid var(--voice-border); border-radius: 7px; color: var(--voice-text); background: var(--voice-surface); font-size: 12px; cursor: pointer; }
.refill-review-option.selected { border-color: #3b82f6; color: #1d4ed8; background: #dbeafe; }
.refill-review-option:disabled { cursor: not-allowed; opacity: 0.58; }
.refill-review-option small { margin-left: 2px; color: #9a6200; font-size: 10px; }
</style>
