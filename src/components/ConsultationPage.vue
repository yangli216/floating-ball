<template>
  <div class="consultation-page">
    <!-- Top: Patient Info -->
    <PatientHeader v-if="currentView !== 'record'" :patient="patientInfo" :avatar="avatarSrc">
      <template #actions>
        <template v-if="currentView === 'consultation'">
          <!-- actions moved to consultation-footer -->
        </template>
        <template v-else>
             <button class="header-btn primary" @click="printReport">打印</button>
             <button class="header-btn primary" @click="submitToHIS">完成问诊</button>
        </template>
      </template>
    </PatientHeader>

    <div class="content-container" v-if="currentView === 'consultation'">
      <!-- Left: Symptom Shortcuts -->
      <aside class="symptom-sidebar">
        <!-- Mode Switch: 西医 / 中医 - vertical tabs on left edge -->
        <div class="sidebar-mode-switch">
          <button
            :class="['sidebar-switch-btn', { active: consultationMode === 'western' }]"
            @click="consultationMode = 'western'"
          >西医</button>
          <button
            :class="['sidebar-switch-btn', { active: consultationMode === 'tcm' }]"
            @click="consultationMode = 'tcm'"
          >中医</button>
        </div>
        <!-- Symptom content area -->
        <div class="sidebar-content">
        <!-- Selection Mode Tabs (always visible) -->
        <div class="selection-tabs">
          <button
            :class="['tab-btn', { active: selectionMode === 'common' }]"
            @click="selectionMode = 'common'"
          >
            常用症状
          </button>
          <button
            :class="['tab-btn', { active: selectionMode === 'bodyPart' }]"
            @click="selectionMode = 'bodyPart'"
          >
            按部位
          </button>
          <button
            :class="['tab-btn', { active: selectionMode === 'system' }]"
            @click="selectionMode = 'system'"
          >
            按系统
          </button>
        </div>

        <div class="search-box">
          <input
            type="text"
            v-model="searchQuery"
            placeholder="搜索症状(支持首字母)"
            class="search-input"
          />
          <svg class="search-box-svg" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8275" width="14" height="14"><path d="M949.888 904.64l-154.816-154.816a416
          416 0 1 0-45.248 45.248l154.816 154.816a32 32 0 0 0 45.184-45.248zM127.936 479.68a352 352 0
          1 1 352 352 352 352 0 0 1-352-352z m0 0" p-id="8276" fill="#999999"></path></svg>
        </div>

        <template v-if="!searchQuery.trim()">
          <!-- placeholder to keep template structure -->
          <span style="display:none"></span>

          <!-- Common Symptoms View -->
          <div v-if="selectionMode === 'common'" class="selection-content">
            <div class="common-filter-header">
              <div class="category-filter-container" ref="categoryFilterRef">
                <div class="category-trigger" @click="toggleCategoryDropdown" :class="{ active: isCategoryDropdownOpen }">
                  <span class="trigger-text">{{ categoryButtonText }}</span>
                  <svg class="trigger-icon" :class="{ rotate: isCategoryDropdownOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>

                <div v-show="isCategoryDropdownOpen" class="category-dropdown">
                  <div class="category-option" @click="toggleCategory('all')" :class="{ selected: selectedCategories.length === 0 }">
                      <div class="checkbox-custom" :class="{ checked: selectedCategories.length === 0 }"></div>
                      <span>全部系统</span>
                  </div>
                  <div class="dropdown-divider"></div>
                  <div v-for="cat in uniqueCategories" :key="cat.key" class="category-option" @click="toggleCategory(cat.key)" :class="{ selected: selectedCategories.includes(cat.key) }">
                      <div class="checkbox-custom" :class="{ checked: selectedCategories.includes(cat.key) }"></div>
                      <span>{{ cat.label }}</span>
                  </div>
                </div>
              </div>
            </div>
            <ul class="symptom-list" v-show="filteredSymptoms.length > 0">
              <li
                v-for="symptom in filteredSymptoms"
                :key="symptom.key"
                :class="{ active: selectedSymptoms.some(s => s.key === symptom.key) }"
                @click="selectSymptom(symptom)"
              >
                {{ symptom.name }}
              </li>
            </ul>
          </div>

          <!-- Body Part Selector View -->
          <div v-if="selectionMode === 'bodyPart'" class="selection-content">
            <BodyPartSelector
              :symptoms="allSymptoms"
              :patient-gender="patientGender"
              :selected-symptoms="selectedSymptoms"
              @select-symptom="selectSymptom"
            />
          </div>

          <!-- System Category Selector View -->
          <div v-if="selectionMode === 'system'" class="selection-content">
            <SystemCategorySelector
              :symptoms="allSymptoms"
              :selected-symptoms="selectedSymptoms"
              @select-symptom="selectSymptom"
            />
          </div>
        </template>

        <!-- Immersive Search Results View -->
        <template v-else>
          <div class="selection-content immersive-search">
            <!-- Global Search Results List -->
            <ul class="symptom-list" v-if="filteredSymptoms.length > 0">
              <li
                v-for="symptom in filteredSymptoms"
                :key="symptom.key"
                :class="{ active: selectedSymptoms.some(s => s.key === symptom.key) }"
                @click="selectSymptom(symptom)"
              >
                {{ symptom.name }}
              </li>
            </ul>

            <!-- AI Add Custom Symptom Button (Empty State) -->
            <div v-else class="ai-add-symptom">
               <div class="empty-state-icon">
                 <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
               </div>
               <p class="empty-state-text">未找到相关症状</p>
               <button 
                 class="ai-add-btn" 
                 :disabled="isGeneratingSymptom"
                 @click="handleGenerateDynamicSymptom(searchQuery.trim())"
               >
                 <Icon v-if="isGeneratingSymptom" icon="lucide:loader-2" class="animate-spin" size="16" style="margin-right: 6px;"/>
                 <Icon v-else icon="lucide:sparkles" size="16" style="margin-right: 6px;"/>
                 <span>{{ isGeneratingSymptom ? 'AI 生成属性中...' : `AI 新增: ${searchQuery}` }}</span>
               </button>
            </div>
          </div>
        </template>
        </div><!-- end sidebar-content -->
      </aside>

      <!-- Right: Dynamic Form -->
      <main class="form-container" v-if="selectedSymptoms.length > 0">
        <div class="forms-scroll-area">
          <template v-for="item in renderList" :key="item.key">
            <div class="symptom-form-section">
              <div class="form-header">
                <h2>{{ item.key === 'general' ? item.name : (item.name + ' - 症状属性问诊') }}</h2>
                <button v-if="item.key !== 'general'" class="icon-btn remove-btn" @click="removeSymptom(item)" title="移除此症状">
                  <Icon icon="lucide:trash-2" size="16"/>
                </button>
              </div>
      
              <div class="dynamic-form">
                <template v-for="section in item.config.sections" :key="section.id">
                  <template v-if="isFieldApplicable(section, patientInfo)">
                    <!-- Section Title (shown for multi-section forms like TCM) -->
                    <h3 v-if="item.config.sections.length > 1" class="section-title">{{ section.title }}</h3>

                    <!-- Iterate over fields -->
                    <template v-for="field in section.fields" :key="field.id">
                    <div
                      v-if="isFieldApplicable(field, patientInfo)"
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
                  </template>
                </template>
              </div>

              <!-- 伴随症状推荐 (per-symptom) -->
              <div v-if="item.key !== 'general' && item.key !== 'tcm_signs' && getSymptomRecommendations(item.key).length > 0" class="recommendation-panel">
                <div class="recommendation-header">
                  <div class="recommendation-title">
                    <Icon icon="lucide:sparkles" size="14" />
                    <span class="recommendation-title-word">伴随症状推荐</span>
                  </div>
                </div>
                <div class="recommendation-chips">
                  <label
                    v-for="rec in getSymptomRecommendations(item.key)"
                    :key="rec.key"
                    class="recommendation-chip"
                    :class="{ checked: isCompanionSelected(rec.key) }"
                  >
                    <input
                      type="checkbox"
                      class="companion-checkbox"
                      :checked="isCompanionSelected(rec.key)"
                      @change="toggleCompanionSymptom(rec.key)"
                    />
                    <span class="companion-name">{{ rec.name }}</span>
                    <button
                      type="button"
                      class="companion-add-btn"
                      @click.prevent.stop="selectSymptom(rec)"
                      title="展开详细问诊"
                    >十</button>
                  </label>
                </div>
              </div>
            </div>
          </template>
        </div>
        
        <!-- Fixed Submit Button Removed -->
      </main>
      <main v-else class="empty-state">
        <div class="empty-icon">
          <img src="/loading.png" alt="AI Agent" />
        </div>
        <p>请选择左侧症状进行问诊</p>
        <span class="sub-text">支持多选，最多{{ CONSULTATION_CONFIG.MAX_SYMPTOMS }}项</span>
      </main>
    </div>

    <!-- Consultation Footer Actions -->
    <div v-if="currentView === 'consultation'" class="consultation-footer">
      <button
          class="footer-submit-btn"
          :disabled="isGenerating"
          :aria-busy="isGenerating"
          @click="handleEndConsultation"
      >
        <Icon v-if="isGenerating" icon="lucide:loader-2" class="animate-spin" size="14" aria-hidden="true" />
        <span>{{ isGenerating ? '生成中...' : '生成病历' }}</span>
      </button>
      <button class="footer-cancel-btn" @click="$emit('close')">取消</button>
    </div>

    <!-- Medical Record View -->
    <div v-else-if="currentView === 'record'" class="medical-record-page">
      <SymptomConsultationResultPage
        :initial-patient-data="props.initialPatientData"
        :generated-record="generatedRecord"
        :diagnoses="aiDiagnoses"
        :selected-diagnosis="selectedDiagnosis"
        :medicines="treatmentRecommendations"
        :examinations="examRecommendations"
        :lab-tests="labTestRecommendations"
        :procedures="procedureRecommendations"
        @cancel="currentView = 'consultation'"
        @close="$emit('close')"
      />
    </div>

    <!-- Final Report View -->
    <div v-else-if="currentView === 'final_report'" class="final-report-page">

       <div class="report-paper">
         <h1 class="hospital-title">{{ consultationMode === 'tcm' ? '中医门诊病历' : '门诊病历' }}</h1>
         <div class="report-header">
           <div class="info-row">
              <span>姓名：{{ patientPromptProfile.patientName }}</span>
              <span>性别：{{ patientPromptProfile.gender }}</span>
              <span>年龄：{{ patientPromptProfile.age }}</span>
           </div>
           <div class="info-row">
             <span>科室：{{ consultationMode === 'tcm' ? '中医科' : '全科医学科' }}</span>
             <span>就诊日期：{{ finalRecord?.date }}</span>
             <span>病历号：{{ patientInfo.idCard }}</span>
           </div>
         </div>

         <div class="report-section">
           <div class="section-title">主诉</div>
           <div class="section-content">{{ finalRecord?.record?.chiefComplaint }}</div>
         </div>

         <div class="report-section">
           <div class="section-title">现病史</div>
           <div class="section-content" style="white-space: pre-line;">{{ finalRecord?.record?.historyOfPresentIllness }}</div>
         </div>

         <div class="report-section">
           <div class="section-title">既往史</div>
           <div class="section-content">{{ finalRecord?.record?.pastMedicalHistory }}</div>
         </div>

         <div class="report-section">
           <div class="section-title">过敏史</div>
           <div class="section-content">{{ finalRecord?.record?.allergyHistory }}</div>
         </div>

         <!-- TCM Four Examinations (if in TCM mode) -->
         <div v-if="consultationMode === 'tcm' && finalRecord?.record?.tcmFourExaminations" class="report-section">
           <div class="section-title">中医四诊</div>
           <div class="section-content" style="white-space: pre-line;">{{ finalRecord?.record?.tcmFourExaminations }}</div>
         </div>

         <!-- Physical Examination (Western mode only) -->
         <div v-if="consultationMode !== 'tcm'" class="report-section">
           <div class="section-title">体格检查</div>
           <div class="section-content">T: 36.5℃, P: 78次/分, R: 18次/分, BP: 120/80mmHg。神志清，精神可，心肺听诊无明显异常，腹软无压痛。</div>
         </div>

         <!-- TCM Diagnosis Format -->
         <div v-if="consultationMode === 'tcm'" class="report-section">
           <div class="section-title">诊断</div>
           <div class="section-content">
             <div class="diagnosis-item">
               <div class="tcm-diagnosis-primary">
                 <strong>中医诊断：</strong>{{ finalRecord?.diagnosis?.name }}
                 <span v-if="finalRecord?.diagnosis?.code" class="diagnosis-code">（{{ finalRecord?.diagnosis?.code }}）</span>
               </div>
               <div v-if="finalRecord?.diagnosis?.syndrome" class="tcm-syndrome-line">
                 <strong>辨证：</strong>{{ finalRecord?.diagnosis?.syndrome }}
                 <span v-if="finalRecord?.diagnosis?.syndromeCode" class="diagnosis-code">（{{ finalRecord?.diagnosis?.syndromeCode }}）</span>
               </div>
             </div>
           </div>
         </div>

         <!-- Western Diagnosis Format -->
         <div v-else class="report-section">
           <div class="section-title">初步诊断</div>
           <div class="section-content">
             {{ finalRecord?.diagnosis?.name }}
             <span v-if="finalRecord?.diagnosis?.code" class="diagnosis-code">（{{ finalRecord?.diagnosis?.code }}）</span>
           </div>
         </div>

         <!-- TCM Treatment Principle -->
         <div v-if="consultationMode === 'tcm' && finalRecord?.treatmentPrinciple" class="report-section">
           <div class="section-title">治则治法</div>
           <div class="section-content">{{ finalRecord?.treatmentPrinciple }}</div>
         </div>

         <div class="report-section">
           <div class="section-title">{{ consultationMode === 'tcm' ? '处方' : '处理意见' }}</div>
           <div class="section-content">
             <div v-for="(tx, idx) in finalRecord?.treatments" :key="idx" class="tx-item">
               <div class="tx-header">
                 {{ idx + 1 }}. {{ tx.name }} {{ tx.matchedItem?.spec ? `(${tx.matchedItem.spec})` : '' }}
               </div>
               <div class="tx-usage" v-if="tx.ingredients">
                 <strong>组成：</strong>{{ tx.ingredients }}
               </div>
               <div class="tx-usage" v-if="tx.usage">
                 <strong>用法用量：</strong>{{ tx.usage }}
               </div>
               <div class="tx-reason" v-if="tx.reason">
                 <strong>说明：</strong>{{ tx.reason }}
               </div>
            </div>
           </div>
         </div>

         <div v-if="finalRecord?.medicalAdvice" class="report-section">
           <div class="section-title">医嘱</div>
           <div class="section-content" style="white-space: pre-line;">{{ finalRecord?.medicalAdvice }}</div>
         </div>

         <div class="report-footer">
            <div class="footer-row">
              <span>医师签名：______________</span>
              <span>日期：{{ finalRecord?.date }}</span>
            </div>
         </div>
       </div>
    </div>

    <!-- Fact Check Notification -->
    <FactCheckNotification
      v-model="showFactCheckNotification"
      :result="factCheckResult"
      @confirm="showFactCheckNotification = false"
      @view-details="showFactCheckNotification = false"
    />

    <!-- Fact Check Widget (Right Bottom Corner) -->
    <FactCheckWidget
      :visible="showFactCheckWidget"
      :status="factCheckWidgetStatus"
      :issues="factCheckWidgetIssues"
      :progress="factCheckProgress"
      :checked-count="factCheckCheckedCount"
      :total-count="factCheckTotalCount"
      @close="showFactCheckWidget = false"
      @view-all="showFactCheckWidget = false"
      @issue-click="(issue) => console.log('Issue clicked:', issue)"
    />

    <!-- Knowledge Panel Toggle Button -->
    <button
      v-if="hasKnowledgeResults || knowledgeLoading"
      class="knowledge-toggle-btn"
      :class="{ loading: knowledgeLoading, active: showKnowledgePanel }"
      @click="toggleKnowledgePanel"
      :title="knowledgeLoading ? '正在搜索相关文献...' : '查看相关医学文献'"
    >
      <span v-if="knowledgeLoading" class="spinner-small"></span>
      <span v-else class="knowledge-icon">📚</span>
      <span v-if="!knowledgeLoading && hasKnowledgeResults" class="knowledge-badge">!</span>
    </button>

    <!-- Knowledge Panel -->
    <KnowledgePanel
      v-model:visible="showKnowledgePanel"
      :loading="knowledgeLoading"
      :results="knowledgeResults"
      :search-keyword="knowledgeSearchKeyword"
      :search-type="knowledgeSearchType"
      @close="showKnowledgePanel = false"
    />

    <!-- Anti-Misdiagnosis Checklist Modal -->
    <Transition name="fade">
      <div v-if="showChecklistModal" class="modal-overlay" @click.self="showChecklistModal = false">
        <div class="modal checklist-modal">
          <div class="modal-header">
            <h3>鉴别排查确认</h3>
            <button class="close-btn" @click="showChecklistModal = false">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="checklist-intro">
              针对诊断 <strong>{{ activeChecklistDiagnosis?.name }}</strong>，为防止与高危急症混淆或漏诊，系统建议您在进一步诊断前确认以下指征：
            </div>
            
            <div class="checklist-items">
              <label v-for="(item, index) in checklistItems" :key="index" class="checklist-item-label">
<!--                <input type="checkbox" v-model="item.checked" />-->
                <span class="checklist-text">{{ item.question }}</span>
              </label>
            </div>

<!--            <div class="checklist-notes-box">-->
<!--              <label>补充说明（如异常发现、查体记录等）</label>-->
<!--              <textarea v-model="checklistNotes" placeholder="填写相关补充信息..."></textarea>-->
<!--            </div>-->
          </div>
<!--          <div class="modal-footer">-->
<!--            <button class="btn secondary" @click="showChecklistModal = false">暂不确认 (跳过)</button>-->
<!--            <button class="btn primary" @click="handleChecklistConfirm" :disabled="!checklistItems.some(i => i.checked) && !checklistNotes">-->
<!--              确认并记录-->
<!--            </button>-->
<!--          </div>-->
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, watch, onUnmounted, inject, nextTick } from 'vue';
import symptomAssociations from '../assets/symptom-associations.json';
import { medicalDataService, type DiagnosisItem, type Icd10CategoryInfo, type MedicineItem, type MedicalItem } from '../services/medicalData';
import Pinyin from 'tiny-pinyin';
import { chat } from '../services/llm';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { feedbackService } from '../services/feedback';
import { getHisAdapter } from '../services/his';
import { trackViewChange, trackClick, trackError, trackFormSubmit, trackRecommendationAction } from '../services/operationTracker';
import BodyPartSelector from './BodyPartSelector.vue';
import SystemCategorySelector from './SystemCategorySelector.vue';
import { PROMPTS, DynamicSymptomTemplatePrompt } from '../prompts';
import Icon from './Icon.vue';
import FactCheckNotification from './FactCheckNotification.vue';
import FactCheckHighlight from './FactCheckHighlight.vue';
import DiagnosisRecommendationCard from './DiagnosisRecommendationCard.vue';
import SymptomConsultationResultPage from './SymptomConsultationResultPage.vue';
import TreatmentRecommendationCard from './TreatmentRecommendationCard.vue';
import TreatmentItemEditor from './TreatmentItemEditor.vue';
import ManualMatchPicker, { type ManualMatchCandidate } from './ManualMatchPicker.vue';
import RecAttributeChip, { type AttrOption } from './RecAttributeChip.vue';
import FactCheckWidget from './FactCheckWidget.vue';
import KnowledgePanel from './KnowledgePanel.vue';
import PatientHeader from './PatientHeader.vue';
import { resolvePatientAvatar } from '../utils/patientAvatar';
import {
  checkDiagnosis,
  checkExamination,
  checkMedicine,
  checkTCMDiagnosis,
  checkTCMMedicine,
  isReviewerEnabled,
  type FactCheckIssue,
  type FactCheckResult,
} from '../services/factChecker';
import { isFieldApplicable, generateTextsForSymptom } from '../services/textGeneration';
import { pmphaiService, isPMPHAIConfigured, type BatchSearchResults } from '../services/pmphai';
import { CONSULTATION_CONFIG, isSymptomSelectionFull } from '../constants/consultationConfig';
import { getTCMTemplates, getWesternTemplates, syncRemoteTemplates } from '../services/templateService';
import {
  buildConsultationSelectionSnapshot,
  buildConsultationUserLogSnapshot,
  submitConsultationUserLog,
} from '../services/consultationUserLog';
/* WINDOW_SIZES / diagnosisPath imports removed - feature commented out */
import type {
  ConsultationAssistAction,
} from '../types/consultationAssist';
import type { AppPatient } from '../types/appState';
import {
  getPatientContextAgeText,
  getPatientContextAnchorId as resolvePatientContextAnchorId,
  getPatientContextGenderCode,
  getPatientContextGenderText,
  getPatientContextName,
  toConsultationPatient,
} from '../utils/patientContext';

const showToast = inject('showToast') as (msg: string, type: 'success' | 'error' | 'info') => void;

const props = defineProps<{
  initialPatientData?: AppPatient;
  assistTrigger?: {
    kind: ConsultationAssistAction;
    token: number;
  } | null;
}>();

const emit = defineEmits(['close', 'consume-auto-trigger']);

// --- Interfaces & State Definitions ---
import type { Diagnosis, Patient, TreatmentRecommendation, FinalRecord } from '../types/consultation';
import {
  buildDiagList as buildSharedDiagList,
  buildOrderListItem as buildSharedOrderListItem,
  buildRecordConfirmedPayload,
  getMatchedItemRaw,
  readFirstString,
  type OrderItemResolvers,
} from '../utils/recordConfirmedPayload';
import { useMedicalDictionaries } from '../composables/useMedicalDictionaries';
import { useTreatmentNormalization } from '../composables/useTreatmentNormalization';
import { useTreatmentGates } from '../composables/useTreatmentGates';
import { useTreatmentHydration } from '../composables/useTreatmentHydration';
import { useVoiceFeedback } from '../composables/useVoiceFeedback';
import {
  getVoiceDiagnosisFeedbackKey,
  getVoiceTreatmentFeedbackKey,
  mapTreatmentTypeToRecommendationType,
  mapTreatmentTypeToTargetType,
} from '../services/voiceFeedback';
import type { VoiceRecommendationFeedbackDraft } from '../types/voiceFeedback';
type AssistAction = ConsultationAssistAction;
type ReferenceAction = 'diagnosis' | 'medication' | 'examination' | 'lab_test' | 'procedure' | 'batch';
type ReferenceLifecycleStatus = 'pending' | 'success' | 'failed';

interface ReferenceItemPayload {
  name: string;
  code?: string;
  type: 'diagnosis' | 'medication' | 'examination' | 'lab_test' | 'procedure';
  isTCM?: boolean;
  idCli?: string;
}

interface ReferenceFeedbackPayload {
  consultationId?: string;
  requestId: string;
  referenceType?: ReferenceAction;
  action: ReferenceAction;
  status: ReferenceLifecycleStatus;
  message?: string;
  items?: ReferenceItemPayload[];
  timestamp?: number;
}

interface ReferenceStatusEntry {
  status: ReferenceLifecycleStatus;
  requestId: string;
  message?: string;
  updatedAt: number;
}

// Patient info: empty defaults; real data flows in via `initialPatientData` watch.
// 不再预填演示数据，避免在真实就诊场景中显示其他患者的字段（如身份证、电话、民族、婚姻）。
const patientInfo = ref<Patient>({
  "idTet": "",
  "idPi": "",
  "idMpi": "",
  "cdPi": "",
  "naPi": "",
  "sdSex": "",
  "birthday": "",
  "idCard": "",
  "mobilePhone": "",
  "sdNation": "",
  "sdNaty": "",
  "sdBlood": "",
  "sdRhBlood": "",
  "sdMarital": "",
  "sdCard": "",
  "ageNum": 0,
  "ageUnit": "",
  "ageText": "",
  "sdNationText": "",
  "sdNatyText": "",
  "sdMaritalText": "",
  "sdSexText": "",
  "sdBloodText": "",
  "fgActiveText": "",
  "sdRhBloodText": "",
  "sdCardText": "",
  "allergyHistory": ""
});

const avatarSrc = computed(() => {
  const info = patientInfo.value;
  return resolvePatientAvatar({
    gender: getPatientContextGenderCode(info as any),
    sdSexText: getPatientContextGenderText(info as any),
    age: (info as any).ageNum,
    ageUnit: (info as any).ageUnit,
    ageText: getPatientContextAgeText(info as any),
  });
});

