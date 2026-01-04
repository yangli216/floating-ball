<template>
  <div class="consultation-page">
    <!-- Top: Patient Info -->
    <header class="patient-header">
      <div class="patient-card">
        <!-- Avatar -->
        <div class="avatar">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="#ff9a9e"/>
          </svg>
        </div>
        
        <!-- Name -->
        <div class="patient-name">{{ patientInfo.naPi }}</div>
        
        <!-- Basic Info -->
        <div class="patient-basic">
          <span>{{ patientInfo.sdSexText }}</span>
          <span class="divider"></span>
          <span>{{ patientInfo.ageText }}</span>
          <span class="divider"></span>
          <span>{{ patientInfo.sdNationText }} | {{ patientInfo.sdMaritalText }}</span>
        </div>

        <!-- Tags -->
        <div class="tag-blue">自费</div>

        <!-- Contact Info -->
        <div class="contact-info">
          <span>身份证号：{{ patientInfo.idCard }}</span>
          <span>联系电话：{{ patientInfo.mobilePhone }}</span>
        </div>

         <!-- Allergy Tag -->
         <div class="tag-green">过敏史</div>
      </div>

      <!-- Header Actions -->
      <div class="header-actions">
        <template v-if="currentView === 'consultation'">
             <button class="header-btn primary" @click="handleEndConsultation">结束问诊</button>
        </template>
        <template v-else-if="currentView === 'record'">
             <button class="header-btn" @click="currentView = 'consultation'">返回</button>
             <button class="header-btn primary" @click="handleComplete">完成</button>
        </template>
        <template v-else>
             <button class="header-btn primary" @click="printReport">打印</button>
             <button class="header-btn" @click="handleEndSession">结束</button>
        </template>
      </div>
    </header>

    <div class="content-container" v-if="currentView === 'consultation'">
      <!-- Left: Symptom Shortcuts -->
      <aside class="symptom-sidebar">
        <h3>常用症状</h3>
        <div class="search-box">
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="搜索症状(支持首字母)..." 
            class="search-input"
          />
        </div>
        <ul class="symptom-list">
          <li 
            v-for="symptom in filteredSymptoms" 
            :key="symptom.key"
            :class="{ active: selectedSymptoms.some(s => s.key === symptom.key) }"
            @click="selectSymptom(symptom)"
          >
            {{ symptom.name }}
          </li>
        </ul>
      </aside>

      <!-- Right: Dynamic Form -->
      <main class="form-container" v-if="selectedSymptoms.length > 0">
        <div class="forms-scroll-area">
          <template v-for="item in renderList" :key="item.key">
            <div class="symptom-form-section">
              <div class="form-header">
                <h2>{{ item.key === 'general' ? item.name : (item.name + ' - 症状属性问诊') }}</h2>
              </div>
      
              <div class="dynamic-form">
                <template v-for="section in item.config.sections" :key="section.id">
                  <!-- Iterate over fields -->
                  <div 
                    v-for="field in section.fields" 
                    :key="field.id" 
                    class="form-field"
                    :id="'field-' + item.key + '-' + field.storageKey"
                    :class="{ 'has-error': validationErrors[item.key + '_' + field.storageKey] }"
                  >
                    <label class="field-label">{{ field.label }}</label>
                    
                    <!-- Field Type: input_radio (e.g., OnsetTime) -->
                    <div v-if="field.type === 'input_radio'" class="field-input-radio">
                      <input 
                        type="text" 
                        v-model="formData[item.key][field.storageKey].inputValue" 
                        :placeholder="field.props.placeholder"
                        class="text-input"
                      />
                      <div class="radio-group">
                        <label 
                          v-for="opt in field.props.radioOptions" 
                          :key="opt" 
                          class="radio-label"
                          :class="{ 'is-active': formData[item.key][field.storageKey].radioValue === opt }"
                        >
                          <input 
                            type="radio" 
                            :name="field.id + '_' + item.key" 
                            :value="opt" 
                            v-model="formData[item.key][field.storageKey].radioValue"
                          />
                          {{ opt }}
                        </label>
                      </div>
                    </div>
      
                    <!-- Field Type: radio -->
                    <div v-else-if="field.type === 'radio'" class="field-radio">
                      <div class="radio-group">
                        <label 
                          v-for="opt in field.props.options" 
                          :key="opt" 
                          class="radio-label"
                          :class="{ 'is-active': formData[item.key][field.storageKey] === opt }"
                        >
                          <input 
                            type="radio" 
                            :name="field.id + '_' + item.key" 
                            :value="opt" 
                            v-model="formData[item.key][field.storageKey]"
                          />
                          {{ opt }}
                        </label>
                      </div>
                    </div>
      
                    <!-- Field Type: checkbox -->
                    <div v-else-if="field.type === 'checkbox'" class="field-checkbox">
                      <div class="checkbox-group">
                        <label 
                          v-for="opt in field.props.options" 
                          :key="opt" 
                          class="checkbox-label"
                          :class="{ 'is-active': formData[item.key][field.storageKey]?.includes(opt) }"
                        >
                          <input 
                            type="checkbox" 
                            :value="opt" 
                            :checked="formData[item.key][field.storageKey]?.includes(opt)"
                            @change="(e) => handleCheckboxChange(e, field, item.key)"
                          />
                          {{ opt }}
                        </label>
                      </div>
                    </div>
      
                    <!-- Field Type: number -->
                    <div v-else-if="field.type === 'number'" class="field-number">
                      <input 
                        type="number" 
                        v-model="formData[item.key][field.storageKey]" 
                        :placeholder="field.props.placeholder"
                        class="text-input"
                      />
                      <span v-if="field.props.unit" class="unit">{{ field.props.unit }}</span>
                    </div>
      
                     <!-- Field Type: input -->
                     <div v-else-if="field.type === 'input'" class="field-input">
                      <input 
                        type="text" 
                        v-model="formData[item.key][field.storageKey]" 
                        :placeholder="field.props.placeholder"
                        class="text-input"
                      />
                    </div>
      
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
        
        <!-- Fixed Submit Button Removed -->
      </main>
      <main v-else class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"></path>
          </svg>
        </div>
        <p>请选择左侧症状进行问诊</p>
        <span class="sub-text">支持多选，最多3项</span>
      </main>
    </div>

    <!-- Medical Record View -->
    <div v-else-if="currentView === 'record'" class="medical-record-page">
      
      <div class="record-content">
        <!-- Left: Generated Record -->
        <div class="record-panel left-panel">
          <div class="panel-header">
            <h3>病历详情</h3>
            <button class="icon-btn" @click="copyToClipboard" title="复制全部">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 2h12v12h-12zM4 6v14h14M8 6h10M8 10h10M8 14h6"></path>
              </svg>
            </button>
          </div>
          <div class="panel-body">
            <div class="record-field">
              <label>主诉</label>
              <textarea v-model="generatedRecord.chiefComplaint" rows="2"></textarea>
            </div>
            <div class="record-field">
              <label>现病史</label>
              <textarea v-model="generatedRecord.historyOfPresentIllness" rows="12"></textarea>
            </div>
          </div>
        </div>

        <!-- Right: AI Recommendations -->
        <div class="record-panel right-panel">
          <div class="panel-header">
            <h3>智能辅助 (AI)</h3>
            <span v-if="aiLoading" class="tag-ai">AI生成中...</span>
          </div>
          <div class="panel-body">
            <div class="ai-card">
              <h4>推荐诊断</h4>
              <div v-if="aiLoading" class="ai-placeholder">
                <div class="skeleton-line" style="width: 60%"></div>
                <div class="skeleton-line" style="width: 80%"></div>
              </div>
              <ul v-else-if="aiDiagnoses.length > 0" class="diagnosis-list">
                <li 
                  v-for="diag in aiDiagnoses" 
                  :key="diag.code"
                  class="diagnosis-item"
                  :class="{ active: selectedDiagnosis?.code === diag.code }"
                  @click="selectedDiagnosis = diag"
                >
                  <div class="diag-header">
                    <span class="diag-name">{{ diag.name }} ({{ diag.code }})</span>
                    <span class="diag-rate">{{ diag.rate }}</span>
                  </div>
                  <div class="diag-rationale">{{ diag.rationale }}</div>
                </li>
              </ul>
              <div v-else class="empty-text">暂无推荐</div>
            </div>
            
            <div class="ai-card" v-if="selectedDiagnosis">
              <h4>推荐方案 (基于 {{ selectedDiagnosis.name }})</h4>
              
              <div v-if="treatmentLoading" class="ai-placeholder">
                 <div class="skeleton-line" style="width: 90%"></div>
                 <div class="skeleton-line" style="width: 70%"></div>
                 <div class="skeleton-line" style="width: 50%"></div>
              </div>

              <div v-else-if="treatmentError" class="error-text">{{ treatmentError }}</div>

              <div v-else-if="treatmentRecommendations.length > 0" class="treatment-list">
                <div 
                  v-for="(rec, idx) in treatmentRecommendations" 
                  :key="idx" 
                  class="treatment-item"
                  :class="{ active: rec.selected }"
                  @click="toggleTreatmentSelection(idx)"
                >
                  <div class="selected-mark" v-if="rec.selected">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <div class="rec-content">
                    <div class="rec-header">
                      <span class="rec-tag" :class="rec.type">{{ rec.type === 'medicine' ? '药' : '检' }}</span>
                      <span class="rec-name">{{ rec.name }}</span>
                      <span v-if="rec.matchedItem" class="matched-inline">
                        <span class="match-icon">✓</span>
                        <span class="match-name">{{ rec.matchedItem.name }}</span>
                        <span class="match-spec" v-if="rec.type === 'medicine'">{{ rec.matchedItem.spec }}</span>
                      </span>
                      <span v-else class="unmatched-icon" title="未匹配标准库">🔍</span>
                    </div>
                    <div class="rec-reason">{{ rec.reason }}</div>
                    <div v-if="rec.usage" class="rec-usage">建议：{{ rec.usage }}</div>
                  </div>
                </div>
              </div>
              <div v-else class="empty-text">暂无推荐方案</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Fixed Action Area -->
      <div class="fixed-action-area">
        <button class="submit-btn" @click="handleComplete">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          完成
        </button>
      </div>
    </div>

    <!-- Final Report View -->
    <div v-else-if="currentView === 'final_report'" class="final-report-page">

       <div class="report-paper">
         <h1 class="hospital-title">门诊病历</h1>
         <div class="report-header">
           <div class="info-row">
             <span>姓名：{{ patientInfo.naPi }}</span>
             <span>性别：{{ patientInfo.sdSexText }}</span>
             <span>年龄：{{ patientInfo.ageText }}</span>
           </div>
           <div class="info-row">
             <span>科室：全科医学科</span>
             <span>日期：{{ finalRecord?.date }}</span>
             <span>卡号：{{ patientInfo.idCard }}</span>
           </div>
         </div>
         
         <div class="report-section">
           <div class="section-title">主诉</div>
           <div class="section-content">{{ finalRecord?.record?.chiefComplaint }}</div>
         </div>

         <div class="report-section">
           <div class="section-title">现病史</div>
           <div class="section-content">{{ finalRecord?.record?.historyOfPresentIllness }}</div>
         </div>

         <div class="report-section">
           <div class="section-title">既往史</div>
           <div class="section-content">否认高血压、糖尿病、冠心病等慢性病史。否认肝炎、结核等传染病史。</div>
         </div>

         <div class="report-section">
           <div class="section-title">体格检查</div>
           <div class="section-content">T: 36.5℃, P: 78次/分, R: 18次/分, BP: 120/80mmHg。神志清，精神可，心肺听诊无明显异常，腹软无压痛。</div>
         </div>

         <div class="report-section">
           <div class="section-title">初步诊断</div>
           <div class="section-content">{{ finalRecord?.diagnosis?.name }} ({{ finalRecord?.diagnosis?.code }})</div>
         </div>

         <div class="report-section">
           <div class="section-title">处理意见</div>
           <div class="section-content">
             <div v-for="(tx, idx) in finalRecord?.treatments" :key="idx" class="tx-item">
               {{ idx + 1 }}. {{ tx.name }} {{ tx.matchedItem?.spec ? `(${tx.matchedItem.spec})` : '' }}
               <div class="tx-usage" v-if="tx.usage">用法：{{ tx.usage }}</div>
             </div>
           </div>
         </div>
         
         <div class="report-footer">
            <span>医师签名：______________</span>
         </div>
       </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import templatesData from '../assets/templates.json';
