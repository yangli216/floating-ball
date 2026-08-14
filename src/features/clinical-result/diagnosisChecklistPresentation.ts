export interface DiagnosisChecklistHighlightSegment {
  text: string;
  highlighted: boolean;
}

const CHECKLIST_SEPARATOR_PATTERN = /([，,、；;。！？!?：:（）()])/gu;
const CHECKLIST_SEPARATOR_ONLY_PATTERN = /^[，,、；;。！？!?：:（）()]$/u;
const CHECKLIST_ACTION_PREFIX_PATTERN = /^(\s*(?:建议补充询问|建议询问|请确认|确认|重点核查|核查|复核|补充询问|询问|明确|评估|观察|排除|了解|注意|当前诊断不能解释|是否|有无)(?:患者)?(?:是否|有无|无|伴有?|存在)?)/u;

function pushSegment(
  segments: DiagnosisChecklistHighlightSegment[],
  text: string,
  highlighted: boolean,
): void {
  if (!text) return;
  const previous = segments[segments.length - 1];
  if (previous?.highlighted === highlighted) {
    previous.text += text;
    return;
  }
  segments.push({ text, highlighted });
}

/**
 * Keeps checklist text as safe text nodes while separating action/context words
 * from clinical phrases that doctors need to scan first.
 */
export function buildDiagnosisChecklistHighlightSegments(
  value: string,
): DiagnosisChecklistHighlightSegment[] {
  if (!value) return [];
  const segments: DiagnosisChecklistHighlightSegment[] = [];
  value.split(CHECKLIST_SEPARATOR_PATTERN).forEach((part) => {
    if (!part) return;
    if (CHECKLIST_SEPARATOR_ONLY_PATTERN.test(part) || !part.trim()) {
      pushSegment(segments, part, false);
      return;
    }
    const prefix = part.match(CHECKLIST_ACTION_PREFIX_PATTERN)?.[1] || '';
    if (prefix) pushSegment(segments, prefix, false);
    const clinicalPhrase = part.slice(prefix.length);
    pushSegment(segments, clinicalPhrase, clinicalPhrase.trim().length >= 2);
  });
  return segments;
}
