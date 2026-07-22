// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_SHORTCUT_STORAGE_KEY,
  captureKeyboardShortcut,
  formatKeyboardShortcut,
  getDefaultKeyboardShortcuts,
  loadKeyboardShortcuts,
  resolveKeyboardShortcutAction,
  saveKeyboardShortcuts,
  validateKeyboardShortcut,
  type KeyboardShortcutStorage,
} from './keyboardShortcuts';

class MemoryStorage implements KeyboardShortcutStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function keyboardEvent(code: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, code, ...init });
}

describe('keyboard shortcuts', () => {
  it('provides a stable unified default set', () => {
    expect(getDefaultKeyboardShortcuts()).toEqual({
      'toggle-assistant': 'Mod+Shift+Space',
      'open-chat': 'Mod+Shift+C',
      'open-settings': 'Mod+Comma',
    });
  });

  it('captures platform-neutral combinations and formats them for each platform', () => {
    expect(captureKeyboardShortcut(keyboardEvent('Space', { metaKey: true, shiftKey: true }))).toBe('Mod+Shift+Space');
    expect(captureKeyboardShortcut(keyboardEvent('KeyC', { ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+C');
    expect(captureKeyboardShortcut(keyboardEvent('KeyC'))).toBeNull();
    expect(formatKeyboardShortcut('Mod+Shift+Space', true)).toBe('⌘ ⇧ Space');
    expect(formatKeyboardShortcut('Mod+Shift+Space', false)).toBe('Ctrl + Shift + Space');
  });

  it('rejects conflicts and reserved editing or system combinations', () => {
    const bindings = getDefaultKeyboardShortcuts();
    expect(validateKeyboardShortcut('Mod+Shift+C', bindings, 'open-settings')).toContain('AI 对话');
    expect(validateKeyboardShortcut('Mod+S', bindings, 'open-settings')).toContain('保留键');
    expect(validateKeyboardShortcut('Alt+F4', bindings, 'open-settings')).toContain('保留键');
    expect(validateKeyboardShortcut('Alt+F2', bindings, 'open-settings')).toBeNull();
  });

  it('persists valid bindings and preserves intentionally cleared actions', () => {
    const storage = new MemoryStorage();
    const bindings = { ...getDefaultKeyboardShortcuts(), 'open-chat': '', 'open-settings': 'Alt+F2' };
    saveKeyboardShortcuts(bindings, storage);
    expect(loadKeyboardShortcuts(storage)).toEqual(bindings);
  });

  it('falls back safely when stored data is invalid or conflicting', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEYBOARD_SHORTCUT_STORAGE_KEY, JSON.stringify({
      'toggle-assistant': 'Mod+S',
      'open-chat': 'Alt+F2',
      'open-settings': 'Alt+F2',
    }));
    expect(loadKeyboardShortcuts(storage)).toEqual(getDefaultKeyboardShortcuts());
  });

  it('does not dispatch while editing, composing, repeating, or inside a modal', () => {
    const bindings = getDefaultKeyboardShortcuts();
    const input = document.createElement('input');
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    modal.append(button);
    document.body.append(input, modal);

    const editableEvent = keyboardEvent('KeyC', { ctrlKey: true, shiftKey: true });
    input.dispatchEvent(editableEvent);
    expect(resolveKeyboardShortcutAction(editableEvent, bindings)).toBeNull();
    expect(resolveKeyboardShortcutAction(keyboardEvent('KeyC', { ctrlKey: true, shiftKey: true, repeat: true }), bindings)).toBeNull();
    expect(resolveKeyboardShortcutAction(keyboardEvent('KeyC', { ctrlKey: true, shiftKey: true, isComposing: true }), bindings)).toBeNull();
    const modalEvent = keyboardEvent('KeyC', { ctrlKey: true, shiftKey: true });
    button.dispatchEvent(modalEvent);
    expect(resolveKeyboardShortcutAction(modalEvent, bindings)).toBeNull();

    input.remove();
    modal.remove();
  });

  it('resolves an enabled action from the current bindings', () => {
    expect(resolveKeyboardShortcutAction(
      keyboardEvent('Comma', { ctrlKey: true }),
      getDefaultKeyboardShortcuts(),
    )).toBe('open-settings');
  });
});
