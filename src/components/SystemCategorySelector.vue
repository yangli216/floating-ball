<template>
  <div class="system-category-selector">
    <!-- 搜索框 - 始终显示在顶部 -->
    <div class="top-search-box">
      <input
        type="text"
        v-model="searchQuery"
        placeholder="搜索症状(支持首字母)..."
        class="top-search-input"
      />
    </div>

    <div class="selector-header">
      <h4>选择症状</h4>
      <button class="clear-btn" @click="clearSelection" v-if="selectedCategories.length > 0">
        清空
      </button>
    </div>

    <div class="systems-grid">
      <div
        v-for="system in systems"
        :key="system.key"
        :class="['system-card', { active: isSelected(system.key) }]"
        @click="toggleSystem(system.key)"
      >
        <div class="system-icon">
          <Icon :icon="system.icon" size="32" />
        </div>
        <span class="system-label">{{ system.label }}</span>
      </div>
    </div>

    <!-- 症状区域：有搜索词时显示搜索结果，无搜索词时按系统显示 -->
    <div class="category-symptoms">
      <!-- 搜索结果模式 -->
      <template v-if="searchQuery.trim()">
        <div v-if="searchResultSymptoms.length > 0" class="symptom-chips">
          <button
            v-for="symptom in searchResultSymptoms"
            :key="symptom.key"
            :class="['symptom-chip', { active: isSymptomSelected(symptom.key) }]"
            @click="handleSymptomClick(symptom)"
          >
            {{ symptom.name }}
          </button>
        </div>
        <div v-else class="no-symptoms">未找到相关症状</div>
      </template>
      <!-- 选择系统模式 -->
      <template v-else-if="selectedCategories.length > 0">
        <div v-if="filteredSymptoms.length > 0">
          <h5>
            已选择 {{ selectedCategories.length }} 个系统
            <span class="symptom-count">({{ filteredSymptoms.length }} 个症状)</span>
          </h5>
          <div class="symptom-chips">
            <button
              v-for="symptom in filteredSymptoms"
              :key="symptom.key"
              :class="['symptom-chip', { active: isSymptomSelected(symptom.key) }]"
              @click="handleSymptomClick(symptom)"
            >
              {{ symptom.name }}
            </button>
          </div>
        </div>
        <div v-else class="no-symptoms">所选系统暂无相关症状</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, PropType } from 'vue';
import Pinyin from 'tiny-pinyin';
import Icon from './Icon.vue';

interface Symptom {
  key: string;
  name: string;
  bodyParts: string[];
  systemCategory: string[];
}

const props = defineProps({
  symptoms: {
    type: Array as PropType<Symptom[]>,
    required: true
  },
  selectedSymptoms: {
    type: Array as PropType<{ key: string }[]>,
    default: () => []
  }
});

const emit = defineEmits<{
  (e: 'select-symptom', symptom: Symptom): void;
}>();

const handleSymptomClick = (symptom: Symptom) => {
  emit('select-symptom', symptom);
  searchQuery.value = '';
};

const isSymptomSelected = (key: string) => {
  return props.selectedSymptoms.some(s => s.key === key);
};

const selectedCategories = ref<string[]>([]);
const searchQuery = ref('');

const systems = [
  {
    key: 'respiratory',
    label: '呼吸系统',
    icon: 'healthicons:lungs'
  },
  {
    key: 'circulatory',
    label: '循环系统',
    icon: 'mdi:heart-pulse'
  },
  {
    key: 'digestive',
    label: '消化系统',
    icon: 'healthicons:stomach'
  },
  {
    key: 'urinary',
    label: '泌尿系统',
    icon: 'healthicons:kidneys'
  },
  {
    key: 'reproductive',
    label: '生殖系统',
    icon: 'mdi:gender-male-female'
  },
  {
    key: 'nervous',
    label: '神经系统',
    icon: 'mdi:brain'
  },
  {
    key: 'endocrine',
    label: '内分泌系统',
    icon: 'mdi:flask'
  },
  {
    key: 'motor',
    label: '运动系统',
    icon: 'mdi:run'
  },
  {
    key: 'other',
    label: '其他',
    icon: 'mdi:dots-horizontal-circle'
  }
];

const toggleSystem = (key: string) => {
  const index = selectedCategories.value.indexOf(key);
  if (index > -1) {
    selectedCategories.value.splice(index, 1);
  } else {
    selectedCategories.value.push(key);
  }
};

const isSelected = (key: string) => {
  return selectedCategories.value.includes(key);
};

const clearSelection = () => {
  selectedCategories.value = [];
};