// 患者性别（用于 BodyPartSelector）
const patientGender = computed<'male' | 'female'>(() => {
  const genderCode = getPatientContextGenderCode(patientInfo.value as any);
  const genderText = getPatientContextGenderText(patientInfo.value as any);
  const isMale = genderCode === 'M' || genderCode === '1' || genderText === '男性' || genderText === '男';
  return isMale ? 'male' : 'female';
});

const symptoms = shallowRef<any[]>([]);
const selectedSymptoms = ref<any[]>([]);
const formData = ref<Record<string, any>>({});
const searchQuery = ref('');
const isGeneratingSymptom = ref(false);
const selectedCategories = ref<string[]>([]);
const isCategoryDropdownOpen = ref(false);
const categoryFilterRef = ref<HTMLElement | null>(null);
const medRecordDetails = ref<string[]>([]);

// Selection mode for sidebar tabs
const selectionMode = ref<'common' | 'bodyPart' | 'system'>('common');
const consultationMode = ref<'western' | 'tcm'>('western');

// 伴随症状：仅勾选标记，不展开详细问诊表单
const companionSymptoms = ref<Set<string>>(new Set());

const toggleCompanionSymptom = (symptomKey: string) => {
  const newSet = new Set(companionSymptoms.value);
  if (newSet.has(symptomKey)) {
    newSet.delete(symptomKey);
  } else {
    newSet.add(symptomKey);
  }
  companionSymptoms.value = newSet;
};

const isCompanionSelected = (symptomKey: string) => {
  return companionSymptoms.value.has(symptomKey);
};

// 获取所有伴随症状名称列表（用于病历生成）
const companionSymptomNames = computed(() => {
  return Array.from(companionSymptoms.value)
    .map(key => {
      const s = symptoms.value.find((item: any) => item.key === key);
      return s ? s.name : key;
    });
});

// 伴随症状推荐：per-symptom recommendations
const getSymptomRecommendations = (symptomKey: string) => {
  const associations = symptomAssociations as Record<string, string[]>;
  const related = associations[symptomKey];
  if (!related) return [];
  
  const selectedKeys = new Set(selectedSymptoms.value.map((s: any) => s.key));
  const allTemplates = symptoms.value;
  
  return related
    .filter(key => !selectedKeys.has(key))
    .slice(0, 10)
    .map(key => allTemplates.find((s: any) => s.key === key))
    .filter(Boolean);
};

// 根据问诊模式动态获取模板数据
const currentTemplatesData = computed(() => {
  if (consultationMode.value === 'tcm') {
    return getTCMTemplates();
  }
  return getWesternTemplates();
});

// All symptoms for body part and system selectors
const allSymptoms = computed(() => symptoms.value);
const currentView = ref<'consultation' | 'record' | 'final_report'>('consultation');
const generatedRecord = ref({ chiefComplaint: '', historyOfPresentIllness: '', tcmFourExaminations: '' });
const activePatientAnchorId = ref('');
const assistFocus = ref<AssistAction | null>(null);
const activeReferenceRequest = ref<ReferenceFeedbackPayload | null>(null);
const lastReferenceFeedback = ref<ReferenceFeedbackPayload | null>(null);
const referenceStatusMap = ref<Record<string, ReferenceStatusEntry>>({});
const isWritingRecord = ref(false);
let unlistenReferenceFeedback: (() => void) | null = null;

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

const uniqueCategories = computed(() => {
  return Object.keys(systemCategories).map(key => ({
    key,
    label: systemCategories[key] || key
  }));
});

const aiLoading = ref(false);
const aiError = ref<string | null>(null);
const aiDiagnoses = ref<Diagnosis[]>([]);
const selectedDiagnosis = ref<Diagnosis | null>(null);
const relatedDiagnoses = ref<DiagnosisItem[]>([]);
const isRelatedOpen = ref(false);
const collapsedDiagnosisGroups = ref<Record<string, boolean>>({});

const treatmentLoading = ref(false);
const treatmentError = ref<string | null>(null);
const treatmentRecommendations = ref<TreatmentRecommendation[]>([]);

// 手动匹配候选弹窗状态（药品/检查/检验/处置 共用）
const activeReasonTooltipKey = ref<string | null>(null);
const activeFeedbackPopoverKey = ref<string | null>(null);
const activeManualMatchKey = ref<string | null>(null);
const manualMatchKeywords = ref<Record<string, string>>({});

// 检查推荐（影像/器械）
const examRecommendations = ref<TreatmentRecommendation[]>([]);
const examLoading = ref(false);
const examError = ref<string | null>(null);

// 检验推荐（实验室）
const labTestRecommendations = ref<TreatmentRecommendation[]>([]);
const labTestLoading = ref(false);
const labTestError = ref<string | null>(null);

// 处置推荐
const procedureRecommendations = ref<TreatmentRecommendation[]>([]);
const procedureLoading = ref(false);
const procedureError = ref<string | null>(null);

// HIS 字典 + 治疗项归一化（与语音问诊共用同一份基础设施）
// 症状侧现已接入“发药药房 / 执行科室”门禁：未设置不允许勾选，不允许参与回写。
const {
  frequencyOptions: hisFrequencyOptions,
  routeOptions: hisRouteOptions,
  pharmacyOptions: hisPharmacyOptions,
  execDeptOptions: hisExecDeptOptions,
  loadAllDictionaries: loadAllHisDictionaries,
} = useMedicalDictionaries();
const treatmentGates = useTreatmentGates({
  pharmacyOptions: hisPharmacyOptions,
  execDeptOptions: hisExecDeptOptions,
});
const treatmentNormalization = useTreatmentNormalization({
  frequencyOptions: hisFrequencyOptions,
  routeOptions: hisRouteOptions,
  ensurePharmacy: treatmentGates.ensurePharmacy,
  isExecDeptSatisfied: treatmentGates.isExecDeptSatisfied,
});
const treatmentHydration = useTreatmentHydration({
  pharmacyOptions: hisPharmacyOptions,
  getCandidatePharmaciesForMedicine: treatmentGates.pharmacyCandidatesFor,
  findFrequencyOptionByValue: treatmentNormalization.findFrequencyOptionByValue,
  findRouteOptionByValue: treatmentNormalization.findRouteOptionByValue,
  notify: (message, level) => showToast(message, level || 'info'),
});
function normalizeTreatmentRecommendation(rec: Partial<TreatmentRecommendation>): TreatmentRecommendation {
  return treatmentNormalization.normalize(rec);
}

function buildMedicineMatchedItem(item: MedicineItem): TreatmentRecommendation['matchedItem'] {
  return {
    id: item.id,
    name: item.name,
    spec: item.spec,
    storeIds: Array.isArray(item.storeIds)
      ? Array.from(new Set(item.storeIds.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)))
      : [],
    idSrv: item.idSrv,
    naSrv: item.naSrv,
    sdSrv: item.sdSrv,
    idDeptExec: item.idDeptExec,
    fgCheckOrd: item.fgCheckOrd,
    fgSkintest: item.fgSkintest,
    raw: item.raw,
  };
}

function buildMedicalItemMatchedItem(item: MedicalItem): TreatmentRecommendation['matchedItem'] {
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    idSrv: item.idSrv,
    naSrv: item.naSrv,
    sdSrv: item.sdSrv,
    idDeptExec: item.idDeptExec,
    idPart: item.idPart,
    jsonField: item.jsonField,
    fgCheckOrd: item.fgCheckOrd,
    raw: item.raw,
  };
}

function assessTreatmentCatalogMatch(
  type: TreatmentRecommendation['type'],
  name: string,
  aliases?: string[],
  spec?: string,
): Pick<TreatmentRecommendation, 'matchedItem' | 'suggestedMatchItem' | 'matchStatus'> {
  switch (type) {
    case 'medicine': {
      const result = medicalDataService.assessMedicineMatch(name, aliases, spec);
      return {
        matchedItem: result.status === 'exact' && result.candidate ? buildMedicineMatchedItem(result.candidate) : undefined,
        suggestedMatchItem: result.status === 'probable' && result.candidate ? buildMedicineMatchedItem(result.candidate) : undefined,
        matchStatus: result.status,
      };
    }
    case 'exam': {
      const result = medicalDataService.assessExamItemMatch(name, aliases);
      return {
        matchedItem: result.status === 'exact' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        suggestedMatchItem: result.status === 'probable' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        matchStatus: result.status,
      };
    }
    case 'lab_test': {
      const result = medicalDataService.assessLabTestItemMatch(name, aliases);
      return {
        matchedItem: result.status === 'exact' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        suggestedMatchItem: result.status === 'probable' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        matchStatus: result.status,
      };
    }
    case 'procedure': {
      const result = medicalDataService.assessProcedureItemMatch(name, aliases);
      return {
        matchedItem: result.status === 'exact' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        suggestedMatchItem: result.status === 'probable' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        matchStatus: result.status,
      };
    }
    default:
      return {
        matchedItem: undefined,
        suggestedMatchItem: undefined,
        matchStatus: 'unmatched',
      };
  }
}

function hasProbableMatch(rec: TreatmentRecommendation): boolean {
  return rec.matchStatus === 'probable' && !!rec.suggestedMatchItem;
}

function getSuggestedMatchName(rec: TreatmentRecommendation): string {
  return (rec.suggestedMatchItem?.name || '').trim();
}

function getTreatmentMatchLabel(rec: TreatmentRecommendation): string {
  if (rec.matchStatus === 'manual') return '已匹配';
  if (rec.matchStatus === 'confirmed') return '已匹配';
  if (rec.matchStatus === 'exact') return '已匹配';
  if (rec.matchStatus === 'probable') return '待确认';
  if (rec.matchedItem) return '已匹配';
  return '未匹配';
}

function getTreatmentOriginalName(rec: TreatmentRecommendation): string {
  if (rec.matchStatus !== 'manual' && rec.matchStatus !== 'confirmed') {
    return '';
  }

  const originalName = (rec.originalName || '').trim();
  if (!originalName || originalName === rec.name) {
    return '';
  }

  return originalName;
}

function confirmSuggestedMatch(rec: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  if (!rec.suggestedMatchItem) {
    return;
  }

  rec.originalName = rec.originalName || rec.name;
  rec.matchedItem = { ...rec.suggestedMatchItem };
  rec.name = rec.suggestedMatchItem.name || rec.name;
  rec.matchStatus = 'confirmed';
  rec.manualMatched = false;
  rec.selected = false;
  rec.suggestedMatchItem = undefined;
  Object.assign(rec, normalizeTreatmentRecommendation(rec));
  showToast(`${rec.name} 已确认标准库匹配`, 'success');
}

function getAllRecommendationItems(): TreatmentRecommendation[] {
  return [
    ...treatmentRecommendations.value,
    ...examRecommendations.value,
    ...labTestRecommendations.value,
    ...procedureRecommendations.value,
  ];
}

async function syncTreatmentPharmacyScope(): Promise<void> {
  const his = getHisAdapter();
  if (!his) {
    medicalDataService.setActivePharmacyStoreIds(null);
    return;
  }

  const activeStoreIds = hisPharmacyOptions.value
    .map((option) => (option.idSto || '').trim())
    .filter((value): value is string => Boolean(value));

  if (activeStoreIds.length === 0) {
    medicalDataService.setActivePharmacyStoreIds(null);
    return;
  }

  try {
    await medicalDataService.ensureMedicineCatalogForStoreIds(activeStoreIds, his);
  } catch (error) {
    console.error('[ConsultationPage] ensureMedicineCatalogForStoreIds failed', error);
  }
}

function syncTreatmentExecDeptSelections(): void {
  if (hisExecDeptOptions.value.length === 0) {
    return;
  }

  const keyByText = new Map(hisExecDeptOptions.value.map((option) => [option.text, option.key]));
  getAllRecommendationItems().forEach((rec) => {
    if (rec.type === 'medicine') {
      return;
    }

    const currentValue = (rec.execDept || '').trim();
    if (!currentValue) {
      return;
    }

    if (hisExecDeptOptions.value.some((option) => option.key === currentValue)) {
      return;
    }

    const normalized = keyByText.get(currentValue);
    if (normalized) {
      rec.execDept = normalized;
    }
  });
}

async function ensureTreatmentDictionaryStateReady(): Promise<void> {
  await loadAllHisDictionaries();
  await syncTreatmentPharmacyScope();
  syncTreatmentExecDeptSelections();
}

const finalRecord = ref<FinalRecord | null>(null);
const hasRecordDraft = computed(
  () =>
    generatedRecord.value.chiefComplaint.trim() !== '' &&
    generatedRecord.value.historyOfPresentIllness.trim() !== ''
);
// 当前聚焦的 assistFocus 过滤：各路独立
const visibleTreatmentRecommendations = computed(() => {
  const focus = assistFocus.value;
  if (focus === 'medication') return treatmentRecommendations.value;
  if (focus === 'examination') return examRecommendations.value;
  if (focus === 'lab_test') return labTestRecommendations.value;
  if (focus === 'procedure') return procedureRecommendations.value;
  // 未聚焦时合并所有
  return [
    ...treatmentRecommendations.value,
    ...examRecommendations.value,
    ...labTestRecommendations.value,
    ...procedureRecommendations.value,
  ];
});
const visibleOtherTreatmentRecommendations = computed(() =>
  visibleTreatmentRecommendations.value.filter(
    (item) => item.type !== 'medicine' && item.type !== 'exam' && item.type !== 'lab_test' && item.type !== 'procedure'
  )
);
const anyRecommendationLoading = computed(
  () => treatmentLoading.value || examLoading.value || labTestLoading.value || procedureLoading.value
);
const showDiagnosisCard = computed(
  () => currentView.value === 'record' && assistFocus.value !== 'medication' && assistFocus.value !== 'examination' && assistFocus.value !== 'lab_test' && assistFocus.value !== 'procedure'
);
const showTreatmentCard = computed(
  () => currentView.value === 'record' && assistFocus.value !== 'differential'
);
const hasPendingReferenceRequest = computed(
  () => activeReferenceRequest.value?.status === 'pending'
);
const currentDiagnosisSummary = computed(
  () =>
    selectedDiagnosis.value?.name ||
    readPatientText(patientInfo.value as unknown as Record<string, unknown>, ['diagnosis']) ||
    ''
);
const assistFocusLabel = computed(() => {
  switch (assistFocus.value) {
    case 'record':
      return '病历快进';
    case 'diagnosis':
      return '诊断快进';
    case 'medication':
      return '用药快进';
    case 'examination':
      return '检查快进';
    case 'lab_test':
      return '检验快进';
    case 'procedure':
      return '处置快进';
    case 'differential':
      return '鉴别排查';
    case 'reminder':
      return '风险提醒';
    default:
      return '';
  }
});
const workflowBannerTone = computed<'info' | 'success' | 'error'>(() => {
  if (activeReferenceRequest.value?.status === 'pending') {
    return 'info';
  }
  if (lastReferenceFeedback.value?.status === 'success') {
    return 'success';
  }
  if (lastReferenceFeedback.value?.status === 'failed') {
    return 'error';
  }
  return 'info';
});
const workflowBannerText = computed(() => {
  if (activeReferenceRequest.value?.status === 'pending') {
    return activeReferenceRequest.value.message || '已发起引用请求，等待 PHIS 保存并回执。';
  }
  if (lastReferenceFeedback.value) {
    return lastReferenceFeedback.value.message ||
      (lastReferenceFeedback.value.status === 'success'
        ? 'PHIS 已完成引用保存。'
        : 'PHIS 引用保存失败。');
  }

  switch (assistFocus.value) {
    case 'record':
      return '检测到 HIS 已有主诉与现病史，已直接进入病历详情页。';
    case 'diagnosis':
      return '请确认诊断；点击“确认诊断”只记录日志，点击“引用诊断”才会写回 PHIS。';
    case 'medication':
      return '请勾选要引用的用药方案，发起引用后会等待 PHIS 回执。';
    case 'examination':
      return '请勾选要引用的检查项目，发起引用后会等待 PHIS 回执。';
    case 'lab_test':
      return '请勾选要引用的检验项目，发起引用后会等待 PHIS 回执。';
    case 'procedure':
      return '请勾选要引用的处置项目，发起引用后会等待 PHIS 回执。';
    case 'differential':
      return '鉴别排查的确认结果只记录日志，不会改写现病史。';
    case 'reminder':
      return '风险提醒已同步，可结合当前病历继续处理。';
    default:
      return '';
  }
});
const workflowBannerStyle = computed(() => {
  const palette =
    workflowBannerTone.value === 'success'
      ? {
          background: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.28)',
          color: '#166534',
        }
      : workflowBannerTone.value === 'error'
        ? {
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.28)',
            color: '#991b1b',
          }
        : {
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.22)',
            color: '#1d4ed8',
          };

  return {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 14px',
    marginBottom: '14px',
    borderRadius: '12px',
    fontSize: '13px',
    lineHeight: '1.5',
    ...palette,
  };
});

type DiagnosisDisplayGroup = {
  key: string;
  title: string;
  rangeLabel?: string;
  diagnoses: Diagnosis[];
  order: number;
  showHeader: boolean;
};
/* DiagnosisPathWindowPhase type removed - feature commented out */

/* DIAGNOSIS_PATH timeouts removed - feature commented out */

const buildDiagnosisGroupKey = (category: Icd10CategoryInfo | null) => {
  return category ? `icd10-${category.key}` : 'icd10-unknown';
};

const diagnosisGroups = computed<DiagnosisDisplayGroup[]>(() => {
  if (aiDiagnoses.value.length === 0) {
    return [];
  }

  if (consultationMode.value === 'tcm') {
    return [
      {
        key: 'tcm',
        title: '中医辨证',
        diagnoses: aiDiagnoses.value,
        order: 0,
        showHeader: false
      }
    ];
  }

  const groupMap = new Map<string, DiagnosisDisplayGroup>();

  aiDiagnoses.value.forEach((diagnosis) => {
    const category = medicalDataService.getIcd10CategoryInfo(diagnosis.code);
    const groupKey = buildDiagnosisGroupKey(category);

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        key: groupKey,
        title: category?.title || '未分类/待确认',
        rangeLabel: category?.range,
        diagnoses: [],
        order: category?.order ?? Number.MAX_SAFE_INTEGER,
        showHeader: true
      });
    }

    groupMap.get(groupKey)?.diagnoses.push(diagnosis);
  });

  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.title.localeCompare(b.title, 'zh-CN');
  });
});

const isDiagnosisGroupCollapsed = (groupKey: string) => {
  return collapsedDiagnosisGroups.value[groupKey] ?? false;
};

const toggleDiagnosisGroup = (groupKey: string) => {
  collapsedDiagnosisGroups.value[groupKey] = !isDiagnosisGroupCollapsed(groupKey);
};

/* emitDiagnosisPathStatus / diagnosisPathOptions removed - feature commented out */
const getPatientAnchorId = (patient?: {
  idPi?: string | number;
  patientId?: string | number;
  id?: string | number;
} | null) => resolvePatientContextAnchorId(patient as any);

const readPatientText = (
  source: Record<string, unknown> | null | undefined,
  keys: string[]
): string => {
  if (!source) {
    return '';
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }

  return '';
};

const resolveConsultationId = (): string =>
  getPatientAnchorId(finalRecord.value?.patient || patientInfo.value) || 'unknown';

const resolvePastMedicalHistory = (): string =>
  readPatientText(finalRecord.value?.record as unknown as Record<string, unknown>, ['pastMedicalHistory']) ||
  readPatientText(
    patientInfo.value as unknown as Record<string, unknown>,
    ['pastMedicalHistory', 'past_medical_history', 'pastMedicalHistoryText']
  ) ||
  '未提供既往病史。';

const patientPromptProfile = computed(() => ({
  patientName: getPatientContextName(patientInfo.value as any) || '',
  gender: getPatientContextGenderText(patientInfo.value as any) || '',
  age: getPatientContextAgeText(patientInfo.value as any) || '',
}));

const {
  recommendationSubmittingKey,
  recommendationSubmittedMap,
  ensureRecommendationDraft,
  updateRecommendationDraft,
  submitRecommendationFeedback,
  registerExternalRecommendationTarget,
} = useVoiceFeedback({
  consultationId: computed(() => resolveConsultationId()),
  patientId: computed(() => getPatientAnchorId(patientInfo.value)),
  patientName: computed(() => patientPromptProfile.value.patientName),
  chiefComplaint: computed(() => generatedRecord.value.chiefComplaint || ''),
  historyOfPresentIllness: computed(() => generatedRecord.value.historyOfPresentIllness || ''),
  pastMedicalHistory: computed(() => resolvePastMedicalHistory()),
});

const buildReferenceKey = (
  action: ReferenceAction,
  item: { name: string; code?: string }
): string => `${action}:${item.code || item.name}`;

const setReferenceStatuses = (
  action: ReferenceAction,
  items: ReferenceItemPayload[],
  entry: ReferenceStatusEntry
): void => {
  const nextMap = { ...referenceStatusMap.value };
  items.forEach((item) => {
    nextMap[buildReferenceKey(action, item)] = entry;
  });
  referenceStatusMap.value = nextMap;
};

