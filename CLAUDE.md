# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered medical assistant desktop application built with Tauri 2.0 + Vue 3 + TypeScript. It presents as a transparent floating ball that expands into various medical consultation interfaces. The app integrates with external HIS (Hospital Information Systems) via HTTP and supports voice-based consultation using Aliyun real-time speech recognition.

**Key Technologies:**
- Frontend: Vue 3 (Composition API) + TypeScript + Vite
- Desktop: Tauri 2.0 (Rust)
- AI: OpenAI-compatible LLM API (supports DeepSeek, ChatGPT, etc.)
- Voice: Aliyun Real-time Speech Recognition WebSocket
- Data: CSV-based medical knowledge base (20,000+ diagnoses, medicines, items)

## Development Commands

```bash
# Install dependencies
yarn install  # or: pnpm install

# Development (hot reload)
yarn tauri dev

# Build production binary
yarn tauri build

# Type checking only
yarn build  # runs vue-tsc --noEmit && vite build

# Release (automatic versioning + git tagging)
yarn release         # patch version (0.1.0 -> 0.1.1)
yarn release minor   # minor version (0.1.0 -> 0.2.0)
yarn release major   # major version (0.1.0 -> 1.0.0)
```

**Release Workflow:** The `yarn release` command auto-increments version in `package.json` and `tauri.conf.json`, creates a git tag, and prompts for push. After push, GitHub Actions builds signed installers for macOS/Windows/Linux and generates updater metadata.

## Architecture

### Application States & Views

The app operates in two primary modes managed in [App.vue](src/App.vue):

1. **Ball Mode** (160x160px): Transparent floating ball with ring menu (chat, settings, consultation, exit)
2. **Work Mode**: Expanded panels with multiple views
   - `chat`: LLM chat interface ([ChatPanel.vue](src/components/ChatPanel.vue))
   - `settings`: Configuration panel ([SettingsPanel.vue](src/components/SettingsPanel.vue))
   - `consultation`: Form-based consultation ([ConsultationPage.vue](src/components/ConsultationPage.vue))
   - `voice-interaction`: Voice recording capsule ([VoiceCapsule.vue](src/components/VoiceCapsule.vue))
   - `voice-result`: Voice consultation result editor ([VoiceConsultationResult.vue](src/components/VoiceConsultationResult.vue))
   - `reception-capsule`: Patient risk alert capsule ([ReceptionCapsule.vue](src/components/ReceptionCapsule.vue))

**Window Sizing:** Each view has predefined dimensions (e.g., consultation: 1200x900, voice capsule: 360x80). The app uses morphing animations with `transform-origin` tracking to smoothly expand/collapse from ball position.

### HIS Integration (External System Communication)

**Backend HTTP Server** ([http_server.rs](src-tauri/src/http_server.rs)):
- Runs on `http://localhost:8899` (Actix-web with CORS enabled)
- Endpoints:
  - `POST /api/patient/consultation/start`: Receives patient data, emits `start-consultation` event to frontend
  - `POST /api/patient/risks`: Receives patient risk data, triggers LLM risk analysis, emits `show-patient-risks` event
  - `POST /api/consultation/voice`: Triggers voice consultation mode via `start-voice-consultation` event
  - `POST /api/consultation/stop`: Stops active consultation
  - `GET /api/consultation/result`: Returns last consultation result

**Event Flow:**
```
HIS System (HTTP) → Rust HTTP Server → Tauri Events → Vue Components
                                    ↓
                               AppState (Mutex)
```

**Data Models:**
- `PatientInfo`: Patient demographics (supports field aliasing for flexibility)
- `ConsultationResult`: Structured medical record output (flattened JSON)
- `PatientRiskData`: Patient info + medical history for risk analysis

### Voice Consultation Workflow

1. **Trigger:** Deep link (`floating-ball://voice-consultation`) or HTTP `/api/consultation/voice`
2. **Recording:** [VoiceCapsule.vue](src/components/VoiceCapsule.vue)
   - Uses [audioRecorder.ts](src/services/audioRecorder.ts) (Web Audio API with PCM16 conversion)
   - Streams PCM data to Aliyun WebSocket ([aliyunSpeech.ts](src/services/aliyunSpeech.ts))
   - Real-time transcription displayed during recording
3. **LLM Processing:** [App.vue:handleVoiceStop](src/App.vue:256-385)
   - Transcribed text → structured medical record via LLM (prompt in [App.vue:286-325](src/App.vue:286-325))
   - Generates: chief complaint, HPI, diagnoses, medications, examinations
4. **Result Review:** [VoiceConsultationResult.vue](src/components/VoiceConsultationResult.vue)
   - User edits/confirms structured data
   - Local medical data matching (diagnoses, medicines, items)
5. **Submission:** Calls `complete_consultation` command → saves to `AppState` → HIS can fetch via `/api/consultation/result`

### Medical Data Matching System

**Service:** [medicalData.ts](src/services/medicalData.ts)
**Data Files:** [src/assets/](src/assets/) (CSV format)
- `diagnoses.csv`: ICD-10 diagnoses (id, code, name, keywords)
- `medicines.csv`: Medicines (id, name, spec)
- `items.csv`: Medical items/tests (id, name, category)

**Matching Algorithm:**
1. Exact match (name/code)
2. Fuzzy match with keywords
3. Pinyin support (via `tiny-pinyin` for Chinese)

**Usage:** LLM outputs generic names → system matches to standardized local catalog → ensures data consistency for HIS submission.

### Form-Based Consultation

**Component:** [ConsultationPage.vue](src/components/ConsultationPage.vue)

