<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue';
import templatesData from '../assets/templates.json';
import Pinyin from 'tiny-pinyin';
import { invoke } from '@tauri-apps/api/core';
import Icon from './Icon.vue';

const showToast = inject('showToast') as (msg: string, type: 'success' | 'error' | 'info') => void;

const emit = defineEmits(['close']);

// --- Types ---
interface Field {
  id: string;
  key: string;
  label: string;
  type: string;
  props: any;
  storageKey: string;
  applicablePopulation?: any;
  textGenConfig?: any;
  required?: boolean;
}

interface Section {
  id: string;
  title: string;
  fields: Field[];
}

interface Symptom {
  id: string;
  key: string;
  name: string;
  description: string;
  isCommonSymptom: boolean;
  systemCategory: string[];
  bodyParts: string[];
  config: {
    sections: Section[];
  };
  applicablePopulation: any;
  createdAt: number;
  updatedAt: number;
}

// --- State ---
const symptoms = ref<Symptom[]>([]);
const selectedSymptomId = ref<string | null>(null);
const searchQuery = ref('');
const filterCategory = ref<string>('all');

const systemCategories: Record<string, string> = {
  respiratory: '呼吸系统',
  circulatory: '循环系统',
  endocrine: '内分泌系统',
  digestive: '消化系统',
  urinary: '泌尿系统',
  reproductive: '生殖系统',
  nervous: '神经系统',
  motor: '运动系统',
  other: '其他'
};

onMounted(() => {
  // Deep clone to avoid mutating origin until save
  symptoms.value = JSON.parse(JSON.stringify(templatesData));
  if (symptoms.value.length > 0) {
    selectedSymptomId.value = symptoms.value[0].id;
  }
});

// --- Computed ---
const filteredSymptoms = computed(() => {
  let result = symptoms.value;

  if (filterCategory.value !== 'all') {
    result = result.filter(s => s.systemCategory.includes(filterCategory.value));
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(s => {
      const name = s.name.toLowerCase();
      if (name.includes(query)) return true;
      if (Pinyin.isSupported()) {
        const pinyinFull = Pinyin.convertToPinyin(s.name, '', true).toLowerCase();
        if (pinyinFull.includes(query)) return true;
        const pinyinInitials = Pinyin.convertToPinyin(s.name, ' ', true)
          .split(' ')
          .map(word => word[0])
          .join('')
          .toLowerCase();
        if (pinyinInitials.includes(query)) return true;
      }
      return false;
    });
  }

  return result;
});

const selectedSymptom = computed(() => {
  return symptoms.value.find(s => s.id === selectedSymptomId.value) || null;
});

// --- Methods ---
const selectSymptom = (id: string) => {
  selectedSymptomId.value = id;
};

