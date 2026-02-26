<template>
  <div class="consultation-page">
    <!-- Top: Patient Info -->
    <header class="patient-header">
      <div class="patient-card">
        <!-- Avatar -->
        <div class="avatar" :style="{ background: avatarConfig.bgColor }">
          <Icon :icon="avatarConfig.icon" :color="avatarConfig.color" size="48" />
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
        <!-- Mode Switch -->
        <div class="mode-switch" v-if="currentView === 'consultation'">
          <button 
            :class="['switch-btn', { active: consultationMode === 'western' }]"
            @click="consultationMode = 'western'"
          >西医</button>
          <button 
            :class="['switch-btn', { active: consultationMode === 'tcm' }]"
            @click="consultationMode = 'tcm'"
          >中医</button>
        </div>

        <template v-if="currentView === 'consultation'">
             <button
               class="header-btn primary"
               :disabled="isGenerating"
               :aria-busy="isGenerating"
               @click="handleEndConsultation"
             >
               <Icon v-if="isGenerating" icon="lucide:loader-2" class="animate-spin" size="16" aria-hidden="true" />
               <span>{{ isGenerating ? '生成中...' : '生成病历' }}</span>
             </button>
        </template>
        <template v-else-if="currentView === 'record'">
             <button class="header-btn" @click="currentView = 'consultation'">返回</button>
             <button class="header-btn primary" @click="handleComplete">生成报告</button>
        </template>
        <template v-else>
             <button class="header-btn primary" @click="printReport">打印</button>
             <button class="header-btn primary" @click="submitToHIS">完成问诊</button>
        </template>
      </div>
    </header>

    <div class="content-container" v-if="currentView === 'consultation'">
      <!-- Left: Symptom Shortcuts -->
      <aside class="symptom-sidebar"> 
        <!-- Selection Mode Tabs -->
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

        <!-- Common Symptoms View -->
        <div v-if="selectionMode === 'common'" class="selection-content">
          <div class="search-box">
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
      </aside>

      <!-- Right: Dynamic Form -->
      <main class="form-container" v-if="selectedSymptoms.length > 0">
        <div class="forms-scroll-area">
          <template v-for="item in renderList" :key="item.key">
            <div class="symptom-form-section">
              <div class="form-header">
                <h2>{{ item.key === 'general' ? item.name : (item.name + ' - 症状属性问诊') }}</h2>
                <button v-if="item.key !== 'general'" class="icon-btn remove-btn" @click="removeSymptom(item)" title="移除此症状">
                  <Icon icon="lucide:trash-2" size="16" />
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
        <span class="sub-text">支持多选，最多{{ CONSULTATION_CONFIG.MAX_SYMPTOMS }}项</span>
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
              <Icon icon="lucide:copy" size="16" />
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
            <!-- TCM Four Examinations -->
            <div v-if="consultationMode === 'tcm' && generatedRecord.tcmFourExaminations" class="record-field">
              <label>中医四诊</label>
              <textarea v-model="generatedRecord.tcmFourExaminations" rows="8"></textarea>
            </div>
          </div>
        </div>

        <!-- Right: AI Recommendations -->
        <div class="record-panel right-panel">
          <div class="panel-header">
            <h3>智能辅助 (AI)</h3>
            <div class="panel-header-actions">
              <span v-if="aiLoading" class="tag-ai">AI生成中...</span>
            </div>
          </div>
          <div class="panel-body">
            <!-- Loading Overlay -->
            <Transition name="fade">
              <div v-if="aiLoading" class="loading-overlay">
                <div class="ai-spinner">
                  <div class="spinner-ring"></div>
                  <div class="spinner-core"></div>
                </div>
                <div class="loading-content">
                  <p class="loading-title">AI 正在分析病例</p>
                  <p class="loading-desc">正在综合患者主诉、现病史及体征信息...</p>
                </div>
              </div>
            </Transition>

            <div class="ai-card">
              <h4>{{ consultationMode === 'tcm' ? '中医辨证' : '推荐诊断' }}</h4>

              <!-- Error Message -->
              <div v-if="aiError" class="error-message" style="color: var(--color-error); padding: 12px; margin-bottom: 12px; background: var(--color-error-bg); border-radius: 8px; font-size: 14px;">
                {{ aiError }}
              </div>

              <!-- TCM Warning: No diagnosis data -->
              <div v-if="!aiLoading && !aiError && aiDiagnoses.length === 0 && consultationMode === 'tcm'" class="warning-message" style="color: var(--color-warning, #f59e0b); padding: 12px; margin-bottom: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; font-size: 14px;">
                提示：请在问诊表单中填写"中医四诊信息"，以便AI进行准确的中医辨证分析。
              </div>

              <ul v-if="aiDiagnoses.length > 0" class="diagnosis-list">
                <li
                  v-for="diag in aiDiagnoses"
                  :key="diag.id"
                  class="diagnosis-item"
                  :class="{ active: selectedDiagnosis?.id === diag.id }"
                  @click="handleDiagnosisSelect(diag)"
                >
                  <div class="diag-header">
                    <div class="diag-name-group">
                      <FactCheckHighlight :issue="getIssueForDiagnosis(diag.code)">
                        <span class="diag-name">
                          <span v-if="diag.isTCM" class="tcm-badge">中</span>
                          {{ diag.name }} ({{ diag.code }})
                        </span>
                      </FactCheckHighlight>
                      <div class="inline-related-trigger" @click="toggleRelatedDropdown(diag, $event)" title="切换同类诊断">
                        <span class="arrow" :class="{ open: openRelatedId === diag.id }">▼</span>
                      </div>
                    </div>
                    <div class="diag-actions">
                      <button
                        class="doc-icon-btn"
                        @click.stop="searchLiterature(diag)"
                        title="搜索文献"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                      </button>
                      <span class="diag-rate">{{ diag.rate }}</span>
                    </div>
                  </div>
                  <div class="diag-rationale">{{ diag.rationale }}</div>

                  <!-- 中医证候和治法 -->
                  <div v-if="diag.isTCM" class="tcm-detail">
                    <div v-if="diag.syndrome" class="tcm-syndrome">
                      <span class="tcm-label">证候:</span>
                      <span class="tcm-value">{{ diag.syndrome }}</span>
                      <span v-if="diag.syndromeCode" class="tcm-code">({{ diag.syndromeCode }})</span>
                      <span v-if="diag.syndromeMatched" class="match-tag" title="已匹配证候数据">✓</span>
                    </div>
                    <div v-if="diag.treatment" class="tcm-treatment">
                      <span class="tcm-label">治法:</span>
                      <span class="tcm-value">{{ diag.treatment }}</span>
                      <span v-if="diag.treatmentCode" class="tcm-code">({{ diag.treatmentCode }})</span>
                      <span v-if="diag.treatmentMatched" class="match-tag" title="已匹配治法数据">✓</span>
                    </div>
                  </div>

                  <!-- Related Diagnoses Dropdown -->
                  <div v-if="openRelatedId === diag.id && inlineRelatedDiagnoses.length > 0" class="related-section" @click.stop>
                    <div class="related-list">
                      <div 
                        v-for="item in inlineRelatedDiagnoses" 
                        :key="item.id" 
                        class="related-item"
                        @click="swapDiagnosis(diag, item)"
                      >
                        <span class="related-code">{{ item.code }}</span>
                        <span class="related-name">{{ item.name }}</span>
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
              <div v-else class="empty-text">暂无推荐</div>
            </div>
            
            <div class="ai-card" v-if="selectedDiagnosis">
              <h4>推荐方案 (基于 {{ selectedDiagnosis.name }})</h4>
              
              <div v-if="treatmentLoading" class="loading-overlay embedded">
                <div class="ai-spinner">
                  <div class="spinner-ring"></div>
                  <div class="spinner-core"></div>
                </div>
                <div class="loading-content">
                  <p class="loading-title">正在加载推荐方案...</p>
                  <p class="loading-desc">正在智能匹配药品与检查项目</p>
                </div>
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
                      <div class="rec-name-group">
                        <span class="rec-tag" :class="rec.type">{{ rec.type === 'medicine' ? '药' : '检' }}</span>
                        <FactCheckHighlight :issue="getIssueForTreatment(rec.name)">
                          <span class="rec-name">{{ rec.name }}</span>
                        </FactCheckHighlight>
                        <span v-if="rec.matchedItem" class="matched-inline">
                          <span class="match-icon">✓</span>
                          <span class="match-name">{{ rec.matchedItem.name }}</span>
                          <span class="match-spec" v-if="rec.type === 'medicine'">{{ rec.matchedItem.spec }}</span>
                        </span>
                        <span v-else class="unmatched-icon" title="未匹配标准库">🔍</span>
                      </div>
                      <button
                        class="doc-icon-btn"
                        @click.stop="searchLiterature(rec)"
                        title="搜索文献"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                      </button>
                    </div>
                    <div class="rec-reason">{{ rec.reason }}</div>
                    <div v-if="rec.ingredients" class="rec-ingredients-edit" @click.stop>
                      <label>组成：</label>
                      <textarea 
                        v-model="rec.ingredients"
                        class="ingredients-textarea"
                        rows="2"
                        placeholder="请输入方剂组成"
                      ></textarea>
                    </div>
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
         <h1 class="hospital-title">{{ consultationMode === 'tcm' ? '中医门诊病历' : '门诊病历' }}</h1>
         <div class="report-header">
           <div class="info-row">
             <span>姓名：{{ patientInfo.naPi }}</span>
             <span>性别：{{ patientInfo.sdSexText }}</span>
             <span>年龄：{{ patientInfo.ageText }}</span>
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
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, watch, onUnmounted, inject } from 'vue';
import westernTemplatesData from '../assets/templates.json';
import tcmTemplatesData from '../assets/tcm-templates.json';
import { medicalDataService, type DiagnosisItem } from '../services/medicalData';
import Pinyin from 'tiny-pinyin';
import { chat } from '../services/llm';
import { invoke } from '@tauri-apps/api/core';
import { feedbackService } from '../services/feedback';
import { trackViewChange, trackClick, trackError, trackFormSubmit, trackRecommendationAction, startTimedOperation } from '../services/operationTracker';
import BodyPartSelector from './BodyPartSelector.vue';
import SystemCategorySelector from './SystemCategorySelector.vue';
import { PROMPTS } from '../prompts';
import Icon from './Icon.vue';
import FactCheckNotification from './FactCheckNotification.vue';
import FactCheckHighlight from './FactCheckHighlight.vue';
import FactCheckWidget from './FactCheckWidget.vue';
import KnowledgePanel from './KnowledgePanel.vue';
import { checkDiagnosis, checkMedicine, checkExamination, checkTCMDiagnosis, checkTCMMedicine, type FactCheckResult, type FactCheckIssue } from '../services/factChecker';
import { isFieldApplicable, generateTextsForSymptom } from '../services/textGeneration';
import { pmphaiService, isPMPHAIConfigured, type BatchSearchResults } from '../services/pmphai';
import { CONSULTATION_CONFIG, isSymptomSelectionFull } from '../constants/consultationConfig';

