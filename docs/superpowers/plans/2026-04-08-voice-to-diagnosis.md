# Voice Consultation to Diagnosis Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire voice consultation output (chief complaint + HPI) into ConsultationPage so it auto-triggers diagnosis recommendation, bypassing VoiceConsultationResult.

**Architecture:** Add a `voiceRecord` ref in App.vue, modify `useVoiceConsultation.handleVoiceStop` to populate it and navigate to consultation view, and add voice mode logic in ConsultationPage that skips symptom selection and auto-triggers diagnosis.

**Tech Stack:** Vue 3 (Composition API), TypeScript, Tauri 2.0

---

## File Map

| File | Role | Action |
|------|------|--------|
| `src/composables/useVoiceConsultation.ts` | Voice workflow orchestration | Modify: change `handleVoiceStop` to store voiceRecord and navigate to consultation |
| `src/App.vue` | Root state + component wiring | Modify: add `voiceRecord` ref, pass as prop, clear on close |
| `src/components/ConsultationPage.vue` | Form-based consultation | Modify: add `voiceRecord` prop, `isVoiceMode`, auto-fill + auto-trigger |

---

### Task 1: Add `voiceRecord` ref and prop wiring in App.vue

**Files:**
- Modify: `src/App.vue:58` (add ref)
- Modify: `src/App.vue:487-493` (add prop to ConsultationPage)
- Modify: `src/App.vue:489` (clear voiceRecord on close)

- [ ] **Step 1: Add `voiceRecord` ref after `generatedRecord` ref**

At line 58 in `src/App.vue`, after the existing `generatedRecord` ref, add:

```typescript
const voiceRecord = ref<{ chiefComplaint: string; historyOfPresentIllness: string } | null>(null);
```

- [ ] **Step 2: Pass `voiceRecord` as prop to ConsultationPage**

Change the ConsultationPage template (around line 487) from:

```vue
<ConsultationPage
  v-show="currentView === 'consultation'"
  @close="handleCollapse"
  :initialPatientData="currentPatient"
  :assistTrigger="consultationAssistTrigger"
  @consume-auto-trigger="clearConsultationAssistTrigger"
/>
```

to:

```vue
<ConsultationPage
  v-show="currentView === 'consultation'"
  @close="handleCollapse"
  :initialPatientData="currentPatient"
  :assistTrigger="consultationAssistTrigger"
  :voiceRecord="voiceRecord"
  @consume-auto-trigger="clearConsultationAssistTrigger"
  @consume-voice-record="voiceRecord = null"
/>
```

- [ ] **Step 3: Clear voiceRecord when consultation closes**

Find the `handleCollapse` usage at `@close="handleCollapse"` on ConsultationPage. We already handle this via the `@consume-voice-record` emit above, but we should also clear on collapse. Wrap the close handler:

Change `@close="handleCollapse"` to `@close="() => { voiceRecord = null; handleCollapse(); }"`.

Actually, combining steps 2 and 3, the final template is:

```vue
<ConsultationPage
  v-show="currentView === 'consultation'"
  @close="() => { voiceRecord = null; handleCollapse(); }"
  :initialPatientData="currentPatient"
  :assistTrigger="consultationAssistTrigger"
  :voiceRecord="voiceRecord"
  @consume-auto-trigger="clearConsultationAssistTrigger"
  @consume-voice-record="voiceRecord = null"
/>
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && yarn build`