const addNewSymptom = () => {
  const newId = Date.now().toString();
  const newSymptom: Symptom = {
    id: newId,
    key: 'new-symptom-' + newId,
    name: '新建症状',
    description: '',
    isCommonSymptom: false,
    systemCategory: [],
    bodyParts: [],
    applicablePopulation: { genders: [], ageGroups: [] },
    config: {
      sections: [{
        id: 'section_0',
        title: '症状属性问诊',
        fields: []
      }]
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  symptoms.value.unshift(newSymptom);
  selectedSymptomId.value = newId;
};

const deleteSymptom = (id: string) => {
  if (confirm('确定要删除这个症状吗？')) {
    const index = symptoms.value.findIndex(s => s.id === id);
    if (index !== -1) {
      symptoms.value.splice(index, 1);
      if (selectedSymptomId.value === id) {
        selectedSymptomId.value = symptoms.value.length > 0 ? symptoms.value[0].id : null;
      }
    }
  }
};

const addField = () => {
  if (!selectedSymptom.value) return;
  const section = selectedSymptom.value.config.sections[0];
  const fieldId = `field_${Date.now()}`;
  section.fields.push({
    id: fieldId,
    key: 'newField',
    label: '新字段',
    type: 'radio',
    props: { options: ['选项1', '选项2'] },
    storageKey: 'newField',
    required: false
  });
};

const removeField = (fieldId: string) => {
  if (!confirm('确定要删除此字段吗？此操作无法撤销。')) return;
  if (!selectedSymptom.value) return;
  const section = selectedSymptom.value.config.sections[0];
  const index = section.fields.findIndex(f => f.id === fieldId);
  if (index !== -1) {
    section.fields.splice(index, 1);
  }
};

const saveAll = async () => {
  try {
    const content = JSON.stringify(symptoms.value, null, 2);
    await invoke('save_templates', { content });
    showToast('配置已成功保存到 templates.json', 'success');
  } catch (err: any) {
    console.error('Save failed:', err);
    showToast('保存失败: ' + err, 'error');
  }
};


const exportJson = async () => {
  try {
    const content = JSON.stringify(symptoms.value, null, 2);
    await invoke('export_templates_with_dialog', { content });
    // Note: Rust returns Ok even if cancelled, currently we don't distinguish
    // If needed we can update Rust to return boolean
  } catch (err: any) {
    console.error('Export failed:', err);
    showToast('导出失败: ' + err, 'error');
  }
};

const importJson = (event: any) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e: any) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) {
        symptoms.value = data;
        selectedSymptomId.value = data.length > 0 ? data[0].id : null;
        alert('导入成功！记得点击保存。');
      }
    } catch (err) {
      alert('导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
};

// --- Options & Mutual Exclusions Helpers ---
const getOptions = (field: any) => {
  return field.type === 'input_radio' ? (field.props.radioOptions || []) : (field.props.options || []);
};

const updateOption = (field: any, index: number, newValue: string) => {
  const opts = [...getOptions(field)];
  opts[index] = newValue;
  if (field.type === 'input_radio') field.props.radioOptions = opts;
  else field.props.options = opts;
};

const removeOption = (field: any, index: number) => {
  const opts = [...getOptions(field)];
  opts.splice(index, 1);
  if (field.type === 'input_radio') field.props.radioOptions = opts;
  else field.props.options = opts;
};

const addOption = (field: any) => {
  const newOpt = '新选项';
  if (field.type === 'input_radio') {
    if (!field.props.radioOptions) field.props.radioOptions = [];
    field.props.radioOptions.push(newOpt);
  } else {
    if (!field.props.options) field.props.options = [];
    field.props.options.push(newOpt);
  }
};

const addMutualGroup = (field: any) => {
  if (!field.props.mutualExclusions) field.props.mutualExclusions = [];
  field.props.mutualExclusions.push([]);
};

const removeMutualGroup = (field: any, index: number) => {
  field.props.mutualExclusions.splice(index, 1);
};

const addToGroup = (field: any, groupIndex: number, option: string) => {
  if (!option) return;
  const group = field.props.mutualExclusions[groupIndex];
  if (!group.includes(option)) {
    group.push(option);
  }
};

const removeFromGroup = (field: any, groupIndex: number, option: string) => {
  const group = field.props.mutualExclusions[groupIndex];
  const idx = group.indexOf(option);
  if (idx !== -1) group.splice(idx, 1);
};


// Mutual Section Collapse State
const expandedMutualSections = ref<Set<string>>(new Set());
const toggleMutualSection = (fieldId: string) => {
  if (expandedMutualSections.value.has(fieldId)) expandedMutualSections.value.delete(fieldId);
  else expandedMutualSections.value.add(fieldId);
};

const expandedFields = ref<Set<string>>(new Set());
const toggleFieldExpand = (id: string) => {
  if (expandedFields.value.has(id)) expandedFields.value.delete(id);
  else expandedFields.value.add(id);
};

</script>

<template>
  <div class="symptom-manage">
    <!-- Header -->
    <header class="manage-header">
      <div class="title-group">
        <button class="back-btn" @click="emit('close')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <h1 class="header-title">症状库维护</h1>
      </div>
      <div class="header-actions">
        <label class="action-btn file-label">
          导入 JSON
          <input type="file" @change="importJson" accept=".json" style="display: none;" />
        </label>
        <button class="action-btn" @click="exportJson">导出 JSON</button>
        <button class="action-btn primary" @click="saveAll">
          <Icon icon="lucide:save" :size="16" style="margin-right: 4px;"/>保存修改
        </button>
      </div>
    </header>

    <div class="manage-content">
      <!-- Left Sidebar: List -->
      <aside class="symptom-list-panel">
        <div class="list-controls">
          <div class="search-bar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" v-model="searchQuery" placeholder="搜索症状..." />
          </div>
          <div class="filter-bar">
            <select v-model="filterCategory" class="form-select">
              <option value="all">全部系统</option>
              <option v-for="(label, key) in systemCategories" :key="key" :value="key">{{ label }}</option>
            </select>
            <button class="add-btn" @click="addNewSymptom" title="添加新症状">+</button>
          </div>
        </div>
        
        <div class="list-container">
          <div 
            v-for="s in filteredSymptoms" 
            :key="s.id"
            :class="['symptom-item', { active: selectedSymptomId === s.id }]"
            @click="selectSymptom(s.id)"
          >
            <div class="item-info">
              <span class="item-name">{{ s.name }}</span>
              <span class="item-key">{{ s.key }}</span>
            </div>
            <button class="item-delete" @click.stop="deleteSymptom(s.id)" title="删除">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </aside>

      <!-- Right Panel: Editor -->
      <main class="editor-panel" v-if="selectedSymptom">
        <div class="editor-scroll">
          <!-- Basic Info Section -->
          <section class="editor-section">
            <h3 class="section-title">基本信息</h3>
            <div class="form-grid">
              <div class="form-item">
                <label>症状名称</label>
                <input type="text" v-model="selectedSymptom.name" />
              </div>
              <div class="form-item">
                <label>Key (英文标识)</label>
                <input type="text" v-model="selectedSymptom.key" />
              </div>
              <div class="form-item full">
                <label>系统分类</label>
                <div class="checkbox-group">
                  <label v-for="(label, key) in systemCategories" :key="key" class="check-label">
                    <input type="checkbox" :value="key" v-model="selectedSymptom.systemCategory" />
                    {{ label }}
                  </label>
                </div>
              </div>
              <div class="form-item">
                <label class="row-label">
                  <input type="checkbox" v-model="selectedSymptom.isCommonSymptom" />
                  设为常用症状
                </label>
              </div>
              <div class="form-item full">
                <label>适用性别 (空表示不限)</label>
                <div class="checkbox-group">
                  <label class="check-label"><input type="checkbox" value="1" v-model="selectedSymptom.applicablePopulation.genders" /> 男性</label>
                  <label class="check-label"><input type="checkbox" value="2" v-model="selectedSymptom.applicablePopulation.genders" /> 女性</label>
                </div>
              </div>
            </div>
          </section>

          <!-- Fields Section -->
          <section class="editor-section">
            <div class="section-header">
              <h3 class="section-title">问诊字段配置</h3>
              <button class="add-field-btn" @click="addField">+ 添加字段</button>
            </div>

            <div class="fields-list">
              <div v-for="field in selectedSymptom.config.sections[0].fields" :key="field.id" class="field-card">
                <div class="field-header" @click="toggleFieldExpand(field.id)" style="cursor: pointer;">
                  <input type="text" v-model="field.label" class="field-label-input" placeholder="字段标签" @click.stop />
                  <div class="field-meta">
                    <span class="expand-tag">{{ expandedFields.has(field.id) ? '收起' : '展开' }}</span>
                    <select v-model="field.type" class="form-select type-select-override" @click.stop>
                      <option value="radio">单选 (Radio)</option>
                      <option value="checkbox">多选 (Checkbox)</option>
                      <option value="input">文本输入 (Input)</option>
                      <option value="input_radio">数值+单位 (InputRadio)</option>
                      <option value="number">数字输入 (Number)</option>
                    </select>
                    <button class="remove-field" @click.stop="removeField(field.id)">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                </div>

                <div class="field-body" v-show="expandedFields.has(field.id)">
                  <!-- Row 1: Key & Required & Population (grouped for compactness) -->
                  <div class="compact-row">
                    <div class="input-group flex-1">
                      <label>Storage Key</label>
                      <input type="text" v-model="field.storageKey" placeholder="存储键名" class="field-input-sm" />
                    </div>
                    
                    <div class="check-group">
                       <label class="check-label-sm">
                        <input type="checkbox" v-model="field.required" /> 
                        <span class="label-text">必填</span>
                      </label>
                    </div>

                    <div class="separator"></div>

                    <div class="input-group">
                      <label>适用性别</label>
                      <div class="check-row">
                        <label class="check-label-xs"><input type="checkbox" value="1" :checked="field.applicablePopulation?.genders?.includes('1')" @change="(e: any) => {
                          if (!field.applicablePopulation) field.applicablePopulation = { genders: [] };
                          if (e.target.checked) field.applicablePopulation.genders.push('1');
                          else field.applicablePopulation.genders = field.applicablePopulation.genders.filter((g: string) => g !== '1');
                        }" /><span>男</span></label>
                        <label class="check-label-xs"><input type="checkbox" value="2" :checked="field.applicablePopulation?.genders?.includes('2')" @change="(e: any) => {
                          if (!field.applicablePopulation) field.applicablePopulation = { genders: [] };
                          if (e.target.checked) field.applicablePopulation.genders.push('2');
                          else field.applicablePopulation.genders = field.applicablePopulation.genders.filter((g: string) => g !== '2');
                        }" /><span>女</span></label>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Row 2: Options (Clean Tag Style) -->
                  <div class="config-block" v-if="['radio', 'checkbox', 'input_radio'].includes(field.type)">
                    <label class="block-label">选项配置</label>
                    <div class="options-container">
                      <div class="option-tags-wrapper">
                        <div v-for="(opt, oddx) in (field.type === 'input_radio' ? field.props.radioOptions : field.props.options)" :key="oddx" class="option-pill">
                          <input 
                            type="text" 
                            :value="opt" 
                            @input="(e: any) => updateOption(field, Number(oddx), e.target.value)"
                            class="pill-input"
                          />
                          <button @click="removeOption(field, Number(oddx))" class="pill-remove">×</button>
                        </div>
                        <button @click="addOption(field)" class="pill-add">+ 添加</button>
                      </div>
                    </div>
                  </div>

                  <!-- Advanced: Mutual Exclusion -->
                  <div class="config-block mutual-block" v-if="field.type === 'checkbox'">
                     <div class="block-header clickable" @click="toggleMutualSection(field.id)">
                        <div class="header-left">
                          <Icon icon="lucide:arrow-right-left" :size="14" class="block-icon"/>
                          <span>互斥关系配置</span>
                          <span class="badge-count" v-if="!expandedMutualSections.has(field.id) && field.props.mutualExclusions?.length">
                            {{ field.props.mutualExclusions.length }}组
                          </span>
                        </div>
                        <Icon icon="lucide:chevron-down" :size="14" :class="{ 'rotate-180': expandedMutualSections.has(field.id) }" class="transition-icon"/>
                     </div>

                     <div v-show="expandedMutualSections.has(field.id)" class="block-content">
                        <div class="help-box-sm">
                          <Icon icon="lucide:info" :size="14" class="help-icon-c"/>
                          <span>不同组互斥 (选中A组清除B组)，组内可多选。</span>
                        </div>

                        <div class="mutual-groups-compact">
                            <div v-for="(group, gidx) in (field.props.mutualExclusions || [])" :key="gidx" class="mutual-group-row">
                                <span class="group-label">组{{Number(gidx) + 1}}</span>
                                <div class="group-items">
                                   <span v-for="opt in group" :key="opt" class="item-tag">
                                      {{ opt }}
                                      <span class="remove-x" @click="removeFromGroup(field, Number(gidx), opt)">×</span>
                                   </span>
                                   <select 
                                      @change="(e: any) => { addToGroup(field, Number(gidx), e.target.value); e.target.value=''; }" 
                                      class="add-select-sm"
                                    >
                                      <option value="" disabled selected>+ 添加...</option>
                                      <option v-for="opt in (field.props.options || []).filter((o: string) => !group.includes(o))" :key="opt" :value="opt">{{ opt }}</option>
                                    </select>
                                </div>
                                <button @click="removeMutualGroup(field, Number(gidx))" class="icon-btn-danger" title="删除组">
                                  <Icon icon="lucide:trash-2" :size="14"/>
                                </button>
                            </div>
                            <button @click="addMutualGroup(field)" class="btn-text-primary">+ 新建互斥组</button>
                        </div>
                     </div>
                  </div>

                  <!-- Advanced: Text Generation (Card Style) -->
                  <div class="text-gen-card">
                    <div class="card-header-sm">
                      <Icon icon="lucide:sparkles" :size="14" style="color: #7c3aed;"/>
                      <span style="font-weight: 600; color: #5b21b6;">智能文本生成配置</span>
                    </div>
                    <div class="card-body-sm">
                      <div class="gen-row">
                        <label>生成目标:</label>
                        <div class="check-row">
                           <label class="check-label-xs"><input type="checkbox" value="chiefComplaint" :checked="field.textGenConfig?.targets?.includes('chiefComplaint')" @change="(e: any) => {
                              if (!field.textGenConfig) field.textGenConfig = { targets: [], template: '{value}' };
                              if (e.target.checked) field.textGenConfig.targets.push('chiefComplaint');
                              else field.textGenConfig.targets = field.textGenConfig.targets.filter((t: string) => t !== 'chiefComplaint');
                           }" /><span>主诉</span></label>
                           <label class="check-label-xs"><input type="checkbox" value="historyOfPresentIllness" :checked="field.textGenConfig?.targets?.includes('historyOfPresentIllness')" @change="(e: any) => {
                              if (!field.textGenConfig) field.textGenConfig = { targets: [], template: '{value}' };
                              if (e.target.checked) field.textGenConfig.targets.push('historyOfPresentIllness');
                              else field.textGenConfig.targets = field.textGenConfig.targets.filter((t: string) => t !== 'historyOfPresentIllness');
                           }" /><span>现病史</span></label>
                        </div>
                      </div>
                      
                      <div class="gen-row">
                        <label>文本模板:</label>
                        <div class="flex-1">
                          <input type="text" :value="field.textGenConfig?.template" @input="(e: any) => {
                            if (!field.textGenConfig) field.textGenConfig = { targets: [], template: '{value}' };
                            field.textGenConfig.template = e.target.value;
                          }" placeholder="例: 伴随{value}" class="input-underline" />
                          <div class="hint-xs">可以使用 <code>{value}</code> 代表选中的选项值</div>
                        </div>
                      </div>

                      <div class="gen-row">
                        <label>跳过条件:</label>
                        <div class="flex-1">
                           <div class="tags-input-container">
                             <div class="tag-chip" v-for="(val, idx) in field.textGenConfig?.optionConfig?.ignoreValues || []" :key="idx">
                               {{ val }}
                               <span class="remove-tag" @click="field.textGenConfig.optionConfig.ignoreValues.splice(idx, 1)">×</span>
                             </div>
                             <select 
                                class="transparent-select" 
                                @change="(e: any) => { 
                                  const val = e.target.value; 
                                  if(!val) return;
                                  if (!field.textGenConfig) field.textGenConfig = { targets: [], template: '{value}' };
                                  if (!field.textGenConfig.optionConfig) field.textGenConfig.optionConfig = { ignoreValues: [] };
                                  if(!field.textGenConfig.optionConfig.ignoreValues.includes(val)) field.textGenConfig.optionConfig.ignoreValues.push(val);
                                  e.target.value=''; 
                                }"
                              >
                               <option value="" disabled selected>+ 添加条件</option>
                               <option v-for="opt in (field.type === 'input_radio' ? field.props.radioOptions : field.props.options) || []" :key="opt" :value="opt" :disabled="field.textGenConfig?.optionConfig?.ignoreValues?.includes(opt)">{{ opt }}</option>
                             </select>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <!-- Empty State -->
      <main class="editor-panel empty" v-else>
        <div class="empty-content">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          <p>请选择左侧症状或新建症状进行编辑</p>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.symptom-manage {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--medical-bg-secondary);
  color: var(--medical-text-secondary);
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* Medical Theme Variables (Mirrored from SettingsPanel) */
  --medical-primary: #0891B2;
  --medical-primary-hover: #0E7490;
  --medical-success: #059669;
  --medical-text-primary: #164E63;
  --medical-text-secondary: #0F172A;
  --medical-text-muted: #475569;
  --medical-bg-primary: #FFFFFF;
  --medical-bg-secondary: #F8FAFC;
  --medical-bg-tertiary: #F1F5F9;
  --medical-border-light: #E2E8F0;
  --medical-border-medium: #CBD5E1;
  --medical-info-bg: #DBEAFE;
  --medical-info: #3B82F6;
  --medical-danger: #EF4444;
}