import medicalCatalog from '../assets/medical_catalog.json';
import Pinyin from 'tiny-pinyin';
import { chatStream } from '../services/llm';

const emit = defineEmits(['close']);

// General Condition Configuration
const generalConditionConfig = {
  key: 'general',
  name: '一般情况问诊',
  config: {
    sections: [
      {
        id: 'general_section',
        title: '一般情况问诊',
        fields: [
          { id: 'spirit', key: 'spirit', label: '精神', type: 'radio', props: { options: ['精神尚可', '精神疲惫', '精神亢奋', '服药后', '其他'] }, storageKey: 'spirit' },
          { id: 'sleep', key: 'sleep', label: '睡眠', type: 'radio', props: { options: ['睡眠正常', '睡眠一般', '睡眠欠佳', '睡眠差', '其他'] }, storageKey: 'sleep' },
          { id: 'appetite', key: 'appetite', label: '食欲', type: 'radio', props: { options: ['食欲正常', '食欲增加', '食欲减退', '其他'] }, storageKey: 'appetite' },
          { id: 'urination', key: 'urination', label: '小便', type: 'radio', props: { options: ['小便正常', '小便增多', '小便减少', '其他'] }, storageKey: 'urination' },
          { id: 'stool', key: 'stool', label: '大便', type: 'radio', props: { options: ['大便正常', '大便增多', '大便减少', '其他'] }, storageKey: 'stool' },
          { id: 'weight', key: 'weight', label: '体重', type: 'radio', props: { options: ['体重无变化', '体重增加', '体重减轻', '其他'] }, storageKey: 'weight' }
        ]
      }
    ]
  }
};