const showToast = inject('showToast') as (msg: string, type: 'success' | 'error' | 'info') => void;

const props = defineProps<{
  initialPatientData?: any;
}>();

const emit = defineEmits(['close']);

// --- Interfaces & State Definitions ---
import type { Diagnosis, Patient, TreatmentRecommendation, FinalRecord } from '../types/consultation';

// Mock Patient Data
const patientInfo = ref<Patient>({
  "idTet": "BSOFTYL",
  "idPi": "766842939207974912",
  "idMpi": "766842939207974912",
  "cdPi": "JG00003125111",
  "naPi": "张虎(示例)",
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
  "sdCardText": "身份证",
  "allergyHistory": "无"
});

const avatarConfig = computed(() => {
  const info = patientInfo.value;
  console.log('Avatar Config Debug:', info);

  // Check code '1' or text '男性'/'男'
  const isMale = info.sdSex === '1' || info.sdSexText === '男性' || info.sdSexText === '男';

  return {
    color: isMale ? 'var(--color-primary)' : 'var(--color-secondary)', // 医疗蓝 for male, 青色 for female
    bgColor: isMale ? 'var(--color-background)' : 'var(--color-background-gray)', // 使用设计令牌背景色
    icon: isMale ? 'mdi:human-male' : 'mdi:human-female'
  };
});

