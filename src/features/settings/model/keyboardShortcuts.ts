export type KeyboardShortcutAction = 'toggle-assistant' | 'open-chat' | 'open-settings';

export type KeyboardShortcutBindings = Record<KeyboardShortcutAction, string>;

export interface KeyboardShortcutDefinition {
  id: KeyboardShortcutAction;
  label: string;
  description: string;
  defaultBinding: string;
}

export interface KeyboardShortcutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const KEYBOARD_SHORTCUT_STORAGE_KEY = 'FLOATING_BALL_KEYBOARD_SHORTCUTS_V1';

export const KEYBOARD_SHORTCUT_DEFINITIONS: readonly KeyboardShortcutDefinition[] = [
  {
    id: 'toggle-assistant',
    label: '切换悬浮球 / 当前工作区',
    description: '收起正在使用的工作区，或唤起并恢复智医助理。',
    defaultBinding: 'Mod+Shift+Space',
  },
  {
    id: 'open-chat',
    label: '打开 AI 对话',
    description: '从悬浮球或其他工作区直接进入 AI 对话。',
    defaultBinding: 'Mod+Shift+C',
  },
  {
    id: 'open-settings',
    label: '打开设置',
    description: '直接进入通用设置。',
    defaultBinding: 'Mod+Comma',
  },
] as const;

const ACTION_IDS = KEYBOARD_SHORTCUT_DEFINITIONS.map(({ id }) => id);
const DEFAULT_BINDINGS = Object.fromEntries(
  KEYBOARD_SHORTCUT_DEFINITIONS.map(({ id, defaultBinding }) => [id, defaultBinding]),
) as KeyboardShortcutBindings;
const SUPPORTED_KEY_PATTERN = /^(?:[A-Z]|[0-9]|F(?:[1-9]|1[0-2])|Space|Enter|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/;
const RESERVED_MOD_ONLY_KEYS = new Set(['A', 'C', 'F', 'L', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Z']);
const RESERVED_BINDINGS = new Set(['Alt+F4', 'Mod+H', 'Mod+M', 'Mod+Space']);

export function getDefaultKeyboardShortcuts(): KeyboardShortcutBindings {
  return { ...DEFAULT_BINDINGS };
}

function keyTokenFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1[0-2])$/.test(code)) return code;
  if (SUPPORTED_KEY_PATTERN.test(code)) return code;
  return null;
}

function isSupportedBinding(binding: string): boolean {
  if (!binding) return true;
  const parts = binding.split('+');
  const key = parts[parts.length - 1] ?? '';
  const modifiers = parts.slice(0, -1);
  if (!SUPPORTED_KEY_PATTERN.test(key) || modifiers.length === 0) return false;
  if (!modifiers.every(modifier => ['Mod', 'Alt', 'Shift'].includes(modifier))) return false;
  if (new Set(modifiers).size !== modifiers.length) return false;
  return modifiers.join('+') === ['Mod', 'Alt', 'Shift'].filter(modifier => modifiers.includes(modifier)).join('+');
}

function isReservedBinding(binding: string): boolean {
  const parts = binding.split('+');
  return RESERVED_BINDINGS.has(binding)
    || (parts.length === 2 && parts[0] === 'Mod' && RESERVED_MOD_ONLY_KEYS.has(parts[1]));
}

export function captureKeyboardShortcut(event: KeyboardEvent): string | null {
  const key = keyTokenFromCode(event.code);
  if (!key || (!event.metaKey && !event.ctrlKey && !event.altKey)) return null;
  const modifiers = [
    event.metaKey || event.ctrlKey ? 'Mod' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
  ].filter(Boolean);
  return [...modifiers, key].join('+');
}

export function validateKeyboardShortcut(
  binding: string,
  bindings: KeyboardShortcutBindings,
  action: KeyboardShortcutAction,
): string | null {
  if (!binding) return null;
  if (!isSupportedBinding(binding)) return '请至少组合 Cmd/Ctrl 或 Alt，并使用受支持的按键。';
  if (isReservedBinding(binding)) return '该组合键属于系统、编辑操作或设置保存保留键，请换一组。';
  const conflict = ACTION_IDS.find(id => id !== action && bindings[id] === binding);
  if (conflict) {
    const label = KEYBOARD_SHORTCUT_DEFINITIONS.find(({ id }) => id === conflict)?.label ?? '其他操作';
    return `该组合键已用于“${label}”。`;
  }
  return null;
}

export function formatKeyboardShortcut(
  binding: string,
  isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
): string {
  if (!binding) return '未设置';
  const macLabels: Record<string, string> = { Mod: '⌘', Alt: '⌥', Shift: '⇧', Space: 'Space', Comma: ',' };
  const otherLabels: Record<string, string> = { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Space: 'Space', Comma: ',' };
  const labels = isMac ? macLabels : otherLabels;
  return binding.split('+').map(part => labels[part] ?? part).join(isMac ? ' ' : ' + ');
}

export function sanitizeKeyboardShortcutBindings(input: unknown): KeyboardShortcutBindings {
  if (!input || typeof input !== 'object') return getDefaultKeyboardShortcuts();
  const source = input as Partial<Record<KeyboardShortcutAction, unknown>>;
  const candidates = ACTION_IDS.map((id) => {
    const value = source[id];
    return typeof value === 'string' && isSupportedBinding(value) && !isReservedBinding(value)
      ? value
      : DEFAULT_BINDINGS[id];
  });
  const counts = new Map<string, number>();
  candidates.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
  const result = getDefaultKeyboardShortcuts();
  ACTION_IDS.forEach((id, index) => {
    const candidate = candidates[index];
    result[id] = candidate === '' || counts.get(candidate) === 1 ? candidate : DEFAULT_BINDINGS[id];
  });
  return result;
}

export function loadKeyboardShortcuts(storage: KeyboardShortcutStorage = localStorage): KeyboardShortcutBindings {
  try {
    const stored = storage.getItem(KEYBOARD_SHORTCUT_STORAGE_KEY);
    return stored ? sanitizeKeyboardShortcutBindings(JSON.parse(stored)) : getDefaultKeyboardShortcuts();
  } catch {
    return getDefaultKeyboardShortcuts();
  }
}

export function saveKeyboardShortcuts(
  bindings: KeyboardShortcutBindings,
  storage: KeyboardShortcutStorage = localStorage,
): void {
  storage.setItem(KEYBOARD_SHORTCUT_STORAGE_KEY, JSON.stringify(sanitizeKeyboardShortcutBindings(bindings)));
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}

export function resolveKeyboardShortcutAction(
  event: KeyboardEvent,
  bindings: KeyboardShortcutBindings,
): KeyboardShortcutAction | null {
  if (event.defaultPrevented || event.repeat || event.isComposing || isEditableShortcutTarget(event.target)) return null;
  if (event.target instanceof Element && event.target.closest('[role="dialog"], [aria-modal="true"]')) return null;
  const binding = captureKeyboardShortcut(event);
  return binding ? ACTION_IDS.find(id => bindings[id] === binding) ?? null : null;
}
