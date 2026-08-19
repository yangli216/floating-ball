import type {
  ClinicalRecordExplicitFact,
  ClinicalRecordFactSuggestion,
} from './clinicalRecordFactConfirmation';

export interface ClinicalRecordAnnotationTextSegment {
  kind: 'text';
  text: string;
}

export interface ClinicalRecordAnnotationFactSegment {
  kind: 'fact';
  text: string;
  fact: ClinicalRecordExplicitFact;
}

export interface ClinicalRecordAnnotationSuggestionSegment {
  kind: 'suggestion';
  text: string;
  suggestion: ClinicalRecordFactSuggestion;
  start?: number;
  end?: number;
}

export type ClinicalRecordAnnotationSegment =
  | ClinicalRecordAnnotationTextSegment
  | ClinicalRecordAnnotationFactSegment
  | ClinicalRecordAnnotationSuggestionSegment;

interface AnnotationRange {
  start: number;
  end: number;
  match: 'exact' | 'compact' | 'semantic-negative';
  fact?: ClinicalRecordExplicitFact;
  suggestion?: ClinicalRecordFactSuggestion;
}

function sourceWeight(fact: ClinicalRecordExplicitFact): number {
  if (fact.source === 'structured-answer') return 2;
  return 1;
}

function rangeWeight(range: AnnotationRange): number {
  if (range.suggestion) return range.suggestion.priority === 'critical' ? 5 : 4;
  return range.fact ? sourceWeight(range.fact) : 0;
}

