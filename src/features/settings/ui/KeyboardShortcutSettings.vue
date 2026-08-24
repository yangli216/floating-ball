<script setup lang="ts">
import { shallowRef } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import {
  KEYBOARD_SHORTCUT_DEFINITIONS,
  captureKeyboardShortcut,
  formatKeyboardShortcut,
  getDefaultKeyboardShortcuts,
  validateKeyboardShortcut,
  type KeyboardShortcutAction,
  type KeyboardShortcutBindings,
} from '../model/keyboardShortcuts';

const model = defineModel<KeyboardShortcutBindings>({ required: true });
const recordingAction = shallowRef<KeyboardShortcutAction | null>(null);
const validationMessage = shallowRef('');

function startRecording(action: KeyboardShortcutAction): void {
  recordingAction.value = action;
  validationMessage.value = '';
}

function stopRecording(): void {
  recordingAction.value = null;
}

function recordShortcut(event: KeyboardEvent, action: KeyboardShortcutAction): void {
  event.preventDefault();
  event.stopPropagation();
  if (event.code === 'Escape') {
    stopRecording();
    return;
  }
  if (event.code === 'Backspace' || event.code === 'Delete') {
    model.value = { ...model.value, [action]: '' };
    validationMessage.value = '';
    stopRecording();
    return;
  }
  const binding = captureKeyboardShortcut(event);
  if (!binding) {
    validationMessage.value = '请至少组合 Cmd/Ctrl 或 Alt，再按一个非修饰键。';
    return;
  }
  const message = validateKeyboardShortcut(binding, model.value, action);
  if (message) {
    validationMessage.value = message;
    return;
  }
  model.value = { ...model.value, [action]: binding };
  validationMessage.value = '';
  stopRecording();
}

function clearShortcut(action: KeyboardShortcutAction): void {
  model.value = { ...model.value, [action]: '' };
  validationMessage.value = '';
  if (recordingAction.value === action) stopRecording();
}

function restoreDefaults(): void {
  model.value = getDefaultKeyboardShortcuts();
  validationMessage.value = '';
  stopRecording();
}
</script>

<template>
  <section class="settings-section shortcut-section" aria-labelledby="keyboard-shortcut-heading">
    <div class="section-header shortcut-header">
      <div class="section-title-inline">
        <Icon icon="lucide:keyboard" :size="20" />
        <h3 id="keyboard-shortcut-heading">快捷键</h3>
      </div>
      <button type="button" class="restore-btn" @click="restoreDefaults">
        <Icon icon="lucide:rotate-ccw" :size="14" aria-hidden="true" />
        恢复默认
      </button>
    </div>
    <p class="section-desc">以下全局导航键仅在全医慧助窗口聚焦且不在输入框、输入法组合态或弹窗内时生效；设置页保存固定使用 Cmd/Ctrl+S。</p>

    <div class="shortcut-list">
      <div v-for="definition in KEYBOARD_SHORTCUT_DEFINITIONS" :key="definition.id" class="shortcut-row">
        <div class="shortcut-copy">
          <strong>{{ definition.label }}</strong>
          <span>{{ definition.description }}</span>
        </div>
        <kbd :aria-label="`当前快捷键：${formatKeyboardShortcut(model[definition.id])}`">
          {{ formatKeyboardShortcut(model[definition.id]) }}
        </kbd>
        <button
          type="button"
          class="record-btn"
          :class="{ recording: recordingAction === definition.id }"
          @click="startRecording(definition.id)"
          @keydown="recordingAction === definition.id && recordShortcut($event, definition.id)"
          @blur="recordingAction === definition.id && stopRecording()"
        >
          {{ recordingAction === definition.id ? '请按组合键…' : '重新录入' }}
        </button>
        <button
          type="button"
          class="clear-btn"
          :disabled="!model[definition.id]"
          :aria-label="`清除“${definition.label}”快捷键`"
          @click="clearShortcut(definition.id)"
        >
          <Icon icon="lucide:x" :size="15" aria-hidden="true" />
        </button>
      </div>
    </div>
    <p v-if="validationMessage" class="shortcut-message" role="alert">{{ validationMessage }}</p>
    <p class="shortcut-tip">录入时按 Esc 取消，按 Delete 或 Backspace 清除当前项；更改随设置页“保存设置”一起生效。</p>
  </section>
</template>

<style scoped>
.shortcut-section { display: grid; gap: 14px; }
.section-header { display: flex; align-items: center; gap: 12px; margin: 0; padding-bottom: 12px; border-bottom: 2px solid var(--medical-border-light); color: var(--medical-primary); }
.shortcut-header { justify-content: space-between; }
.section-title-inline, .restore-btn, .record-btn, .clear-btn { display: inline-flex; align-items: center; }
.section-title-inline { gap: 10px; }
.section-title-inline h3 { margin: 0; color: var(--medical-text-primary); font-size: 18px; font-weight: 600; }
.section-desc { margin: 0; color: var(--medical-text-muted); font-size: 14px; line-height: 1.5; }
.restore-btn, .record-btn, .clear-btn { border: 1px solid var(--medical-border-medium); border-radius: 8px; background: #fff; color: var(--medical-text-muted); font: inherit; cursor: pointer; }
.restore-btn { gap: 6px; padding: 6px 10px; }
.shortcut-list { display: grid; border: 1px solid var(--medical-border-light); border-radius: 10px; overflow: hidden; }
.shortcut-row { display: grid; grid-template-columns: minmax(190px, 1fr) minmax(112px, auto) auto 34px; gap: 10px; align-items: center; padding: 12px; background: #fff; }
.shortcut-row + .shortcut-row { border-top: 1px solid var(--medical-border-light); }
.shortcut-copy { display: grid; gap: 3px; min-width: 0; }
.shortcut-copy strong { color: var(--medical-text-secondary); font-size: 14px; }
.shortcut-copy span, .shortcut-tip { color: var(--medical-text-muted); font-size: 12px; line-height: 1.5; }
kbd { justify-self: end; min-width: 98px; padding: 5px 8px; border: 1px solid #cbd5e1; border-bottom-width: 2px; border-radius: 7px; background: #f8fafc; color: #334155; font: 600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
.record-btn { justify-content: center; min-width: 86px; padding: 7px 10px; }
.record-btn.recording { border-color: var(--medical-primary); background: #ecfeff; color: var(--medical-primary-hover); }
.clear-btn { justify-content: center; width: 32px; height: 32px; padding: 0; }
.clear-btn:disabled { opacity: .4; cursor: not-allowed; }
.restore-btn:hover:not(:disabled), .record-btn:hover:not(:disabled), .clear-btn:hover:not(:disabled) { border-color: var(--medical-primary); color: var(--medical-primary-hover); }
.restore-btn:focus-visible, .record-btn:focus-visible, .clear-btn:focus-visible { outline: 3px solid rgba(8, 145, 178, 0.35); outline: 3px solid color-mix(in srgb, var(--medical-primary) 35%, transparent); outline-offset: 2px; }
.shortcut-message { margin: 0; color: #b91c1c; font-size: 12px; }
.shortcut-tip { margin: 0; }
@media (max-width: 720px) {
  .shortcut-row { grid-template-columns: 1fr auto 34px; }
  .shortcut-copy { grid-column: 1 / -1; }
  kbd { justify-self: start; }
}
</style>