// Mock Patient Data
const patientInfo = ref({
  "idTet": "BSOFTYL",
  "idPi": "766842939207974912",
  "idMpi": "766842939207974912",
  "cdPi": "JG00003125111",
  "naPi": "张虎",
  "sdSex": "2",
  "birthday": "2006-07-11",
  "idCard": "360731200607117442",
  "mobilePhone": "13800138000",
  "sdNation": "1",
  "sdNaty": "001",
  "sdBlood": "5",
  "sdRhBlood": "3",
  "sdMarital": "1",
  "sdCard": "11",
  "ageNum": 19,
  "ageUnit": "Y",
  "ageText": "19岁",
  "sdNationText": "汉族",
  "sdNatyText": "中国",
  "sdMaritalText": "未婚",
  "sdSexText": "女性",
  "sdBloodText": "不详",
  "fgActiveText": "是",
  "sdRhBloodText": "不详",
  "sdCardText": "身份证"
});

const symptoms = ref<any[]>([]);
const selectedSymptoms = ref<any[]>([]);
const formData = ref<Record<string, any>>({});
const searchQuery = ref('');
const currentView = ref<'consultation' | 'record' | 'final_report'>('consultation');
const generatedRecord = ref({ chiefComplaint: '', historyOfPresentIllness: '' });

// AI Recommendations State
interface Diagnosis {
  code: string;
  name: string;
  rate: string;
  rationale: string;
}

interface TreatmentRecommendation {
  type: 'medicine' | 'exam';
  name: string; // AI recommended name
  reason: string;
  usage?: string;
  matchedItem?: any; // Matched item from catalog
  selected?: boolean;
}

const aiLoading = ref(false);
const aiError = ref<string | null>(null);
const aiDiagnoses = ref<Diagnosis[]>([]);
const selectedDiagnosis = ref<Diagnosis | null>(null);

const treatmentLoading = ref(false);
const treatmentError = ref<string | null>(null);
const treatmentRecommendations = ref<TreatmentRecommendation[]>([]);

interface FinalRecord {
  patient: any;
  record: { chiefComplaint: string; historyOfPresentIllness: string };
  diagnosis: Diagnosis;
  treatments: TreatmentRecommendation[];
  date: string;
}

const finalRecord = ref<FinalRecord | null>(null);

const printReport = () => {
  window.print();
};

const handleEndSession = () => {
  currentView.value = 'consultation';
  selectedSymptoms.value = [];
  formData.value = {};
  generatedRecord.value = { chiefComplaint: '', historyOfPresentIllness: '' };
  finalRecord.value = null;
  aiDiagnoses.value = [];
  selectedDiagnosis.value = null;
  treatmentRecommendations.value = [];
  emit('close');
};

onMounted(() => {
  symptoms.value = templatesData;
  // Initialize General Condition data
  initFormData(generalConditionConfig);
});

const filteredSymptoms = computed(() => {
  if (!searchQuery.value) return symptoms.value;
  const query = searchQuery.value.toLowerCase();
  return symptoms.value.filter(s => {
    const name = s.name.toLowerCase();
    if (name.includes(query)) return true;
    
    // Pinyin support
    if (Pinyin.isSupported()) {
       const pinyinFull = Pinyin.convertToPinyin(s.name, '', true); // "fare"
       if (pinyinFull.includes(query)) return true;
       
       const pinyinInitials = Pinyin.convertToPinyin(s.name, ' ', true)
          .split(' ')
          .map(w => w[0])
          .join('');
       if (pinyinInitials.includes(query)) return true;
    }
    return false;
  });
});

