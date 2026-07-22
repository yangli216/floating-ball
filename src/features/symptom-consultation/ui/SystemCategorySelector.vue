<template>
  <div class="system-category-selector">
    <div class="selector-header">
      <h4>选择症状</h4>
      <button v-if="selectedCategories.length > 0" type="button" class="clear-btn" @click="clearSelection">
        <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9585" width="14" height="14"><path d="M781.28 851.36a58.56 58.56 0 0 1-58.56 58.56H301.28a58.72 58.72 0 0 1-58.56-58.56V230.4h538.56zM359.68 125.44a11.84 11.84 0 0 1 12-12h281.28a11.84 11.84 0 0 1 12 12V160H359.68zM956.8 160H734.72V125.44a81.76 81.76 0 0 0-81.76-81.76H371.68a82.08 82.08 0 0 0-81.76 81.76V160H67.2a35.36 35.36 0 0 0 0 70.56h105.12v620.8a128.96 128.96 0 0 0 128.96 128.96h421.44a128.96 128.96 0 0 0 128.96-128.96V230.4h105.12a35.2 35.2 0 0 0 35.2-35.2 34.56 34.56 0 0 0-35.2-35.2zM512 804.16a35.2 35.2 0 0 0 35.2-35.36V393.92a35.2 35.2 0 1 0-70.4 0v374.88a35.2 35.2 0 0 0 35.2 35.36m-164.32 0a35.36 35.36 0 0 0 35.36-35.36V393.92a35.36 35.36 0 1 0-70.56 0v374.88a36.32 36.32 0 0 0 35.2 35.36m328.64 0a35.36 35.36 0 0 0 35.2-35.36V393.92a35.36 35.36 0 1 0-70.56 0v374.88a35.36 35.36 0 0 0 35.36 35.36" fill="#d81e06" p-id="9586"></path></svg>
        清空
      </button>
    </div>

    <div class="systems-grid">
      <button
        v-for="system in systems"
        :key="system.key"
        type="button"
        :class="['system-card', { active: isSelected(system.key) }]"
        :aria-pressed="isSelected(system.key)"
        @click="toggleSystem(system.key)"
      >
        <div class="system-icon">
          <svgIcon :file="system.icon" :color="isSelected(system.key)?'#FFFFFF':'#CCCCCC'" :fontSize="'28px'"></svgIcon>
        </div>
        <span class="system-label">{{ system.label }}</span>
      </button>
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
              type="button"
              :class="['symptom-chip', { active: isSymptomSelected(symptom.key) }]"
              :aria-pressed="isSymptomSelected(symptom.key)"
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
import SvgIcon from "@/components/svgIcon.vue";

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
  font-size: 12px;
  background: transparent;
  border: 1px solid #dce3eb;
  border-radius: 4px;
  color: #262626;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
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
  font: inherit;
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
  /* background: #FAFBFD; */
  /* border: 1px solid #EEF2F6; */
  /* border-radius: 8px; */
  /* padding: 10px; */
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