function findTextRange(recordText: string, targetText: string): AnnotationRange | null {
  const exactStart = recordText.indexOf(targetText);
  if (exactStart >= 0) {
    return { start: exactStart, end: exactStart + targetText.length, match: 'exact' };
  }

  const ignored = /[\s，。；、：:！？!?（）()]/u;
  const compactChars: string[] = [];
  const sourceIndices: number[] = [];
  Array.from(recordText).forEach((char, index) => {
    if (ignored.test(char)) return;
    compactChars.push(char);
    sourceIndices.push(index);
  });
  const compactTarget = Array.from(targetText).filter((char) => !ignored.test(char)).join('');
  if (!compactTarget) return null;
  const compactStart = compactChars.join('').indexOf(compactTarget);
  if (compactStart >= 0) {
    const sourceStart = sourceIndices[compactStart];
    const sourceEnd = sourceIndices[compactStart + compactTarget.length - 1];
    if (typeof sourceStart === 'number' && typeof sourceEnd === 'number') {
      return { start: sourceStart, end: sourceEnd + 1, match: 'compact' };
    }
  }

  const negativePattern = /(?:否认|不伴|未见|未闻及|未及|无)/u;
  if (!negativePattern.test(targetText)) return null;
  const targetTerms = targetText
    .replace(/(?:否认|不伴|未见|未闻及|未及|无)/gu, '')
    .split(/[、，,及和与]/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  if (targetTerms.length < 2) return null;
  const sentencePattern = /[^。；;\n]+/gu;
  for (const match of recordText.matchAll(sentencePattern)) {
    const sentence = match[0];
    const negativeStart = sentence.search(negativePattern);
    if (negativeStart < 0) continue;
    if (!targetTerms.every((term) => sentence.includes(term))) continue;
    const sentenceStart = match.index ?? -1;
    if (sentenceStart < 0) continue;
    return {
      start: sentenceStart + negativeStart,
      end: sentenceStart + sentence.length,
      match: 'semantic-negative',
    };
  }
  return null;
}

/**
 * Splits only the persisted record value. Suggestions are used solely to mark
 * matching ranges; unmatched reading-layer text is appended by the UI component
 * and can never leak into save data.
 */
export function buildClinicalRecordAnnotationSegments(
  recordText: string,
  facts: readonly ClinicalRecordExplicitFact[],
  suggestions: readonly ClinicalRecordFactSuggestion[] = [],
): ClinicalRecordAnnotationSegment[] {
  if (!recordText) return [];

  const factCandidates: AnnotationRange[] = facts
    .map<AnnotationRange | null>((fact) => {
      const range = findTextRange(recordText, fact.text);
      return range ? { ...range, fact } : null;
    })
    .filter((item): item is AnnotationRange => Boolean(item));
  const suggestionCandidates: AnnotationRange[] = suggestions
    .filter((item) => item.status === 'pending')
    .map<AnnotationRange | null>((suggestion) => {
      const range = findTextRange(recordText, suggestion.negativeRecordText);
      return range ? { ...range, suggestion } : null;
    })
    .filter((item): item is AnnotationRange => Boolean(item));
  const candidates = [...factCandidates, ...suggestionCandidates]
    .sort((left, right) => (
      left.start - right.start
      || (right.end - right.start) - (left.end - left.start)
      || rangeWeight(right) - rangeWeight(left)
    ));

  const selected: AnnotationRange[] = [];
  for (const candidate of candidates) {
    const overlaps = selected.some((item) => candidate.start < item.end && candidate.end > item.start);
    if (!overlaps) selected.push(candidate);
  }
  selected.sort((left, right) => left.start - right.start);

  if (selected.length === 0) return [{ kind: 'text', text: recordText }];

  const segments: ClinicalRecordAnnotationSegment[] = [];
  let cursor = 0;
  for (const item of selected) {
    if (item.start > cursor) {
      segments.push({ kind: 'text', text: recordText.slice(cursor, item.start) });
    }
    const text = recordText.slice(item.start, item.end);
    if (item.suggestion) {
      segments.push({
        kind: 'suggestion',
        text,
        suggestion: item.suggestion,
        start: item.start,
        end: item.end,
      });
    } else if (item.fact) {
      segments.push({ kind: 'fact', text, fact: item.fact });
    }
    cursor = item.end;
  }
  if (cursor < recordText.length) {
    segments.push({ kind: 'text', text: recordText.slice(cursor) });
  }
  return segments;
}

function cleanRecordAfterRangeEdit(value: string): string {
  return value
    .replace(/\s+([，。；、！？])/gu, '$1')
    .replace(/([，。；、！？])(?:\s*[，。；、！？])+/gu, (sequence) => {
      const terminal = sequence.match(/[。！？]/u)?.[0];
      if (terminal) return terminal;
      if (sequence.includes('；')) return '；';
      if (sequence.includes('，')) return '，';
      return '、';
    })
    .replace(/^[\s，。；、]+/gu, '')
    .replace(/[\s，；、]+$/gu, '')
    .trim();
}

/**
 * Applies an explicit doctor edit to the persisted record. A matched suggestion
 * replaces its exact rendered range. An unmatched reading-layer suggestion is
 * appended only when the doctor supplies non-empty text; removing it leaves the
 * persisted record untouched.
 */
export function applyClinicalRecordSuggestionEdit(
  recordText: string,
  segment: ClinicalRecordAnnotationSuggestionSegment,
  nextText: string,
): string {
  const edited = nextText.trim();
  const hasStableRange = (
    typeof segment.start === 'number'
    && typeof segment.end === 'number'
    && segment.start >= 0
    && segment.end >= segment.start
    && recordText.slice(segment.start, segment.end) === segment.text
  );
  if (hasStableRange) {
    return cleanRecordAfterRangeEdit(
      `${recordText.slice(0, segment.start)}${edited}${recordText.slice(segment.end)}`,
    );
  }
  if (!edited) return recordText;
  const current = recordText.trim().replace(/[，、]\s*$/u, '');
  const normalizedEdited = /[。；！？]$/u.test(edited) ? edited : `${edited}。`;
  if (!current) return normalizedEdited;
  const separator = /[。；！？]$/u.test(current) ? '' : '。';
  return `${current}${separator}${normalizedEdited}`;
}