// Computed list of all items to render (Selected Symptoms + General Condition)
const renderList = computed(() => {
  if (selectedSymptoms.value.length === 0) return [];
  return [...selectedSymptoms.value, generalConditionConfig];
});

const selectSymptom = (symptom: any) => {
  const index = selectedSymptoms.value.findIndex(s => s.key === symptom.key);
  if (index !== -1) {
    // Deselect
    selectedSymptoms.value.splice(index, 1);
    // Optional: clear formData for this symptom? Keeping it might be better for user experience if they re-select.
  } else {
    // Select
    if (selectedSymptoms.value.length >= 3) {
      return; 
    }
    selectedSymptoms.value.push(symptom);
    // Initialize form data if not exists
    if (!formData.value[symptom.key]) {
      initFormData(symptom);
    }
  }
};

const initFormData = (configItem: any) => {
  const data: Record<string, any> = {};
  configItem.config.sections.forEach((section: any) => {
    section.fields.forEach((field: any) => {
      if (field.type === 'input_radio') {
        data[field.storageKey] = { inputValue: '', radioValue: '' };
      } else if (field.type === 'checkbox') {
        data[field.storageKey] = [];
      } else {
        // Set default value for General Condition or if explicitly requested
        if (configItem.key === 'general' && field.props?.options?.length > 0) {
           data[field.storageKey] = field.props.options[0];
        } else {
           data[field.storageKey] = '';
        }
      }
    });
  });
  // Use reactive set
  formData.value[configItem.key] = data;
};

const handleCheckboxChange = (event: Event, field: any, symptomKey: string) => {
  const target = event.target as HTMLInputElement;
  const value = target.value;
  const currentValues = formData.value[symptomKey][field.storageKey] || [];
  
  if (target.checked) {
    let newValues = [...currentValues, value];
    
    if (field.props.mutualExclusions) {
      const myGroup = field.props.mutualExclusions.find((g: string[]) => g.includes(value));
      if (myGroup) {
           const otherGroups = field.props.mutualExclusions.filter((g: string[]) => g !== myGroup);
           const allOtherValues = otherGroups.flat();
           newValues = newValues.filter((v: string) => !allOtherValues.includes(v));
      }
    }
    
    formData.value[symptomKey][field.storageKey] = newValues;
  } else {
    formData.value[symptomKey][field.storageKey] = currentValues.filter((v: string) => v !== value);
  }
};

const validationErrors = ref<Record<string, boolean>>({});