Expected: Build passes (ConsultationPage doesn't use `voiceRecord` prop yet, but Vue allows extra props without errors).

- [ ] **Step 5: Commit**

```bash
cd /Users/das/SourceCode/regional-ai-workspace/floating-ball
git add src/App.vue
git commit -m "feat: add voiceRecord ref and prop wiring in App.vue"
```

---

### Task 2: Modify `useVoiceConsultation.handleVoiceStop` to navigate to consultation

**Files:**
- Modify: `src/composables/useVoiceConsultation.ts:28-48` (options interface)
- Modify: `src/composables/useVoiceConsultation.ts:107-208` (handleVoiceStop function)
- Modify: `src/App.vue:168-176` (pass new options)

- [ ] **Step 1: Add `voiceRecord` and navigation to the options interface**

In `src/composables/useVoiceConsultation.ts`, update `VoiceConsultationOptions` (line 28) to add:

```typescript
export interface VoiceConsultationOptions {
  /** Tauri window instance ref */
  appWindow: Ref<TauriWindow | null>;
  /** Current view */
  currentView: Ref<ViewType>;
  /** Generated record (legacy, kept for backward compat) */
  generatedRecord: Ref<GeneratedRecord | null>;
  /** Voice record output for ConsultationPage */
  voiceRecord: Ref<{ chiefComplaint: string; historyOfPresentIllness: string } | null>;
  /** Current patient */
  currentPatient: Ref<AppPatient | null>;
  /** Toast function */
  showToast: (msg: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  /** Window management API */
  windowMgmt: {
    smartExpand: (width: number, height: number) => Promise<void>;
  };
  /** Work mode API */
  workMode: {
    enterWorkMode: (customW?: number, customH?: number) => Promise<void>;
    exitWork: (sessionStatus?: 'completed' | 'cancelled' | 'error') => Promise<void>;
  };
}
```

And destructure it in the function body (line 76):

```typescript
const {
  appWindow,
  currentView,
  generatedRecord,
  voiceRecord,
  currentPatient,
  showToast,
  windowMgmt,
  workMode,
} = options;
```

- [ ] **Step 2: Rewrite `handleVoiceStop` to navigate to consultation**

Replace the `handleVoiceStop` function body (lines 107-208) with:

```typescript
async function handleVoiceStop(audioBlob: Blob, transcribedText: string): Promise<void> {
  console.log('[VoiceConsultation] handleVoiceStop received blob:', audioBlob?.size, 'bytes');
  console.log('[VoiceConsultation] Transcribed text:', transcribedText);

  // Stay on voice-interaction view while processing (capsule shows loading state via event)
  const finishVoiceLlm = startTimedOperation('voice_llm_processing');
  try {
    const text = transcribedText;
    console.log('[VoiceConsultation] Using realtime transcription:', text);

    if (!text || text.trim().length === 0) {
      throw new Error('未能识别到有效语音');
    }

    // LLM Generation
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.consultation.medicalRecordGeneration.system },
      { role: 'user', content: PROMPTS.consultation.medicalRecordGeneration.buildUserPrompt(text) },
    ];

    console.log('[VoiceConsultation] Sending request to LLM...');
    const llmStart = Date.now();
    const jsonStr = await chat(messages);
    console.log(`[VoiceConsultation] Response received in ${Date.now() - llmStart}ms`);

    // Parse JSON
    let cleanJson = jsonStr.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanJson = jsonMatch[0];
    }

    const parsed = JSON.parse(cleanJson);

    // Check if LLM detected irrelevant content
    if (parsed.error) {
      console.warn('[VoiceConsultation] Irrelevant content detected:', parsed.message);
      showToast(parsed.message || '输入内容与医疗问诊场景无关', 'error');
      setTimeout(() => {
        exitWork('cancelled');
      }, 2000);
      return;
    }

    // Validate required fields
    if (!parsed.chiefComplaint) parsed.chiefComplaint = '未能识别';
    if (!parsed.historyOfPresentIllness) parsed.historyOfPresentIllness = '未能识别';

    // Store voice record for ConsultationPage
    voiceRecord.value = {
      chiefComplaint: parsed.chiefComplaint,
      historyOfPresentIllness: parsed.historyOfPresentIllness,
    };

    // Navigate to consultation view
    currentView.value = 'consultation';
    if (appWindow.value) {
      try {
        await appWindow.value.setResizable(true);
        await appWindow.value.setSize(
          new LogicalSize(WINDOW_SIZES.CONSULTATION.width, WINDOW_SIZES.CONSULTATION.height)
        );
        await smartExpand(WINDOW_SIZES.CONSULTATION.width, WINDOW_SIZES.CONSULTATION.height);
      } catch (e) {
        console.error('[VoiceConsultation] Failed to resize for consultation:', e);
      }
    } else {
      await enterWorkMode(WINDOW_SIZES.CONSULTATION.width, WINDOW_SIZES.CONSULTATION.height);
    }

    console.log('[VoiceConsultation] Navigated to consultation with voice record');
    finishVoiceLlm(true, {
      transcriptionLength: text.length,
    });
  } catch (err: unknown) {
    console.error('[VoiceConsultation] Processing failed:', err);
    trackError('voice_processing_failed', err);
    const errMessage = err instanceof Error ? err.message : String(err);
    finishVoiceLlm(false, { errorMessage: errMessage });
    showToast(`处理失败: ${errMessage}`, 'error');
    setTimeout(() => {
      exitWork('error');
    }, 2000);
  }
}
```

- [ ] **Step 3: Pass `voiceRecord` in App.vue composable call**

In `src/App.vue` (around line 168), update the `useVoiceConsultation` call:

```typescript
const voiceConsultation = useVoiceConsultation({
  appWindow,
  currentView,
  generatedRecord,
  voiceRecord,
  currentPatient,
  showToast,
  windowMgmt,
  workMode,
});
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && yarn build`

Expected: Build passes.

- [ ] **Step 5: Commit**

```bash
cd /Users/das/SourceCode/regional-ai-workspace/floating-ball
git add src/composables/useVoiceConsultation.ts src/App.vue
git commit -m "feat: voice consultation navigates to ConsultationPage with voiceRecord"
```

---

### Task 3: Add voice mode to ConsultationPage

**Files:**
- Modify: `src/components/ConsultationPage.vue:1022-1030` (props + emits)
- Modify: `src/components/ConsultationPage.vue:1194-1195` (add isVoiceMode state)
- Modify: `src/components/ConsultationPage.vue` (add watcher for voiceRecord)
- Modify: `src/components/ConsultationPage.vue:56-364` (template: hide sidebar/forms in voice mode)
- Modify: `src/components/ConsultationPage.vue:1734-1762` (reset voice mode on workflow reset)

- [ ] **Step 1: Add `voiceRecord` prop and `consume-voice-record` emit**

In `src/components/ConsultationPage.vue`, update the props definition (line 1022):

```typescript
const props = defineProps<{
  initialPatientData?: any;
  assistTrigger?: {
    kind: ConsultationAssistAction;
    token: number;
  } | null;
  voiceRecord?: {
    chiefComplaint: string;
    historyOfPresentIllness: string;
  } | null;
}>();
```

Update the emits (line 1030):

```typescript
const emit = defineEmits(['close', 'consume-auto-trigger', 'consume-voice-record']);
```

- [ ] **Step 2: Add `isVoiceMode` ref**

After the `currentView` ref (line 1194), add:

```typescript
const isVoiceMode = ref(false);
```

- [ ] **Step 3: Add watcher for `voiceRecord` prop**

After the existing `assistTrigger` watcher (around line 4095), add:

```typescript
watch(
  () => props.voiceRecord,
  async (record) => {
    if (!record) return;

    // Enter voice mode
    isVoiceMode.value = true;

    // Fill chief complaint and HPI
    generatedRecord.value.chiefComplaint = record.chiefComplaint;
    generatedRecord.value.historyOfPresentIllness = record.historyOfPresentIllness;

    // Consume the prop so it doesn't re-trigger
    emit('consume-voice-record');

    // Switch to record view and trigger diagnosis
    await nextTick();
    currentView.value = 'record';
    assistFocus.value = 'diagnosis';
    if (aiDiagnoses.value.length === 0 && !aiLoading.value) {
      await fetchAIDiagnosis();
    }
  },
  { immediate: true }
);
```

- [ ] **Step 4: Hide symptom sidebar and form area in voice mode**

In the template, modify the `content-container` div (line 56). Wrap the sidebar in a `v-if`:

Change:
```vue
<div class="content-container" v-if="currentView === 'consultation'">
  <!-- Left: Symptom Shortcuts -->
  <aside class="symptom-sidebar">
```

To:
```vue
<div class="content-container" v-if="currentView === 'consultation' && !isVoiceMode">
  <!-- Left: Symptom Shortcuts -->
  <aside class="symptom-sidebar">
```

Also hide the consultation footer (line 367). Change:
```vue
<div v-if="currentView === 'consultation'" class="consultation-footer">
```

To:
```vue
<div v-if="currentView === 'consultation' && !isVoiceMode" class="consultation-footer">
```

This way, when `isVoiceMode` is true and the watcher sets `currentView = 'record'`, the record view (which already shows chief complaint, HPI, diagnosis recommendations, etc.) is displayed directly.

- [ ] **Step 5: Reset `isVoiceMode` in `resetWorkflowState`**

In the `resetWorkflowState` function (line 1734), add `isVoiceMode.value = false;` after the existing `currentView.value = 'consultation';` line:

```typescript
const resetWorkflowState = () => {
  currentView.value = 'consultation';
  isVoiceMode.value = false;
  assistFocus.value = null;
  // ... rest unchanged
};
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && yarn build`

Expected: Build passes with no type errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/das/SourceCode/regional-ai-workspace/floating-ball
git add src/components/ConsultationPage.vue
git commit -m "feat: add voice mode to ConsultationPage with auto-fill and diagnosis trigger"
```

---

### Task 4: End-to-end manual verification

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && yarn tauri dev`

- [ ] **Step 2: Test voice-to-diagnosis flow**

1. Trigger voice consultation (via floating ball menu or HTTP endpoint):
   ```bash
   curl -X POST http://localhost:8899/api/consultation/voice \
     -H "Content-Type: application/json" \
     -d '{"patientId":"123","name":"测试患者","gender":"男性","age":"30岁"}'
   ```
2. Verify VoiceCapsule appears (360x80 capsule)
3. Speak test content or wait for recognition
4. Click stop button
5. Verify: capsule stays visible during LLM processing (no jump to voice-result)
6. Verify: after LLM completes, window expands to consultation size (1080x720)
7. Verify: ConsultationPage record view appears with chief complaint and HPI filled
8. Verify: symptom sidebar is NOT shown
9. Verify: diagnosis recommendation auto-triggers (loading indicator, then results)
10. Verify: can continue the flow (select diagnosis, get treatment recommendations, generate report)

- [ ] **Step 3: Test form flow still works**

1. Open consultation via floating ball menu (non-voice path)
2. Verify: symptom sidebar appears as before
3. Verify: full form workflow functions correctly
4. Verify: no regressions in the existing flow

- [ ] **Step 4: Test cancel from voice mode**

1. Trigger voice consultation flow
2. After reaching ConsultationPage in voice mode, click cancel/close
3. Verify: app returns to ball mode
4. Verify: next consultation (form or voice) starts fresh

- [ ] **Step 5: Commit final state if any adjustments were needed**

```bash
cd /Users/das/SourceCode/regional-ai-workspace/floating-ball
git add -A
git commit -m "fix: adjustments from end-to-end voice-to-diagnosis testing"
```
