export type KnowledgeSearchType = 'diagnosis' | 'medication' | 'examination';

export interface KnowledgeNamedItem {
  name?: string | null;
}

export interface KnowledgeTreatmentItem extends KnowledgeNamedItem {
  type?: string | null;
}

export interface KnowledgeSearchCategories {
  diagnoses: string[];
  medications: string[];
  examinations: string[];
}

export interface BuildKnowledgeSearchCategoriesInput {
  diagnoses?: readonly KnowledgeNamedItem[];
  medications?: readonly KnowledgeNamedItem[];
  examinations?: readonly KnowledgeNamedItem[];
  treatments?: readonly KnowledgeTreatmentItem[];
}

export interface KnowledgeBatchResultsLike<TResult = unknown> {
  diagnoses: Map<string, TResult[]>;
  medications: Map<string, TResult[]>;
  examinations: Map<string, TResult[]>;
}

function extractNames(items: readonly KnowledgeNamedItem[] = []): string[] {
  return items.map(item => item.name || '').filter(Boolean);
}

export function buildKnowledgeSearchCategories({
  diagnoses = [],
  medications = [],
  examinations = [],
  treatments = [],
}: BuildKnowledgeSearchCategoriesInput): KnowledgeSearchCategories {
  const categories: KnowledgeSearchCategories = {
    diagnoses: extractNames(diagnoses),
    medications: extractNames(medications),
    examinations: extractNames(examinations),
  };

  treatments.forEach(item => {
    const name = item.name || '';
    if (!name) {
      return;
    }

    if (item.type === 'medicine') {
      categories.medications.push(name);
    } else if (item.type === 'exam') {
      categories.examinations.push(name);
    }
  });

  return categories;
}

export function countKnowledgeBatchResults(results: KnowledgeBatchResultsLike): number {
  return (
    Array.from(results.diagnoses.values()).flat().length +
    Array.from(results.medications.values()).flat().length +
    Array.from(results.examinations.values()).flat().length
  );
}

export function resolveKnowledgeSearchType(item: { type?: string | null }): KnowledgeSearchType {
  if (item.type === 'medicine') {
    return 'medication';
  }

  if (item.type === 'exam') {
    return 'examination';
  }

  return 'diagnosis';
}