const handleEndConsultation = () => {
  // 1. Validation
  const errors: string[] = [];
  validationErrors.value = {}; // Reset errors
  let firstErrorFieldId = '';

  selectedSymptoms.value.forEach(s => {
    const data = formData.value[s.key];
    if (data.onsetTime && (!data.onsetTime.inputValue || !data.onsetTime.radioValue)) {
      errors.push(`${s.name}: 请填写发病时间`);
      const errorId = `${s.key}_onsetTime`;
      validationErrors.value[errorId] = true;
      if (!firstErrorFieldId) firstErrorFieldId = `field-${s.key}-onsetTime`;
    }
  });

  if (errors.length > 0) {
    alert("请完善以下信息：\n" + errors.join("\n"));
    
    // Scroll to first error
    if (firstErrorFieldId) {
      const element = document.getElementById(firstErrorFieldId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    return;
  }

  // 2. Generation Logic
  generateMedicalRecord();

  // 3. Switch View
  currentView.value = 'record';

  // 4. Trigger AI Diagnosis
  fetchAIDiagnosis();
};

const parseLLMJson = (text: string): any => {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return JSON.parse(jsonStr);
};

const fetchAIDiagnosis = async () => {
  aiLoading.value = true;
  aiError.value = null;
  aiDiagnoses.value = [];
  selectedDiagnosis.value = null;

  const prompt = `
你是一个专业的医疗辅助助手。请根据以下患者信息、主诉和现病史，推荐最可能的3个ICD10诊断结果。
请严格按照JSON数组格式返回，不要包含Markdown标记或其他多余文本。

患者信息：
姓名：${patientInfo.value.naPi}
性别：${patientInfo.value.sdSexText}
年龄：${patientInfo.value.ageText}

主诉：
${generatedRecord.value.chiefComplaint}

现病史：
${generatedRecord.value.historyOfPresentIllness}

返回格式要求：
[
  {
    "code": "ICD10编码",
    "name": "诊断名称",
    "rate": "符合率(例如 95%)",
    "rationale": "简短推荐理由"
  }
]
`;

  try {
    let fullResponse = "";
    await chatStream([
      { role: 'system', content: '你是一个专业的医疗辅助助手，只返回JSON格式的数据。' },
      { role: 'user', content: prompt }
    ], (chunk) => {
      fullResponse += chunk;
    });

    // Clean up response if it contains markdown code blocks
    const diagnoses: Diagnosis[] = parseLLMJson(fullResponse);
    
    // Sort by rate descending
    diagnoses.sort((a, b) => {
      const rateA = parseFloat(a.rate.replace('%', '')) || 0;
      const rateB = parseFloat(b.rate.replace('%', '')) || 0;
      return rateB - rateA;
    });

    aiDiagnoses.value = diagnoses;
  } catch (e) {
    console.error("Failed to fetch AI diagnosis", e);
    aiError.value = "无法获取诊断建议，请稍后重试或检查网络。";
  } finally {
    aiLoading.value = false;
  }
};

const fetchTreatmentRecommendation = async () => {
  if (!selectedDiagnosis.value) return;
  
  treatmentLoading.value = true;
  treatmentError.value = null;
  treatmentRecommendations.value = [];

  const prompt = `
你是一个专业的医疗辅助助手。
患者信息：${patientInfo.value.naPi}，${patientInfo.value.sdSexText}，${patientInfo.value.ageText}。
已选诊断：${selectedDiagnosis.value.name} (ICD10: ${selectedDiagnosis.value.code})。
主诉：${generatedRecord.value.chiefComplaint}

请根据诊断结果，推荐3-5个最需要的药品（通用名）和1-2个必要的检验检查项目。
请严格按照JSON数组格式返回，不要包含Markdown标记或其他多余文本。

返回格式要求：
[
  {
    "type": "medicine", // 或 "exam"
    "name": "通用名称",
    "reason": "推荐理由",
    "usage": "建议用法用量(仅药品需要)"
  }
]
`;

  try {
    let fullResponse = "";
    await chatStream([
      { role: 'system', content: '你是一个专业的医疗辅助助手，只返回JSON格式的数据。' },
      { role: 'user', content: prompt }
    ], (chunk) => {
      fullResponse += chunk;
    });

    const rawRecommendations: any[] = parseLLMJson(fullResponse);
    
    // Match against catalog
    const processedRecs: TreatmentRecommendation[] = rawRecommendations.map(rec => {
      let matchedItem = null;
      if (rec.type === 'medicine') {
        // Simple fuzzy match for medicines
        matchedItem = medicalCatalog.medicines.find(m => 
          m.genericName.includes(rec.name) || rec.name.includes(m.genericName) || m.name.includes(rec.name)
        );
      } else if (rec.type === 'exam') {
        // Simple fuzzy match for exams
        matchedItem = medicalCatalog.examinations.find(e => 
          e.name.includes(rec.name) || rec.name.includes(e.name)
        );
      }
      return {
        ...rec,
        matchedItem,
        selected: false
      };
    });

    treatmentRecommendations.value = processedRecs;
  } catch (e) {
    console.error("Failed to fetch treatment recommendations", e);
    treatmentError.value = "无法获取治疗方案建议。";
  } finally {
    treatmentLoading.value = false;
  }
};

const toggleTreatmentSelection = (index: number) => {
  const item = treatmentRecommendations.value[index];
  if (item) {
    item.selected = !item.selected;
  }
};

const handleComplete = () => {
  if (!selectedDiagnosis.value) {
    alert("请先选择一个诊断结果");
    return;
  }

  // Build Final Record
  const selectedTreatments = treatmentRecommendations.value
    .filter(t => t.selected)
    .map(t => ({
      type: t.type,
      name: t.name,
      usage: t.usage,
      matchedItem: t.matchedItem,
      reason: t.reason
    }));
  
  finalRecord.value = {
    patient: patientInfo.value,
    record: generatedRecord.value,
    diagnosis: selectedDiagnosis.value,
    treatments: selectedTreatments,
    date: new Date().toLocaleDateString()
  };

  currentView.value = 'final_report';
};

watch(selectedDiagnosis, (newVal) => {
  if (newVal) {
    fetchTreatmentRecommendation();
  } else {
    treatmentRecommendations.value = [];
  }
});

const generateMedicalRecord = () => {
  const complaints: string[] = [];
  const hpiParts: string[] = [];
  
  // -- Chief Complaint --
  selectedSymptoms.value.forEach(s => {
    const data = formData.value[s.key];
    if (data.onsetTime) {
      complaints.push(`${s.name}${data.onsetTime.inputValue}${data.onsetTime.radioValue}`);
    } else {
      complaints.push(s.name);
    }
  });
  const chiefComplaint = complaints.join("，") + "。";

  // -- History of Present Illness --
  // Intro: Patient [duration] ago...
  const firstSymptom = selectedSymptoms.value[0];
  const firstData = formData.value[firstSymptom.key];
  const duration = firstData.onsetTime ? `${firstData.onsetTime.inputValue}${firstData.onsetTime.radioValue}` : '近日';
  
  // Try to find precipitating factor for the first symptom
  let precipitating = '无明显诱因';
  if (firstData.precipitatingFactor) {
    if (Array.isArray(firstData.precipitatingFactor)) {
      if (firstData.precipitatingFactor.length > 0) precipitating = firstData.precipitatingFactor.join('、');
    } else if (firstData.precipitatingFactor !== '不清楚') {
      precipitating = firstData.precipitatingFactor;
    }
  }

  let intro = `患者于${duration}前，${precipitating}出现`;
  const symptomNames = selectedSymptoms.value.map(s => s.name).join('、');
  intro += symptomNames + "。";
  hpiParts.push(intro);

  // Symptom Details
  selectedSymptoms.value.forEach(s => {
    const data = formData.value[s.key];
    let detail = formatSymptomDetail(s, data);

    if (detail) {
      hpiParts.push(`${s.name}表现为：${detail}。`);
    }
  });

  // General Condition
  const genData = formData.value['general'];
  if (genData) {
    const genParts: string[] = [];
    
    // Process standard fields first
    ['spirit', 'sleep', 'appetite'].forEach(k => {
      if (genData[k] && genData[k] !== '其他') genParts.push(genData[k]);
    });

    // Special handling for urination and stool optimization
    const isUrinationNormal = genData['urination'] === '小便正常';
    const isStoolNormal = genData['stool'] === '大便正常';

    if (isUrinationNormal && isStoolNormal) {
      genParts.push('二便正常');
    } else {
      if (genData['urination'] && genData['urination'] !== '其他') genParts.push(genData['urination']);
      if (genData['stool'] && genData['stool'] !== '其他') genParts.push(genData['stool']);
    }

    // Process weight
    if (genData['weight'] && genData['weight'] !== '其他') genParts.push(genData['weight']);

    if (genParts.length > 0) {
      hpiParts.push(`一般情况：${genParts.join('，')}。`);
    }
  }

  generatedRecord.value = {
    chiefComplaint,
    historyOfPresentIllness: hpiParts.join("\n")
  };
};

const formatSymptomDetail = (s: any, data: any) => {
    let detail = "";
    
    // Custom logic for common symptoms
    if (s.key === 'fever') {
      if (data.maximumBodyTemperature) detail += `最高体温${data.maximumBodyTemperature}℃，`;
      if (data.reliefFactor && data.reliefFactor !== '不清楚') detail += `${data.reliefFactor}，`;
    } else if (s.key === 'cough') {
      if (data.frequencyCharacteristic && data.frequencyCharacteristic !== '不清楚') detail += `${data.frequencyCharacteristic}，`;
      if (data.soundCharacter && data.soundCharacter.length > 0) detail += `${data.soundCharacter.join('、')}，`;
      if (data.colorFeature && data.colorFeature.length > 0) detail += `咳${data.colorFeature.join('、')}，`;
    }
    
    // Generic logic for remaining fields
    Object.keys(data).forEach(k => {
      if (k === 'onsetTime' || k === 'precipitatingFactor') return; // Handled in intro
      if (s.key === 'fever' && (k === 'maximumBodyTemperature' || k === 'reliefFactor')) return; // Handled above
      if (s.key === 'cough' && (k === 'frequencyCharacteristic' || k === 'soundCharacter' || k === 'colorFeature')) return;
      
      const val = data[k];
      if (Array.isArray(val) && val.length > 0) {
         // Exclude '不清楚', '以上都无'
         const validVals = val.filter(v => v !== '不清楚' && v !== '以上都无' && v !== '无');
         if (validVals.length > 0) detail += `${validVals.join('、')}，`;
      } else if (typeof val === 'string' && val && val !== '不清楚' && val !== '无') {
         detail += `${val}，`;
      }
    });

    if (detail.endsWith('，')) detail = detail.slice(0, -1);
    return detail;
};

const copyToClipboard = () => {
  const text = `主诉：${generatedRecord.value.chiefComplaint}\n现病史：\n${generatedRecord.value.historyOfPresentIllness}`;
  navigator.clipboard.writeText(text).then(() => {
    alert('已复制到剪贴板');
  });
};



</script>

<style scoped>
.consultation-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #eff6ff; /* Livelier light blue background */
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px; /* Base font size */
  overflow: hidden;
}

.patient-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  background: linear-gradient(to right, #ffffff, #f0f9ff);
  padding: 8px 16px; /* Reduced padding */
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.08);
  z-index: 10;
  flex-shrink: 0;
  border-bottom: 1px solid #e6f7ff;
}