const buildCurrentSummary = (
  chiefComplaint: string,
  historyOfPresentIllness: string,
  diagnoses: Array<{ name: string }>
): string => {
  const lines = [
    chiefComplaint ? `主诉：${chiefComplaint}` : '',
    historyOfPresentIllness ? `现病史：${historyOfPresentIllness}` : '',
    diagnoses.length ? `诊断：${diagnoses.map((item) => item.name).join('；')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
};

const buildCurrentDiagnosisList = (): Array<{ name: string; code?: string; isTCM?: boolean }> => {
  if (selectedDiagnosis.value) {
    return [
      {
        name: selectedDiagnosis.value.name,
        code: selectedDiagnosis.value.code,
        isTCM: selectedDiagnosis.value.isTCM,
      },
    ];
  }

  const diagnosisName = readPatientText(
    patientInfo.value as unknown as Record<string, unknown>,
    ['diagnosis']
  );
  return diagnosisName ? [{ name: diagnosisName }] : [];
};

const buildCurrentMedicalPayload = (
  extra: Record<string, unknown> = {},
  options: {
    includeDiagnosis?: boolean;
    includeTreatments?: boolean;
    includedTreatmentTypes?: Array<'medicine' | 'exam' | 'lab_test' | 'procedure'>;
  } = {}
) => {
  const includeDiagnosis = options.includeDiagnosis ?? true;
  const includeTreatments = options.includeTreatments ?? true;
  const includedTreatmentTypes = options.includedTreatmentTypes;
  const diagnosisList = includeDiagnosis ? buildCurrentDiagnosisList() : [];
  const medications = includeTreatments && (!includedTreatmentTypes || includedTreatmentTypes.includes('medicine'))
    ? treatmentRecommendations.value
        .filter((item) => item.selected)
        .map((item) => ({
          name: item.name,
          spec: item.matchedItem?.spec,
          usage: item.usage,
          idMedPro: item.matchedItem?.id,
        }))
    : [];
  const examinations = includeTreatments && (!includedTreatmentTypes || includedTreatmentTypes.includes('exam'))
    ? examRecommendations.value
        .filter((item) => item.selected)
        .map((item) => ({
          name: item.name,
          idCli: item.matchedItem?.id,
        }))
    : [];
  const labTests = includeTreatments && (!includedTreatmentTypes || includedTreatmentTypes.includes('lab_test'))
    ? labTestRecommendations.value
        .filter((item) => item.selected)
        .map((item) => ({
          name: item.name,
          idCli: item.matchedItem?.id,
        }))
    : [];
  const procedures = includeTreatments && (!includedTreatmentTypes || includedTreatmentTypes.includes('procedure'))
    ? procedureRecommendations.value
        .filter((item) => item.selected)
        .map((item) => ({
          name: item.name,
          idCli: item.matchedItem?.id,
        }))
    : [];

  const treatmentPlanParts = [
    medications.length ? `建议用药：${medications.map((item) => item.name).join('；')}` : '',
    examinations.length ? `建议检查：${examinations.map((item) => item.name).join('；')}` : '',
    labTests.length ? `建议检验：${labTests.map((item) => item.name).join('；')}` : '',
    procedures.length ? `建议处置：${procedures.map((item) => item.name).join('；')}` : '',
  ].filter(Boolean);

  return {
    consultationId: resolveConsultationId(),
    timestamp: Date.now(),
    resultType: 'draft',
    chiefComplaint: generatedRecord.value.chiefComplaint,
    historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness,
    pastMedicalHistory: resolvePastMedicalHistory(),
    diagnosisList,
    medications,
    examinations,
    labTests,
    procedures,
    treatmentPlan: treatmentPlanParts.length > 0
      ? treatmentPlanParts.join('；')
      : '建议结合医生站规则完成最终确认。',
    medicalSummary: buildCurrentSummary(
      generatedRecord.value.chiefComplaint,
      generatedRecord.value.historyOfPresentIllness,
      diagnosisList
    ),
    ...extra,
  };
};

const buildSmartUserLogSnapshot = () => buildConsultationUserLogSnapshot({
  chiefComplaint: generatedRecord.value.chiefComplaint,
  historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness,
  diagnoses: aiDiagnoses.value,
  selectedDiagnosis: selectedDiagnosis.value,
  medicines: treatmentRecommendations.value,
  examinations: examRecommendations.value,
  labTests: labTestRecommendations.value,
});

const submitSmartGeneratedUserLog = () => {
  void submitConsultationUserLog({
    consultationId: resolveConsultationId(),
    consultationType: 'smart',
    patient: patientInfo.value,
    firstSnapshot: buildSmartUserLogSnapshot(),
  });
};

const submitSmartFinalUserLog = () => {
  const finalSnapshot = buildSmartUserLogSnapshot();
  void submitConsultationUserLog({
    consultationId: resolveConsultationId(),
    consultationType: 'smart',
    patient: patientInfo.value,
    finalSnapshot,
    selectionSnapshot: buildConsultationSelectionSnapshot(finalSnapshot),
  });
};

const prefillGeneratedRecordFromPatient = (force = false): boolean => {
  const chiefComplaint = readPatientText(
    patientInfo.value as unknown as Record<string, unknown>,
    ['chiefComplaint', 'chief_complaint']
  );
  const historyOfPresentIllness = readPatientText(
    patientInfo.value as unknown as Record<string, unknown>,
    ['historyOfPresentIllness', 'history_of_present_illness']
  );

  if (!chiefComplaint || !historyOfPresentIllness) {
    return false;
  }

  if (force || !generatedRecord.value.chiefComplaint.trim()) {
    generatedRecord.value.chiefComplaint = chiefComplaint;
  }
  if (force || !generatedRecord.value.historyOfPresentIllness.trim()) {
    generatedRecord.value.historyOfPresentIllness = historyOfPresentIllness;
  }
  return true;
};

const prefillDiagnosisFromPatient = (force = false): boolean => {
  const diagnosisName = readPatientText(
    patientInfo.value as unknown as Record<string, unknown>,
    ['diagnosis']
  );
  if (!diagnosisName) {
    return false;
  }

  if (
    !force &&
    selectedDiagnosis.value &&
    selectedDiagnosis.value.name.trim() !== ''
  ) {
    return true;
  }

  selectedDiagnosis.value = {
    id: `phis-diagnosis-${resolveConsultationId()}`,
    code: '',
    name: diagnosisName,
    rate: 'PHIS 当前诊断',
    rationale: '来自 PHIS 当前诊断草稿',
  } as Diagnosis;
  return true;
};

const resetWorkflowState = () => {
  currentView.value = 'consultation';
  assistFocus.value = null;
  selectedSymptoms.value = [];
  formData.value = {};
  searchQuery.value = '';
  selectedCategories.value = [];
  isCategoryDropdownOpen.value = false;
  generatedRecord.value = { chiefComplaint: '', historyOfPresentIllness: '', tcmFourExaminations: '' };
  finalRecord.value = null;
  aiDiagnoses.value = [];
  selectedDiagnosis.value = null;
  relatedDiagnoses.value = [];
  treatmentRecommendations.value = [];
  examRecommendations.value = [];
  labTestRecommendations.value = [];
  procedureRecommendations.value = [];
  checklistItems.value = [];
  checklistNotes.value = '';
  showChecklistModal.value = false;
  activeChecklistDiagnosis.value = null;
  activeReferenceRequest.value = null;
  lastReferenceFeedback.value = null;
  referenceStatusMap.value = {};
  isWritingRecord.value = false;
  knowledgeLoading.value = false;
  hasKnowledgeResults.value = false;
  showKnowledgePanel.value = false;
};

const resetToConsultationView = () => {
  currentView.value = 'consultation';
};

defineExpose({
  resetToConsultationView,
});

/* canOpenDiagnosisPath / openDiagnosisPathWindow removed - template usage commented out */

watch(diagnosisGroups, (groups) => {
  const activeKeys = new Set(groups.map(group => group.key));
  const nextState: Record<string, boolean> = {};

  groups.forEach((group) => {
    nextState[group.key] = collapsedDiagnosisGroups.value[group.key] ?? false;
  });

  Object.keys(collapsedDiagnosisGroups.value).forEach((groupKey) => {
    if (!activeKeys.has(groupKey)) {
      delete nextState[groupKey];
    }
  });

  collapsedDiagnosisGroups.value = nextState;
}, { immediate: true });

// Generating medical record loading state
const isGenerating = ref(false);

// Fact Check State
const showFactCheckNotification = ref(false);
const factCheckResult = ref<FactCheckResult | null>(null);
const diagnosisFactChecks = ref<Map<string, FactCheckResult>>(new Map());
const treatmentFactChecks = ref<Map<string, FactCheckResult>>(new Map());

// Fact Check Widget State
const showFactCheckWidget = ref(false);
const factCheckWidgetStatus = ref<'idle' | 'checking' | 'completed'>('idle');
const factCheckWidgetIssues = ref<FactCheckIssue[]>([]);
const factCheckProgress = ref(0);
const factCheckCheckedCount = ref(0);
const factCheckTotalCount = ref(0);

// Anti-Misdiagnosis Checklist State
const isChecklistLoading = ref(false);
const showChecklistModal = ref(false);
const checklistItems = ref<{ question: string, recordText: string, checked: boolean }[]>([]);
const checklistNotes = ref('');
const activeChecklistDiagnosis = ref<Diagnosis | null>(null);

// Knowledge Panel State
const showKnowledgePanel = ref(false);
const knowledgeLoading = ref(false);
const knowledgeSearchKeyword = ref('');  // 当前搜索关键词
const knowledgeSearchType = ref<'diagnosis' | 'medication' | 'examination'>('diagnosis');  // 搜索类型
const knowledgeResults = ref<BatchSearchResults>({
  diagnoses: new Map(),
  medications: new Map(),
  examinations: new Map(),
});
const hasKnowledgeResults = ref(false);

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

// TCM Inquiry Configuration - 中医四诊
const tcmInquiryConfig = {
  key: 'tcm_signs',
  name: '中医四诊信息',
  config: {
    sections: [
      // 望诊 (Inspection)
      {
        id: 'inspection',
        title: '望诊',
        fields: [
          {
            id: 'spirit',
            key: 'spirit',
            label: '望神',
            type: 'radio',
            props: { options: ['得神', '少神', '失神', '假神'] },
            storageKey: 'tcm_spirit'
          },
          {
            id: 'face_color',
            key: 'face_color',
            label: '望面色',
            type: 'radio',
            props: { options: ['红黄隐隐、明润含蓄', '色青', '色赤', '色黄', '色白', '色黑', '两颧潮红', '颧红如妆'] },
            storageKey: 'tcm_face_color'
          },
          {
            id: 'body_shape',
            key: 'body_shape',
            label: '望形态',
            type: 'input',
            props: { placeholder: '强弱胖瘦、肢体、体型' },
            storageKey: 'tcm_body_shape'
          },
          {
            id: 'tongue_body',
            key: 'tongue_body',
            label: '舌质',
            type: 'radio',
            props: { options: ['淡红(正常)', '红', '淡白', '绛舌', '淡紫', '绛紫', '红绛', '青紫'] },
            storageKey: 'tongue_body'
          },
          {
            id: 'tongue_shape',
            key: 'tongue_shape',
            label: '舌形',
            type: 'checkbox',
            props: { options: ['胖大', '肿胀', '瘦薄', '点刺', '裂纹', '光滑', '齿痕'] },
            storageKey: 'tcm_tongue_shape'
          },
          {
            id: 'tongue_coating',
            key: 'tongue_coating',
            label: '苔色',
            type: 'radio',
            props: { options: ['白', '黄', '灰', '黑', '绿'] },
            storageKey: 'tongue_coating'
          },
          {
            id: 'coating_quality',
            key: 'coating_quality',
            label: '苔质',
            type: 'checkbox',
            props: { options: ['厚', '薄', '剥落', '无根', '润泽', '滑利', '干燥', '燥裂', '腐苔', '腻苔'] },
            storageKey: 'tcm_coating_quality'
          }
        ]
      },
      // 闻诊 (Auscultation and Olfaction)
      {
        id: 'auscultation',
        title: '闻诊',
        fields: [
          {
            id: 'voice',
            key: 'voice',
            label: '听声音',
            type: 'checkbox',
            props: { options: ['音哑/失音', '声亢有力', '声音重浊', '语声低微', '呻吟不止', '沉默寡言', '烦躁多言', '咳嗽', '呼吸如常', '气喘', '喉间痰鸣'] },
            storageKey: 'tcm_voice'
          },
          {
            id: 'smell',
            key: 'smell',
            label: '嗅气味',
            type: 'checkbox',
            props: { options: ['口气', '汗气', '鼻臭', '身臭', '病室气味'] },
            storageKey: 'tcm_smell'
          }
        ]
      },
      // 问诊 (Inquiry)
      {
        id: 'inquiry',
        title: '问诊',
        fields: [
          {
            id: 'cold_heat',
            key: 'cold_heat',
            label: '寒热',
            type: 'radio',
            props: { options: ['无异常', '恶寒发热', '但热不寒', '但寒不热', '寒热往来', '恶寒重发热轻', '发热重恶寒轻', '壮热', '潮热', '微热'] },
            storageKey: 'tcm_cold_heat'
          },
          {
            id: 'sweating',
            key: 'sweating',
            label: '出汗',
            type: 'checkbox',
            props: { options: ['自汗', '盗汗', '大汗', '战汗', '头汗', '半身汗', '手足心汗'] },
            storageKey: 'tcm_sweating'
          },
          {
            id: 'head_body',
            key: 'head_body',
            label: '头身',
            type: 'input',
            props: { placeholder: '头痛部位、头晕、身痛、身重、四肢痛、腰痛等' },
            storageKey: 'tcm_head_body'
          },
          {
            id: 'chest_abdomen',
            key: 'chest_abdomen',
            label: '胸胁脘腹',
            type: 'input',
            props: { placeholder: '疼痛部位、性质、伴随症状' },
            storageKey: 'tcm_chest_abdomen'
          },
          {
            id: 'ears_eyes',
            key: 'ears_eyes',
            label: '耳目',
            type: 'checkbox',
            props: { options: ['耳鸣', '耳聋', '重听', '目痛', '目眩', '目昏', '雀目'] },
            storageKey: 'tcm_ears_eyes'
          },
          {
            id: 'appetite',
            key: 'appetite',
            label: '饮食与口味',
            type: 'radio',
            props: { options: ['胃纳可', '纳呆', '多食易饥', '饥不欲食', '口不渴', '口渴多饮', '渴不多饮', '口淡乏味', '口甜粘腻', '口中泛酸', '口苦', '口咸'] },
            storageKey: 'tcm_appetite'
          },
          {
            id: 'sleep',
            key: 'sleep',
            label: '睡眠',
            type: 'radio',
            props: { options: ['睡眠安', '失眠', '不易入睡', '睡后易醒', '时时惊醒', '夜卧不安', '嗜睡'] },
            storageKey: 'tcm_sleep'
          },
          {
            id: 'stool',
            key: 'stool',
            label: '大便',
            type: 'radio',
            props: { options: ['大便调', '便秘', '泄泻', '完谷不化', '溏结不调', '肛门灼热', '排便不爽', '里急后重'] },
            storageKey: 'tcm_stool'
          },
          {
            id: 'urination',
            key: 'urination',
            label: '小便',
            type: 'radio',
            props: { options: ['小便可', '尿量增多', '尿量减少', '小便频数', '癃闭', '涩痛', '失禁', '遗尿'] },
            storageKey: 'tcm_urination'
          },
          {
            id: 'gynecology',
            key: 'gynecology',
            label: '妇女(经/带/胎/产)',
            type: 'input',
            props: { placeholder: '如为女性，请填写月经、带下、胎孕、产育情况' },
            storageKey: 'tcm_gynecology'
          }
        ]
      },
      // 切诊 (Palpation)
      {
        id: 'palpation',
        title: '切诊',
        fields: [
          {
            id: 'pulse',
            key: 'pulse',
            label: '脉诊',
            type: 'checkbox',
            props: { options: ['浮', '沉', '迟', '数', '洪', '微', '细', '散', '虚', '实', '滑', '涩', '长', '短', '弦', '芤', '紧', '缓', '革', '劳', '弱', '濡', '伏', '动', '促', '结', '代', '疾脉'] },
            storageKey: 'pulse'
          },
          {
            id: 'palpation',
            key: 'palpation',
            label: '按诊',
            type: 'input',
            props: { placeholder: '肌肤、手足、胸腹、俞穴' },
            storageKey: 'tcm_palpation'
          },
          {
            id: 'other_signs',
            key: 'other_signs',
            label: '其他',
            type: 'input',
            props: { placeholder: '其他中医体征描述' },
            storageKey: 'other_signs'
          }
        ]
      }
    ]
  }
};

// --- Logic ---

// AI 动态生成症状
const handleGenerateDynamicSymptom = async (name: string) => {
  if (!name || isGeneratingSymptom.value) return;
  try {
    isGeneratingSymptom.value = true;
    showToast(`正在由 AI 分析【${name}】的临床属性...`, 'info');

    const messages = DynamicSymptomTemplatePrompt.buildMessage(name);
    let resultJsonStr = await chat(
      messages,
      undefined,
      undefined,
      undefined,
      {
        traceContext: {
          scene: 'consultation-dynamic-symptom',
          sourceModule: 'consultation_dynamic_symptom',
          operationModule: 'consultation',
          operationAction: 'generate_dynamic_symptom_template',
          title: '生成动态症状模板',
        },
      }
    );

    // 解析格式
    if (resultJsonStr.includes('```json')) {
      resultJsonStr = resultJsonStr.substring(resultJsonStr.indexOf('```json') + 7, resultJsonStr.lastIndexOf('```')).trim();
    } else if (resultJsonStr.includes('```')) {
      resultJsonStr = resultJsonStr.substring(resultJsonStr.indexOf('```') + 3, resultJsonStr.lastIndexOf('```')).trim();
    }

    const fields = JSON.parse(resultJsonStr);
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new Error('AI 返回数据不合规');
    }

    // 动态构造 Symptom 实体并自动挂载
    const newSymptom = {
      id: `custom_${Date.now()}`,
      key: `custom_${Date.now()}`,
      name: name,
      description: 'AI 动态生成症状',
      isCommonSymptom: false,
      systemCategory: ['other'],
      bodyParts: [],
      config: {
        sections: [{
          id: 'section_0',
          title: `属性填写 (AI 动态生成)`,
          fields: fields
        }]
      },
      applicablePopulation: { genders: [], ageGroups: [] },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    selectSymptom(newSymptom);

    searchQuery.value = ''; // 清空搜索，关闭界面提示
    showToast('已成功添加动态生成的症状模板', 'success');
  } catch (err: any) {
    console.error('动态生成症状失败:', err);
    showToast(`AI 生成失败: ${err.message}`, 'error');
  } finally {
    isGeneratingSymptom.value = false;
  }
};

const applyReferenceFeedback = (payload: ReferenceFeedbackPayload) => {
  const resolvedAction = payload.referenceType || payload.action;
  const safePayload: ReferenceFeedbackPayload = {
    ...payload,
    action: resolvedAction,
    referenceType: resolvedAction,
    timestamp: payload.timestamp || Date.now(),
  };
  lastReferenceFeedback.value = safePayload;
  activeReferenceRequest.value =
    activeReferenceRequest.value?.requestId === safePayload.requestId
      ? { ...activeReferenceRequest.value, ...safePayload }
      : activeReferenceRequest.value;

  const items =
    (safePayload.items && safePayload.items.length > 0
      ? safePayload.items
      : activeReferenceRequest.value?.items) || [];
  if (items.length > 0) {
    const feedbackEntry: ReferenceStatusEntry = {
      status: safePayload.status,
      requestId: safePayload.requestId,
      message: safePayload.message,
      updatedAt: safePayload.timestamp || Date.now(),
    };
    if (safePayload.action === 'batch') {
      const nextMap = { ...referenceStatusMap.value };
      items.forEach((item: ReferenceItemPayload) => {
        nextMap[buildReferenceKey(item.type as ReferenceAction, item)] = feedbackEntry;
      });
      referenceStatusMap.value = nextMap;
    } else {
      setReferenceStatuses(safePayload.action, items, feedbackEntry);
    }
  }

  feedbackService.logOperation({
    module: 'consultation',
    action: `reference_feedback_${safePayload.action}`,
    title: '接收 PHIS 引用回执',
    sourceModule: 'consultation_reference',
    scene: 'consultation-reference',
    operationType: 'api_call',
    operationName: `reference_feedback:${safePayload.action}`,
    details: safePayload,
    success: safePayload.status === 'success',
  });

  if (safePayload.status === 'success') {
    showToast(safePayload.message || 'PHIS 已完成引用保存。', 'success');
  } else {
    showToast(safePayload.message || 'PHIS 引用保存失败。', 'error');
  }
};

/* writeRecordToHIS / confirmDiagnosisSelection removed - template usage commented out */

const getTreatmentTagLabel = (type: TreatmentRecommendation['type']): string => {
  switch (type) {
    case 'medicine':
      return '药';
    case 'exam':
      return '查';
    case 'lab_test':
      return '验';
    case 'procedure':
      return '处';
    default:
      return '治';
  }
};

const getTreatmentSpec = (rec: TreatmentRecommendation): string => {
  return rec.type === 'medicine' ? (rec.spec || rec.matchedItem?.spec || '') : '';
};

const getMedicineInlineSummary = (rec: TreatmentRecommendation): string => {
  const normalized = normalizeTreatmentRecommendation(rec);
  const parts = [
    normalized.dosage || normalized.dosageUnit ? `一次剂量 ${[normalized.dosage, normalized.dosageUnit].filter(Boolean).join(' ')}` : '',
    normalized.frequency ? `频次 ${normalized.frequency}` : '',
    normalized.route ? `用法 ${normalized.route}` : '',
    normalized.days ? `天数 ${normalized.days}天` : '',
    normalized.totalQty || normalized.totalUnit ? `总量 ${[normalized.totalQty, normalized.totalUnit].filter(Boolean).join(' ')}` : '',
  ].filter(Boolean);

  return parts.join(' / ');
};

function getReasonTooltipKey(kind: 'diagnosis' | 'treatment', primary: string, secondary = ''): string {
  return `${kind}:${primary}:${secondary}`;
}

function toggleReasonTooltip(key: string, event?: Event): void {
  event?.stopPropagation();
  activeReasonTooltipKey.value = activeReasonTooltipKey.value === key ? null : key;
}

function getDiagnosisFeedbackKey(diag: Diagnosis): string {
  return getVoiceDiagnosisFeedbackKey(diag);
}

function getTreatmentFeedbackKey(rec: TreatmentRecommendation): string {
  return getVoiceTreatmentFeedbackKey(rec);
}

function getRecommendationDraft(recommendationKey: string): VoiceRecommendationFeedbackDraft {
  return ensureRecommendationDraft(recommendationKey);
}

function getRecommendationSubmittedLabel(recommendationKey: string): string {
  return recommendationSubmittedMap.value[recommendationKey]?.actionLabel || '';
}

function isRecommendationFeedbackOpen(recommendationKey: string): boolean {
  return activeFeedbackPopoverKey.value === recommendationKey;
}

function toggleRecommendationFeedback(recommendationKey: string, event?: Event): void {
  event?.stopPropagation();
  activeFeedbackPopoverKey.value = activeFeedbackPopoverKey.value === recommendationKey ? null : recommendationKey;
}

function buildDiagnosisFeedbackSnapshot(diag: Diagnosis): Record<string, unknown> {
  const isSelected =
    (selectedDiagnosis.value?.id && diag.id && selectedDiagnosis.value.id === diag.id)
    || (selectedDiagnosis.value?.name === diag.name && selectedDiagnosis.value?.code === diag.code);

  return {
    id: diag.id || '',
    code: diag.code || '',
    name: diag.name || '',
    rationale: diag.rationale || '',
    selected: isSelected,
    primary: isSelected,
  };
}

function buildTreatmentFeedbackSnapshot(rec: TreatmentRecommendation): Record<string, unknown> {
  return {
    type: rec.type,
    name: rec.name,
    originalName: rec.originalName || '',
    reason: rec.reason || '',
    selected: !!rec.selected,
    matchedItem: rec.matchedItem || null,
    matchStatus: rec.matchStatus || 'unmatched',
    dosage: rec.dosage || '',
    dosageUnit: rec.dosageUnit || '',
    frequency: rec.frequency || '',
    route: rec.route || '',
    totalQty: rec.totalQty || '',
    totalUnit: rec.totalUnit || '',
    pharmacy: rec.pharmacy || '',
    execDept: rec.execDept || '',
    insuranceType: rec.insuranceType || '',
    bodySite: rec.bodySite || '',
    bodySiteId: rec.bodySiteId || '',
  };
}

