<script setup lang="ts">
import { computed } from 'vue';
import type {
  MutualRecognitionDecisionType,
  MutualRecognitionItem,
} from '../../clinical-result/mutualRecognition';

const props = defineProps<{
  open: boolean;
  message: string;
  items: MutualRecognitionItem[];
  selectedItemIds: string[];
  submitting?: boolean;
}>();

const emit = defineEmits<{
  toggleItem: [idSrv: string, selected: boolean];
  toggleAll: [];
  decision: [decision: MutualRecognitionDecisionType];
}>();

const selectedSet = computed(() => new Set(props.selectedItemIds));
const allSelected = computed(() => (
  props.items.length > 0 && props.selectedItemIds.length === props.items.length
));

function formatPrice(value?: number): string {
  return typeof value === 'number' ? `¥${value.toFixed(2)}` : '';
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mutual-recognition-overlay">
      <section
        class="mutual-recognition-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mutual-recognition-title"
      >
        <header class="mutual-recognition-header">
          <div>
            <h2 id="mutual-recognition-title">检验检查互认提示</h2>
            <p>{{ message }}</p>
          </div>
          <span class="mutual-recognition-count">{{ selectedItemIds.length }}/{{ items.length }} 项</span>
        </header>

        <div class="mutual-recognition-toolbar">
          <label>
            <input
              type="checkbox"
              :checked="allSelected"
              :disabled="submitting"
              @change="emit('toggleAll')"
            >
            <span>选择全部可互认项目</span>
          </label>
          <span>可取消部分项目后再确认</span>
        </div>

        <div class="mutual-recognition-list">
          <label
            v-for="item in items"
            :key="item.idSrv"
            class="mutual-recognition-item"
          >
            <input
              type="checkbox"
              :checked="selectedSet.has(item.idSrv)"
              :disabled="submitting"
              @change="emit('toggleItem', item.idSrv, ($event.target as HTMLInputElement).checked)"
            >
            <span class="mutual-recognition-item-main">
              <strong>{{ item.name }}</strong>
              <span>
                {{ item.type === 'examination' ? '检查' : '检验' }}
                <template v-if="item.mutualRecognitionCode"> · 互认编码 {{ item.mutualRecognitionCode }}</template>
              </span>
            </span>
            <span v-if="formatPrice(item.priceSale)" class="mutual-recognition-price">
              {{ formatPrice(item.priceSale) }}
            </span>
          </label>
        </div>

        <p class="mutual-recognition-note">
          确认互认后，PHIS 将按所选项目复用近期报告；未选项目仍按原开立流程处理。
        </p>

        <footer class="mutual-recognition-actions">
          <button type="button" class="mutual-recognition-btn plain" :disabled="submitting" @click="emit('decision', 'cancel')">
            取消
          </button>
          <button type="button" class="mutual-recognition-btn secondary" :disabled="submitting" @click="emit('decision', 'not_recognize')">
            不互认
          </button>
          <button
            type="button"
            class="mutual-recognition-btn primary"
            :disabled="submitting || selectedItemIds.length === 0"
            @click="emit('decision', 'recognize')"
          >
            {{ submitting ? '提交中…' : `确认互认（${selectedItemIds.length}项）` }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.mutual-recognition-overlay {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(2px);
}

.mutual-recognition-dialog {
  width: min(560px, calc(100vw - 32px));
  max-height: min(680px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid #dbe5ef;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.24);
  color: #1e293b;
}

.mutual-recognition-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid #e8eef5;
}

.mutual-recognition-header h2 { margin: 0; font-size: 18px; line-height: 1.4; }
.mutual-recognition-header p { margin: 8px 0 0; color: #64748b; font-size: 14px; line-height: 1.6; }
.mutual-recognition-count { flex: none; margin-top: 2px; color: #2563eb; font-size: 13px; font-weight: 600; }

.mutual-recognition-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 24px;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
}

.mutual-recognition-toolbar label { display: flex; align-items: center; gap: 8px; color: #334155; font-weight: 600; }
.mutual-recognition-list { max-height: 340px; overflow-y: auto; padding: 8px 24px; }
.mutual-recognition-item { display: flex; align-items: center; gap: 12px; padding: 14px 4px; border-bottom: 1px solid #edf2f7; cursor: pointer; }
.mutual-recognition-item:last-child { border-bottom: 0; }
.mutual-recognition-item input, .mutual-recognition-toolbar input { width: 16px; height: 16px; accent-color: #2563eb; }
.mutual-recognition-item-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
.mutual-recognition-item-main strong { font-size: 15px; line-height: 1.4; }
.mutual-recognition-item-main span { overflow: hidden; color: #64748b; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.mutual-recognition-price { flex: none; color: #475569; font-size: 13px; }
.mutual-recognition-note { margin: 0; padding: 12px 24px; border-top: 1px solid #e8eef5; background: #f8fbff; color: #64748b; font-size: 12px; line-height: 1.6; }
.mutual-recognition-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px 20px; }
.mutual-recognition-btn { min-height: 38px; padding: 0 18px; border: 1px solid transparent; border-radius: 9px; font-size: 14px; font-weight: 600; cursor: pointer; }
.mutual-recognition-btn:disabled { cursor: not-allowed; opacity: .55; }
.mutual-recognition-btn.plain { border-color: #dbe3ec; background: #fff; color: #64748b; }
.mutual-recognition-btn.secondary { border-color: #cbd5e1; background: #f8fafc; color: #334155; }
.mutual-recognition-btn.primary { background: #2563eb; color: #fff; }
</style>