.patient-card {
  display: flex;
  align-items: center;
  gap: 12px; /* Reduced gap */
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
  margin-right: 16px;
}

.avatar {
  width: 32px; /* Reduced size */
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  background: #fff0f1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ffe4e6;
}

.avatar svg {
  width: 20px; /* Reduced icon size */
  height: 20px;
}

.patient-name {
  font-size: 16px; /* Slightly reduced */
  font-weight: 700;
  color: #1f2937;
}

.patient-basic {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #4b5563;
}

.divider {
  width: 1px;
  height: 12px;
  background: #d1d5db;
}

.tag-blue {
  background: #dbeafe;
  color: #2563eb;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.tag-green {
  background: #dcfce7;
  color: #16a34a;
  padding: 2px 8px;
  border-radius: 12px; /* Pill shape */
  font-size: 12px;
  font-weight: 500;
}

.contact-info {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 14px; /* Increased to 14px */
  color: #6b7280;
  margin-left: auto; /* Push to right if space permits, or just standard flow */
}

@media (max-width: 800px) {
  .contact-info {
    margin-left: 0;
    width: 100%;
    margin-top: 8px;
  }
}

/* Header Actions */
.header-actions {
  margin-left: auto;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-shrink: 0;
}

.header-btn {
  padding: 6px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 18px;
  color: #4b5563;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  font-weight: 500;
}

.header-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
  color: #1f2937;
}

.header-btn.primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2);
}

.header-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3);
}

.content-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.symptom-sidebar {
  width: 200px; /* Reduced width */
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-right: 1px solid #e6f7ff;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-shadow: 2px 0 8px rgba(0,0,0,0.02);
  z-index: 5;
}

.symptom-sidebar h3 {
  padding: 12px 16px; /* Reduced padding */
  margin: 0;
  font-size: 14px; /* Adjusted to 14px */
  font-weight: 600;
  color: #0c4a6e; /* Dark blue text */
  border-bottom: 1px solid #e6f7ff;
  background: transparent;
  flex-shrink: 0;
}

.search-box {
  padding: 10px; /* Reduced padding */
  border-bottom: 1px solid #e6f7ff;
  background: transparent;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 6px 10px; /* Reduced padding */
  border: 1px solid #dbeafe; /* Blue-100 */
  border-radius: 6px;
  font-size: 14px; /* Adjusted to 14px */
  box-sizing: border-box;
  outline: none;
  background: #ffffff;
  transition: all 0.3s;
}

.search-input:focus {
  border-color: #3b82f6; /* Blue-500 */
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.symptom-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0; /* Fix for flex child scrolling */
}

.symptom-list li {
  padding: 8px 16px; /* Reduced padding */
  cursor: pointer;
  border-bottom: 1px solid #f0f9ff;
  transition: all 0.2s;
  color: #4b5563;
  font-size: 14px;
}

.symptom-list li:hover {
  background: #eff6ff;
  color: #2563eb;
  padding-left: 20px; /* Subtle movement */
}

.symptom-list li.active {
  background: #2563eb; /* Dark blue background */
  color: #ffffff; /* White text */
  border-right: none;
  font-weight: 600;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
}

.symptom-list li.active:hover {
  background: #1d4ed8;
  color: #ffffff;
}

.form-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.forms-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px; /* Reduced padding */
  padding-bottom: 80px; /* Extra padding to prevent last item truncation */
}

