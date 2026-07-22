import createDOMPurify, {
  type Config,
  type DOMPurify,
  type WindowLike,
} from 'dompurify';

const FORBIDDEN_TAGS = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'link',
  'meta',
  'base',
  'svg',
  'math',
  'video',
  'audio',
  'canvas',
] as const;

const FORBIDDEN_ATTRIBUTES = [
  'action',
  'formaction',
  'href',
  'integrity',
  'nonce',
  'ping',
  'srcdoc',
  'srcset',
  'target',
] as const;

const SAFE_STYLE_PROPERTIES = new Set([
  'background',
  'background-color',
  'border',
  'border-bottom',
  'border-bottom-color',
  'border-bottom-style',
  'border-bottom-width',
  'border-collapse',
  'border-color',
  'border-left',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-radius',
  'border-right',
  'border-right-color',
  'border-right-style',
  'border-right-width',
  'border-spacing',
  'border-style',
  'border-top',
  'border-top-color',
  'border-top-style',
  'border-top-width',
  'border-width',
  'color',
  'display',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'overflow',
  'overflow-wrap',
  'overflow-x',
  'overflow-y',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'table-layout',
  'text-align',
  'text-decoration',
  'text-indent',
  'vertical-align',
  'white-space',
  'width',
  'word-break',
  'word-wrap',
]);

const UNSAFE_STYLE_VALUE = /(?:url\s*\(|expression\s*\(|javascript\s*:|@import|behavior\s*:|-moz-binding|\\|[{}<>]|!important)/i;
const MAX_STYLE_VALUE_LENGTH = 512;
const MAX_STYLE_LENGTH = 4_096;

const SAFE_HTML_CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [...FORBIDDEN_TAGS],
  FORBID_ATTR: [...FORBIDDEN_ATTRIBUTES],
  ALLOW_ARIA_ATTR: true,
  ALLOW_DATA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  FORCE_BODY: true,
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
  SANITIZE_DOM: true,
  SANITIZE_NAMED_PROPS: true,
};

function resolvePurifier(): DOMPurify | null {
  if (typeof createDOMPurify.sanitize === 'function') {
    return createDOMPurify;
  }
  if (typeof window === 'undefined') {
    return null;
  }
  return createDOMPurify(window as unknown as WindowLike);
}

const purifier = resolvePurifier();

export function sanitizeInlineStyle(style: string): string {
  if (!style || style.length > MAX_STYLE_LENGTH) {
    return '';
  }

  return style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(':');
      if (separator <= 0) return '';

      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (
        !SAFE_STYLE_PROPERTIES.has(property)
        || !value
        || value.length > MAX_STYLE_VALUE_LENGTH
        || UNSAFE_STYLE_VALUE.test(value)
      ) {
        return '';
      }
      return `${property}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

function isSafeImageSource(value: string): boolean {
  const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  if (!normalized) return false;
  if (/^(?:\/|\.\/|\.\.\/|#)/.test(normalized)) return true;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(normalized)) return true;
  return /^(?:https?:|blob:|asset:|http:\/\/asset\.localhost\/)/i.test(normalized);
}

if (purifier) {
  purifier.addHook('uponSanitizeAttribute', (_node, data) => {
    const attributeName = data.attrName.toLowerCase();
    if (attributeName === 'style') {
      const safeStyle = sanitizeInlineStyle(data.attrValue);
      data.attrValue = safeStyle;
      data.keepAttr = Boolean(safeStyle);
      return;
    }

    if (attributeName === 'src' && !isSafeImageSource(data.attrValue)) {
      data.keepAttr = false;
    }
  });
}

export function escapeHtml(value: string): string {
  return String(value || '')
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#039;');
}

/**
 * Sanitizes HTML received from HIS/PHIS, server-managed knowledge content or
 * external templates before it is parsed or rendered in the Tauri WebView.
 */
export function sanitizeExternalHtml(value: string | null | undefined): string {
  const source = String(value || '').trim();
  if (!source) return '';
  if (!purifier) {
    return `<pre>${escapeHtml(source)}</pre>`;
  }
  return String(purifier.sanitize(source, SAFE_HTML_CONFIG));
}