async function handleDiagnosisFeedbackSubmit(diag: Diagnosis, draft: VoiceRecommendationFeedbackDraft): Promise<void> {
  const recommendationKey = getDiagnosisFeedbackKey(diag);
  try {
    await submitRecommendationFeedback({
      recommendationKey,
      recommendationTitle: diag.name,
      draft,
      snapshot: buildDiagnosisFeedbackSnapshot(diag),
      fallbackTargetType: 'diagnosis',
      fallbackRecommendationType: 'diagnosis',
    });
    activeFeedbackPopoverKey.value = null;
    showToast?.('诊断反馈已记录', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showToast?.(`提交反馈失败: ${message}`, 'error');
  }
}

async function handleTreatmentFeedbackSubmit(rec: TreatmentRecommendation, draft: VoiceRecommendationFeedbackDraft): Promise<void> {
  const recommendationKey = getTreatmentFeedbackKey(rec);
  try {
    await submitRecommendationFeedback({
      recommendationKey,
      recommendationTitle: rec.name,
      draft,
      snapshot: buildTreatmentFeedbackSnapshot(rec),
      fallbackTargetType: mapTreatmentTypeToTargetType(rec.type),
      fallbackRecommendationType: mapTreatmentTypeToRecommendationType(rec.type),
    });
    activeFeedbackPopoverKey.value = null;
    showToast?.('推荐反馈已记录', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showToast?.(`提交反馈失败: ${message}`, 'error');
  }
}

const isPendingReferenceItem = (
  action: ReferenceAction,
  item: { name: string; code?: string }
): boolean => {
  if (activeReferenceRequest.value?.status !== 'pending' || activeReferenceRequest.value.action !== action) {
    return false;
  }

  return (activeReferenceRequest.value.items || []).some((pendingItem) =>
    buildReferenceKey(action, pendingItem) === buildReferenceKey(action, item)
  );
};

const getDiagnosisReferenceButtonLabel = (diagnosis: Diagnosis): string => {
  const status = getDiagnosisReferenceStatus(diagnosis)?.status;
  if (status === 'success') {
    return '已引用';
  }
  if (isPendingReferenceItem('diagnosis', { name: diagnosis.name, code: diagnosis.code })) {
    return '等待回执...';
  }
  if (status === 'failed') {
    return '重试引用';
  }
  return '引用诊断';
};

const getDiagRateClass = (rate: string | undefined): string => {
  if (!rate) return '';
  const num = parseInt(rate);
  if (isNaN(num)) return '';
  if (num >= 70) return 'rate-high';
  if (num >= 60) return 'rate-medium';
  return 'rate-low';
};

const isDiagnosisReferenceDisabled = (diagnosis: Diagnosis): boolean => {
  const status = getDiagnosisReferenceStatus(diagnosis)?.status;
  return status === 'success' || hasPendingReferenceRequest.value;
};

const getTreatmentReferenceAction = (
  recommendation: TreatmentRecommendation
): Exclude<ReferenceAction, 'diagnosis'> | null => {
  if (recommendation.type === 'medicine') {
    return 'medication';
  }
  if (recommendation.type === 'exam') {
    return 'examination';
  }
  if (recommendation.type === 'lab_test') {
    return 'lab_test';
  }
  if (recommendation.type === 'procedure') {
    return 'procedure';
  }
  return null;
};

/* getTreatmentReferenceButtonLabel removed - per-section reference replaced by batch 一键回写 */

const getReferenceStatusLabel = (status: ReferenceLifecycleStatus): string => {
  switch (status) {
    case 'success':
      return '已引用';
    case 'failed':
      return '引用失败';
    default:
      return '等待回执';
  }
};

const getDiagnosisReferenceStatus = (diagnosis: Diagnosis): ReferenceStatusEntry | null =>
  referenceStatusMap.value[
    buildReferenceKey('diagnosis', {
      name: diagnosis.name,
      code: diagnosis.code,
    })
  ] || null;

const getTreatmentReferenceStatus = (
  recommendation: TreatmentRecommendation
): ReferenceStatusEntry | null => {
  const action = getTreatmentReferenceAction(recommendation);
  if (!action) {
    return null;
  }

  return referenceStatusMap.value[
    buildReferenceKey(action, {
      name: recommendation.name,
      code: recommendation.matchedItem?.code,
    })
  ] || null;
};

const requestReferenceToPHIS = async (
  action: ReferenceAction,
  items: ReferenceItemPayload[]
) => {
  if (items.length === 0) {
    showToast('当前没有可引用的项目。', 'info');
    return;
  }

  const resolveItemAction = (item: ReferenceItemPayload): ReferenceAction =>
    action === 'batch' ? (item.type as ReferenceAction) : action;
  const existingSuccess = items.every(
    (item) => referenceStatusMap.value[buildReferenceKey(resolveItemAction(item), item)]?.status === 'success'
  );
  if (existingSuccess) {
    showToast('这些项目已经成功引用到 PHIS，无需重复操作。', 'info');
    return;
  }

  const requestId = `ref-${action}-${Date.now()}`;
  const payload = buildCurrentMedicalPayload(
    {
      resultType: 'reference-request',
      requestId,
      referenceType: action,
      action,
      referenceStatus: 'pending',
      referenceMessage: '等待 PHIS 保存引用结果',
      referenceItems: items,
    },
    {
      includeTreatments: action === 'batch' || action !== 'diagnosis',
      includedTreatmentTypes:
        action === 'batch'
          ? undefined
          : action === 'medication'
            ? ['medicine']
            : action === 'examination'
              ? ['exam']
              : action === 'lab_test'
                ? ['lab_test']
                : action === 'procedure'
                  ? ['procedure']
                  : undefined,
    }
  );

  try {
    await invoke('complete_consultation', { result: payload });
    if (action === 'batch') {
      const pendingEntry: ReferenceStatusEntry = {
        status: 'pending',
        requestId,
        message: '等待 PHIS 保存引用结果',
        updatedAt: Date.now(),
      };
      const nextMap = { ...referenceStatusMap.value };
      items.forEach((item) => {
        nextMap[buildReferenceKey(item.type as ReferenceAction, item)] = pendingEntry;
      });
      referenceStatusMap.value = nextMap;
    } else {
      setReferenceStatuses(action, items, {
        status: 'pending',
        requestId,
        message: '等待 PHIS 保存引用结果',
        updatedAt: Date.now(),
      });
    }
    activeReferenceRequest.value = {
      consultationId: resolveConsultationId(),
      requestId,
      action,
      status: 'pending',
      message: '等待 PHIS 保存引用结果',
      items,
      timestamp: Date.now(),
    };
    feedbackService.logOperation({
      module: 'consultation',
      action: `request_phis_reference_${action}`,
      title: '发起 PHIS 引用请求',
      sourceModule: 'consultation_reference',
      scene: 'consultation-reference',
      operationType: 'form_submit',
      operationName: `request_reference:${action}`,
      details: activeReferenceRequest.value,
      success: true,
    });
    showToast('已发起引用请求，等待 PHIS 回执。', 'info');
  } catch (error) {
    console.error('[ConsultationPage] Failed to request PHIS reference:', error);
    trackError('request_reference_failed', error, { action });
    showToast(`发起引用失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
};

const referenceDiagnosisItemToPHIS = async (diagnosis: Diagnosis) => {
  handleDiagnosisSelect(diagnosis);
  await requestReferenceToPHIS('diagnosis', [
    {
      name: diagnosis.name,
      code: diagnosis.code,
      type: 'diagnosis',
      isTCM: diagnosis.isTCM,
    },
  ]);
};

/* referenceSelectedTreatmentsToPHIS removed - per-section reference replaced by batch 一键回写 */

const canSubmitToHIS = computed(() => {
  if (!selectedDiagnosis.value) return false;
  return generatedRecord.value.chiefComplaint.trim().length > 0
    && generatedRecord.value.historyOfPresentIllness.trim().length > 0;
});

watch(() => props.initialPatientData, (newData) => {
  if (newData) {
    const nextPatientId = resolvePatientContextAnchorId(newData);
    const shouldReset = activePatientAnchorId.value !== '' && nextPatientId !== '' && activePatientAnchorId.value !== nextPatientId;

    if (shouldReset) {
      resetWorkflowState();
    }

    patientInfo.value = {
      ...patientInfo.value,
      ...toConsultationPatient(newData),
    };
    activePatientAnchorId.value = resolvePatientContextAnchorId(patientInfo.value as any);

    prefillGeneratedRecordFromPatient(shouldReset);
  }
}, { immediate: true });

const symptomOrderResolvers: OrderItemResolvers = {
  getServiceCode: (rec) => (rec.matchedItem?.sdSrv || readFirstString(getMatchedItemRaw(rec), ['sdSrv']) || '').trim(),
  getServiceId: (rec) => (rec.matchedItem?.idSrv || readFirstString(getMatchedItemRaw(rec), ['idSrv', 'idCli', 'idMedPro', 'idMed', 'id']) || rec.matchedItem?.id || '').trim(),
  getServiceName: (rec) => (rec.matchedItem?.naSrv || readFirstString(getMatchedItemRaw(rec), ['naSrv', 'naCli', 'naMedPro', 'naMed']) || rec.matchedItem?.name || rec.name || '').trim(),
  getExecDeptId: (rec) => (rec.matchedItem?.idDeptExec || readFirstString(getMatchedItemRaw(rec), ['idDeptExec', 'idDept']) || '').trim(),
  getPartId: (rec) => (rec.matchedItem?.idPart || readFirstString(getMatchedItemRaw(rec), ['idPart']) || '').trim(),
  getJsonField: (rec) => (rec.matchedItem?.jsonField || readFirstString(getMatchedItemRaw(rec), ['jsonField']) || '').trim(),
};

const getSelectedTreatments = (): TreatmentRecommendation[] => [
  ...treatmentRecommendations.value,
  ...examRecommendations.value,
  ...labTestRecommendations.value,
  ...procedureRecommendations.value,
].filter((item) => item.selected);

const getInventoryBlockedSubmitMessage = (items: TreatmentRecommendation[]): string => {
  if (items.length === 0) {
    return '存在库存不足的药品，请调整用药数量或药房后再提交';
  }

  const names = Array.from(new Set(items.map((item) => item.name).filter(Boolean)));
  if (names.length === 1) {
    return `${names[0]} 库存不足，请调整用药数量或药房后再提交`;
  }

  const preview = names.slice(0, 3).join('、');
  return `${preview}${names.length > 3 ? ` 等${names.length}种药品` : ''}库存不足，请调整用药数量或药房后再提交`;
};

const ensureSelectedTreatmentsReadyForSubmit = async (selectedTreatments: TreatmentRecommendation[]): Promise<boolean> => {
  const missingPharmacy = selectedTreatments.find((item) => !treatmentGates.hasRequiredPharmacy(item));
  if (missingPharmacy) {
    showToast(`${missingPharmacy.name} 当前发药药房不可用，请选择实际拥有该药品的药房后再提交`, 'info');
    return false;
  }

  const missingExecDept = selectedTreatments.find((item) => !treatmentGates.hasRequiredExecDept(item));
  if (missingExecDept) {
    showToast(`${missingExecDept.name} 未设置执行科室，请先设置后再提交`, 'info');
    return false;
  }

  const medicinesReady = await Promise.all(selectedTreatments
    .filter((item) => item.type === 'medicine')
    .map((item) => treatmentHydration.ensureMedicineSelectable(item, true)));
  if (medicinesReady.some((ready) => !ready)) {
    showToast('存在当前药房无有效详情的药品，请取消选择后再提交', 'info');
    return false;
  }

  const selectedMedicines = selectedTreatments.filter((item) => item.type === 'medicine');
  const medicineInventoriesReady = await Promise.all(selectedMedicines
    .map((item) => treatmentHydration.checkMedicineInventoryEnough(item, false)));
  const inventoryBlockedItems = selectedMedicines.filter((_, index) => !medicineInventoriesReady[index]);
  if (inventoryBlockedItems.length > 0) {
    showToast(getInventoryBlockedSubmitMessage(inventoryBlockedItems), 'info');
    return false;
  }

  return true;
};

const submitToHIS = async () => {
  if (!canSubmitToHIS.value) {
    if (!selectedDiagnosis.value) {
      showToast('请先选择一个诊断结果', 'info');
      return;
    }
    showToast('请先完善主诉和现病史后再提交', 'info');
    return;
  }

  const requestId = `record-confirmed-${Date.now()}`;
  const consultationId = resolveConsultationId();
  const selectedTreatments = getSelectedTreatments();

  if (!(await ensureSelectedTreatmentsReadyForSubmit(selectedTreatments))) {
    return;
  }

  const diagList = buildSharedDiagList({
    selectedDiagnoses: selectedDiagnosis.value ? [selectedDiagnosis.value] : [],
    primaryDiagnosis: selectedDiagnosis.value,
    patientTetId: (patientInfo.value as unknown as { idTet?: string }).idTet || '',
  });
  const orderList = selectedTreatments.map((item) => buildSharedOrderListItem(item, symptomOrderResolvers));
  const groupNames = (type: TreatmentRecommendation['type']) =>
    selectedTreatments.filter((item) => item.type === type).map((item) => item.name);
  const treatmentPlan = [
    groupNames('medicine').length ? `用药：${groupNames('medicine').join('；')}` : '',
    groupNames('exam').length ? `检查：${groupNames('exam').join('；')}` : '',
    groupNames('lab_test').length ? `检验：${groupNames('lab_test').join('；')}` : '',
    groupNames('procedure').length ? `处置：${groupNames('procedure').join('；')}` : '',
  ].filter(Boolean).join('。');

  const result = buildRecordConfirmedPayload({
    consultationId,
    requestId,
    chiefComplaint: generatedRecord.value.chiefComplaint,
    historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness,
    pastMedicalHistory: resolvePastMedicalHistory(),
    diagList,
    orderList,
    treatmentPlan,
  });

  try {
    await invoke('complete_consultation', { result });
    submitSmartFinalUserLog();
    trackFormSubmit('submit_to_his', { patientId: consultationId });
    showToast("问诊完成，数据已发送回HIS系统。", "success");
    handleEndSession();
  } catch (e) {
    console.error("Failed to submit", e);
    trackError('submit_to_his_failed', e);
    showToast("发送数据失败: " + e, "error");
  }
};

const printReport = () => {
  trackClick('print_report');
  window.print();
};

const handleEndSession = () => {
  trackClick('end_consultation_session');
  resetWorkflowState();
  initFormData(generalConditionConfig);
  emit('close');
};

const removeSymptom = (symptom: any) => {
  trackClick('symptom_remove', { symptomKey: symptom.key, symptomName: symptom.name });
  const index = selectedSymptoms.value.findIndex(s => s.key === symptom.key);
  if (index !== -1) {
    selectedSymptoms.value.splice(index, 1);
  }
};

const toggleCategoryDropdown = () => {
  isCategoryDropdownOpen.value = !isCategoryDropdownOpen.value;
};

const toggleCategory = (key: string) => {
  if (key === 'all') {
    selectedCategories.value = [];
  } else {
    const index = selectedCategories.value.indexOf(key);
    if (index !== -1) {
      selectedCategories.value.splice(index, 1);
    } else {
      selectedCategories.value.push(key);
    }
  }
};

const categoryButtonText = computed(() => {
  if (selectedCategories.value.length === 0) return '全部系统';
  if (selectedCategories.value.length === 1) {
    const cat = uniqueCategories.value.find(c => c.key === selectedCategories.value[0]);
    return cat ? cat.label : selectedCategories.value[0];
  }
  return `已选 ${selectedCategories.value.length} 项`;
});

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null;

  if (activeReasonTooltipKey.value && !target?.closest('.reason-tooltip-trigger')) {
    activeReasonTooltipKey.value = null;
  }

  if (activeFeedbackPopoverKey.value && !target?.closest('.voice-feedback-anchor')) {
    activeFeedbackPopoverKey.value = null;
  }

  if (categoryFilterRef.value && !categoryFilterRef.value.contains(event.target as Node)) {
    isCategoryDropdownOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  symptoms.value = currentTemplatesData.value;
  void syncRemoteTemplates()
    .then(() => {
      if (selectedSymptoms.value.length === 0) {
        symptoms.value = currentTemplatesData.value;
      }
    })
    .catch((error) => {
      console.warn('[ConsultationPage] Template sync on mount failed:', error);
    });
  // Initialize General Condition data
  initFormData(generalConditionConfig);
  prefillGeneratedRecordFromPatient(false);

  // 预热 HIS 频次/用法/药房/执行科室字典，让后续 normalizeTreatmentRecommendation
  // 能命中 dftFreq/dftUsage 等默认值，并同步预热当前药房 scope 对应的药品目录。
  void ensureTreatmentDictionaryStateReady().catch((error) => {
    console.warn('[ConsultationPage] Failed to preload treatment dictionaries:', error);
  });

  void listen<ReferenceFeedbackPayload>('consultation-reference-feedback', (event) => {
    const payload = event.payload;
    if (
      payload.consultationId &&
      payload.consultationId !== resolveConsultationId()
    ) {
      return;
    }
    applyReferenceFeedback(payload);
  })
    .then((unlisten) => {
      unlistenReferenceFeedback = unlisten;
    })
    .catch((error) => {
      console.error('[ConsultationPage] Failed to subscribe reference feedback:', error);
    });
});

// 监听问诊模式变化，切换模板
watch(consultationMode, () => {
  symptoms.value = currentTemplatesData.value;
  // 清空已选症状，因为不同模板的症状可能不兼容
  selectedSymptoms.value = [];
  formData.value = {};
  initFormData(generalConditionConfig);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  if (unlistenReferenceFeedback) {
    unlistenReferenceFeedback();
    unlistenReferenceFeedback = null;
  }
});

// Removed the automatic selectionMode switch watcher since we use v-if="!searchQuery.trim()" to hide tabs

const filteredSymptoms = computed(() => {
  let result = symptoms.value;

  // 1. Filter by Category (Only if NOT searching globally)
  if (!searchQuery.value && selectedCategories.value.length > 0) {
    result = result.filter((s: any) => 
      s.systemCategory && 
      Array.isArray(s.systemCategory) && 
      s.systemCategory.some((c: string) => selectedCategories.value.includes(c))
    );
  }

  // 2. Filter by Gender (Always Execute)
  const currentGender = getPatientContextGenderCode(patientInfo.value as any);
  if (currentGender) {
    const compatibleGenders = currentGender === 'M'
      ? ['M', '1']
      : currentGender === 'F'
        ? ['F', '2']
        : [currentGender];
    result = result.filter((s: any) => {
      // Assuming 's.applicablePopulation' structure is now standardized
      if (!s.applicablePopulation?.genders || s.applicablePopulation.genders.length === 0) {
        return true;
      }
      return compatibleGenders.some((gender) => s.applicablePopulation.genders.includes(gender));
    });
  }

  // 3. Filter by Search Query
  if (!searchQuery.value) return result;
  
  const query = searchQuery.value.toLowerCase();
  return result.filter((s: any) => {
    const name = s.name.toLowerCase();
    if (name.includes(query)) return true;
    
    // Pinyin support
    if (Pinyin.isSupported()) {
       const pinyinFull = Pinyin.convertToPinyin(s.name, '', true); // "fare"
       if (pinyinFull.includes(query)) return true;
       
       const pinyinInitials = Pinyin.convertToPinyin(s.name, ' ', true).split(' ').map((char: string) => char[0]).join(''); // "fr"
       if (pinyinInitials.includes(query)) return true;
    }
    
    return false;
  });
});

// Computed list of all items to render (Selected Symptoms + TCM Inquiry / General Condition)
const renderList = computed(() => {
  if (selectedSymptoms.value.length === 0) return [];
  const list = [...selectedSymptoms.value];
  if (consultationMode.value === 'tcm') {
    // Initialize TCM data if needed
    if (!formData.value[tcmInquiryConfig.key]) {
      initFormData(tcmInquiryConfig);
    }
    // Clear general condition data when in TCM mode
    if (formData.value['general']) {
      delete formData.value['general'];
    }
    list.push(tcmInquiryConfig);
  } else {
    // For western medicine, add general condition inquiry
    // Initialize general condition data if needed
    if (!formData.value[generalConditionConfig.key]) {
      initFormData(generalConditionConfig);
    }
    // Clear TCM signs data when in Western mode
    if (formData.value['tcm_signs']) {
      delete formData.value['tcm_signs'];
    }
    list.push(generalConditionConfig);
  }
  return list;
});

const selectSymptom = (symptom: any) => {
  const index = selectedSymptoms.value.findIndex(s => s.key === symptom.key);
  if (index !== -1) {
    // Deselect
    trackClick('symptom_deselect', { symptomKey: symptom.key, symptomName: symptom.name });
    selectedSymptoms.value.splice(index, 1);
  } else {
    // Select
    if (isSymptomSelectionFull(selectedSymptoms.value.length)) {
      showToast(`最多只能选择 ${CONSULTATION_CONFIG.MAX_SYMPTOMS} 个症状`, 'info');
      return;
    }
    trackClick('symptom_select', { symptomKey: symptom.key, symptomName: symptom.name, totalSelected: selectedSymptoms.value.length + 1 });
    selectedSymptoms.value.push(symptom);
    // 从伴随症状中移除（已升级为详细问诊）
    if (companionSymptoms.value.has(symptom.key)) {
      const newSet = new Set(companionSymptoms.value);
      newSet.delete(symptom.key);
      companionSymptoms.value = newSet;
    }
    // Initialize form data if not exists
    if (!formData.value[symptom.key]) {
      initFormData(symptom);
    }
  }
};

const initFormData = (configItem: any) => {
  const data: Record<string, any> = {};
  if (configItem && configItem.config && configItem.config.sections) {
      configItem.config.sections.forEach((section: any) => {
        section.fields.forEach((field: any) => {
          // 兼容中医和西医模板：优先使用 storageKey，回退到 key
          const fieldKey = field.storageKey || field.key;
          if (!fieldKey) return;

          if (field.type === 'input_radio') {
            data[fieldKey] = { inputValue: '', radioValue: '' };
          } else if (field.type === 'checkbox') {
            data[fieldKey] = [];
          } else {
            // Set default value for General Condition or if explicitly requested
            if (configItem.key === 'general' && field.props?.options?.length > 0) {
              data[fieldKey] = field.props.options[0];
            } else {
              data[fieldKey] = '';
            }
          }
        });
      });
      // Use reactive set
      formData.value[configItem.key] = data;
  }
};

const handleCheckboxChange = (event: Event, field: any, symptomKey: string) => {
  const target = event.target as HTMLInputElement;
  const value = target.value;
  // 兼容中医和西医模板
  const fieldKey = field.storageKey || field.key;
  const currentValues = formData.value[symptomKey][fieldKey] || [];
  
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

// Knowledge Base Search Functions
const searchKnowledgeBaseForDiagnoses = async (diagnoses: Diagnosis[]) => {
  if (!isPMPHAIConfigured() || diagnoses.length === 0) {
    return;
  }

  knowledgeLoading.value = true;
  hasKnowledgeResults.value = false;

  try {
    const diagnosisNames = diagnoses.map(d => d.name).filter(Boolean);
    const results = await pmphaiService.batchSearch(diagnosisNames, { limit: 3, enableAbstract: true });

    knowledgeResults.value = {
      diagnoses: results,
      medications: new Map(),
      examinations: new Map(),
    };

    const totalResults = Array.from(results.values()).flat().length;
    hasKnowledgeResults.value = totalResults > 0;

    if (hasKnowledgeResults.value) {
      showKnowledgePanel.value = true;
      trackClick('knowledge_search_diagnoses', { totalResults });
    }
  } catch (error) {
    console.error('Knowledge base search failed:', error);
    trackError('knowledge_search_failed', error);
  } finally {
    knowledgeLoading.value = false;
  }
};

// (Unused warning suppressed: this function is prepared for future manual triggering)
// (Unused warning suppressed: this function is prepared for future manual triggering)
// @ts-ignore
const searchKnowledgeBaseForTreatment = async (medications: string[], examinations: string[]) => {
  if (!isPMPHAIConfigured()) {
    return;
  }

  knowledgeLoading.value = true;

  try {
    const [medResults, examResults] = await Promise.all([
      pmphaiService.batchSearch(medications, { limit: 3, enableAbstract: true }),
      pmphaiService.batchSearch(examinations, { limit: 3, enableAbstract: true }),
    ]);

    // Merge with existing diagnosis results
    knowledgeResults.value = {
      ...knowledgeResults.value,
      medications: medResults,
      examinations: examResults,
    };

    const totalResults =
      Array.from(knowledgeResults.value.diagnoses.values()).flat().length +
      Array.from(medResults.values()).flat().length +
      Array.from(examResults.values()).flat().length;

    hasKnowledgeResults.value = totalResults > 0;

    if (hasKnowledgeResults.value && !showKnowledgePanel.value) {
      trackClick('knowledge_search_treatment', { totalResults });
    }
  } catch (error) {
    console.error('Knowledge base search failed:', error);
    trackError('knowledge_search_failed', error);
  } finally {
    knowledgeLoading.value = false;
  }
};

const toggleKnowledgePanel = () => {
  showKnowledgePanel.value = !showKnowledgePanel.value;
  trackClick('knowledge_panel_toggle', { visible: showKnowledgePanel.value });
};

// @ts-ignore
const searchKnowledgeForRecommendations = async () => {
  if (!isPMPHAIConfigured()) {
    return;
  }

  knowledgeLoading.value = true;
  hasKnowledgeResults.value = false;

  try {
    // Extract search queries from current AI recommendations
    const diagnoses = aiDiagnoses.value.map(d => d.name).filter(Boolean);
    const medications: string[] = [];
    const examinations: string[] = [];

    treatmentRecommendations.value.forEach(rec => {
      if (rec.type === 'medicine' && rec.name) {
        medications.push(rec.name);
      } else if (rec.type === 'exam' && rec.name) {
        examinations.push(rec.name);
      }
    });

    // Search knowledge base by categories
    const results = await pmphaiService.searchByCategories(diagnoses, medications, examinations);
    knowledgeResults.value = results;

    // Check if we have any results
    const totalResults =
      Array.from(results.diagnoses.values()).flat().length +
      Array.from(results.medications.values()).flat().length +
      Array.from(results.examinations.values()).flat().length;

    hasKnowledgeResults.value = totalResults > 0;

    if (hasKnowledgeResults.value && !showKnowledgePanel.value) {
      trackClick('knowledge_search_all', { totalResults });
      showKnowledgePanel.value = true;
    }
  } catch (error) {
    console.error('Knowledge base search failed:', error);
    trackError('knowledge_search_failed', error);
  } finally {
    knowledgeLoading.value = false;
  }
};

// Search literature for a specific item (diagnosis or treatment)
const searchLiterature = (item: any) => {
  const itemName = item.name || '';
  if (!itemName) {
    return;
  }

  if (!isPMPHAIConfigured()) {
    showToast('请先在设置中配置知识库', 'error');
    return;
  }

  // 设置搜索关键词和类型
  knowledgeSearchKeyword.value = itemName;

  // 根据条目类型确定搜索类型
  if (item.type === 'medicine') {
    knowledgeSearchType.value = 'medication';
  } else if (item.type === 'exam') {
    knowledgeSearchType.value = 'examination';
  } else {
    knowledgeSearchType.value = 'diagnosis';
  }

  // 打开知识面板
  showKnowledgePanel.value = true;

  trackClick('knowledge_search_item', {
    itemName,
    type: knowledgeSearchType.value
  });
};

const handleEndConsultation = async () => {
  // 防止重复提交
  if (isGenerating.value) return;
  assistFocus.value = null;

  // 1. Validation
  const errors: string[] = [];
  validationErrors.value = {}; // Reset errors
  let firstErrorFieldId = '';

  selectedSymptoms.value.forEach(s => {
    const data = formData.value[s.key];
    
    // Generic Validation based on 'required' config
    if (s.config && s.config.sections) {
      s.config.sections.forEach((section: any) => {
        // Check section applicability (optional, simplified to field check)
        section.fields.forEach((field: any) => {
          // Only validate applicable fields
          if (isFieldApplicable(field, patientInfo.value) && field.required) {
            const val = data[field.storageKey];
            let isEmpty = false;

            if (val === undefined || val === null || val === '') {
              isEmpty = true;
            } else if (Array.isArray(val)) {
              isEmpty = val.length === 0;
            } else if (typeof val === 'object') {
              // input_radio or specialized objects
               if ('inputValue' in val || 'radioValue' in val) {
                 // For input_radio, usually both needed? Or at least one?
                 // Typically input_radio logic is combined. Let's strict check if partial emptiness is allowed.
                 // If "required", usually implies complete.
                 if (!val.inputValue && !val.radioValue) isEmpty = true; 
                 // If only one part is present? 
                 // Let's assume if it has inputValue but no unit (radioValue), it's incomplete if required?
                 // Previous hardcode was (!inputValue || !radioValue).
                 else if (field.type === 'input_radio' && (!val.inputValue || !val.radioValue)) isEmpty = true;
               } 
            }

            if (isEmpty) {
              errors.push(`${s.name}: ${field.label} 为必填项`);
              const errorId = `${s.key}_${field.storageKey}`;
              validationErrors.value[errorId] = true;
              if (!firstErrorFieldId) firstErrorFieldId = `field-${s.key}-${field.storageKey}`;
            }
          }
        });
      });
    }
  });

  if (errors.length > 0) {
    trackError('record_validation_failed', new Error(errors.join('; ')));
    showToast("请完善以下信息：" + errors.join("; "), "error");

    // Scroll to first error
    if (firstErrorFieldId) {
      const element = document.getElementById(firstErrorFieldId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    return;
  }

  // 2. Start loading
  isGenerating.value = true;

  try {
    // 3. Generation Logic
    generateMedicalRecord();

    // 4. Switch View
    currentView.value = 'record';
    trackFormSubmit('generate_medical_record', { symptomCount: selectedSymptoms.value.length, mode: consultationMode.value });

    // 5. Trigger AI Diagnosis
    await fetchAIDiagnosis();
  } catch (error) {
    console.error('Failed to generate medical record:', error);
    trackError('generate_medical_record_failed', error);
    showToast('生成病历失败，请稍后重试', 'error');
  } finally {
    // 6. Always clear loading state
    isGenerating.value = false;
  }
};

const parseLLMJson = (text: string): any => {
  try {
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(jsonStr);
    console.log('[parseLLMJson] Successfully parsed:', parsed);
    return parsed;
  } catch (err) {
    console.error('[parseLLMJson] Failed to parse JSON:', text, err);
    throw new Error(`JSON解析失败: ${err instanceof Error ? err.message : String(err)}`);
  }
};

const buildConsultationTraceConfig = (
  operationAction: string,
  title: string,
  scene: string,
  sourceModule = 'consultation_ai',
) => ({
  traceContext: {
    scene,
    sourceModule,
    operationModule: 'consultation',
    operationAction,
    title,
  },
});

const fetchAIDiagnosis = async () => {
  aiLoading.value = true;
  aiError.value = null;
  aiDiagnoses.value = [];
  selectedDiagnosis.value = null;
  try {
    const startTime = Date.now();
    console.log('========== AI 辅助诊断开始 ==========');
    console.time('[AI分析] 1. 构建提示词');
    let fullResponse = "";

    if (consultationMode.value === 'tcm') {
      // TCM Diagnosis Logic
      // Collect TCM signs dynamically from all sections
      const tcmData = formData.value['tcm_signs'] || {};
      console.log('[TCM Debug] TCM formData:', tcmData);
      const signs: string[] = [];

      // Iterate through all sections and fields in tcmInquiryConfig
      tcmInquiryConfig.config.sections.forEach(section => {
        const sectionSigns: string[] = [];
        section.fields.forEach(field => {
          const value = tcmData[field.storageKey];
          if (value) {
            if (Array.isArray(value) && value.length > 0) {
              // For checkbox fields
              sectionSigns.push(`${field.label}：${value.join('、')}`);
            } else if (typeof value === 'string' && value.trim() !== '') {
              // For radio and input fields
              sectionSigns.push(`${field.label}：${value}`);
            }
          }
        });
        if (sectionSigns.length > 0) {
          signs.push(`【${section.title}】${sectionSigns.join('，')}`);
        }
      });

      const tcmSignsText = signs.length > 0 ? signs.join('\n') : '未填写详细四诊信息';
      console.log('[TCM Debug] Collected TCM Signs:', tcmSignsText);

      const userPrompt = PROMPTS.consultation.tcmDiagnosisRecommendation.buildUserPrompt({
        patientName: patientPromptProfile.value.patientName,
        gender: patientPromptProfile.value.gender,
        age: patientPromptProfile.value.age,
        chiefComplaint: generatedRecord.value.chiefComplaint,
        historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness,
        tcmSigns: tcmSignsText
      });

      console.log('[TCM Debug] User Prompt:', userPrompt);

      console.timeEnd('[AI分析] 1. 构建提示词');
      console.time('[AI分析] 2. LLM 请求 (中医)');

      fullResponse = await chat([
        {
          role: 'system',
          content: PROMPTS.consultation.tcmDiagnosisRecommendation.system
        },
        {
          role: 'user',
          content: userPrompt
        }
      ], undefined, undefined, undefined, buildConsultationTraceConfig(
        'generate_tcm_diagnosis_recommendation',
        '生成中医诊断推荐',
        'consultation-diagnosis-tcm'
      ));

      console.log('[TCM Debug] LLM Response:', fullResponse);
      console.timeEnd('[AI分析] 2. LLM 请求 (中医)');
    } else {
      // Western Medicine Logic (Existing)
      const userPrompt = PROMPTS.consultation.diagnosisRecommendation.buildUserPrompt({
        patientName: patientPromptProfile.value.patientName,
        gender: patientPromptProfile.value.gender,
        age: patientPromptProfile.value.age,
        chiefComplaint: generatedRecord.value.chiefComplaint,
        historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness
      });
      
      console.timeEnd('[AI分析] 1. 构建提示词');
      console.time('[AI分析] 2. LLM 请求 (西医)');

      fullResponse = await chat([
        {
          role: 'system',
          content: PROMPTS.consultation.diagnosisRecommendation.system
        },
        {
          role: 'user',
          content: userPrompt
        }
      ], undefined, undefined, undefined, buildConsultationTraceConfig(
        'generate_diagnosis_recommendation',
        '生成西医诊断推荐',
        'consultation-diagnosis'
      ));
      console.timeEnd('[AI分析] 2. LLM 请求 (西医)');
    }
    const latencyMs = Date.now() - startTime;

    console.time('[AI分析] 3. 解析数据和匹配标准词典');
    console.log('[TCM Debug] Parsing LLM response...');
    // Clean up response if it contains markdown code blocks
    let diagnoses: Diagnosis[] = parseLLMJson(fullResponse);
    console.log('[TCM Debug] Parsed diagnoses:', diagnoses);

    // Match against local catalog to get system ID
    if (consultationMode.value !== 'tcm') {
      // Western medicine diagnosis matching
      diagnoses = diagnoses.map(d => {
        // 1. Try matching by code first (Highest priority)
        let matched = medicalDataService.matchDiagnosis(d.code);

        // 2. If no code match, try matching by name
        if (!matched) {
          matched = medicalDataService.matchDiagnosis(d.name);
        }

        if (matched) {
          return {
            ...d,
            id: matched.id,
            code: matched.code, // Use local standard code (e.g. R50.9 -> R50.900)
            name: matched.name  // Use local standard name
          };
        }

        return {
          ...d,
          id: undefined
        };
      });
    } else {
      // TCM diagnosis matching
      diagnoses = diagnoses.map((d, index) => {
        // Try matching disease by code first
        let matched = medicalDataService.matchTCMDiagnosis(d.code);

        // If no code match, try matching by name
        if (!matched) {
          matched = medicalDataService.matchTCMDiagnosis(d.name);
        }

        const result: any = {
          ...d,
          isTCM: true // 标记为中医诊断
        };

        if (matched) {
          result.id = matched.id;
          result.code = matched.code; // Use local standard code
          result.name = matched.name; // Use local standard name
        } else {
          // No match found - keep original data but add pseudo-code for tracking
          result.code = d.code || `TCM${String(index + 1).padStart(3, '0')}`;
          result.id = undefined;
        }

        // Match TCM syndrome (证候)
        if (d.syndrome) {
          const syndromeMatch = medicalDataService.matchTCMSyndrome(d.syndrome);
          if (syndromeMatch) {
            result.syndrome = syndromeMatch.name;
            result.syndromeCode = syndromeMatch.code;
            result.syndromeMatched = true;
          } else {
            result.syndrome = d.syndrome;
            result.syndromeMatched = false;
          }
        }

        // Match TCM treatment (治法)
        if (d.treatment) {
          const treatmentMatch = medicalDataService.matchTCMTreatment(d.treatment);
          if (treatmentMatch) {
            result.treatment = treatmentMatch.name;
            result.treatmentCode = treatmentMatch.code;
            result.treatmentMatched = true;
          } else {
            result.treatment = d.treatment;
            result.treatmentMatched = false;
          }
        }

        return result;
      });
    }

    // Sort by rate descending
    diagnoses.sort((a, b) => {
      const rateA = parseFloat(a.rate.replace('%', '')) || 0;
      const rateB = parseFloat(b.rate.replace('%', '')) || 0;
      return rateB - rateA;
    });

    // Generate unique IDs for each diagnosis (to handle duplicates with same code but different syndromes)
    // For TCM: Even if matched to same disease, different syndromes should have unique IDs
    const timestamp = Date.now();
    diagnoses = diagnoses.map((d, index) => {
      // For TCM diagnoses with same disease but different syndrome/treatment, generate unique composite ID
      if (d.isTCM && d.id) {
        const syndromeCode = d.syndromeCode || d.syndrome || '';
        const treatmentCode = d.treatmentCode || d.treatment || '';
        return {
          ...d,
          id: `${d.id}_${syndromeCode}_${treatmentCode}_${index}`.replace(/\s+/g, '_')
        };
      }
      return {
        ...d,
        id: d.id || `diag_${timestamp}_${index}`
      };
    });

    aiDiagnoses.value = diagnoses;

    console.timeEnd('[AI分析] 3. 解析数据和匹配标准词典');
    console.time('[AI分析] 4. 分支逻辑 (文献检索、持久化和事实核查)');

    // Search knowledge base for related medical literature
    searchKnowledgeBaseForDiagnoses(diagnoses);

    // Save diagnosis recommendations to database
    try {
      for (const diagnosis of diagnoses) {
        const recommendationId = await feedbackService.saveRecommendation({
          recType: 'diagnosis',
          content: JSON.stringify(diagnosis),
          matched: !!diagnosis.id,
          matchConfidence: diagnosis.id ? 1.0 : 0.0,
          latencyMs,
        });
        registerExternalRecommendationTarget({
          recommendationKey: getDiagnosisFeedbackKey(diagnosis),
          targetId: recommendationId,
          targetType: 'diagnosis',
          recommendationType: 'diagnosis',
        });
      }

      // Record performance metric
      await feedbackService.recordMetric({
        metricType: 'llm_latency',
        metricValue: latencyMs,
        unit: 'ms',
        context: { operation: 'diagnosis_recommendation' }
      });
    } catch (err) {
      console.error('[ConsultationPage] Failed to save diagnosis recommendations:', err);
    }

    // Perform automatic fact checking on all diagnoses
    performDiagnosisFactCheck(diagnoses);
    
    console.timeEnd('[AI分析] 4. 分支逻辑 (文献检索、持久化和事实核查)');
    console.log(`========== AI 辅助诊断完成，总耗时: ${Date.now() - startTime}ms ==========`);
  } catch (e) {
    console.error("Failed to fetch AI diagnosis", e);
    trackError('ai_diagnosis_failed', e);
    aiError.value = "无法获取诊断建议，请稍后重试或检查网络。";
  } finally {
    aiLoading.value = false;
  }
};

// Helper function to deduplicate issues
const deduplicateIssues = (issues: FactCheckIssue[]): FactCheckIssue[] => {
  const seen = new Set<string>();
  return issues.filter(issue => {
    // Create a unique key based on content and issue description
    const key = `${issue.content || ''}-${issue.issue}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const performDiagnosisFactCheck = async (diagnoses: Diagnosis[]) => {
  if (!diagnoses || diagnoses.length === 0) return;
  if (!isReviewerEnabled()) return;

  showFactCheckWidget.value = true;
  factCheckWidgetStatus.value = 'checking';
  factCheckTotalCount.value = diagnoses.length;
  factCheckCheckedCount.value = 0;
  factCheckProgress.value = 0;

  diagnosisFactChecks.value.clear();

  const allIssues: FactCheckIssue[] = [];

  for (let i = 0; i < diagnoses.length; i++) {
    const diagnosis = diagnoses[i];

    try {
      const result = diagnosis.isTCM
        ? await checkTCMDiagnosis({
            diagnosis:
              diagnosis.syndrome && diagnosis.syndrome.trim().length > 0
                ? `${diagnosis.name}-${diagnosis.syndrome}`
                : diagnosis.name,
            chiefComplaint: generatedRecord.value.chiefComplaint,
            historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness,
            tcmFourExaminations: generatedRecord.value.tcmFourExaminations,
          })
        : await checkDiagnosis({
            diagnosis: diagnosis.name,
            chiefComplaint: generatedRecord.value.chiefComplaint,
            historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness,
          });

      diagnosisFactChecks.value.set(diagnosis.code, result);

      if (result.hasIssues && Array.isArray(result.issues)) {
        allIssues.push(...result.issues);
      }

      factCheckCheckedCount.value = i + 1;
      factCheckProgress.value = Math.round(((i + 1) / diagnoses.length) * 100);
    } catch (e) {
      console.error(`Failed to fact check diagnosis: ${diagnosis.name}`, e);
    }
  }

  factCheckWidgetIssues.value = deduplicateIssues([
    ...factCheckWidgetIssues.value,
    ...allIssues,
  ]);
  factCheckWidgetStatus.value = 'completed';
};

const performTreatmentFactCheck = async (treatments: TreatmentRecommendation[]) => {
  if (!treatments || treatments.length === 0) return;
  if (!isReviewerEnabled()) return;

  // Show widget in checking state
  showFactCheckWidget.value = true;
  factCheckWidgetStatus.value = 'checking';
  factCheckTotalCount.value = treatments.length;
  factCheckCheckedCount.value = 0;
  factCheckProgress.value = 0;

  treatmentFactChecks.value.clear();
  factCheckWidgetIssues.value = [];

  const allIssues: FactCheckIssue[] = [];

  for (let i = 0; i < treatments.length; i++) {
    const treatment = treatments[i];
    try {
      let result: FactCheckResult;

      if (treatment.type === 'medicine') {
        if (consultationMode.value === 'tcm') {
          // Use TCM medicine checker
          result = await checkTCMMedicine({
            medicineName: treatment.name,
            ingredients: treatment.ingredients,
            usage: treatment.usage,
            diagnosis: selectedDiagnosis.value?.name
          });
        } else {
          // Use Western medicine checker
          result = await checkMedicine({
            medicineName: treatment.name,
            dosage: treatment.usage,
            diagnosis: selectedDiagnosis.value?.name
          });
        }
      } else {
        // For exams and other types, use examination checker
        result = await checkExamination({
          examinationName: treatment.name,
          diagnosis: selectedDiagnosis.value?.name
        });
      }

      treatmentFactChecks.value.set(treatment.name, result);

      if (result.hasIssues && Array.isArray(result.issues)) {
        allIssues.push(...result.issues);
      }

      // Update progress
      factCheckCheckedCount.value = i + 1;
      factCheckProgress.value = Math.round(((i + 1) / treatments.length) * 100);
    } catch (e) {
      console.error(`Failed to fact check treatment: ${treatment.name}`, e);
    }
  }

  // Deduplicate and update issues
  factCheckWidgetIssues.value = deduplicateIssues(allIssues);

  // Update widget to completed state
  factCheckWidgetStatus.value = 'completed';
};

const getIssueForDiagnosis = (diagCode: string): FactCheckIssue | undefined => {
  const check = diagnosisFactChecks.value.get(diagCode);
  if (!check || !check.hasIssues || check.issues.length === 0) return undefined;
  return check.issues[0]; // Return first issue
};

const getIssueForTreatment = (treatmentName: string): FactCheckIssue | undefined => {
  const check = treatmentFactChecks.value.get(treatmentName);
  if (!check || !check.hasIssues || check.issues.length === 0) return undefined;
  return check.issues[0]; // Return first issue
};

const openRelatedId = ref<string | null>(null);
const inlineRelatedDiagnoses = ref<DiagnosisItem[]>([]);

const toggleRelatedDropdown = (diag: Diagnosis, event?: Event) => {
  if (!event) return;
  event.stopPropagation();

  if (openRelatedId.value === diag.id) {
    openRelatedId.value = null;
  } else {
    // Fallback to code if id is undefined to satisfy string | null type
    openRelatedId.value = diag.id || diag.code;
    // 根据诊断类型选择合适的方法
    const related = diag.isTCM
      ? medicalDataService.getRelatedTCMDiagnoses(diag.code)
      : medicalDataService.getRelatedDiagnoses(diag.code);
    inlineRelatedDiagnoses.value = related.filter(d => d.code !== diag.code);
  }
};

const swapDiagnosis = (originalDiag: Diagnosis, newItem: { id?: string; code: string; name: string }) => {
  trackRecommendationAction('diagnosis', originalDiag.id || originalDiag.code, 'modified', {
    originalValue: originalDiag.name,
    modifiedValue: newItem.name,
  });
  // Update aiDiagnoses list
  const index = aiDiagnoses.value.findIndex(d => d.id === originalDiag.id);
  if (index !== -1) {
    const updatedDiag: Diagnosis = {
      ...aiDiagnoses.value[index],
      id: newItem.id,
      code: newItem.code,
      name: newItem.name
    };
    aiDiagnoses.value[index] = updatedDiag;

    // If this was the selected diagnosis, update selection too
    if (selectedDiagnosis.value?.id === originalDiag.id) {
      selectedDiagnosis.value = updatedDiag;
      // We don't automatically trigger treatment fetch here to avoid "unnecessary triggering" as requested.
      // User can click the row again if they want to refresh treatments.
      // But if they just swapped it, the row is still "active" visually.
      // If the code changed, the treatments might be invalid.
      // Ideally, we should probably refresh treatments if it IS selected.
      // But user said "avoid unnecessary triggering". Maybe they mean "don't trigger IF NOT selected".
      // If it IS selected, we probably SHOULD trigger.
      // But let's stick to minimal side effects first.
    }
  }
  
  openRelatedId.value = null;
};


const fetchDiagnosisChecklist = async (diag: Diagnosis) => {
  isChecklistLoading.value = true;
  checklistItems.value = [];
  checklistNotes.value = '';
  activeChecklistDiagnosis.value = diag;
  
  try {
    const userPrompt = PROMPTS.consultation.diagnosisChecklist.buildUserPrompt({
      diagnosisName: diag.name,
      chiefComplaint: generatedRecord.value.chiefComplaint,
      historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness
    });

    const response = await chat([
      { role: 'system', content: PROMPTS.consultation.diagnosisChecklist.system },
      { role: 'user', content: userPrompt }
    ], undefined, undefined, undefined, buildConsultationTraceConfig(
      'generate_diagnosis_checklist',
      '生成鉴别排查建议',
      'consultation-diagnosis-checklist'
    ));

    const result = parseLLMJson(response);
    
    if (result && result.isNeeded && Array.isArray(result.items) && result.items.length > 0) {
      checklistItems.value = result.items.map((item: any) => ({ 
        question: item.question, 
        recordText: item.recordText, 
        checked: false 
      }));
      // Do not auto-open. Show the inline '鉴别排查' button.
    }
  } catch (error) {
    console.error("Failed to fetch diagnosis checklist:", error);
  } finally {
    isChecklistLoading.value = false;
  }
};

// @ts-ignore: kept for future use (currently commented out in template)
const _handleChecklistConfirm = () => {
  const checkedQuestions = checklistItems.value
    .filter(i => i.checked)
    .map(i => i.question);

  if (checkedQuestions.length === 0 && !checklistNotes.value) {
    showChecklistModal.value = false;
    return;
  }

  feedbackService.logOperation({
    module: 'consultation',
    action: 'confirm_differential_checklist',
    title: '确认鉴别排查',
    sourceModule: 'consultation_checklist',
    scene: 'consultation-diagnosis-checklist',
    operationType: 'form_submit',
    operationName: 'confirm_differential_checklist',
    details: {
      consultationId: resolveConsultationId(),
      diagnosisName: activeChecklistDiagnosis.value?.name,
      checkedQuestions,
      notes: checklistNotes.value,
    },
    success: true,
  });
  showToast("鉴别排查已记录，未改写现病史", "success");

  showChecklistModal.value = false;
  checklistItems.value = []; // Hide button after confirmation
  checklistNotes.value = '';
};

const handleDiagnosisSelect = (diag: Diagnosis) => {
  trackClick('diagnosis_select', { diagnosisName: diag.name, diagnosisCode: diag.code, hasId: !!diag.id });
  selectedDiagnosis.value = diag;
  
  // Asynchronously trigger checklist generation
  if (diag.name) {
    fetchDiagnosisChecklist(diag);
  }

  if (diag.code) {
    // 根据诊断类型选择合适的方法
    const related = diag.isTCM
      ? medicalDataService.getRelatedTCMDiagnoses(diag.code)
      : medicalDataService.getRelatedDiagnoses(diag.code);
    relatedDiagnoses.value = related.filter(d => d.code !== diag.code);
  } else {
    relatedDiagnoses.value = [];
  }
  isRelatedOpen.value = false;
};

const fetchTreatmentRecommendation = async () => {
  if (!selectedDiagnosis.value) return;

  treatmentLoading.value = true;
  treatmentError.value = null;
  treatmentRecommendations.value = [];
  try {
    const startTime = Date.now();
    let fullResponse = "";

    if (consultationMode.value === 'tcm') {
      const userPrompt = PROMPTS.consultation.tcmTreatmentRecommendation.buildUserPrompt({
        patientName: patientPromptProfile.value.patientName,
        gender: patientPromptProfile.value.gender,
        age: patientPromptProfile.value.age,
        diagnosisName: selectedDiagnosis.value.name,
        chiefComplaint: generatedRecord.value.chiefComplaint
      });

      fullResponse = await chat([
        { role: 'system', content: PROMPTS.consultation.tcmTreatmentRecommendation.system },
        { role: 'user', content: userPrompt }
      ], undefined, undefined, undefined, buildConsultationTraceConfig(
        'generate_tcm_treatment_recommendation',
        '生成中医治疗推荐',
        'consultation-treatment-tcm'
      ));
    } else {
      const userPrompt = PROMPTS.consultation.treatmentRecommendation.buildUserPrompt({
        patientName: patientPromptProfile.value.patientName,
        gender: patientPromptProfile.value.gender,
        age: patientPromptProfile.value.age,
        diagnosisName: selectedDiagnosis.value.name,
        diagnosisCode: selectedDiagnosis.value.code || '',
        chiefComplaint: generatedRecord.value.chiefComplaint
      });

      fullResponse = await chat([
        { role: 'system', content: PROMPTS.consultation.treatmentRecommendation.system },
        { role: 'user', content: userPrompt }
      ], undefined, undefined, undefined, buildConsultationTraceConfig(
        'generate_treatment_recommendation',
        '生成用药推荐',
        'consultation-treatment-medication'
      ));
    }
    const latencyMs = Date.now() - startTime;
    const rawRecommendations: any[] = parseLLMJson(fullResponse);

    const processedRecs: TreatmentRecommendation[] = rawRecommendations
      .filter(rec => !rec.type || rec.type === 'medicine')
      .map((rec) => {
        const assessment = assessTreatmentCatalogMatch('medicine', rec.name, Array.isArray(rec.aliases) ? rec.aliases : undefined, rec.spec);
        return normalizeTreatmentRecommendation({
          ...rec,
          type: 'medicine' as const,
          matchedItem: assessment.matchedItem,
          suggestedMatchItem: assessment.suggestedMatchItem,
          matchStatus: assessment.matchStatus,
          selected: false,
        });
      });

    treatmentRecommendations.value = processedRecs;

    try {
      for (const rec of processedRecs) {
        const recommendationId = await feedbackService.saveRecommendation({
          recType: 'medication',
          content: JSON.stringify(rec),
          matched: !!rec.matchedItem,
          matchConfidence: rec.matchedItem ? 1.0 : 0.0,
          latencyMs,
        });
        registerExternalRecommendationTarget({
          recommendationKey: getTreatmentFeedbackKey(rec),
          targetId: recommendationId,
          targetType: 'medication',
          recommendationType: 'medication',
        });
      }
      await feedbackService.recordMetric({
        metricType: 'llm_latency',
        metricValue: latencyMs,
        unit: 'ms',
        context: { operation: 'treatment_recommendation' }
      });
    } catch (err) {
      console.error('[ConsultationPage] Failed to save medication recommendations:', err);
    }

    performTreatmentFactCheck(processedRecs);
  } catch (e) {
    console.error("Failed to fetch medication recommendations", e);
    trackError('treatment_recommendation_failed', e);
    treatmentError.value = "无法获取用药方案建议。";
  } finally {
    treatmentLoading.value = false;
  }
};

const fetchExamRecommendation = async () => {
  if (!selectedDiagnosis.value || consultationMode.value === 'tcm') return;

  examLoading.value = true;
  examError.value = null;
  examRecommendations.value = [];

  try {
    const startTime = Date.now();
    const userPrompt = PROMPTS.consultation.examinationRecommendation.buildUserPrompt({
      patientName: patientPromptProfile.value.patientName,
      gender: patientPromptProfile.value.gender,
      age: patientPromptProfile.value.age,
      diagnosisName: selectedDiagnosis.value.name,
      diagnosisCode: selectedDiagnosis.value.code || '',
      chiefComplaint: generatedRecord.value.chiefComplaint
    });

    const fullResponse = await chat([
      { role: 'system', content: PROMPTS.consultation.examinationRecommendation.system },
      { role: 'user', content: userPrompt }
    ], undefined, undefined, undefined, buildConsultationTraceConfig(
      'generate_examination_recommendation',
      '生成检查推荐',
      'consultation-treatment-examination'
    ));
    const latencyMs = Date.now() - startTime;
    const rawRecommendations: any[] = parseLLMJson(fullResponse);
    console.log('[检查推荐] LLM raw count:', rawRecommendations.length, rawRecommendations.map(r => ({ name: r.name, type: r.type })));

    const processedRecs: TreatmentRecommendation[] = rawRecommendations
      .filter(rec => !rec.type || rec.type === 'exam')
      .map((rec) => {
        const assessment = assessTreatmentCatalogMatch('exam', rec.name, Array.isArray(rec.aliases) ? rec.aliases : undefined);
        return normalizeTreatmentRecommendation({
          ...rec,
          type: 'exam' as const,
          matchedItem: assessment.matchedItem,
          suggestedMatchItem: assessment.suggestedMatchItem,
          matchStatus: assessment.matchStatus,
          selected: false,
        });
      });

    examRecommendations.value = processedRecs;

    try {
      for (const rec of processedRecs) {
        const recommendationId = await feedbackService.saveRecommendation({
          recType: 'examination',
          content: JSON.stringify(rec),
          matched: !!rec.matchedItem,
          matchConfidence: rec.matchedItem ? 1.0 : 0.0,
          latencyMs,
        });
        registerExternalRecommendationTarget({
          recommendationKey: getTreatmentFeedbackKey(rec),
          targetId: recommendationId,
          targetType: 'examination',
          recommendationType: 'examination',
        });
      }
    } catch (err) {
      console.error('[ConsultationPage] Failed to save exam recommendations:', err);
    }
  } catch (e) {
    console.error("Failed to fetch exam recommendations", e);
    examError.value = "无法获取检查推荐。";
  } finally {
    examLoading.value = false;
  }
};

const fetchLabTestRecommendation = async () => {
  if (!selectedDiagnosis.value || consultationMode.value === 'tcm') return;

  labTestLoading.value = true;
  labTestError.value = null;
  labTestRecommendations.value = [];

  try {
    const startTime = Date.now();
    const userPrompt = PROMPTS.consultation.labTestRecommendation.buildUserPrompt({
      patientName: patientPromptProfile.value.patientName,
      gender: patientPromptProfile.value.gender,
      age: patientPromptProfile.value.age,
      diagnosisName: selectedDiagnosis.value.name,
      diagnosisCode: selectedDiagnosis.value.code || '',
      chiefComplaint: generatedRecord.value.chiefComplaint
    });

    const fullResponse = await chat([
      { role: 'system', content: PROMPTS.consultation.labTestRecommendation.system },
      { role: 'user', content: userPrompt }
    ], undefined, undefined, undefined, buildConsultationTraceConfig(
      'generate_lab_test_recommendation',
      '生成检验推荐',
      'consultation-treatment-lab-test'
    ));
    const latencyMs = Date.now() - startTime;
    const rawRecommendations: any[] = parseLLMJson(fullResponse);
    console.log('[检验推荐] LLM raw count:', rawRecommendations.length, rawRecommendations.map(r => ({ name: r.name, type: r.type })));

    const processedRecs: TreatmentRecommendation[] = rawRecommendations
      .filter(rec => !rec.type || rec.type === 'lab_test')
      .map((rec) => {
        const assessment = assessTreatmentCatalogMatch('lab_test', rec.name, Array.isArray(rec.aliases) ? rec.aliases : undefined);
        return normalizeTreatmentRecommendation({
          ...rec,
          type: 'lab_test' as const,
          matchedItem: assessment.matchedItem,
          suggestedMatchItem: assessment.suggestedMatchItem,
          matchStatus: assessment.matchStatus,
          selected: false,
        });
      });

    labTestRecommendations.value = processedRecs;

    try {
      for (const rec of processedRecs) {
        const recommendationId = await feedbackService.saveRecommendation({
          recType: 'lab_test',
          content: JSON.stringify(rec),
          matched: !!rec.matchedItem,
          matchConfidence: rec.matchedItem ? 1.0 : 0.0,
          latencyMs,
        });
        registerExternalRecommendationTarget({
          recommendationKey: getTreatmentFeedbackKey(rec),
          targetId: recommendationId,
          targetType: 'lab_test',
          recommendationType: 'lab_test',
        });
      }
    } catch (err) {
      console.error('[ConsultationPage] Failed to save lab test recommendations:', err);
    }
  } catch (e) {
    console.error("Failed to fetch lab test recommendations", e);
    labTestError.value = "无法获取检验推荐。";
  } finally {
    labTestLoading.value = false;
  }
};

const fetchProcedureRecommendation = async () => {
  if (!selectedDiagnosis.value || consultationMode.value === 'tcm') return;

  procedureLoading.value = true;
  procedureError.value = null;
  procedureRecommendations.value = [];

  try {
    const startTime = Date.now();
    const userPrompt = PROMPTS.consultation.procedureRecommendation.buildUserPrompt({
      patientName: patientPromptProfile.value.patientName,
      gender: patientPromptProfile.value.gender,
      age: patientPromptProfile.value.age,
      diagnosisName: selectedDiagnosis.value.name,
      diagnosisCode: selectedDiagnosis.value.code || '',
      chiefComplaint: generatedRecord.value.chiefComplaint
    });

    const fullResponse = await chat([
      { role: 'system', content: PROMPTS.consultation.procedureRecommendation.system },
      { role: 'user', content: userPrompt }
    ], undefined, undefined, undefined, buildConsultationTraceConfig(
      'generate_procedure_recommendation',
      '生成处置推荐',
      'consultation-treatment-procedure'
    ));
    const latencyMs = Date.now() - startTime;
    const rawRecommendations: any[] = parseLLMJson(fullResponse);
    console.log('[处置推荐] LLM raw count:', rawRecommendations.length, rawRecommendations.map(r => ({ name: r.name, type: r.type })));
    
    // Debug toast to see exactly what came back
    showToast(`[调试-处置返回] 共 ${rawRecommendations.length} 项: ${rawRecommendations.map(r => r.name).join(', ')}`, 'info');

    const processedRecs: TreatmentRecommendation[] = rawRecommendations
      .filter(rec => !rec.type || rec.type === 'procedure')
      .map((rec) => {
        const assessment = assessTreatmentCatalogMatch('procedure', rec.name, Array.isArray(rec.aliases) ? rec.aliases : undefined);
        return normalizeTreatmentRecommendation({
          ...rec,
          type: 'procedure' as const,
          matchedItem: assessment.matchedItem,
          suggestedMatchItem: assessment.suggestedMatchItem,
          matchStatus: assessment.matchStatus,
          selected: false,
        });
      });

    procedureRecommendations.value = processedRecs;

    try {
      for (const rec of processedRecs) {
        const recommendationId = await feedbackService.saveRecommendation({
          recType: 'procedure',
          content: JSON.stringify(rec),
          matched: !!rec.matchedItem,
          matchConfidence: rec.matchedItem ? 1.0 : 0.0,
          latencyMs,
        });
        registerExternalRecommendationTarget({
          recommendationKey: getTreatmentFeedbackKey(rec),
          targetId: recommendationId,
          targetType: 'procedure',
          recommendationType: 'procedure',
        });
      }
    } catch (err) {
      console.error('[ConsultationPage] Failed to save procedure recommendations:', err);
    }
  } catch (e) {
    console.error("Failed to fetch procedure recommendations", e);
    procedureError.value = "无法获取处置推荐。";
  } finally {
    procedureLoading.value = false;
  }
};

/** 并行触发所有四路推荐 */
const fetchAllRecommendations = async () => {
  await ensureTreatmentDictionaryStateReady();
  await Promise.all([
    fetchTreatmentRecommendation(),
    fetchExamRecommendation(),
    fetchLabTestRecommendation(),
    fetchProcedureRecommendation(),
  ]);
  syncTreatmentExecDeptSelections();
  submitSmartGeneratedUserLog();
};

const toggleTreatmentSelection = async (item: TreatmentRecommendation) => {
  if (!item) return;

  const nextSelected = !item.selected;
  if (nextSelected) {
    if (!treatmentGates.hasRequiredPharmacy(item)) {
      showToast('请先选择发药药房后再勾选该药品', 'info');
      return;
    }
    if (!treatmentGates.hasRequiredExecDept(item)) {
      showToast('请先设置执行科室后再勾选该项目', 'info');
      return;
    }
    // 药品：先在候选药房中轮询拉取详情；任一药房返回有效详情即应用并通过
    if (item.type === 'medicine' && !(await treatmentHydration.ensureMedicineSelectable(item, true))) {
      return;
    }
    // 药品：库存校验失败则保留 warning 并阻止勾选
    if (item.type === 'medicine' && !(await treatmentHydration.checkMedicineInventoryEnough(item, true))) {
      return;
    }
  } else {
    treatmentHydration.clearMedicineInventoryWarning(item);
  }

  item.selected = nextSelected;

  // 勾选后按 HIS 默认值重新归一化（用法/频次/总量等可能因详情拉取而更新）
  if (item.selected && item.type === 'medicine') {
    Object.assign(item, normalizeTreatmentRecommendation(item));
  }

  trackClick('treatment_toggle', {
    treatmentName: item.name,
    type: item.type,
    selected: item.selected,
  });
};

// === 发药药房 / 执行科室 chip 选择器 ===
function getPharmacyChipOptions(rec: TreatmentRecommendation): AttrOption[] {
  return treatmentGates.pharmacyCandidatesFor(rec).map((pharmacy) => ({
    key: (pharmacy.idSto || '').trim(),
    text: pharmacy.name || pharmacy.idSto || '',
    meta: pharmacy.idSto || '',
  }));
}

function getExecDeptChipOptions(): AttrOption[] {
  return treatmentGates.execDeptCandidates.value.map((option) => ({
    key: option.key,
    text: option.text,
    meta: option.key !== option.text ? option.key : '',
  }));
}

function onPharmacySelect(rec: TreatmentRecommendation, option: AttrOption): void {
  if ((rec.pharmacy || '').trim() === option.text) return;
  rec.pharmacy = option.text;
  // 切换药房后既有的库存告警与详情缓存已失效；强制下次 toggle 时重新轮询。
  treatmentHydration.clearMedicineInventoryWarning(rec);
  const raw = getMatchedItemRaw(rec);
  if (raw && (raw as Record<string, unknown>).__medicineDetailLoaded === true) {
    rec.matchedItem = {
      ...(rec.matchedItem as any),
      raw: { ...raw, __medicineDetailLoaded: false },
    };
  }
  // 已勾选药品改了药房，需要先取消勾选避免 stale 状态
  if (rec.selected) rec.selected = false;
  showToast(`${rec.name} 发药药房已设置为 ${option.text}`, 'success');
}

function onExecDeptSelect(rec: TreatmentRecommendation, option: AttrOption): void {
  rec.execDept = option.key;
  showToast(`${rec.name} 执行科室已设置为 ${option.text}`, 'success');
}

// 药品 hydration / 库存状态：在 chip 上展示"检测中"或"库存不足"标签（持久化，便于医生定位）
function getMedicineHydrationStatus(rec: TreatmentRecommendation): { kind: 'checking' | 'warning'; message?: string } | null {
  if (rec.type !== 'medicine') return null;
  if (treatmentHydration.isMedicineInventoryChecking(rec)) {
    return { kind: 'checking', message: '正在校验药品详情与库存…' };
  }
  const warning = treatmentHydration.getMedicineInventoryWarning(rec);
  if (warning) return { kind: 'warning', message: warning };
  return null;
}

// === 手动匹配（标准库候选）===
function getManualMatchKey(rec: TreatmentRecommendation): string {
  return `manual-match:${rec.type}:${rec.name}`;
}

function getManualMatchKeyword(rec: TreatmentRecommendation): string {
  const cached = manualMatchKeywords.value[getManualMatchKey(rec)];
  return typeof cached === 'string' ? cached : rec.name;
}

function setManualMatchKeyword(rec: TreatmentRecommendation, value: string): void {
  manualMatchKeywords.value = {
    ...manualMatchKeywords.value,
    [getManualMatchKey(rec)]: value,
  };
}

function isManualMatchOpen(rec: TreatmentRecommendation): boolean {
  return activeManualMatchKey.value === getManualMatchKey(rec);
}

function toggleManualMatch(rec: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  const key = getManualMatchKey(rec);
  const isOpening = activeManualMatchKey.value !== key;
  activeManualMatchKey.value = isOpening ? key : null;
  if (isOpening) {
    setManualMatchKeyword(rec, getManualMatchKeyword(rec) || rec.name);
  }
}

function getManualMatchPickerCandidates(rec: TreatmentRecommendation): ManualMatchCandidate[] {
  const query = getManualMatchKeyword(rec).trim();
  if (!query) {
    return [];
  }

  let raw: Array<{ id: string; name: string; spec?: string; code?: string }> = [];
  switch (rec.type) {
    case 'medicine':
      raw = medicalDataService.searchMedicines(query, undefined, 8);
      break;
    case 'exam':
      raw = medicalDataService.searchExamItems(query, undefined, 8);
      break;
    case 'lab_test':
      raw = medicalDataService.searchLabTestItems(query, undefined, 8);
      break;
    case 'procedure':
      raw = medicalDataService.searchProcedureItems(query, undefined, 8);
      break;
    default:
      raw = [];
  }

  return raw.map((item) => ({
    id: item.id,
    name: item.name,
    meta: item.spec || item.code || '',
  }));
}

function applyManualMatchSelection(rec: TreatmentRecommendation, candidate: ManualMatchCandidate): void {
  const query = getManualMatchKeyword(rec).trim();
  let pickedRaw: any = null;
  switch (rec.type) {
    case 'medicine':
      pickedRaw = medicalDataService.searchMedicines(query, undefined, 8).find((item) => item.id === candidate.id);
      break;
    case 'exam':
      pickedRaw = medicalDataService.searchExamItems(query, undefined, 8).find((item) => item.id === candidate.id);
      break;
    case 'lab_test':
      pickedRaw = medicalDataService.searchLabTestItems(query, undefined, 8).find((item) => item.id === candidate.id);
      break;
    case 'procedure':
      pickedRaw = medicalDataService.searchProcedureItems(query, undefined, 8).find((item) => item.id === candidate.id);
      break;
  }

  if (!pickedRaw) {
    return;
  }

  rec.originalName = rec.originalName || rec.name;
  rec.name = pickedRaw.name;
  rec.matchedItem = rec.type === 'medicine'
    ? buildMedicineMatchedItem(pickedRaw as MedicineItem)
    : buildMedicalItemMatchedItem(pickedRaw as MedicalItem);
  if (rec.type === 'medicine' && pickedRaw.spec) {
    rec.spec = pickedRaw.spec;
  }
  rec.manualMatched = true;
  rec.matchStatus = 'manual';
  rec.selected = false;
  rec.suggestedMatchItem = undefined;
  Object.assign(rec, normalizeTreatmentRecommendation(rec));
  activeManualMatchKey.value = null;
  showToast(`${pickedRaw.name} 已完成标准库匹配`, 'success');
}

const ensureAssistRecordContext = (): boolean => {
  prefillGeneratedRecordFromPatient(true);
  if (hasRecordDraft.value) {
    currentView.value = 'record';
    return true;
  }

  currentView.value = 'consultation';
  showToast('当前患者暂无可直接复用的主诉和现病史，已进入症状选择页。', 'info');
  return false;
};

const ensureAssistDiagnosisContext = async (): Promise<boolean> => {
  if (!ensureAssistRecordContext()) {
    return false;
  }

  if (selectedDiagnosis.value || prefillDiagnosisFromPatient(true)) {
    await nextTick();
    return true;
  }

  assistFocus.value = 'diagnosis';
  if (aiDiagnoses.value.length === 0 && !aiLoading.value) {
    await fetchAIDiagnosis();
  }
  showToast('当前缺少主诊断，请先确认诊断。', 'info');
  return false;
};

const handleAssistTrigger = async (kind: AssistAction): Promise<void> => {
  assistFocus.value = kind;

  try {
    switch (kind) {
      case 'record': {
        if (!ensureAssistRecordContext()) {
          return;
        }
        if (aiDiagnoses.value.length === 0 && !aiLoading.value) {
          await fetchAIDiagnosis();
        }
        return;
      }
      case 'diagnosis': {
        if (!ensureAssistRecordContext()) {
          return;
        }
        if (aiDiagnoses.value.length === 0 && !aiLoading.value) {
          await fetchAIDiagnosis();
        }
        return;
      }
      case 'medication': {
        const hasDiagnosis = await ensureAssistDiagnosisContext();
        if (!hasDiagnosis) return;
        await nextTick();
        if (!treatmentLoading.value && treatmentRecommendations.value.length === 0) {
          await fetchTreatmentRecommendation();
        }
        return;
      }
      case 'examination': {
        const hasDiagnosis = await ensureAssistDiagnosisContext();
        if (!hasDiagnosis) return;
        await nextTick();
        if (!examLoading.value && examRecommendations.value.length === 0) {
          await fetchExamRecommendation();
        }
        return;
      }
      case 'lab_test': {
        const hasDiagnosis = await ensureAssistDiagnosisContext();
        if (!hasDiagnosis) return;
        await nextTick();
        if (!labTestLoading.value && labTestRecommendations.value.length === 0) {
          await fetchLabTestRecommendation();
        }
        return;
      }
      case 'procedure': {
        const hasDiagnosis = await ensureAssistDiagnosisContext();
        if (!hasDiagnosis) return;
        await nextTick();
        if (!procedureLoading.value && procedureRecommendations.value.length === 0) {
          await fetchProcedureRecommendation();
        }
        return;
      }
      case 'differential': {
        const hasDiagnosis = await ensureAssistDiagnosisContext();
        if (!hasDiagnosis || !selectedDiagnosis.value) {
          return;
        }
        await fetchDiagnosisChecklist(selectedDiagnosis.value);
        if (checklistItems.value.length > 0) {
          showChecklistModal.value = true;
        } else {
          showToast('当前诊断暂无待确认的鉴别排查项。', 'info');
        }
        return;
      }
      case 'reminder': {
        if (ensureAssistRecordContext() && aiDiagnoses.value.length === 0 && !aiLoading.value) {
          await fetchAIDiagnosis();
        }
        showToast('风险提醒已同步，可继续处理当前病历。', 'info');
        return;
      }
      default:
        return;
    }
  } finally {
    emit('consume-auto-trigger');
  }
};

// @ts-ignore: kept for future use (currently commented out in template)
const _handleComplete = () => {
  if (!selectedDiagnosis.value) {
    showToast("请先选择一个诊断结果", "info");
    return;
  }

  // Build Final Record
  const selectedTreatments = [
    ...treatmentRecommendations.value,
    ...examRecommendations.value,
    ...labTestRecommendations.value,
    ...procedureRecommendations.value,
  ]
    .filter(t => t.selected)
    .map(t => ({
      type: t.type,
      name: t.name,
      usage: t.usage,
      ingredients: t.ingredients, // Add ingredients
      matchedItem: t.matchedItem,
      reason: t.reason
    }));

  // --- Batch acceptance/rejection tracking ---
  // Diagnosis: selected one is adopted, rest are rejected
  trackRecommendationAction('diagnosis', selectedDiagnosis.value.id || selectedDiagnosis.value.code, 'adopted', {
    originalValue: selectedDiagnosis.value.name,
  });
  aiDiagnoses.value
    .filter(d => d.id !== selectedDiagnosis.value?.id)
    .forEach(d => {
      trackRecommendationAction('diagnosis', d.id || d.code, 'rejected', { originalValue: d.name });
    });

  // Treatments: selected are adopted, unselected are rejected
  treatmentRecommendations.value.forEach(t => {
    const targetType =
      t.type === 'medicine'
        ? 'medication' as const
        : t.type === 'exam'
          ? 'examination' as const
          : null;
    if (!targetType) {
      return;
    }
    if (t.selected) {
      trackRecommendationAction(targetType, t.name, 'adopted', { originalValue: t.name });
    } else {
      trackRecommendationAction(targetType, t.name, 'rejected', { originalValue: t.name });
    }
  });

  trackFormSubmit('generate_final_report', {
    diagnosisName: selectedDiagnosis.value.name,
    selectedTreatmentCount: selectedTreatments.length,
    totalTreatmentCount: treatmentRecommendations.value.length,
    mode: consultationMode.value,
  });

  // Prepare treatment principle for TCM (治则治法)
  let treatmentPrinciple = '';
  if (consultationMode.value === 'tcm' && selectedDiagnosis.value.treatment) {
    treatmentPrinciple = selectedDiagnosis.value.treatment;
  }

  // Generate medical advice (医嘱)
  const medicalAdvice = generateMedicalAdvice();

  finalRecord.value = {
    patient: patientInfo.value,
    record: {
      ...generatedRecord.value,
      pastMedicalHistory:
        readPatientText(
          patientInfo.value as unknown as Record<string, unknown>,
          ['pastMedicalHistory', 'past_medical_history', 'pastMedicalHistoryText']
        ) || '未提供既往病史。',
      allergyHistory: patientInfo.value.allergyHistory || '无'
    },
    diagnosis: selectedDiagnosis.value,
    treatments: selectedTreatments,
    date: new Date().toLocaleDateString(),
    treatmentPrinciple,
    medicalAdvice
  };

  currentView.value = 'final_report';
};

const generateMedicalAdvice = (): string => {
  const advice: string[] = [];

  if (consultationMode.value === 'tcm') {
    // TCM medical advice
    advice.push('1. 按时服药，遵医嘱用药。');
    advice.push('2. 注意休息，避风寒，保持心情舒畅。');
    advice.push('3. 饮食宜清淡，忌辛辣刺激、生冷油腻之品。');
    advice.push('4. 如症状加重或出现新的不适，请及时复诊。');

    // Check if there are Chinese medicine prescriptions (check for ingredients field)
    const hasHerbalMedicine = treatmentRecommendations.value.some(t => t.selected && t.ingredients);
    if (hasHerbalMedicine) {
      advice.push('5. 中药煎服法：先煎20分钟，文火煎煮30分钟，每日1剂，分早晚两次温服。');
    }
  } else {
    // Western medicine advice
    advice.push('1. 按时服药，注意观察药物不良反应。');
    advice.push('2. 多饮水，清淡饮食，注意休息。');
    advice.push('3. 如症状无缓解或加重，请及时复诊。');
  }

  return advice.join('\n');
};

watch(selectedDiagnosis, (newVal) => {
  if (newVal) {
    fetchAllRecommendations();
  } else {
    treatmentRecommendations.value = [];
    examRecommendations.value = [];
    labTestRecommendations.value = [];
    procedureRecommendations.value = [];
  }
});

watch(consultationMode, (newVal, oldVal) => {
  trackClick('consultation_mode_change', { from: oldVal, to: newVal });
});

watch(selectionMode, (newVal) => {
  trackClick('symptom_selection_mode', { mode: newVal });
});

watch(currentView, (newVal, oldVal) => {
  trackViewChange(`consultation:${oldVal}`, `consultation:${newVal}`);
});

watch(
  () => props.assistTrigger?.token,
  async (token) => {
    if (!token || !props.assistTrigger) {
      return;
    }

    await handleAssistTrigger(props.assistTrigger.kind);
  },
  { immediate: true }
);

const generateMedicalRecord = () => {
  const complaints: string[] = [];
  const hpiParts: string[] = [];
  
  // -- Chief Complaint --
  // 使用 textGenConfig 生成主诉，或回退到默认逻辑
  selectedSymptoms.value.forEach(s => {
    const data = formData.value[s.key];
    
    // 从 textGenConfig (包含默认 onsetTime 逻辑) 生成主诉
    // 即使被“跳过条件”全部过滤导致 chiefComplaintTexts 为空，也能确保仅保留症状名，而不触发错误的兜底。
    const chiefComplaintTexts = generateTextsForSymptom(s, data, 'chiefComplaint');
    complaints.push(`${s.name}${chiefComplaintTexts.join('')}`);
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
      if (precipitating === '没有原因') precipitating = '无明显诱因';
    }
  }

  let intro = `患者于${duration}前，${precipitating}出现`;
  const symptomNames = selectedSymptoms.value.map(s => s.name).join('、');
  intro += symptomNames + "。";
  hpiParts.push(intro);

  // Symptom Details - 使用 textGenConfig 生成
  selectedSymptoms.value.forEach(s => {
    const data = formData.value[s.key];
    
    // 生成现病史文本，跳过由于首句播报而不再需要的字段
    const excludeKeys = ['onsetTime'];
    if (s === selectedSymptoms.value[0]) {
      excludeKeys.push('precipitatingFactor');
    }

    const hpiTexts = generateTextsForSymptom(s, data, 'historyOfPresentIllness', excludeKeys);
    if (hpiTexts.length > 0) {
      hpiParts.push(`${s.name}：${hpiTexts.join('，')}。`);
    }
  });

  // General Condition (only in Western mode, not TCM)
  const genData = formData.value['general'];
  let tcmFourExamStr = '';

  // Only add general condition text in Western mode, not in TCM mode
  if (genData && consultationMode.value !== 'tcm') {
    const genParts: string[] = [];

    // Process standard fields first
    ['spirit', 'sleep', 'appetite'].forEach(k => {
      if (genData[k] && !['其他', '不清楚', '不详'].includes(genData[k])) genParts.push(genData[k]);
    });

    // Special handling for urination and stool optimization
    const isUrinationNormal = genData['urination'] === '小便正常';
    const isStoolNormal = genData['stool'] === '大便正常';

    if (isUrinationNormal && isStoolNormal) {
      genParts.push('二便正常');
    } else {
      if (genData['urination'] && !['其他', '不清楚', '不详'].includes(genData['urination'])) genParts.push(genData['urination']);
      if (genData['stool'] && !['其他', '不清楚', '不详'].includes(genData['stool'])) genParts.push(genData['stool']);
    }

    // Process weight
    if (genData['weight'] && !['其他', '不清楚', '不详'].includes(genData['weight'])) genParts.push(genData['weight']);

    if (genParts.length > 0) {
      hpiParts.push(`${genParts.join('，')}。`);
    }
  }

  // TCM Signs
  if (consultationMode.value === 'tcm') {
    const tcmData = formData.value['tcm_signs'];
    if (tcmData) {
      const clean = (str: string) => str ? str.replace(/\(.*?\)/, '') : '';

      // Iterate through all sections in tcmInquiryConfig
      tcmInquiryConfig.config.sections.forEach(section => {
        const sectionSigns: string[] = [];

        section.fields.forEach(field => {
          const value = tcmData[field.storageKey];
          if (value) {
            if (Array.isArray(value) && value.length > 0) {
              // For checkbox fields
              const cleanedValues = value.map(v => clean(v));
              sectionSigns.push(`${field.label}${cleanedValues.join('、')}`);
            } else if (typeof value === 'string' && value.trim() !== '' && !['其他', '不清楚', '不详'].includes(value)) {
              // For radio and input fields
              const cleanedValue = clean(value);
              // For certain fields like tongue and pulse, omit the label if it's redundant
              if (field.key === 'tongue_body' || field.key === 'tongue_shape') {
                sectionSigns.push(`舌${cleanedValue}`);
              } else if (field.key === 'tongue_coating') {
                sectionSigns.push(`苔${cleanedValue}`);
              } else if (field.key === 'coating_quality') {
                sectionSigns.push(`苔质${cleanedValue}`);
              } else if (field.key === 'pulse') {
                sectionSigns.push(`脉${cleanedValue}`);
              } else {
                sectionSigns.push(`${field.label}${cleanedValue}`);
              }
            }
          }
        });

        if (sectionSigns.length > 0) {
          tcmFourExamStr += `${section.title}：${sectionSigns.join('，')}。\n`;
        }
      });
    }
  }

  // 伴随症状（仅勾选、未展开详细问诊的）
  if (companionSymptomNames.value.length > 0) {
    hpiParts.push(`伴${companionSymptomNames.value.join('、')}。`);
  }

  generatedRecord.value = {
    chiefComplaint,
    historyOfPresentIllness: hpiParts.join("\n"),
    tcmFourExaminations: tcmFourExamStr.trim()
  };
};

const copyToClipboard = () => {
  trackClick('copy_to_clipboard');
  const text = `主诉：${generatedRecord.value.chiefComplaint}\n现病史：\n${generatedRecord.value.historyOfPresentIllness}`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制到剪贴板', 'success');
  });
};

const removedSymptomRecordViewSymbols = [
  FactCheckHighlight,
  DiagnosisRecommendationCard,
  TreatmentRecommendationCard,
  TreatmentItemEditor,
  ManualMatchPicker,
  RecAttributeChip,
  medRecordDetails,
  hasProbableMatch,
  getSuggestedMatchName,
  getTreatmentMatchLabel,
  getTreatmentOriginalName,
  confirmSuggestedMatch,
  visibleOtherTreatmentRecommendations,
  anyRecommendationLoading,
  showDiagnosisCard,
  showTreatmentCard,
  currentDiagnosisSummary,
  assistFocusLabel,
  workflowBannerText,
  workflowBannerStyle,
  toggleDiagnosisGroup,
  recommendationSubmittingKey,
  updateRecommendationDraft,
  getTreatmentTagLabel,
  getTreatmentSpec,
  getMedicineInlineSummary,
  getReasonTooltipKey,
  toggleReasonTooltip,
  getRecommendationDraft,
  getRecommendationSubmittedLabel,
  isRecommendationFeedbackOpen,
  toggleRecommendationFeedback,
  handleDiagnosisFeedbackSubmit,
  handleTreatmentFeedbackSubmit,
  getDiagnosisReferenceButtonLabel,
  getDiagRateClass,
  isDiagnosisReferenceDisabled,
  getReferenceStatusLabel,
  getTreatmentReferenceStatus,
  referenceDiagnosisItemToPHIS,
  searchLiterature,
  getIssueForDiagnosis,
  getIssueForTreatment,
  toggleRelatedDropdown,
  swapDiagnosis,
  toggleTreatmentSelection,
  getMedicineHydrationStatus,
  isManualMatchOpen,
  toggleManualMatch,
  getManualMatchPickerCandidates,
  applyManualMatchSelection,
  getPharmacyChipOptions,
  getExecDeptChipOptions,
  onPharmacySelect,
  onExecDeptSelect,
  canSubmitToHIS,
  copyToClipboard,
];

void removedSymptomRecordViewSymbols;



</script>

<style scoped>
.consultation-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-background, #ECFEFF); /* 医疗背景色 */
  color: var(--color-text-strong, #0F172A);
  font-family: var(--font-body);
  font-size: 14px; /* Base font size */
  overflow: hidden;
}

.header-btn {
  padding: 6px 16px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.15);
  border-radius: 18px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  transition: all var(--duration-normal) var(--ease-out);
  font-weight: 500;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.6);
  color: #fff;
}

.header-btn.primary {
  background: #fff;
  color: #2B7FE3;
  border: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  font-weight: 600;
}

.header-btn.primary:hover {
  background: #F0F6FF;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.header-btn.primary:disabled {
  background: rgba(255, 255, 255, 0.5);
  color: rgba(43, 127, 227, 0.5);
  cursor: not-allowed;
  box-shadow: none;
}

/* Sidebar Mode Switch: 西医 / 中医 - vertical tabs on left edge */
.sidebar-mode-switch {
  display: flex;
  flex-direction: column;
  width: 28px;
  flex-shrink: 0;
  background: #FFFFFF;
  border-right: 1px solid #EEF2F6;
  padding-top: 0px;
  gap: 0;
}

.sidebar-switch-btn {
  width: 100%;
  height: 52px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  color: #262626;
  transition: all 0.2s ease;
  font-weight: 500;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
}

.sidebar-switch-btn.active {
  background: #E0EFFF;
  color: #2469F2;
  font-weight: 600;
  /*border-right: 2px solid #2B7FE3;*/
}

/* Consultation Footer */
.consultation-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 16px;
  background: #fff;
  border-top: 1px solid #EEF2F6;
  flex-shrink: 0;
  z-index: 10;
}