**Workflow:**
1. **Symptom Selection:** Three modes (tabs)
   - Common symptoms (searchable with pinyin)
   - By body part ([BodyPartSelector.vue](src/components/BodyPartSelector.vue))
   - By system ([SystemCategorySelector.vue](src/components/SystemCategorySelector.vue))
2. **Dynamic Forms:** Each selected symptom (max 3) loads a config from [templates.json](src/assets/templates.json)
   - Field types: `input_radio`, `radio`, `checkbox`, `number`, `input`
   - Automatic "General Condition" section (spirit, sleep, appetite, etc.)
3. **Record Generation:** Converts form data into chief complaint + HPI text
4. **AI Assistance:**
   - Diagnosis recommendation (LLM + local matching)
   - Treatment plan (medicines + examinations with matching)
5. **Final Report:** Print-ready format for submission

### LLM Integration

**Service:** [llm.ts](src/services/llm.ts)

**Configuration Sources (priority order):**
1. `localStorage` keys: `OPENAI_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`
2. Environment variables: `VITE_OPENAI_API_KEY`, `VITE_LLM_BASE_URL`, `VITE_LLM_MODEL`
3. Defaults: OpenAI official API

**Functions:**
- `chatStream()`: Streaming chat (SSE parsing)
- `chat()`: Non-streaming chat (full response)
- `analyzePatientRisks()`: Risk analysis prompt (returns structured `RiskItem[]`)
- `transcribeAudio()`: Audio transcription (used as fallback if Aliyun fails)

**Prompt Engineering Notes:**
- Medical record generation prompt in [App.vue:286-325](src/App.vue:286-325) includes:
  - Semantic filtering (removes casual conversation)
  - Structured JSON output with validation
  - Fine-grained splitting for combined items (e.g., "A+B" → separate entries)
  - Smart inference when data is incomplete

### Window Management & Drag Behavior

**Hover Detection:** Due to Tauri limitations with unfocused transparent windows, a Rust thread polls mouse position ([lib.rs:94-133](src-tauri/src/lib.rs:94-133)) and emits `hover-change`/`mouse-pos` events. Frontend CSS uses these events to trigger ring menu animations.

**Drag Handling:**
- Uses `data-tauri-drag-region` attribute for toolbar dragging
- Ball mode uses `window.startDragging()` on mousedown
- Position persisted to `.settings.dat` (tauri-plugin-store)

**Always-on-Top Toggle:** Managed via settings panel, applies only in Work Mode (ball always stays on top).

### State Persistence

**Store:** `.settings.dat` (via tauri-plugin-store)
**Saved State:**
- Window position (x, y)
- LLM config (API key, base URL, model)
- App state (isWorking, currentView) - **Note:** App always starts in ball mode to avoid invisible window issues

## Key Conventions

### Component Communication

- **Emit Pattern:** Components emit semantic events (e.g., `@close`, `@confirm`, `@select-symptom`) to parent
- **Global Toast:** Injected via `provide('showToast', ...)` in App.vue, callable from any component
- **Patient Context:** `currentPatient` ref in App.vue serves as global patient state across views

### Styling

- **CSS Variables:** Defined in [App.vue styles](src/App.vue:1283-1293) (e.g., `--accent`, `--text-strong`)
- **Transitions:** Uses `morph` transition with `transform-origin` for expand/collapse animations
- **Scoped Styles:** All component styles are scoped; global styles in App.vue for theme variables

### Error Handling

- **HTTP Server:** Returns JSON with error messages; frontend shows toasts
- **LLM Errors:** Caught and displayed with fallback mechanisms (e.g., irrelevant content detection)
- **Voice Errors:** Recording errors trigger `@error` event → exit work mode

## Important Files

- [App.vue](src/App.vue): Main app state, view routing, window management, voice workflow orchestration
- [ConsultationPage.vue](src/components/ConsultationPage.vue): Form-based consultation (1330+ lines)
- [lib.rs](src-tauri/src/lib.rs): Tauri setup, hover polling thread, command handlers
- [http_server.rs](src-tauri/src/http_server.rs): HIS integration REST API
- [medicalData.ts](src/services/medicalData.ts): Medical data matching service
- [llm.ts](src/services/llm.ts): LLM API client
- [aliyunSpeech.ts](src/services/aliyunSpeech.ts): Real-time speech recognition WebSocket client
- [templates.json](src/assets/templates.json): Symptom form configurations

## Testing Notes

- No formal test suite currently exists
- Manual testing workflow:
  1. Start dev server (`yarn tauri dev`)
  2. Test ball hover/ring menu interactions
  3. Test HIS integration via curl: `curl -X POST http://localhost:8899/api/patient/consultation/start -H "Content-Type: application/json" -d '{"patientId":"123","name":"测试患者","gender":"男性","age":"30岁"}'`
  4. Test voice consultation: Use deep link or HTTP trigger
  5. Test form consultation: Click left ring button (consultation icon)

## Build & Release

**Platform-Specific Notes:**
- **macOS:** Requires signing certificate for distribution (set in GitHub secrets for CI)
- **Windows:** Uses `installMode: passive` for silent updates
- **Linux:** Builds AppImage and deb packages

**Updater:** Auto-checks `https://github.com/yangli216/floating-ball/releases/latest/download/latest.json` on startup. Users can manually check via Settings panel.

## Known Issues & Workarounds

1. **Window Position on macOS:** Sometimes position validation fails on multi-monitor setups → app uses fallback (100, 100)
2. **Hover Detection:** Unfocused transparent windows don't receive mouse events → solved with Rust polling thread
3. **Voice Recording on Windows:** Some Windows builds require microphone permission → handled via browser permission prompt
4. **LLM Rate Limits:** No built-in retry mechanism → users must handle API errors manually