.symptom-form-section {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.06);
  padding: 12px; /* Ultra compact padding */
  margin-bottom: 12px; /* Ultra compact margin */
  border: 1px solid #dbeafe;
  transition: transform 0.2s;
}

.symptom-form-section:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.1);
}

.form-header {
  background: linear-gradient(to right, #ffffff, #eff6ff);
  margin: -12px -12px 12px -12px; /* Adjusted for new padding */
  padding: 8px 16px; /* Compact padding */
  border-bottom: 1px solid #e0f2fe;
  border-radius: 12px 12px 0 0;
}

.form-header h2 {
  margin: 0;
  font-size: 15px; /* Slightly smaller font */
  font-weight: 600;
  color: #1e3a8a; /* Dark blue */
  display: flex;
  align-items: center;
}

.form-header h2::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 14px;
  background: #2563eb;
  margin-right: 10px;
  border-radius: 2px;
}

.dynamic-form {
  padding-top: 4px; /* Reduced */
}

.form-field {
  display: flex;
  align-items: flex-start;
  margin-bottom: 10px; /* Compact margin */
  border-bottom: 1px dashed #f0f0f0;
  padding-bottom: 10px; /* Compact padding */
}

.form-field:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.field-label {
  flex-shrink: 0;
  width: 70px; /* Fixed width for alignment */
  margin-bottom: 0;
  margin-right: 12px;
  font-weight: 600;
  font-size: 14px;
  color: #374151;
  padding-top: 5px; /* Visual alignment with inputs */
  text-align: right; /* Align right for cleaner look */
}

/* Ensure input containers take remaining space */
.field-input-radio,
.radio-group,
.checkbox-group,
.field-number,
.field-input {
  flex: 1;
}

/* Input Radio Style */
.field-input-radio {
  display: flex;
  align-items: center;
  gap: 8px;
}

.has-error .text-input {
  border-color: #ef4444; /* Red-500 */
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.2);
  animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
}

.has-error .radio-label {
  border-color: #fecaca;
  background-color: #fef2f2;
}

@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}

.text-input {
  padding: 6px 10px; /* Reduced padding */
  border: 1px solid #d1d5db;
  border-radius: 6px;
  width: 100px; /* Default small width */
  outline: none;
  transition: all 0.3s;
  color: #1f2937;
  font-size: 14px; /* Adjusted to 14px */
}

.field-input .text-input {
  width: 100%; /* Full width for standalone inputs */
}

.text-input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

.radio-group, .checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px; /* Reduced gap */
}

.radio-label, .checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px; /* Reduced gap */
  cursor: pointer;
  font-size: 14px; /* Adjusted to 14px */
  color: #4b5563;
  padding: 4px 10px; /* Reduced padding */
  border-radius: 20px;
  transition: all 0.2s;
  border: 1px solid #e5e7eb; /* Subtle default border */
  background: #ffffff;
}

.radio-label:hover, .checkbox-label:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.radio-label.is-active, .checkbox-label.is-active {
  background: #eff6ff;
  color: #2563eb;
  border-color: #3b82f6;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.1);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 15px;
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  color: #cbd5e1;
}

.empty-icon svg {
  width: 100%;
  height: 100%;
}

.sub-text {
  font-size: 13px;
  color: #cbd5e1;
  margin-top: 8px;
}

.action-area {
  padding: 20px 0;
  display: flex;
  justify-content: center;
}

.submit-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
  transition: all 0.3s;
}

.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
}

.submit-btn svg {
  width: 18px;
  height: 18px;
}

/* Fixed Action Area */
.fixed-action-area {
  position: absolute;
  bottom: 4px;
  right: 24px;
  z-index: 50;
}

/* Medical Record Page Styles */
.medical-record-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f3f4f6;
  overflow: hidden;
  position: relative;
  min-height: 0;
}

/* Footer Actions */
.record-footer {
  height: 60px;
  background: white;
  border-top: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 24px;
  gap: 12px;
  z-index: 100;
  flex-shrink: 0;
}

.back-btn-footer {
  padding: 8px 20px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 20px;
  color: #4b5563;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}
.back-btn-footer:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.complete-btn {
  padding: 8px 24px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2);
  transition: all 0.2s;
}
.complete-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.record-content {
  flex: 1;
  display: flex;
  gap: 16px; /* Reduced gap */
  padding: 16px; /* Reduced padding */
  overflow: hidden;
  min-height: 0;
}

.record-panel {
  flex: 1;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.left-panel {
  flex: 0.8; /* Reduced width */
}

.right-panel {
  flex: 1.2; /* Increased width */
  background: #f8fafc;
  border-color: #e2e8f0;
}

.panel-header {
  padding: 10px 16px; /* Compact */
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: white;
}

.right-panel .panel-header {
  background: #f1f5f9;
}

.panel-header h3 {
  margin: 0;
  font-size: 15px; /* Slightly smaller */
  color: #374151;
  font-weight: 600;
}

.panel-body {
  flex: 1;
  padding: 12px; /* Compact */
  overflow-y: auto;
}

.record-field {
  margin-bottom: 12px; /* Compact */
}

.record-field label {
  display: block;
  font-size: 13px; /* Smaller */
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 6px;
}

.record-field textarea {
  width: 100%;
  padding: 8px 10px; /* Compact */
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: #1f2937;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s;
}

.record-field textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.icon-btn {
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: #f3f4f6;
  color: #2563eb;
}

.tag-ai {
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: white;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.ai-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  border: 1px solid #e2e8f0;
}

.ai-card h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #475569;
}

.ai-placeholder {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 12px;
  background: #f1f5f9;
  border-radius: 6px;
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.3; }
  100% { opacity: 0.6; }
}

/* Diagnosis List Styles */
.diagnosis-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diagnosis-item {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  cursor: pointer;
  transition: all 0.2s;
}

.diagnosis-item:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.diagnosis-item.active {
  background: #eff6ff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.diag-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.diag-name {
  font-weight: 600;
  color: #1e293b;
  font-size: 14px;
}