.footer-cancel-btn {
  width: 64px;
  height: 32px;
  padding: 5px 14px;
  border: 1px solid #DBDBDB;
  background: #fff;
  border-radius: 4px;
  font-family: Microsoft YaHei, Microsoft YaHei;
  font-weight: 400;
  font-size: 14px;
  color: #262626;
  cursor: pointer;
  transition: all 0.2s ease;
}

.footer-cancel-btn:hover {
  background: #F8FAFC;
  border-color: #CBD5E1;
}

.footer-submit-btn {
  display: inline-flex;
  align-items: center;
  width: 88px;
  height: 32px;
  gap: 6px;
  padding: 5px 16px;
  background: #2469F2;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-family: Microsoft YaHei, Microsoft YaHei;
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.2s ease;
}

.footer-submit-btn:hover:not(:disabled) {
  background: #1A6FD5;
  box-shadow: 0 2px 8px rgba(43, 127, 227, 0.35);
}

.footer-submit-btn:disabled {
  background: rgba(43, 127, 227, 0.45);
  cursor: not-allowed;
  box-shadow: none;
}

.footer-submit-btn .animate-spin {
  animation: spin 0.6s linear infinite;
}

/* Loading 动画样式 */
.header-btn .animate-spin {
  display: inline-block;
  animation: spin 0.6s linear infinite;
  margin-right: var(--space-xs, 4px);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Reduced Motion 支持 */
@media (prefers-reduced-motion: reduce) {
  .header-btn .animate-spin {
    animation: none;
  }
}

.content-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  padding: 14px 0 0 14px;
}

