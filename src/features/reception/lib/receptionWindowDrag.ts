const INTERACTIVE_CONTROL_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[contenteditable="true"]',
].join(',');

export function shouldRequestReceptionWindowDrag(
  handle: EventTarget | null,
  target: EventTarget | null,
): boolean {
  if (!(handle instanceof Element) || !(target instanceof Element) || !handle.contains(target)) {
    return false;
  }

  const interactiveControl = target.closest(INTERACTIVE_CONTROL_SELECTOR);
  return interactiveControl === null || interactiveControl === handle;
}