.diag-rate {
  font-size: 12px;
  color: #2563eb;
  background: #dbeafe;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.diag-rationale {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.empty-text {
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  padding: 20px 0;
}

.error-text {
  text-align: center;
  color: #ef4444;
  font-size: 13px;
  padding: 20px 0;
  background: #fef2f2;
  border-radius: 6px;
  border: 1px solid #fee2e2;
}

.treatment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.treatment-item {
  position: relative;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.selected-mark {
  position: absolute;
  top: 0;
  right: 0;
  width: 24px;
  height: 24px;
  background: #3b82f6;
  color: white;
  border-radius: 0 0 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 2px;
  padding-left: 2px;
}

.treatment-item:hover {
  background-color: #f8fafc;
  border-color: #cbd5e1;
}

.treatment-item.active {
  background-color: #eff6ff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.rec-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.rec-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.rec-tag.medicine {
  background: #dbeafe;
  color: #2563eb;
}

.rec-tag.exam {
  background: #fce7f3;
  color: #db2777;
}

.rec-name {
  font-weight: 600;
  font-size: 14px;
  color: #1e293b;
}

.rec-reason, .rec-usage {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.rec-action {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
}

.match-success {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f0fdf4;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #dcfce7;
}

.match-info {
  display: flex;
  flex-direction: column;
  font-size: 12px;
}

.match-name {
  font-weight: 600;
  color: #166534;
}

.match-spec, .match-price {
  color: #15803d;
  font-size: 11px;
}

.match-fail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #f1f5f9;
}

.unmatched-tip {
  font-size: 12px;
  color: #94a3b8;
}

.btn-add {
  background: #22c55e;
  color: white;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.btn-search {
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12px;
}

.field-number {
  display: flex;
  align-items: center;
  gap: 6px; /* Reduced gap */
}

.unit {
  color: #6b7280;
  font-size: 13px; /* Slightly smaller font */
}

.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #60a5fa; /* Blue-400 */
  flex-direction: column;
  gap: 16px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  margin: 24px;
  border: 2px dashed #dbeafe;
}

/* Final Report Styles */
.final-report-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #525659;
  overflow: hidden;
  position: relative;
}

.report-actions {
  height: 60px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 24px;
  gap: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.report-paper {
  margin: 24px auto;
  width: 210mm;
  min-height: 297mm;
  background: white;
  padding: 40px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  overflow-y: auto;
  font-family: 'SimSun', 'Songti SC', serif;
  color: #000;
}

.hospital-title {
  text-align: center;
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 30px;
  border-bottom: 2px solid #000;
  padding-bottom: 10px;
}

.report-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  border-bottom: 1px solid #000;
  padding-bottom: 10px;
}

.info-row {
  display: flex;
  justify-content: space-between;
}

.report-section {
  margin-bottom: 20px;
}

.section-title {
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 5px;
}

.section-content {
  font-size: 15px;
  line-height: 1.6;
}

.tx-item {
  margin-bottom: 4px;
}

.tx-usage {
  font-size: 14px;
  color: #444;
  margin-left: 1em;
}

.report-footer {
  margin-top: 50px;
  display: flex;
  justify-content: flex-end;
  padding-right: 50px;
}

@media print {
  .consultation-page > header,
  .symptom-sidebar,
  .report-actions,
  .fixed-action-area {
    display: none !important;
  }
  
  .consultation-page {
    height: auto;
    overflow: visible;
  }

  .final-report-page {
    background: white;
    height: auto;
    overflow: visible;
    position: static;
  }

  .report-paper {
    margin: 0;
    box-shadow: none;
    width: 100%;
    min-height: 0;
    padding: 0;
  }
}

.empty-state::before {
  content: '';
  display: block;
  width: 120px;
  height: 120px;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23bfdbfe" stroke-width="1"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 9h.01"/></svg>') no-repeat center/contain;
  opacity: 0.8;
}

/* Final Report Styles */
.final-report-page {
  flex: 1;
  background: #525659;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  overflow-y: auto;
}

.report-paper {
  background: white;
  width: 210mm;
  min-height: 297mm;
  padding: 20mm;
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.paper-header {
  text-align: center;
  margin-bottom: 20px;
  border-bottom: 2px solid #000;
  padding-bottom: 10px;
}

.paper-header h1 {
  margin: 0;
  font-size: 24px;
  color: #000;
}

.hospital-name {
  font-size: 14px;
  color: #666;
  margin-top: 5px;
}

.paper-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  font-size: 14px;
  border-bottom: 1px solid #000;
  padding-bottom: 10px;
}

.info-row {
  display: flex;
  justify-content: space-between;
}

.paper-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 8px;
  color: #000;
}

.section-content {
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  padding-left: 10px;
}

.rp-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.rp-item {
  display: flex;
  gap: 10px;
  margin-bottom: 5px;
}

.rp-index {
  font-weight: bold;
}

.rp-name {
  font-weight: 500;
}

.rp-spec {
  color: #666;
}

.paper-footer {
  margin-top: 40px;
  text-align: right;
  padding-top: 20px;
}

.doctor-sign {
  font-size: 14px;
}

.report-actions {
  display: flex;
  gap: 16px;
  margin-top: 20px;
}

.action-btn {
  padding: 10px 24px;
  border-radius: 4px;
  border: none;
  background: white;
  color: #333;
  cursor: pointer;
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.action-btn.primary {
  background: #2563eb;
  color: white;
}

@media print {
  .consultation-page {
    height: auto;
    overflow: visible;
  }
  
  .patient-header,
  .report-actions {
    display: none !important;
  }
  
  .final-report-page {
    padding: 0;
    background: white;
    height: auto;
    overflow: visible;
  }
  
  .report-paper {
    box-shadow: none;
    width: 100%;
    min-height: auto;
    padding: 0;
    margin: 0;
  }
}
</style>