.symptom-sidebar {
  width: 260px;
  background: #fff;
  border-right: 1px solid #EEF2F6;
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  z-index: 5;
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* Selection Mode Tabs */
.selection-tabs {
  display: flex;
  padding: 0;
  gap: 0;
  border-bottom: 1px solid #EEF2F6;
  background: #FAFBFD;
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 9px 0;
  font-size: 13px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  color: #94A3B8;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
  white-space: nowrap;
  text-align: center;
}

.tab-btn:hover {
  color: #2B7FE3;
  background: transparent;
}

.tab-btn.active {
  background: transparent;
  border-bottom-color: #2B7FE3;
  color: #2B7FE3;
  font-weight: 600;
}

/* Selection Content Area */
.selection-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  padding: 0;
}

.symptom-sidebar h3 {
  padding: 12px 16px; /* Reduced padding */
  margin: 0;
  font-size: 14px; /* Adjusted to 14px */
  font-weight: 600;
  color: var(--color-text-primary); /* Dark cyan text */
  border-bottom: 1px solid var(--color-border-light);
  background: transparent;
  flex-shrink: 0;
}

.search-box {
  position: relative;
  padding: 8px 10px;
  border-bottom: none !important;
  background: transparent;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.search-box-svg{
  position: absolute;
  right: 20px;
}

.common-filter-header {
  padding: 0 10px 6px;
  margin-bottom: 2px;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 5px 7px;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
  outline: none;
  background: #F8FAFC;
  transition: all 0.2s ease;
}
.search-input::placeholder{
  font-family: Microsoft YaHei, Microsoft YaHei;
  font-weight: 400;
  font-size: 13px;
  color: #999999;
  line-height: 22px;
  text-align: left;
  font-style: normal;
  text-transform: none;
}

.search-input:focus {
  border-color: #2B7FE3;
  box-shadow: 0 0 0 2px rgba(43, 127, 227, 0.08);
  background: #fff;
}

.symptom-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.symptom-list li {
  padding: 8px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(238, 242, 246, 0.6);
  transition: all 0.15s ease;
  color: #475569;
  font-size: 13px;
}

.symptom-list li:last-child {
  border-bottom: none;
}

.symptom-list li:hover {
  background: #F0F6FF;
  color: #2B7FE3;
}

.symptom-list li.active {
  background: #EFF6FF;
  color: #2B7FE3;
  font-weight: 600;
  border-left: 2px solid #2B7FE3;
  padding-left: 12px;
}

.symptom-list li.active:hover {
  background: #E0EDFF;
  color: #1A6FD5;
}

.ai-add-symptom {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--color-background-gray);
  border-radius: 8px;
  margin: 12px;
  text-align: center;
}