// 患者性别（用于 BodyPartSelector）
const patientGender = computed<'male' | 'female'>(() => {
  const info = patientInfo.value;
  const isMale = info.sdSex === '1' || info.sdSexText === '男性' || info.sdSexText === '男';
  return isMale ? 'male' : 'female';
});

const symptoms = shallowRef<any[]>([]);
const selectedSymptoms = ref<any[]>([]);
const formData = ref<Record<string, any>>({});
const searchQuery = ref('');
const selectedCategories = ref<string[]>([]);
const isCategoryDropdownOpen = ref(false);
const categoryFilterRef = ref<HTMLElement | null>(null);

// Selection mode for sidebar tabs
const selectionMode = ref<'common' | 'bodyPart' | 'system'>('common');
const consultationMode = ref<'western' | 'tcm'>('western');

// 根据问诊模式动态获取模板数据
const currentTemplatesData = computed(() => {
  if (consultationMode.value === 'tcm') {
    // 中医模板结构: { version, symptoms: [...] }
    return (tcmTemplatesData as any).symptoms || [];
  }
  // 西医模板直接是数组
  return westernTemplatesData;
});

// All symptoms for body part and system selectors
const allSymptoms = computed(() => symptoms.value);
const currentView = ref<'consultation' | 'record' | 'final_report'>('consultation');
const generatedRecord = ref({ chiefComplaint: '', historyOfPresentIllness: '', tcmFourExaminations: '' });

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

const treatmentLoading = ref(false);
const treatmentError = ref<string | null>(null);
const treatmentRecommendations = ref<TreatmentRecommendation[]>([]);

const finalRecord = ref<FinalRecord | null>(null);

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

watch(() => props.initialPatientData, (newData) => {
  if (newData) {
    patientInfo.value = {
      ...patientInfo.value,
      ...newData, // Merge directly as keys now match (naPi, idPi, etc.)
      // Map old fields if they still come in via alias
      naPi: newData.naPi || newData.name || patientInfo.value.naPi,
      idPi: newData.idPi || newData.patientId || patientInfo.value.idPi,
    };
  }
}, { immediate: true });