const filteredSymptoms = computed(() => {
  if (selectedCategories.value.length === 0) return [];
  return props.symptoms.filter(symptom =>
    symptom.systemCategory.some(cat => selectedCategories.value.includes(cat))
  );
});

// 直接搜索所有症状的辅助函数
const matchQuery = (symptom: Symptom, q: string): boolean => {
  if (symptom.name.toLowerCase().includes(q)) return true;
  try {
    const pinyin = Pinyin.convertToPinyin(symptom.name, '', true).toLowerCase();
    const initial = symptom.name.split('').map((char: string) => {
      try { return Pinyin.convertToPinyin(char, '', true)[0]?.toLowerCase() || ''; } catch { return ''; }
    }).join('');
    return pinyin.includes(q) || initial.includes(q);
  } catch {
    return false;
  }
};

const searchResultSymptoms = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [];
  return props.symptoms.filter(s => matchQuery(s, q));
});
</script>

<style scoped>
/**
 * 组件样式规范：
 * - 所有颜色使用 var(--color-*) 语义变量
 * - 间距使用 var(--space-*)
 * - 动画使用 var(--duration-*) 和 var(--ease-*)
 * - 参考: src/styles/design-tokens.css
 */

.system-category-selector {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  height: 100%;
  padding: 8px;
}

.top-search-box {
  flex-shrink: 0;
}

.top-search-input {
  width: 100%;
  padding: 7px 10px;
  font-size: 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: var(--color-background-white);
  color: var(--color-text-strong);
  outline: none;
  transition: border-color var(--duration-normal) var(--ease-out);
  box-sizing: border-box;
}

.top-search-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-100);
}

.top-search-input::placeholder {
  color: var(--color-text-muted);
}

.search-results-container {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.selector-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
}

.clear-btn {
  padding: 3px 10px;
  font-size: 11px;
  background: var(--color-primary-100);
  border: 1px solid var(--color-primary-200);
  border-radius: 4px;
  color: var(--color-text-medium);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.clear-btn:hover {
  background: var(--color-primary-200);
  color: var(--color-text-strong);
  border-color: var(--color-primary);
}

.systems-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  flex-shrink: 0;
}

.system-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 6px;
  background: var(--color-primary-50);
  border: 2px solid var(--color-border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  min-height: 70px;
}

.system-card:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-100);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(8, 145, 178, 0.15);
}

.system-card.active {
  background: var(--color-primary-200);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-200);
}

.system-icon {
  width: 28px;
  height: 28px;
  color: var(--color-text-muted);
  transition: all var(--duration-normal) var(--ease-out);
}

.system-card.active .system-icon {
  color: var(--color-primary);
  transform: scale(1.1);
}

.system-label {
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  color: var(--color-text-weak);
  text-align: center;
  line-height: 1.2;
}

.system-card.active .system-label {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

.category-symptoms {
  background: var(--color-primary-50);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.category-symptoms h5 {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
  flex-shrink: 0;
}

.symptom-count {
  font-weight: var(--font-weight-normal);
  color: var(--color-text-muted);
  font-size: 11px;
}

.symptom-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
}

.symptom-chip {
  padding: 5px 10px;
  font-size: 11px;
  background: var(--color-primary-100);
  border: 1px solid var(--color-primary-200);
  border-radius: 6px;
  color: var(--color-primary);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  white-space: nowrap;
}

.symptom-chip:hover {
  background: var(--color-primary-200);
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.symptom-chip.active {
  background: var(--color-primary);
  border-color: var(--color-primary-dark);
  color: var(--color-background-white);
}

.no-symptoms {
  text-align: center;
  padding: 15px;
  font-size: 12px;
  color: var(--color-text-muted);
  background: var(--color-primary-50);
  border-radius: var(--radius-md);
}

.symptom-search-box {
  margin-bottom: 8px;
  flex-shrink: 0;
}

.symptom-search-input {
  width: 100%;
  padding: 7px 10px;
  font-size: 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: var(--color-background-white);
  color: var(--color-text-strong);
  outline: none;
  transition: border-color var(--duration-normal) var(--ease-out);
  box-sizing: border-box;
}

.symptom-search-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-100);
}

.symptom-search-input::placeholder {
  color: var(--color-text-muted);
}

/* Scrollbar Styling */
.category-symptoms::-webkit-scrollbar {
  width: 6px;
}

.category-symptoms::-webkit-scrollbar-track {
  background: var(--color-primary-50);
  border-radius: 3px;
}

.category-symptoms::-webkit-scrollbar-thumb {
  background: var(--color-border-medium);
  border-radius: 3px;
}

.category-symptoms::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-strong);
}
</style>