.empty-state-icon {
  margin-bottom: 12px;
  color: var(--color-text-muted);
  opacity: 0.5;
}

.empty-state-text {
  font-size: 13px;
  color: var(--color-text-medium);
  margin-bottom: 20px;
}

.ai-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 12px 16px;
  background: linear-gradient(135deg, #10b981, #059669); /* Medical green to indicate adding */
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
  transition: all 0.2s ease;
}

.ai-add-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.3);
}

.ai-add-btn:disabled {
  background: #a7f3d0;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* 伴随症状推荐面板 */
.recommendation-panel {
  margin: 0;
  padding: 10px 16px;
  border-top: 1px solid #EEF2F6;
  background: #F9F9F9;
  border-radius: 0 0 8px 8px;
  flex-shrink: 0;
}

.recommendation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 6px 0;
  user-select: none;
}

.recommendation-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #2B7FE3;
}
.recommendation-title .recommendation-title-word{
  color: #262626!important;
}

.recommendation-title .iconify {
  color: var(--color-warning, #f59e0b);
}

.recommendation-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-background-white);
  background: var(--color-primary);
  border-radius: 9px;
}

.collapse-icon {
  color: var(--color-text-muted);
  transition: transform var(--duration-normal) var(--ease-out);
}

.collapse-icon.rotated {
  transform: rotate(-90deg);
}

.recommendation-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
}

.recommendation-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 8px 8px 8px;
  font-size: 14px;
  color: #2469F2;
  background: #FFFFFF;
  border: none;
  border-radius: 16px 16px 16px 16px;
  cursor: default;
  transition: background 0.15s ease;
  white-space: nowrap;
  height: 26px;
  font-family: Microsoft YaHei, Microsoft YaHei;
}

.recommendation-chip:hover {
  background: rgba(43, 127, 227, 0.04);
}

.recommendation-chip.checked {
  background: rgba(43, 127, 227, 0.06);
}

.companion-checkbox {
  appearance: none !important;
  -webkit-appearance: auto;
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #2B7FE3;
  cursor: pointer;
  flex-shrink: 0;
  border: 1px solid #DBDBDB;
  border-radius: 2px;
  background: #fff;
  display: inline-grid;
  place-content: center;
}
.companion-checkbox:checked {
  background: var(--color-info);
  border-color: var(--color-info);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 10px;
}

.companion-name {
  cursor: pointer;
  user-select: none;
  line-height: 1;
}

.companion-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: #2B7FE3;
  font-size: 12px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
  line-height: 1;
}

.companion-add-btn:hover {
  background: rgba(43, 127, 227, 0.1);
  color: #1A6FD5;
}

.recommendation-chips::-webkit-scrollbar {
  width: 3px;
}

.recommendation-chips::-webkit-scrollbar-track {
  background: transparent;
}

.recommendation-chips::-webkit-scrollbar-thumb {
  background: var(--color-border-medium);
  border-radius: 3px;
}

.form-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #F7F8FA;
}

.forms-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px 2px 8px;
}

.symptom-form-section {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  padding: 0;
  margin-bottom: 12px;
  border: 1px solid #EEF2F6;
  transition: none;
}

.symptom-form-section:hover {
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
}

.form-header {
  background: linear-gradient( 90deg, #DCECFF 0%, rgba(189,220,255,0) 100%);
  margin: 0;
  padding: 10px 16px;
  border-bottom: 1px solid #EEF2F6;
  border-radius: 8px 8px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.remove-btn {
  color: #CBD5E1;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.remove-btn:hover {
  color: var(--color-error);
  background: var(--color-error-bg);
}

.form-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1E293B;
  display: flex;
  align-items: center;
}

.form-header h2::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 14px;
  background: #2B7FE3;
  margin-right: 10px;
  border-radius: 2px;
}

.section-title {
  margin: 16px 0 10px 0;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  background: #F8FAFC;
  border-left: 3px solid #2B7FE3;
  border-radius: 0 4px 4px 0;
}

.section-title:first-child {
  margin-top: 0;
}

/* Override for final report - ensure black text */
.final-report-page .section-title {
  margin: 0;
  margin-bottom: 8px;
  padding: 0;
  font-weight: bold;
  font-size: 16px;
  color: #000 !important;
  background: none;
  border: none;
  border-radius: 0;
}

.dynamic-form {
  padding: 8px 16px;
}

.form-field {
  display: flex;
  align-items: flex-start;
  margin-bottom: 0;
  border-bottom: 1px solid rgba(238, 242, 246, 0.8);
  padding: 9px 0;
}

.form-field:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 4px;
}

.field-label {
  flex-shrink: 0;
  width: 72px;
  margin-bottom: 0;
  margin-right: 14px;
  font-weight: 500;
  font-size: 13px;
  color: #64748B;
  padding-top: 3px;
  text-align: right;
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
  gap: 10px;
}

.has-error .text-input {
  border-color: var(--color-error); /* Red-500 */
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.2);
  animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
}

.has-error .radio-label {
  border-color: var(--color-error-border);
  background-color: var(--color-error-bg);
}

@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}

.text-input {
  padding: 5px 10px;
  border: 1px solid #E2E8F0;
  border-radius: 4px;
  width: 100px;
  outline: none;
  transition: all 0.2s ease;
  color: #1E293B;
  font-size: 13px;
  background: #fff;
}

.field-input .text-input {
  width: 100%;
}

.text-input:focus {
  border-color: #2B7FE3;
  box-shadow: 0 0 0 2px rgba(43, 127, 227, 0.08);
}

.radio-group, .checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  align-items: center;
}

.radio-label, .checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #64748B;
  padding: 2px 0;
  border-radius: 0;
  transition: color 0.15s ease;
  border: none;
  background: transparent;
  white-space: nowrap;
}

.radio-label input[type="radio"],
.checkbox-label input[type="checkbox"] {
  appearance: auto;
  -webkit-appearance: auto;
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #2B7FE3;
  cursor: pointer;
}

.radio-label:hover, .checkbox-label:hover {
  color: #2B7FE3;
  background: transparent;
}

.radio-label.is-active, .checkbox-label.is-active {
  color: #2B7FE3;
  font-weight: 500;
  background: transparent;
  border: none;
  box-shadow: none;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 15px;
}

.empty-icon {
  width: 87px;
  height: 102px;
  margin-bottom: 16px;
  color: var(--color-border-medium);
}

.empty-icon img {
  width: 100%;
  height: 100%;
}

.sub-text {
  font-size: 13px;
  color: var(--color-border-medium);
  margin-top: 8px;
}

.action-area {
  padding: 20px 0;
  display: flex;
  justify-content: center;
}

/* Fixed Action Area */
.fixed-action-area {
  position: absolute;
  bottom: 12px;
  right: 24px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 12px;
}

.writeback-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 var(--space-lg);
  background: #E5710B;
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.writeback-btn:hover {
  background: var(--color-primary-dark);
}

.writeback-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reference-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 var(--space-lg);
  background: rgba(229, 113, 11, 0.08);
  color: #b45309;
  border: 1px solid rgba(229, 113, 11, 0.24);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.reference-btn:hover {
  background: rgba(229, 113, 11, 0.14);
}

.reference-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 var(--space-lg);
  background: var(--color-background-white);
  color: var(--color-text-medium);
  border: 1px solid var(--color-border-medium);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.back-btn:hover {
  border-color: var(--color-info);
  color: var(--color-info);
}

/* Medical Record Page Styles */
.medical-record-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-background-gray);
  overflow: hidden;
  position: relative;
  min-height: 0;
  padding: 12px;
}

/* Footer Actions */
.record-footer {
  height: 60px;
  background: var(--color-background-white);
  border-top: 1px solid var(--color-border-light);
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
  border: 1px solid var(--color-border-medium);
  background: var(--color-background-white);
  border-radius: 20px;
  color: var(--color-text-weak);
  cursor: pointer;
  font-size: 14px;
  transition: all var(--duration-normal) var(--ease-out);
}
.back-btn-footer:hover {
  background: var(--color-background-gray);
  border-color: var(--color-text-muted);
}

.complete-btn {
  padding: 8px 24px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2);
  transition: all var(--duration-normal) var(--ease-out);
}
.complete-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.record-content {
  flex: 1;
  display: flex;
  gap: 0;
  padding: 0;
  overflow: hidden;
  min-height: 0;
}

.record-panel {
  flex: 1;
  background: #fff;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: none;
  border-right: 1px solid #EEF2F6;
}

.record-panel:last-child {
  border-right: none;
}

.left-panel {
  flex: 0.8;
}

.right-panel {
  flex: 1.2;
  background: #FAFBFD;
  border-right: none;
  margin-left: 10px;
}

.panel-header {
  padding: 4px 16px;
  border-bottom: 1px solid #EEF2F6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #F2F8FF !important;
}

.right-panel .panel-header {
  background: linear-gradient( 90deg, #DCECFF 0%, rgba(189,220,255,0) 100%) !important;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  color: #262626 !important;
  font-weight: 600;
}

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-knowledge-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--color-primary, #3b82f6);
  background: transparent;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-primary, #3b82f6);
  cursor: pointer;
  transition: all 0.2s ease;
}

.search-knowledge-btn:hover:not(:disabled) {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.search-knowledge-btn.active {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.search-knowledge-btn.loading {
  opacity: 0.7;
  cursor: wait;
}

.search-knowledge-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner-tiny {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.panel-body {
  flex: 1;
  padding: 12px; /* Compact */
  overflow-y: auto;
  position: relative;
  min-height: 0;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(4px);
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.ai-spinner {
  position: relative;
  width: 44px;
  height: 44px;
}

.spinner-ring {
  position: absolute;
  inset: 0;
  border: 2.5px solid #EEF2F6;
  border-top-color: #2B7FE3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  background: radial-gradient(circle, #2B7FE3 0%, #4A9BF5 100%);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(43, 127, 227, 0.35);
  animation: pulse-core 1.5s ease-in-out infinite;
}

.loading-content {
  text-align: center;
}

.loading-title {
  color: #1E293B;
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.loading-desc {
  color: #94A3B8;
  font-size: 12px;
  margin: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse-core {
  0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
  50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-slow) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.record-field {
  margin-bottom: 12px; /* Compact */
}

.record-field label {
  display: block;
  font-size: 13px; /* Smaller */
  font-weight: 600;
  color: var(--color-text-weak);
  margin-bottom: 6px;
}

.record-field .record-field-checkbox{
  display: flex;
  align-items: center;
  gap: 8px;
  color: #262626 !important;
}
.record-field .record-field-checkbox input[type="checkbox"] {
  appearance: none;
  outline: none;
  width: 14px;
  height: 14px;
  border: 1px solid #DBDBDB;
  border-radius: 2px;
  background: #fff;
  display: inline-grid;
  place-content: center;
}
.record-field .record-field-checkbox.is-active input[type="checkbox"] {
  background: var(--color-info);
  border-color: var(--color-info);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 10px;
}

/*.record-field .record-field-checkbox.is-active{*/
/*  color: #2469F2 !important;*/
/*}*/

.record-field textarea {
  width: 100%;
  padding: 8px 10px; /* Compact */
  border: 1px solid var(--color-border-medium);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-strong);
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color var(--duration-normal) var(--ease-out);
}

.record-field textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--color-text-weak);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all var(--duration-normal) var(--ease-out);
}

.icon-btn:hover {
  background: var(--color-background-gray);
  color: var(--color-primary-dark);
}

.tag-ai {
  background: var(--color-background-gradient)!important;
  color: #262626!important;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 10px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  border: 1px solid transparent;
  border-image: var(--color-border-gradient);
}

.ai-card {
  background: var(--color-background-white);
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(226, 232, 240, 0.8);
  position: relative;
  overflow: visible;
  min-height: 0;
}

.category-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.category-filter select {
  flex: 1;
  padding: 6px;
  border: 1px solid var(--color-info-bg);
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-text-weak);
  outline: none;
  background: var(--color-background-white);
}

.clear-filter {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}

.clear-filter:hover {
  color: var(--color-error);
}

.loading-overlay.embedded {
  border-radius: 8px;
  position: relative;
  background: rgba(255, 255, 255, 0.92);
  min-height: 180px;
  flex-direction: row;
}

.treatment-loading-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.treatment-loading-img{
  height: 102px;
  width: 87px;
}

.treatment-loading-pulse {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: rgba(43, 127, 227, 0.08);
  animation: treatment-pulse 2s ease-in-out infinite;
}

@keyframes treatment-pulse {
  0%, 100% { transform: scale(0.9); opacity: 0.5; }
  50% { transform: scale(1.15); opacity: 1; }
}

.ai-card h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-strong);
}