const submitToHIS = async () => {
  if (!finalRecord.value) return;

  // Transform internal structure to Unified API format (matching VoiceConsultationResult)
  const medications = finalRecord.value.treatments
    .filter(t => t.type === 'medicine')
    .map(t => ({
      name: t.name,
      spec: t.matchedItem?.spec,
      usage: t.usage,
      // matched: !!t.matchedItem // Optional based on receiver
    }));

  const examinations = finalRecord.value.treatments
    .filter(t => t.type === 'exam')
    .map(t => ({
      name: t.name,
      // matched: !!t.matchedItem
    }));

  const result = {
    consultationId: finalRecord.value.patient.idPi || "unknown",
    timestamp: Date.now(),
    
    // Core Medical Record
    chiefComplaint: finalRecord.value.record.chiefComplaint,
    historyOfPresentIllness: finalRecord.value.record.historyOfPresentIllness,
    pastMedicalHistory: "否认高血压、糖尿病、冠心病等慢性病史。", // TODO: Get from patientInfo or form if available
    
    // Structured Data
    diagnosisList: [{
      name: finalRecord.value.diagnosis.name,
      code: finalRecord.value.diagnosis.code
    }],
    medications: medications,
    examinations: examinations,
    
    // Text summaries
    treatmentPlan: "建议门诊随访", // General treatment advice
    medicalSummary: `主诉：${finalRecord.value.record.chiefComplaint}\n现病史：${finalRecord.value.record.historyOfPresentIllness}` // Keep for legacy if needed
  };

  try {
    await invoke('complete_consultation', { result });
    trackFormSubmit('submit_to_his', { patientId: finalRecord.value.patient.idPi });
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
  currentView.value = 'consultation';
  selectedSymptoms.value = [];
  formData.value = {};
  initFormData(generalConditionConfig);
  generatedRecord.value = { chiefComplaint: '', historyOfPresentIllness: '', tcmFourExaminations: '' };
  finalRecord.value = null;
  aiDiagnoses.value = [];
  selectedDiagnosis.value = null;
  treatmentRecommendations.value = [];
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
  if (categoryFilterRef.value && !categoryFilterRef.value.contains(event.target as Node)) {
    isCategoryDropdownOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  symptoms.value = currentTemplatesData.value;
  // Initialize General Condition data
  initFormData(generalConditionConfig);
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
});

const filteredSymptoms = computed(() => {
  let result = symptoms.value;

  // 1. Filter by Category
  if (selectedCategories.value.length > 0) {
    result = result.filter((s: any) => 
      s.systemCategory && 
      Array.isArray(s.systemCategory) && 
      s.systemCategory.some((c: string) => selectedCategories.value.includes(c))
    );
  }

  // 2. Filter by Gender (Always Execute)
  const currentGender = patientInfo.value?.sdSex;
  if (currentGender) {
    result = result.filter((s: any) => {
      // Assuming 's.applicablePopulation' structure is now standardized
      if (!s.applicablePopulation?.genders || s.applicablePopulation.genders.length === 0) {
        return true;
      }
      return s.applicablePopulation.genders.includes(currentGender);
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

const fetchAIDiagnosis = async () => {
  aiLoading.value = true;
  aiError.value = null;
  aiDiagnoses.value = [];
  selectedDiagnosis.value = null;
  const finishDiagnosisLlm = startTimedOperation('fetch_ai_diagnosis');

  try {
    const startTime = Date.now();
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
        patientName: patientInfo.value.naPi,
        gender: patientInfo.value.sdSexText || '',
        age: patientInfo.value.ageText || '',
        chiefComplaint: generatedRecord.value.chiefComplaint,
        historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness,
        tcmSigns: tcmSignsText
      });

      console.log('[TCM Debug] User Prompt:', userPrompt);

      fullResponse = await chat([
        {
          role: 'system',
          content: PROMPTS.consultation.tcmDiagnosisRecommendation.system
        },
        {
          role: 'user',
          content: userPrompt
        }
      ]);

      console.log('[TCM Debug] LLM Response:', fullResponse);
    } else {
      // Western Medicine Logic (Existing)
      fullResponse = await chat([
        {
          role: 'system',
          content: PROMPTS.consultation.diagnosisRecommendation.system
        },
        {
          role: 'user',
          content: PROMPTS.consultation.diagnosisRecommendation.buildUserPrompt({
            patientName: patientInfo.value.naPi,
            gender: patientInfo.value.sdSexText || '',
            age: patientInfo.value.ageText || '',
            chiefComplaint: generatedRecord.value.chiefComplaint,
            historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness
          })
        }
      ]);
    }
    const latencyMs = Date.now() - startTime;

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

    // Search knowledge base for related medical literature
    searchKnowledgeBaseForDiagnoses(diagnoses);

    // Save diagnosis recommendations to database
    try {
      for (const diagnosis of diagnoses) {
        await feedbackService.saveRecommendation({
          recType: 'diagnosis',
          content: JSON.stringify(diagnosis),
          matched: !!diagnosis.id,
          matchConfidence: diagnosis.id ? 1.0 : 0.0,
          latencyMs,
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
    finishDiagnosisLlm(true, { diagnosisCount: diagnoses.length, mode: consultationMode.value });
  } catch (e) {
    console.error("Failed to fetch AI diagnosis", e);
    trackError('ai_diagnosis_failed', e);
    finishDiagnosisLlm(false);
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

// Fact Check Functions
const performDiagnosisFactCheck = async (diagnoses: Diagnosis[]) => {
  if (!diagnoses || diagnoses.length === 0) return;

  // Show widget in checking state
  showFactCheckWidget.value = true;
  factCheckWidgetStatus.value = 'checking';
  factCheckTotalCount.value = diagnoses.length;
  factCheckCheckedCount.value = 0;
  factCheckProgress.value = 0;

  // Clear previous checks
  diagnosisFactChecks.value.clear();
  factCheckWidgetIssues.value = [];

  const allIssues: FactCheckIssue[] = [];

  // Check each diagnosis
  for (let i = 0; i < diagnoses.length; i++) {
    const diag = diagnoses[i];
    try {
      let result: FactCheckResult;

      if (consultationMode.value === 'tcm') {
        // Use TCM diagnosis checker
        result = await checkTCMDiagnosis({
          diagnosis: diag.name,
          chiefComplaint: generatedRecord.value.chiefComplaint,
          historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness,
          tcmFourExaminations: generatedRecord.value.tcmFourExaminations
        });
      } else {
        // Use Western diagnosis checker
        result = await checkDiagnosis({
          diagnosis: diag.name,
          chiefComplaint: generatedRecord.value.chiefComplaint,
          historyOfPresentIllness: generatedRecord.value.historyOfPresentIllness
        });
      }

      diagnosisFactChecks.value.set(diag.code, result);

      if (result.hasIssues && Array.isArray(result.issues)) {
        allIssues.push(...result.issues);
      }

      // Update progress
      factCheckCheckedCount.value = i + 1;
      factCheckProgress.value = Math.round(((i + 1) / diagnoses.length) * 100);
    } catch (e) {
      console.error(`Failed to fact check diagnosis: ${diag.name}`, e);
    }
  }

  // Deduplicate and update issues
  factCheckWidgetIssues.value = deduplicateIssues(allIssues);

  // Update widget to completed state
  factCheckWidgetStatus.value = 'completed';
};

const performTreatmentFactCheck = async (treatments: TreatmentRecommendation[]) => {
  if (!treatments || treatments.length === 0) return;

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

const toggleRelatedDropdown = (diag: Diagnosis, event: Event) => {
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

const swapDiagnosis = (originalDiag: Diagnosis, newItem: DiagnosisItem) => {
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

const handleDiagnosisSelect = (diag: Diagnosis) => {
  trackClick('diagnosis_select', { diagnosisName: diag.name, diagnosisCode: diag.code, hasId: !!diag.id });
  selectedDiagnosis.value = diag;

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
  const finishTreatmentLlm = startTimedOperation('fetch_treatment_recommendation');

  try {
    const startTime = Date.now();
    let fullResponse = "";

    if (consultationMode.value === 'tcm') {
      fullResponse = await chat([
        {
          role: 'system',
          content: PROMPTS.consultation.tcmTreatmentRecommendation.system
        },
        {
          role: 'user',
          content: PROMPTS.consultation.tcmTreatmentRecommendation.buildUserPrompt({
            patientName: patientInfo.value.naPi,
            gender: patientInfo.value.sdSexText || '',
            age: patientInfo.value.ageText || '',
            diagnosisName: selectedDiagnosis.value.name,
            chiefComplaint: generatedRecord.value.chiefComplaint
          })
        }
      ]);
    } else {
      fullResponse = await chat([
        {
          role: 'system',
          content: PROMPTS.consultation.treatmentRecommendation.system
        },
        {
          role: 'user',
          content: PROMPTS.consultation.treatmentRecommendation.buildUserPrompt({
            patientName: patientInfo.value.naPi,
            gender: patientInfo.value.sdSexText || '',
            age: patientInfo.value.ageText || '',
            diagnosisName: selectedDiagnosis.value.name,
            diagnosisCode: selectedDiagnosis.value.code || '',
            chiefComplaint: generatedRecord.value.chiefComplaint
          })
        }
      ]);
    }
    const latencyMs = Date.now() - startTime;

    const rawRecommendations: any[] = parseLLMJson(fullResponse);

    // Match against catalog
    const processedRecs: TreatmentRecommendation[] = rawRecommendations.map(rec => {
      let matchedItem = null;
      if (rec.type === 'medicine') {
        // Use service for smart matching
        matchedItem = medicalDataService.matchMedicine(rec.name);
      } else if (rec.type === 'exam') {
        // Use service for smart matching
        matchedItem = medicalDataService.matchItem(rec.name);
      }
      return {
        ...rec,
        matchedItem,
        selected: false
      };
    });

    treatmentRecommendations.value = processedRecs;

    // Save treatment recommendations to database
    try {
      for (const rec of processedRecs) {
        await feedbackService.saveRecommendation({
          recType: rec.type === 'medicine' ? 'medication' : 'examination',
          content: JSON.stringify(rec),
          matched: !!rec.matchedItem,
          matchConfidence: rec.matchedItem ? 1.0 : 0.0,
          latencyMs: latencyMs,
        });
      }

      // Record performance metric
      await feedbackService.recordMetric({
        metricType: 'llm_latency',
        metricValue: latencyMs,
        unit: 'ms',
        context: { operation: 'treatment_recommendation' }
      });
    } catch (err) {
      console.error('[ConsultationPage] Failed to save treatment recommendations:', err);
    }

    // Perform automatic fact checking on treatments
    performTreatmentFactCheck(processedRecs);
    finishTreatmentLlm(true, { treatmentCount: processedRecs.length, mode: consultationMode.value });
  } catch (e) {
    console.error("Failed to fetch treatment recommendations", e);
    trackError('treatment_recommendation_failed', e);
    finishTreatmentLlm(false);
    treatmentError.value = "无法获取治疗方案建议。";
  } finally {
    treatmentLoading.value = false;
  }
};

const toggleTreatmentSelection = (index: number) => {
  const item = treatmentRecommendations.value[index];
  if (item) {
    item.selected = !item.selected;
    trackClick('treatment_toggle', {
      treatmentName: item.name,
      type: item.type,
      selected: item.selected,
    });
  }
};

const handleComplete = () => {
  if (!selectedDiagnosis.value) {
    showToast("请先选择一个诊断结果", "info");
    return;
  }

  // Build Final Record
  const selectedTreatments = treatmentRecommendations.value
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
    const targetType = t.type === 'medicine' ? 'medication' as const : 'examination' as const;
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
      pastMedicalHistory: '否认高血压、糖尿病、冠心病等慢性病史。否认肝炎、结核等传染病史。',
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
    fetchTreatmentRecommendation();
  } else {
    treatmentRecommendations.value = [];
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

const generateMedicalRecord = () => {
  const complaints: string[] = [];
  const hpiParts: string[] = [];
  
  // -- Chief Complaint --
  // 使用 textGenConfig 生成主诉，或回退到默认逻辑
  selectedSymptoms.value.forEach(s => {
    const data = formData.value[s.key];
    
    // 尝试从 textGenConfig 生成
    const chiefComplaintTexts = generateTextsForSymptom(s, data, 'chiefComplaint');
    if (chiefComplaintTexts.length > 0) {
      complaints.push(`${s.name}${chiefComplaintTexts.join('')}`);
    } else {
      // 回退到默认逻辑
      if (data.onsetTime && data.onsetTime.inputValue && data.onsetTime.radioValue) {
        complaints.push(`${s.name}${data.onsetTime.inputValue}${data.onsetTime.radioValue}`);
      } else {
        complaints.push(s.name);
      }
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
    
    // 优先使用 textGenConfig 生成现病史文本
    const hpiTexts = generateTextsForSymptom(s, data, 'historyOfPresentIllness');
    if (hpiTexts.length > 0) {
      hpiParts.push(`${s.name}：${hpiTexts.join('，')}。`);
    } else {
      // 回退到原有逻辑
      let detail = formatSymptomDetail(s, data);
      if (detail) {
        hpiParts.push(`${s.name}，${detail}。`);
      }
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

  generatedRecord.value = {
    chiefComplaint,
    historyOfPresentIllness: hpiParts.join("\n"),
    tcmFourExaminations: tcmFourExamStr.trim()
  };
};

const formatSymptomDetail = (s: any, data: any) => {
    const details: string[] = [];
    
    // Iterate through configuration to ensure correct order
    if (s.config && s.config.sections) {
        s.config.sections.forEach((section: any) => {
            section.fields.forEach((field: any) => {
                const k = field.key;
                // Skip fields handled in intro
                if (k === 'onsetTime' || k === 'precipitatingFactor') return;
                
                const val = data[k];
                // Skip empty or invalid values
                if (val === undefined || val === null || val === '') return;
                
                // Filter out common negative/unclear answers
                const isInvalid = (v: string) => ['不清楚', '无', '以上都无', '未查', '不详', '不记得'].includes(v);

                let formatted = '';

                if (Array.isArray(val)) {
                    const validItems = val.filter(v => !isInvalid(v));
                    if (validItems.length > 0) {
                        if (s.key === 'cough' && k === 'colorFeature') {
                             formatted = `咳${validItems.join('、')}`;
                        } else {
                             formatted = validItems.join('、');
                        }
                    }
                } else if (typeof val === 'string') {
                    if (isInvalid(val)) return;
                    
                    if (s.key === 'fever' && k === 'maximumBodyTemperature') {
                        formatted = `最高体温${val}℃`;
                    } else {
                        formatted = val;
                    }
                } else if (typeof val === 'number') {
                     if (s.key === 'fever' && k === 'maximumBodyTemperature') {
                        formatted = `最高体温${val}℃`;
                    } else {
                        formatted = String(val);
                    }
                }
                
                if (formatted) details.push(formatted);
            });
        });
    } else {
        // Fallback (should typically not be reached if templates are correct)
         Object.keys(data).forEach(k => {
            if (k === 'onsetTime' || k === 'precipitatingFactor') return;
            const val = data[k];
            if (val && typeof val === 'string' && val !== '不清楚') details.push(val);
         });
    }

    return details.join('，');
};

const copyToClipboard = () => {
  trackClick('copy_to_clipboard');
  const text = `主诉：${generatedRecord.value.chiefComplaint}\n现病史：\n${generatedRecord.value.historyOfPresentIllness}`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制到剪贴板', 'success');
  });
};



</script>

<style scoped>
.consultation-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-background, #ECFEFF); /* 医疗背景色 */
  color: var(--color-text-strong, #0F172A);
  font-family: var(--font-body);
  font-size: 14px; /* Base font size */
  overflow: hidden;
}

.patient-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  background: linear-gradient(to right, var(--color-background-white), var(--color-background));
  padding: 8px 16px; /* Reduced padding */
  box-shadow: 0 2px 8px rgba(8, 145, 178, 0.08);
  z-index: 10;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border-light);
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
  background: var(--color-background-gray);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-light);
}

.avatar svg {
  width: 20px; /* Reduced icon size */
  height: 20px;
}

.patient-name {
  font-size: 16px; /* Slightly reduced */
  font-weight: 700;
  color: var(--color-text-strong);
}

.patient-basic {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-weak);
}

.divider {
  width: 1px;
  height: 12px;
  background: var(--color-border-medium);
}

.tag-blue {
  background: var(--color-info-bg);
  color: var(--color-info);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.tag-green {
  background: var(--color-success-bg);
  color: var(--color-success);
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
  color: var(--color-text-muted);
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
  border: 1px solid var(--color-border-medium);
  background: var(--color-background-white);
  border-radius: 18px;
  color: var(--color-text-weak);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--duration-normal) var(--ease-out);
  font-weight: 500;
}

.header-btn:hover {
  background: var(--color-background-gray);
  border-color: var(--color-border-strong);
  color: var(--color-text-strong);
}

.header-btn.primary {
  background: var(--color-cta);
  color: white;
  border: none;
  box-shadow: 0 2px 6px var(--color-cta-200);
}

.header-btn.primary:hover {
  background: var(--color-cta-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px var(--color-cta-200);
}

.header-btn.primary:disabled {
  background: var(--color-border-medium);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Mode Switch */
.mode-switch {
  display: flex;
  background: var(--color-background-gray);
  padding: 2px;
  border-radius: 16px;
  margin-right: 12px;
  border: 1px solid var(--color-border-medium);
}

.switch-btn {
  padding: 4px 12px;
  border-radius: 14px;
  border: none;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  color: var(--color-text-weak);
  transition: all 0.2s ease;
}

.switch-btn.active {
  background: white;
  color: var(--color-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  font-weight: 600;
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
}

.symptom-sidebar {
  width: 320px; /* 增加宽度以容纳人体图示 */
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-right: 1px solid var(--color-border-light);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-shadow: 2px 0 8px rgba(0,0,0,0.02);
  z-index: 5;
}

/* Selection Mode Tabs */
.selection-tabs {
  display: flex;
  padding: 10px;
  gap: 6px;
  border-bottom: 1px solid var(--color-border-light);
  background: transparent;
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 6px 8px;
  font-size: 12px;
  background: transparent;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  font-weight: 500;
  white-space: nowrap;
}

.tab-btn:hover {
  background: var(--color-background-gray);
  border-color: var(--color-info-border);
}

.tab-btn.active {
  background: var(--color-background, #ECFEFF);
  border-color: var(--color-primary, #0891B2);
  color: var(--color-primary, #0891B2);
  font-weight: 600;
}

/* Selection Content Area */
.selection-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px; /* 添加内边距 */
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
  padding: 10px; /* Reduced padding */
  border-bottom: 1px solid var(--color-border-light);
  background: transparent;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 6px 10px; /* Reduced padding */
  border: 1px solid var(--color-border-light); /* Light border */
  border-radius: 6px;
  font-size: 14px; /* Adjusted to 14px */
  box-sizing: border-box;
  outline: none;
  background: var(--color-background-white);
  transition: all var(--duration-slow) var(--ease-out);
}

.search-input:focus {
  border-color: var(--color-primary); /* Primary color on focus */
  box-shadow: 0 0 0 2px var(--color-primary-200);
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
  border-bottom: 1px solid var(--color-border-light);
  transition: all var(--duration-normal) var(--ease-out);
  color: var(--color-text-weak);
  font-size: 14px;
}

.symptom-list li:hover {
  background: var(--color-background);
  color: var(--color-primary);
  padding-left: 20px; /* Subtle movement */
}

.symptom-list li.active {
  background: var(--color-primary); /* Primary background */
  color: var(--color-background-white); /* White text */
  border-right: none;
  font-weight: 600;
  box-shadow: 0 4px 6px -1px var(--color-primary-200);
}

.symptom-list li.active:hover {
  background: var(--color-primary-dark);
  color: var(--color-background-white);
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
  box-shadow: 0 4px 20px var(--color-primary-50);
  padding: 12px; /* Ultra compact padding */
  margin-bottom: 12px; /* Ultra compact margin */
  border: 1px solid var(--color-border-light);
  transition: transform var(--duration-normal) var(--ease-smooth);
}

.symptom-form-section:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px var(--color-primary-100);
}

.form-header {
  background: linear-gradient(to right, var(--color-background-white), var(--color-background));
  margin: -12px -12px 12px -12px; /* Adjusted for new padding */
  padding: 8px 16px; /* Compact padding */
  border-bottom: 1px solid var(--color-border-light);
  border-radius: 12px 12px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.remove-btn {
  color: var(--color-text-disabled);
  padding: 4px;
}

.remove-btn:hover {
  color: var(--color-error);
  background: var(--color-error-bg);
}

.form-header h2 {
  margin: 0;
  font-size: 15px; /* Slightly smaller font */
  font-weight: 600;
  color: var(--color-text-primary); /* Dark cyan */
  display: flex;
  align-items: center;
}

.form-header h2::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 14px;
  background: var(--color-primary);
  margin-right: 10px;
  border-radius: 2px;
}

.section-title {
  margin: 20px 0 12px 0;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
  background: linear-gradient(90deg, var(--color-primary-bg) 0%, transparent 100%);
  border-left: 3px solid var(--color-primary);
  border-radius: 4px;
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
  padding-top: 4px; /* Reduced */
}

.form-field {
  display: flex;
  align-items: flex-start;
  margin-bottom: 10px; /* Compact margin */
  border-bottom: 1px dashed var(--color-border-light);
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
  color: var(--color-text-medium);
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
  padding: 6px 10px; /* Reduced padding */
  border: 1px solid var(--color-border-medium);
  border-radius: 6px;
  width: 100px; /* Default small width */
  outline: none;
  transition: all var(--duration-slow) var(--ease-out);
  color: var(--color-text-strong);
  font-size: 14px; /* Adjusted to 14px */
}

.field-input .text-input {
  width: 100%; /* Full width for standalone inputs */
}

.text-input:focus {
  border-color: var(--color-primary);
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
  color: var(--color-text-weak);
  padding: 4px 10px; /* Reduced padding */
  border-radius: 20px;
  transition: all var(--duration-normal) var(--ease-out);
  border: 1px solid var(--color-border-light); /* Subtle default border */
  background: var(--color-background-white);
}

.radio-label:hover, .checkbox-label:hover {
  background: var(--color-background-gray);
  border-color: var(--color-border-medium);
}

.radio-label.is-active, .checkbox-label.is-active {
  background: var(--color-primary-50);
  color: var(--color-primary-dark);
  border-color: var(--color-primary);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.1);
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
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  color: var(--color-border-medium);
}

.empty-icon svg {
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

.submit-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
  transition: all var(--duration-slow) var(--ease-out);
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
  background: var(--color-background-gray);
  overflow: hidden;
  position: relative;
  min-height: 0;
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
  gap: 16px; /* Reduced gap */
  padding: 16px; /* Reduced padding */
  overflow: hidden;
  min-height: 0;
}

.record-panel {
  flex: 1;
  background: var(--color-background-white);
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border-light);
}

.left-panel {
  flex: 0.8; /* Reduced width */
}

.right-panel {
  flex: 1.2; /* Increased width */
  background: var(--color-background-light);
  border-color: var(--color-border-light);
}

.panel-header {
  padding: 10px 16px; /* Compact */
  border-bottom: 1px solid var(--color-border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-background-white);
}

.right-panel .panel-header {
  background: var(--color-background-gray);
}

.panel-header h3 {
  margin: 0;
  font-size: 15px; /* Slightly smaller */
  color: var(--color-text-medium);
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
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(5px);
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.ai-spinner {
  position: relative;
  width: 48px;
  height: 48px;
}

.spinner-ring {
  position: absolute;
  inset: 0;
  border: 3px solid var(--color-border-light);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  background: radial-gradient(circle, var(--color-primary) 0%, var(--color-primary-light) 100%);
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.5);
  animation: pulse-core 1.5s ease-in-out infinite;
}

.loading-content {
  text-align: center;
}

.loading-title {
  color: var(--color-text-strong);
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.loading-desc {
  color: var(--color-text-muted);
  font-size: 13px;
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
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: white;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.ai-card {
  background: var(--color-background-white);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  border: 1px solid var(--color-border-light);
  position: relative;
  overflow: hidden;
  min-height: 200px;
  overflow-y: auto;
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
}

.ai-card h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--color-text-weak);
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
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: var(--color-background-light);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.diagnosis-item:hover {
  background: var(--color-background-gray);
  border-color: var(--color-border-medium);
}

.diagnosis-item.active {
  background: var(--color-primary-50);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.diag-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.diag-name {
  font-weight: 600;
  color: var(--color-text-strong);
  font-size: 14px;
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
  font-size: 12px;
  color: var(--color-primary-dark);
  background: var(--color-info-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.diag-rationale {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.tcm-detail {
  margin-top: 8px;
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

.treatment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.treatment-item {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-background-white);
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  padding: 10px;
  gap: 8px;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  overflow: hidden;
}

.selected-mark {
  position: absolute;
  top: 0;
  right: 0;
  width: 24px;
  height: 24px;
  background: var(--color-primary);
  color: white;
  border-radius: 0 0 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 2px;
  padding-left: 2px;
}

.treatment-item:hover {
  background-color: var(--color-background-light);
  border-color: var(--color-border-medium);
}

.treatment-item.active {
  background-color: var(--color-primary-50);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
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
  background: var(--color-info-bg);
  color: var(--color-primary-dark);
}

.rec-tag.exam {
  background: var(--tag-exam-bg);
  color: var(--tag-exam-text);
}

.rec-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-strong);
}

.rec-reason, .rec-usage, .rec-ingredients {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.4;
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
  margin: 24px;
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
  padding: 8px 12px;
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
  font-size: 14px;
  color: var(--color-text-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
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
  font-size: 10px;
  transition: transform var(--duration-normal) var(--ease-smooth);
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
  gap: 4px;
  background: var(--color-success-bg);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-success-border);
  font-size: 12px;
  margin-left: 6px;
}

.match-icon {
  color: var(--color-success-text);
  font-weight: bold;
}

.unmatched-icon {
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.6;
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
</style>
