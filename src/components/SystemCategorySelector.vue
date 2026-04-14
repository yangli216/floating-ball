<template>
  <div class="system-category-selector">
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
          <svgIcon :file="system.icon" :color="isSelected(system.key)?'#FFFFFF':'#CCCCCC'" :fontSize="'28px'"></svgIcon>
        </div>
        <span class="system-label">{{ system.label }}</span>
      </div>
    </div>

    <!-- 症状区域：按系统显示 -->
    <div class="category-symptoms">
      <div v-if="selectedCategories.length > 0">
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, PropType } from 'vue';
import Icon from './Icon.vue';
import SvgIcon from "../components/svgIcon.vue";

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
};

const isSymptomSelected = (key: string) => {
  return props.selectedSymptoms.some(s => s.key === key);
};

const selectedCategories = ref<string[]>([]);

const systems = [
  {
    key: 'respiratory',
    label: '呼吸系统',
    icon: '/lungs_sys.svg'
  },
  {
    key: 'circulatory',
    label: '循环系统',
    icon: '/circulatory_sys.svg'
  },
  {
    key: 'digestive',
    label: '消化系统',
    icon: '/stomach_sys.svg'
  },
  {
    key: 'urinary',
    label: '泌尿系统',
    icon: '/kidneys_sys.svg'
  },
  {
    key: 'reproductive',
    label: '生殖系统',
    icon: '/reproductive_sys.svg'
  },
  {
    key: 'nervous',
    label: '神经系统',
    icon: '/brain_sys.svg'
  },
  {
    key: 'endocrine',
    label: '内分泌系统',
    icon: '/flask_sys.svg'
  },
  {
    key: 'motor',
    label: '运动系统',
    icon: '/training.svg'
  },
  {
    key: 'other',
    label: '其他',
    icon: '/other_sys.svg'
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

</script>

<style scoped>
.system-category-selector {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  padding: 0 10px;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}

.selector-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1E293B;
}

.clear-btn {
  padding: 3px 10px;
  font-size: 11px;
  background: transparent;
  border: 1px solid #dce3eb;
  border-radius: 4px;
  color: #8c98a5;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: #f0f5ff;
  color: #2B7FE3;
  border-color: #2B7FE3;
}

/* -- System Grid -- */
.systems-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  flex-shrink: 0;
}

.system-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 10px 4px 8px;
  background: #F8FAFC;
  border: 1.5px solid #EEF2F6;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 68px;
}

.system-card:hover {
  border-color: rgba(43, 127, 227, 0.3);
  background: #F0F6FF;
}

.system-card.active {
  background: #E8F1FF;
  border-color: #2B7FE3;
  box-shadow: 0 0 0 1px rgba(43, 127, 227, 0.15);
}

.system-icon {
  width: 28px;
  height: 28px;
  color: #94A3B8;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.system-card:hover .system-icon {
  color: #64A3E8;
}

.system-card.active .system-icon {
  color: #2B7FE3;
}

.system-label {
  font-family: Microsoft YaHei, Microsoft YaHei;
  font-size: 11px;
  font-weight: 500;
  color: #262626;
  text-align: center;
  line-height: 1.2;
}

.system-card.active .system-label {
  color: #FFFFFF;
  font-weight: 400;
}

/* -- Category Symptoms Area -- */
.category-symptoms {
  background: #FAFBFD;
  border: 1px solid #EEF2F6;
  border-radius: 8px;
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
  font-weight: 600;
  color: #1E293B;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.symptom-count {
  font-weight: 400;
  color: #94A3B8;
  font-size: 11px;
}

.symptom-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
}

.symptom-chip {
  padding: 4px 10px;
  font-size: 12px;
  background: #fff;
  border: 1px solid #E2E8F0;
  border-radius: 4px;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.symptom-chip:hover {
  background: #F0F6FF;
  border-color: rgba(43, 127, 227, 0.3);
  color: #2B7FE3;
}

.symptom-chip.active {
  background: #2B7FE3;
  border-color: #1A6FD5;
  color: #fff;
  font-weight: 500;
}

.no-symptoms {
  text-align: center;
  padding: 20px;
  font-size: 12px;
  color: #94A3B8;
}

/* Scrollbar */
.category-symptoms::-webkit-scrollbar {
  width: 4px;
}

.category-symptoms::-webkit-scrollbar-track {
  background: transparent;
}

.category-symptoms::-webkit-scrollbar-thumb {
  background: #CBD5E1;
  border-radius: 2px;
}

.category-symptoms::-webkit-scrollbar-thumb:hover {
  background: #94A3B8;
}
</style>