.ai-card-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border-light);
}

.ai-card-title-row h4 {
  margin: 0;
}

.ai-card-title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-recommend-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) 13px;
  border: 1px solid transparent;
  /*border-image: var(--color-border-gradient);*/
  border-radius: var(--radius-sm);
  background: var(--color-background-gradient);
  color: #262626;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  white-space: nowrap;
}
.ai-recommend-btn-border{
  position: absolute;
  width: 109px;
  height: 28px;
  right: 17px;
  background: linear-gradient(
      88deg,
      rgba(5, 213, 255, 1),
      rgba(88, 5, 255, 1),
      rgba(5, 134, 255, 1)
  );
  border-radius: 5px;
  overflow: hidden;
}

.ai-recommend-btn:hover {
  background: var(--color-info-bg);
}

.ai-recommend-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-recommend-btn-img{
  width: 16px;
  height: 16px;
}

.treatment-card-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.treatment-card-heading h4 {
  display: flex;
  align-items: center;
  gap: 6px;
}

.treatment-card-desc {
  margin: 0 0 var(--space-sm);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  color: var(--color-text-muted);
}

.treatment-summary-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.treatment-summary-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  background: rgba(43, 127, 227, 0.06);
  color: #4A7AB5;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.treatment-summary-pill.medicine {
  background: rgba(16, 185, 129, 0.06);
  color: #059669;
}

.treatment-summary-pill.exam {
  background: rgba(99, 102, 241, 0.06);
  color: #4F46E5;
}

.treatment-summary-pill.lab-test {
  background: rgba(245, 158, 11, 0.06);
  color: #D97706;
}

.treatment-summary-pill.procedure {
  background: rgba(236, 72, 153, 0.06);
  color: #DB2777;
}

.diagnosis-path-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(84, 132, 216, 0.22);
  border-radius: 999px;
  background: rgba(233, 241, 255, 0.88);
  color: #3d68b2;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: transform var(--duration-normal) var(--ease-out), box-shadow var(--duration-normal) var(--ease-out), background var(--duration-normal) var(--ease-out);
}

.diagnosis-path-btn:hover {
  transform: translateY(-1px);
  background: rgba(221, 234, 255, 0.98);
  box-shadow: 0 10px 18px rgba(84, 132, 216, 0.14);
}

.ai-placeholder {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 12px;
  background: var(--color-background-gray);
  border-radius: 6px;
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.3; }
  100% { opacity: 0.6; }
}

/* Diagnosis List Styles */
.diagnosis-group-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diagnosis-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diagnosis-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 0;
  border-bottom: 1px solid #EEF2F6;
  background: transparent;
  color: #1E293B;
  cursor: pointer;
  transition: all 0.2s ease;
}

.diagnosis-group-header:hover {
  background: rgba(43, 127, 227, 0.03);
}

.diagnosis-group-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.diagnosis-group-toggle {
  color: #2B7FE3;
  font-size: 12px;
  line-height: 1;
  transition: transform 0.2s ease;
}

.diagnosis-group-toggle.collapsed {
  transform: rotate(-90deg);
}

.diagnosis-group-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-strong);
}

/*.diagnosis-group-title::before {*/
/*  content: '';*/
/*  display: inline-block;*/
/*  width: 4px;*/
/*  height: 4px;*/
/*  background: var(--color-info);*/
/*  border-radius: var(--radius-full);*/
/*  margin-right: 6px;*/
/*  vertical-align: middle;*/
/*}*/

.diagnosis-group-range {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(43, 127, 227, 0.08);
  color: #2B7FE3;
  font-size: 11px;
  font-weight: 600;
}

.diagnosis-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 3px;
  background: rgba(43, 127, 227, 0.08);
  color: #2B7FE3;
  font-size: 11px;
  font-weight: 600;
}

.diagnosis-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diagnosis-item {
  position: relative;
  padding: 12px 16px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-background-white);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.diagnosis-item:hover {
  background: #F8FAFC;
  border-color: #CBD5E1;
}

.diagnosis-item.active {
  background: rgba(43, 127, 227, 0.04);
  border-color: #2B7FE3;
  box-shadow: 0 0 0 1px rgba(43, 127, 227, 0.15);
}

.diagnosis-item::before {
  content: '';
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1px solid #DBDBDB;
  border-radius: 2px;
  margin-right: var(--space-sm);
  vertical-align: middle;
  flex-shrink: 0;
  position: absolute;
  left: 19px;
  top: 19px;
}

.diagnosis-item.active::before {
  background: var(--color-info);
  border-color: var(--color-info);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 10px;
}

.diag-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  padding-left: 28px;
}

.diag-name {
  font-weight: var(--font-weight-semibold);
  color: var(--color-info);
  font-size: var(--font-size-sm);
  display: flex;
  align-items: center;
  gap: 6px;
}

.tcm-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: linear-gradient(135deg, #C9A063 0%, #B8860B 100%);
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.diag-rate {
  font-size: var(--font-size-xs);
  color: var(--color-background-white);
  background: var(--color-success);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: var(--font-weight-medium);
}

.diag-rate.rate-high {
  background: var(--color-success);
}

.diag-rate.rate-medium {
  background: var(--color-info);
}

.diag-rate.rate-low {
  background: var(--color-warning);
  color: var(--color-background-white);
}

.diag-select-dot {
  display: inline-block;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  border: 2px solid var(--color-border-medium);
  flex-shrink: 0;
  transition: all var(--duration-normal) var(--ease-out);
}

.diag-select-dot.active {
  background: var(--color-info);
  border-color: var(--color-info);
}

.diag-rationale {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  line-height: var(--line-height-normal);
  padding-left: 28px;
}

.tcm-detail {
  margin-top: 8px;
  margin-left: 28px;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(201, 160, 99, 0.05) 0%, rgba(184, 134, 11, 0.05) 100%);
  border-left: 3px solid #C9A063;
  border-radius: 4px;
  font-size: 12px;
}

.tcm-syndrome,
.tcm-treatment {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  line-height: 1.6;
}

.tcm-syndrome:last-child,
.tcm-treatment:last-child {
  margin-bottom: 0;
}

.tcm-label {
  color: #B8860B;
  font-weight: 600;
  flex-shrink: 0;
  min-width: 40px;
}

.tcm-value {
  color: var(--color-text-strong);
  font-weight: 500;
}

.tcm-code {
  color: var(--color-text-muted);
  font-size: 11px;
  background: var(--color-background-gray);
  padding: 1px 6px;
  border-radius: 4px;
}

.match-tag {
  color: var(--color-success);
  font-weight: bold;
  font-size: 11px;
  margin-left: auto;
}

.empty-text {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 20px 0;
}

.error-text {
  text-align: center;
  color: var(--color-error);
  font-size: 13px;
  padding: 20px 0;
  background: var(--color-error-bg);
  border-radius: 6px;
  border: 1px solid var(--color-error-bg);
}

.treatment-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.treatment-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  border-radius: 16px;
  border: 1px solid #DBDBDB;
  background: #FFFFFF;
  overflow: visible;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
}

.treatment-section-muted {
  border-color: #D8E0E8;
  background: #FCFDFE;
}

.treatment-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 8px;
  background: #F2F5F7;
  border-radius: 16px 16px 0 0;
  border: none;
  border-bottom: 1px solid #E6EBF1;
}

.treatment-section-header h5 {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-strong);
  display: flex;
  align-items: center;
  gap: 6px;
}

/*.treatment-section-header h5::before {*/
/*  content: '';*/
/*  display: inline-block;*/
/*  width: 3px;*/
/*  height: 14px;*/
/*  border-radius: 2px;*/
/*  background: #2B7FE3;*/
/*}*/

.treatment-section-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.item-reference-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 14px;
  border: 1px solid rgba(43, 127, 227, 0.18);
  border-radius: 6px;
  background: rgba(240, 247, 255, 0.9);
  color: #2B7FE3;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-normal) var(--ease-out);
}

.item-reference-btn:hover {
  background: rgba(224, 239, 255, 0.98);
  border-color: rgba(43, 127, 227, 0.3);
  box-shadow: 0 1px 4px rgba(43, 127, 227, 0.1);
}

.item-reference-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.treatment-section-pill,
.section-readonly-badge,
.section-readonly-inline {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: 22px;
  padding: 0 var(--space-sm);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-normal);
}

.treatment-section-pill.strong {
  color: var(--color-success);
}

.section-readonly-badge,
.section-readonly-inline {
  background: rgba(148, 163, 184, 0.1);
  color: #7A8A9A;
}

.treatment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  background: inherit;
}

.treatment-list > * {
  position: relative;
}

.treatment-list > * + *::before {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  top: -6px;
  height: 1px;
  background: linear-gradient(90deg, rgba(219, 219, 219, 0) 0%, rgba(219, 219, 219, 0.92) 16%, rgba(219, 219, 219, 0.92) 84%, rgba(219, 219, 219, 0) 100%);
  pointer-events: none;
}

.treatment-item {
  position: relative;
  display: flex;
  flex-direction: column;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  border-radius: 0;
  padding: 10px 16px;
  gap: 4px;
  cursor: pointer;
  transition: background var(--duration-normal) var(--ease-out);
  overflow: visible;
}


.treatment-item:last-child {
  border-bottom: none!important;
  border-radius: 0px 0px 16px 16px;
}

.selected-mark {
  position: absolute;
  top: 8px;
  left: -2px;
  width: 18px;
  height: 18px;
  background: #2B7FE3;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow: 0 1px 3px rgba(43, 127, 227, 0.3);
}

.treatment-item:hover {
  background: rgba(43, 127, 227, 0.03);
}

.treatment-item.active {
  background: rgba(43, 127, 227, 0.04);
  border-color: rgba(43, 127, 227, 0.12);
  padding-left: 20px;
}

.rec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 0;
}

.diag-actions,
.rec-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-left: auto;
}

.rec-name-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.checkbox-label.rec-name-group-checkbox {
  border: none!important;
  padding: 0!important;
}
.checkbox-label.rec-name-group-checkbox:hover{
  border: none!important;
}
.checkbox-label.rec-name-group-checkbox:has(input:checked){
  border: none!important;
}

.rec-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
  line-height: 1.6;
}

.rec-tag.medicine {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.rec-tag.exam {
  background: rgba(99, 102, 241, 0.08);
  color: #4F46E5;
}

.rec-tag.lab_test {
  background: rgba(245, 158, 11, 0.1);
  color: #D97706;
}

.rec-tag.procedure {
  background: rgba(236, 72, 153, 0.08);
  color: #DB2777;
}

.rec-tag.acupuncture {
  background: rgba(245, 158, 11, 0.1);
  color: #b45309;
}

.treatment-detail-panel {
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid var(--voice-border, #dbe4ef);
  border-radius: 12px;
  background: var(--voice-surface-soft, #f8fafc);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
}

.treatment-detail-panel + .treatment-detail-panel {
  margin-top: 8px;
}

.treatment-body-panel .diag-rationale {
  padding-left: 0;
}

.treatment-body-panel .rec-ingredients-edit {
  margin-top: 0;
  background: rgba(255, 255, 255, 0.78);
}

.treatment-body-panel .diag-rationale + .rec-ingredients-edit {
  margin-top: 8px;
}

.treatment-editor-panel {
  padding: 10px 12px;
}

.rec-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text-strong);
}

.treatment-item-muted {
  border-style: dashed;
  border-color: rgba(148, 163, 184, 0.3);
}

.rec-reason, .rec-usage, .rec-ingredients {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.doc-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  padding: 0;
}

.doc-icon-btn:hover {
  background: rgba(43, 127, 227, 0.08);
  color: #2B7FE3;
}

.manual-match-toggle-btn {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #fff;
  color: #2B7FE3;
  font-size: 12px;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.manual-match-toggle-btn:hover {
  border-color: #2B7FE3;
  background: rgba(43, 127, 227, 0.08);
}

.rec-ingredients {
  color: var(--color-text-strong);
  font-family: serif;
  background: var(--color-background-gray);
  padding: 4px 8px;
  border-radius: 4px;
  margin: 4px 0;
}

.rec-action {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border-light);
}

.match-success {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-success-bg);
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-success-border);
}

.match-info {
  display: flex;
  flex-direction: column;
  font-size: 12px;
}

.match-name {
  font-weight: 600;
  color: var(--color-success-text);
}

.match-spec, .match-price {
  color: var(--color-success);
  font-size: 11px;
}

.match-fail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-background-light);
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-background-gray);
}

.unmatched-tip {
  font-size: 12px;
  color: var(--color-text-muted);
}

.btn-add {
  background: var(--color-success);
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
  background: var(--color-background-white);
  border: 1px solid var(--color-border-medium);
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
  color: var(--color-text-weak);
  font-size: 13px; /* Slightly smaller font */
}

.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--color-primary-light); /* Blue-400 */
  flex-direction: column;
  gap: 16px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  margin: 8px 24px 24px 24px;
  border: 2px dashed var(--color-info-bg);
}

/* Final Report Styles */
.final-report-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--print-bg);
  overflow: hidden;
  position: relative;
}

.report-actions {
  height: 60px;
  background: var(--color-background-white);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 24px;
  gap: 12px;
  border-bottom: 1px solid var(--color-border-light);
}

.report-paper {
  margin: 24px auto;
  width: 210mm;
  min-height: 297mm;
  background: var(--color-background-white);
  padding: 40px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  overflow-y: auto;
  font-family: 'SimSun', 'Songti SC', serif;
  color: #000;
}

/* 强制报告文字为黑色，覆盖主题样式 */
.report-paper *,
.report-paper p,
.report-paper span,
.report-paper div,
.report-paper h1,
.report-paper h2,
.report-paper h3,
.report-paper label,
.final-report-page *,
.final-report-page p,
.final-report-page span,
.final-report-page div,
.final-report-page h1,
.final-report-page h2,
.final-report-page h3,
.final-report-page label {
  color: #000 !important;
}

.report-paper .tx-usage,
.final-report-page .tx-usage {
  color: #444 !important;
}

/* Category Filter Dropdown */
.category-filter-container {
  position: relative;
  margin-bottom: 8px;
}

.category-trigger {
  width: 100%;
  padding: 3px 7px;
  background: var(--color-background-white);
  border: 1px solid var(--color-info-bg);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all var(--duration-normal) var(--ease-out);
}

.category-trigger:hover {
  border-color: var(--color-primary);
}

.category-trigger.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.trigger-text {
  font-size: 13px;
  color: var(--color-text-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  font-family: Microsoft YaHei, Microsoft YaHei;
  font-weight: 400;
  line-height: 22px;
  text-align: left;
  font-style: normal;
  text-transform: none;
}

.trigger-icon {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  margin-left: 8px;
  transition: transform var(--duration-normal) var(--ease-smooth);
}

.trigger-icon.rotate {
  transform: rotate(180deg);
}

.category-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
  background: var(--color-background-white);
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  margin-top: 4px;
  z-index: 50;
  padding: 4px 0;
}

.category-option {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.category-option:hover {
  background: var(--color-background-gray);
}

.category-option.selected {
  background: var(--color-primary-50);
  color: var(--color-primary-dark);
}

.checkbox-custom {
  width: 16px;
  height: 16px;
  border: 1px solid var(--color-border-medium);
  border-radius: 4px;
  margin-right: 8px;
  position: relative;
  transition: all var(--duration-normal) var(--ease-out);
  background: var(--color-background-white);
}

.category-option:hover .checkbox-custom {
  border-color: var(--color-text-muted);
}

.checkbox-custom.checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.checkbox-custom.checked::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.dropdown-divider {
  height: 1px;
  background: #e5e7eb;
  margin: 4px 0;
}

.hospital-title {
  text-align: center;
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 30px;
  border-bottom: 2px solid #000;
  padding-bottom: 10px;
  color: #000 !important;
}

.report-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  border-bottom: 1px solid #000;
  padding-bottom: 10px;
  color: #000 !important;
}

.info-row {
  display: flex;
  justify-content: space-between;
  color: #000 !important;
  font-size: 14px;
}

.info-row span {
  color: #000 !important;
}

.report-section {
  margin-bottom: 20px;
}

.section-title {
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 5px;
  color: #000 !important;
}

.section-content {
  font-size: 15px;
  line-height: 1.6;
  color: #000 !important;
  white-space: pre-wrap;
}

.tx-item {
  margin-bottom: 4px;
  color: #000 !important;
}

.tx-usage {
  font-size: 14px;
  color: #444;
  margin-left: 1em;
}

.tx-header {
  font-weight: 500;
  margin-bottom: 4px;
}

.tx-reason {
  font-size: 13px;
  color: #666;
  margin-left: 1em;
  margin-top: 4px;
}

/* TCM Diagnosis Styles */
.diagnosis-item {
  line-height: 1.8;
}

.tcm-diagnosis-primary {
  margin-bottom: 8px;
}

.tcm-syndrome-line {
  margin-left: 2em;
  color: #2c5282;
}

.diagnosis-code {
  font-size: 0.9em;
  color: #666;
  margin-left: 8px;
}

.report-footer {
  margin-top: 50px;
  padding-right: 50px;
  color: #000 !important;
}

.footer-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.report-footer span {
  color: #000 !important;
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
    background: var(--color-background-white);
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

/*.empty-state::before {*/
/*  content: '';*/
/*  display: block;*/
/*  width: 120px;*/
/*  height: 120px;*/
/*  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23bfdbfe" stroke-width="1"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 9h.01"/></svg>') no-repeat center/contain;*/
/*  opacity: 0.8;*/
/*}*/

/* Final Report Styles */
.final-report-page {
  flex: 1;
  background: var(--print-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  overflow-y: auto;
}

.report-paper {
  background: var(--color-background-white);
  width: 210mm;
  min-height: 297mm;
  padding: 20mm;
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  color: #000;
}

/* 强制报告文字为黑色，覆盖主题样式 */
.report-paper *,
.report-paper p,
.report-paper span,
.report-paper div,
.report-paper h1,
.report-paper label {
  color: #000 !important;
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
  color: #000 !important;
}

.section-content {
  font-size: 14px;
  line-height: 1.6;
  color: #000 !important;
  padding-left: 10px;
  white-space: pre-wrap;
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
  background: var(--color-background-white);
  color: var(--color-text-medium);
  cursor: pointer;
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.action-btn.primary {
  background: var(--color-primary);
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
    background: var(--color-background-white);
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
/* Related Diagnoses */
.related-section {
  margin-top: 8px;
  background: var(--color-background-white);
  border-radius: 6px;
  border: 1px solid var(--color-border-light);
  overflow: hidden;
  font-size: 13px;
}

.related-trigger {
  padding: 6px 10px;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background var(--duration-normal) var(--ease-out);
  background: var(--color-background-light);
}

.related-trigger:hover {
  background: var(--color-background-gray);
}

.arrow {
  /*font-size: 10px;*/
  /*transition: transform var(--duration-normal) var(--ease-smooth);*/
  width: 14px;
  height: 22px;
  /*background-color: #2469F2;*/
  /*border-radius: 50%;*/
  /*display: flex;*/
  /*justify-content: center;*/
  /*align-items: center;*/
}

.arrow.open {
  transform: rotate(180deg);
}

.related-list {
  max-height: 200px;
  overflow-y: auto;
  border-top: 1px solid #e2e8f0;
}

.related-item {
  padding: 8px 10px;
  display: flex;
  gap: 10px;
  cursor: pointer;
  transition: background var(--duration-normal) var(--ease-out);
  align-items: center;
}

.related-item:hover {
  background: #f0f9ff;
}

.related-code {
  font-family: monospace;
  color: var(--color-text-muted);
  font-weight: 500;
  min-width: 60px;
}

.related-name {
  color: #334155;
  font-weight: 500;
}

.matched-inline {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(16, 185, 129, 0.08);
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid rgba(16, 185, 129, 0.2);
  font-size: 11px;
  margin-left: 4px;
}

.match-icon {
  color: #059669;
  font-weight: 600;
  font-size: 10px;
}

.unmatched-icon {
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.5;
}

.diag-name-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inline-related-trigger {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--color-text-muted);
  transition: all var(--duration-normal) var(--ease-out);
  display: flex;
  align-items: center;
  justify-content: center;
}

.rec-ingredients-edit {
  margin-top: 6px;
  background: var(--color-background-gray);
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--color-border-light);
}

.rec-ingredients-edit label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-weak);
  margin-bottom: 4px;
}

.ingredients-textarea {
  width: 100%;
  border: 1px solid var(--color-border-medium);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-text-strong);
  resize: vertical;
  background: var(--color-background-white);
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.2s;
}

.ingredients-textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.inline-related-trigger:hover {
  background: #e2e8f0;
  color: var(--color-text-weak);
}
/* Knowledge Panel Toggle Button */
.knowledge-toggle-btn {
  position: fixed;
  right: 20px;
  bottom: 80px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
  transition: all 0.3s ease;
  z-index: 99;
}

.knowledge-toggle-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
}

.knowledge-toggle-btn.active {
  background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
}

.knowledge-toggle-btn.loading {
  background: var(--color-background-gray);
  cursor: wait;
}

.knowledge-icon {
  font-size: 22px;
}

.knowledge-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  background: var(--color-success, #10b981);
  color: white;
  font-size: 12px;
  font-weight: 700;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
}

.spinner-small {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border-light);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.checklist-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background-color: var(--color-warning-light, #fef3c7);
  color: var(--color-warning-dark, #b45309);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  margin-top: 8px;
  margin-left: 28px;
  cursor: pointer;
  border: 1px solid var(--color-warning-border, #fcd34d);
  transition: all 0.2s ease;
}

.checklist-indicator:hover {
  background-color: var(--color-warning, #fde68a);
}

.checklist-indicator.loading {
  background-color: var(--color-background-gray);
  color: var(--color-text-muted);
  border-color: var(--color-border-light);
  cursor: default;
}

.checklist-modal {
  max-width: 520px;
  width: 90%;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.checklist-modal .modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.checklist-modal .modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1E293B;
  margin: 0;
}

.checklist-modal .close-btn {
  background: transparent;
  border: none;
  color: #94A3B8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checklist-modal .close-btn:hover {
  background: #F1F5F9;
  color: #475569;
}

.checklist-modal .modal-body {
  margin-bottom: 20px;
}

.checklist-modal .modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid #EEF2F6;
}

.checklist-modal .modal-footer .btn.secondary {
  background: #fff;
  color: #64748B;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  font-size: 13px;
  padding: 7px 16px;
}

.checklist-modal .modal-footer .btn.secondary:hover {
  background: #F8FAFC;
  border-color: #CBD5E1;
}

.checklist-modal .modal-footer .btn.primary {
  background: #2B7FE3;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 16px;
  box-shadow: 0 1px 4px rgba(43, 127, 227, 0.25);
}

.checklist-modal .modal-footer .btn.primary:hover {
  background: #1A6FD5;
}

.checklist-modal .modal-footer .btn.primary:disabled {
  background: rgba(43, 127, 227, 0.4);
  cursor: not-allowed;
  box-shadow: none;
}

.checklist-intro {
  font-size: 13px;
  color: #1E293B;
  line-height: 1.6;
  margin-bottom: 16px;
  background: #FEF9EC;
  padding: 12px 14px;
  border-radius: 8px;
  border-left: 3px solid #F59E0B;
}

.checklist-intro strong {
  color: #2B7FE3;
}

.checklist-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.checklist-item-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #EEF2F6;
  background: #FAFBFD;
  transition: all 0.15s ease;
}

.checklist-item-label:hover {
  background: #F0F6FF;
  border-color: rgba(43, 127, 227, 0.2);
}

.checklist-item-label:has(input:checked) {
  background: rgba(43, 127, 227, 0.04);
  border-color: #2B7FE3;
}

.checklist-item-label input[type="checkbox"] {
  margin-top: 2px;
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #2B7FE3;
  flex-shrink: 0;
}

.checklist-text {
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
}

.checklist-notes-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.checklist-notes-box label {
  font-size: 12px;
  font-weight: 500;
  color: #64748B;
}

.checklist-notes-box textarea {
  width: 100%;
  height: 76px;
  padding: 8px 12px;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  font-size: 13px;
  resize: none;
  font-family: inherit;
  color: #1E293B;
  background: #FAFBFD;
}

.checklist-notes-box textarea:focus {
  outline: none;
  border-color: #2B7FE3;
  box-shadow: 0 0 0 2px rgba(43, 127, 227, 0.08);
  background: #fff;
}

</style>