/* Header */
.manage-header {
  height: 48px;
  background: var(--medical-bg-primary);
  border-bottom: 1px solid var(--medical-border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--medical-text-primary);
}

.back-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--medical-border-light);
  background: var(--medical-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #64748b;
}

.back-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--medical-border-light);
  background: var(--medical-bg-primary);
  transition: all 0.2s;
  color: var(--medical-text-muted);
}

.action-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.action-btn.primary {
  background: var(--medical-primary);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(8, 145, 178, 0.3);
  display: flex;
  align-items: center;
}

.action-btn.primary:hover {
  background: var(--medical-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.4);
}

/* Content Layout */
.manage-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  height: auto;
}

/* Left Panel */
.symptom-list-panel {
  flex: 0 0 300px;
  width: 300px;
  background: var(--medical-bg-primary);
  border-right: 1px solid var(--medical-border-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-controls {
  padding: 12px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.search-bar {
  position: relative;
  display: flex;
  align-items: center;
}

.search-bar svg {
  position: absolute;
  left: 10px;
  color: #94a3b8;
}

.search-bar input {
  width: 100%;
  height: 36px;
  padding-left: 36px;
  padding-right: 12px;
  border-radius: 8px;
  border: 1px solid var(--medical-border-medium);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: var(--medical-bg-primary);
  color: var(--medical-text-secondary);
}

.search-bar input:hover {
  border-color: #93c5fd;
}

.search-bar input:focus {
  border-color: var(--medical-primary);
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
}

.filter-bar {
  display: flex;
  gap: 8px;
}

/* Shared Select Style */
.form-select {
  height: 36px;
  border-radius: 8px;
  border: 1px solid #dbeafe;
  font-size: 13px;
  padding: 0 12px;
  background: white;
  color: #4b5563;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 32px;
}

.form-select:hover {
  border-color: #93c5fd;
}

.form-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.filter-bar select {
  flex: 1; /* Keep layout property */
}

.add-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.add-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.list-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px;
  min-height: 0;
}

.symptom-item {
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.symptom-item:hover {
  background: #f8fafc;
}

.symptom-item.active {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.item-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-key {
  font-size: 12px;
  color: #94a3b8;
}

.item-delete {
  opacity: 0;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.symptom-item:hover .item-delete {
  opacity: 1;
}

/* Right Panel */
.editor-panel {
  flex: 1;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.editor-section {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 14px 0;
  color: #0f172a;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-header .section-title {
  margin: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-item.full {
  grid-column: span 2;
}

.form-item label {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
}

.form-item input[type="text"] {
  height: 34px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  padding: 0 12px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-item input[type="text"]:hover {
  border-color: #93c5fd;
}

.form-item input[type="text"]:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.check-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
}

.row-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

/* Field Cards */
.add-field-btn {
  padding: 8px 16px;
  border-radius: 8px;
  background: linear-gradient(135deg, #dbeafe, #eff6ff);
  border: 1px solid #bfdbfe;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: #2563eb;
  transition: all 0.2s;
}

.add-field-btn:hover {
  background: linear-gradient(135deg, #bfdbfe, #dbeafe);
  border-color: #93c5fd;
  transform: translateY(-1px);
}

.fields-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.field-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.field-header {
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-label-input {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-weight: 600;
  font-size: 15px;
  outline: none;
  flex: 1;
  padding: 4px 0;
  transition: border-color 0.2s;
}

.field-label-input:focus {
  border-bottom-color: #3b82f6;
}

.field-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Override common form-select for header compactness */
.type-select-override {
  width: auto;
  min-width: 140px;
  height: 32px; 
  padding: 0 10px;
  padding-right: 30px;
}

.remove-field {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}

.remove-field:hover {
  color: #ef4444;
}

.field-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prop-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.prop-row > label {
  font-size: 13px;
  color: #64748b;
  width: 100px;
  flex-shrink: 0;
}

.prop-row > input[type="text"],
.field-input-styled {
  flex: 1;
  height: 34px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: white;
  padding: 0 12px;
  font-size: 14px;
  color: #1f2937;
  outline: none;
}

.prop-row input:focus,
.field-input-styled:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Advanced Sections */
.advanced-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}

.sub-title {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.check-mini {
  display: flex;
  gap: 16px;
  align-items: center;
}

.check-item {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  width: auto !important;
  color: #374151;
}

.check-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
}

.check-item span {
  line-height: 1;
}

.expand-tag {
  font-size: 12px;
  color: #3b82f6;
  background: #eff6ff;
  padding: 2px 6px;
  border-radius: 4px;
}

.file-label {
  cursor: pointer;
}


/* Empty State */
.editor-panel.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-content {
  text-align: center;
  color: #94a3b8;
}

.empty-content svg {
  margin-bottom: 16px;
}

.empty-content p {
  font-size: 16px;
}
</style>

<style scoped>
/* Options Editor Styles */
.options-manager {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.option-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.option-tag {
  display: flex;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #fff;
  padding: 0 4px;
}
.option-tag input {
  border: none;
  background: transparent;
  width: 80px;
  font-size: 14px;
  outline: none;
}
.icon-btn-small {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}
.icon-btn-small:hover { color: #ef4444; }
.btn-tiny {
  align-self: flex-start;
  font-size: 13px;
  padding: 4px 8px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  border-radius: 4px;
  cursor: pointer;
  color: #64748b;
}
.btn-tiny:hover { border-color: #94a3b8; color: #475569; }

.mutual-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.mutual-group-card {
  background: #f1f5f9;
  border-radius: 6px;
  padding: 8px;
  border: 1px solid #e2e8f0;
}
.group-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #64748b;
  margin-bottom: 6px;
}
.link-danger {
  color: #ef4444;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}
.group-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.tag-simple {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.tag-remove {
  cursor: pointer;
  color: #94a3b8;
  font-weight: bold;
  margin-left: 4px;
}
.tag-remove:hover { color: #ef4444; }
.group-add select {
  width: 100%;
  font-size: 12px;
  padding: 4px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}
.btn-dashed {
  width: 100%;
  padding: 8px;
  border: 1px dashed #cbd5e1;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  border-radius: 6px;
}
.btn-dashed:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}

/* 互斥组优化样式 */
.mutual-section {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 8px;
  padding: 12px;
  margin-top: 12px;
}


.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  user-select: none;
}

.section-title-row.clickable:hover .sub-title {
  color: #3b82f6;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collapse-icon svg {
  color: #94a3b8;
  transition: transform 0.2s;
}

.collapse-icon svg.rotated {
  transform: rotate(90deg);
}

.summary-badge {
  background: #e0f2fe;
  color: #0284c7;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.section-summary {
  font-size: 13px;
  margin-bottom: 4px;
  padding-left: 24px;
  cursor: pointer;
}

.text-hint {
  color: #94a3b8;
  font-style: italic;
}

.text-info {
  color: #4b5563;
}

.section-title-row .sub-title {
  margin: 0;
}

/* Summary Preview Styles */
.summary-preview {
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px dashed #e2e8f0;
  transition: all 0.2s;
  cursor: pointer;
  margin-left: 24px;
}
.summary-preview:hover {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.empty-hint {
  color: #94a3b8;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.plus-icon {
  font-weight: bold;
  font-size: 14px;
  color: #3b82f6;
}
.preview-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preview-group-tag {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}
.pgt-label {
  background: #f1f5f9;
  color: #64748b;
  padding: 2px 6px;
  font-weight: 500;
  border-right: 1px solid #e2e8f0;
  font-size: 10px;
}
.pgt-content {
  padding: 2px 8px;
  color: #334155;
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.help-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #94a3b8;
  color: white;
  font-size: 10px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: help;
}

.help-box {
  display: flex;
  gap: 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.help-icon-svg {
  flex-shrink: 0;
  color: #3b82f6;
  margin-top: 2px;
}

.help-text {
  font-size: 12px;
  color: #1e40af;
  line-height: 1.5;
}

.help-text strong {
  display: block;
  margin-bottom: 4px;
  color: #1e3a8a;
}

.help-text p {
  margin: 0 0 4px 0;
}

.help-text em {
  font-style: normal;
  background: #fef3c7;
  padding: 0 4px;
  border-radius: 2px;
  color: #92400e;
}

.mutual-group-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.mutual-group-card .group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: linear-gradient(90deg, #f1f5f9, #fff);
  border-bottom: 1px solid #e2e8f0;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-badge {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-name {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.group-body {
  padding: 12px;
}

.empty-group {
  text-align: center;
  padding: 16px;
  color: #94a3b8;
  font-size: 13px;
  background: #f8fafc;
  border-radius: 4px;
  margin-bottom: 8px;
}

.option-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, #dbeafe, #eff6ff);
  border: 1px solid #93c5fd;
  border-radius: 16px;
  padding: 4px 8px 4px 12px;
  font-size: 13px;
  color: #1e40af;
  transition: all 0.2s;
}

.option-chip:hover {
  background: #bfdbfe;
}

.chip-remove {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.chip-remove:hover {
  background: #ef4444;
  color: white;
}



.btn-add-group {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-group:hover {
  border-color: #3b82f6;
  color: #3b82f6;
  background: #eff6ff;
}

.btn-add-group svg {
  transition: transform 0.2s;
}

.btn-add-group:hover svg {
  transform: rotate(90deg);
}

/* Compact UI Styles */
.compact-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-group label {
  font-size: 12px;
  color: var(--medical-text-muted);
  font-weight: 500;
}

.flex-1 { flex: 1; }

.field-input-sm {
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--medical-border-medium);
  font-size: 13px;
  padding: 0 8px;
  background: var(--medical-bg-primary);
}

.check-group {
  display: flex;
  align-items: center;
  padding-top: 18px; /* Align with input */
}

.check-label-sm {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.separator {
  width: 1px;
  height: 24px;
  background: var(--medical-border-light);
  margin: 0 4px;
}

.check-row {
  display: flex;
  gap: 12px;
}

.check-label-xs {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
}

/* Option Configuration Block */
.config-block {
  margin-bottom: 12px;
}

.block-label {
  display: block;
  font-size: 12px;
  color: var(--medical-text-muted);
  margin-bottom: 6px;
  font-weight: 500;
}

.options-container {
  background: var(--medical-bg-tertiary);
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--medical-border-light);
}

.option-tags-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option-pill {
  display: flex;
  align-items: center;
  background: var(--medical-bg-primary);
  border: 1px solid var(--medical-border-medium);
  border-radius: 4px;
  padding: 2px;
  padding-right: 6px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.pill-input {
  border: none;
  background: transparent;
  width: auto;
  min-width: 40px;
  padding: 4px 6px;
  font-size: 13px;
  outline: none;
  color: var(--medical-text-secondary);
}

.pill-remove {
  width: 16px;
  height: 16px;
  background: #fee2e2;
  color: #ef4444;
  border-radius: 4px; /* Squared circle */
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  margin-left: 4px;
}

.pill-remove:hover {
  background: #fecaca;
}

.pill-add {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px dashed var(--medical-primary);
  color: var(--medical-primary);
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
}

.pill-add:hover {
  background: rgba(8, 145, 178, 0.05);
}

/* Text Gen Card */
.text-gen-card {
  background: linear-gradient(to bottom, #f5f3ff, #fff); /* Light purple tint */
  border: 1px solid #ddd6fe;
  border-radius: 8px;
  overflow: hidden;
  margin-top: 12px;
}

.card-header-sm {
  padding: 8px 12px;
  background: rgba(139, 92, 246, 0.1);
  border-bottom: 1px solid rgba(139, 92, 246, 0.2);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.card-body-sm {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gen-row {
  display: flex;
  align-items: flex-start; /* Changed to flex-start for multi-line inputs */
  gap: 12px;
}

.gen-row label {
  width: 60px;
  font-size: 12px;
  color: var(--medical-text-muted);
  padding-top: 6px;
  text-align: right;
}

.input-underline {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--medical-border-medium);
  border-radius: 0;
  padding: 4px 0;
  background: transparent;
  font-size: 13px;
}

.input-underline:focus {
  border-color: #8b5cf6;
  outline: none;
}

.tags-input-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0;
  border: none;
  background: transparent;
  min-height: auto;
}

.tag-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--medical-bg-primary);
  border: 1px solid var(--medical-border-medium);
  border-radius: 4px;
  font-size: 13px;
  color: var(--medical-text-secondary);
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.remove-tag {
  cursor: pointer;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fee2e2;
  color: #ef4444;
  border-radius: 4px;
  font-size: 14px;
}

.remove-tag:hover {
  background: #fecaca;
}

.transparent-select {
  appearance: none;
  -webkit-appearance: none;
  border: 1px dashed var(--medical-primary);
  outline: none;
  background: transparent;
  font-size: 12px;
  color: var(--medical-primary);
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  width: auto;
  min-width: auto;
  transition: background 0.2s;
}

.transparent-select:hover {
  background: rgba(8, 145, 178, 0.05);
}

.hint-xs {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

/* Mutual Block Refinements */
.mutual-block .block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: var(--medical-bg-tertiary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: var(--medical-text-secondary);
}

.badge-count {
  background: var(--medical-info);
  color: white;
  padding: 1px 6px;
  font-size: 10px;
  border-radius: 10px;
}

.block-content {
  padding: 8px;
  border: 1px solid var(--medical-border-light);
  border-top: none;
  background: var(--medical-bg-primary);
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}

.help-box-sm {
  display: flex;
  gap: 6px;
  padding: 6px 10px;
  background: #eff6ff;
  border-radius: 4px;
  color: #1e40af;
  font-size: 11px;
  margin-bottom: 8px;
}

.mutual-group-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  background: #f8fafc;
  border-radius: 4px;
  margin-bottom: 4px;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--medical-primary);
  background: rgba(8, 145, 178, 0.1);
  padding: 1px 4px;
  border-radius: 3px;
}

.group-items {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.item-tag {
  font-size: 11px;
  padding: 1px 5px;
  border: 1px solid var(--medical-border-light);
  border-radius: 3px;
  background: white;
  display: flex;
  align-items: center;
  gap: 3px;
}

.remove-x {
  cursor: pointer;
  color: #cbd5e1;
}

.remove-x:hover { color: #ef4444; }

.add-select-sm {
  border: none;
  background: transparent;
  font-size: 11px;
  color: var(--medical-info);
  width: 60px;
  outline: none;
}

.icon-btn-danger {
  color: #94a3b8;
  padding: 4px;
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
}

.icon-btn-danger:hover {
  background: #fee2e2;
  color: #ef4444;
}

.rotate-180 {
  transform: rotate(180deg);
}

.transition-icon {
  transition: transform 0.2s;
}
.btn-text-primary {
  background: transparent;
  border: none;
  color: var(--medical-primary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 0;
}
.btn-text-primary:hover { text-decoration: underline; }
.btn-tiny {
  padding: 2px 6px; font-size: 11px; border:1px solid; border-radius:4px; margin-top:4px;
}
.icon-btn-small { border:none; background:transparent; font-size:12px; cursor:pointer; color:#94a3b8; }
</style>
