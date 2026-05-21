import { computed, ref } from 'vue';

export interface CompanionSymptomLike {
  key: string;
  name: string;
}

export interface UseCompanionSymptomsInput<TSymptom extends CompanionSymptomLike> {
  associations: Record<string, string[]>;
  getSymptoms: () => TSymptom[];
  getSelectedSymptoms: () => Array<Pick<TSymptom, 'key'>>;
  recommendationLimit?: number;
}

export function useCompanionSymptoms<TSymptom extends CompanionSymptomLike>(
  input: UseCompanionSymptomsInput<TSymptom>,
) {
  const companionSymptoms = ref<Set<string>>(new Set());
  const recommendationLimit = input.recommendationLimit ?? 10;

  function toggleCompanionSymptom(symptomKey: string): void {
    const next = new Set(companionSymptoms.value);
    if (next.has(symptomKey)) {
      next.delete(symptomKey);
    } else {
      next.add(symptomKey);
    }
    companionSymptoms.value = next;
  }

  function isCompanionSelected(symptomKey: string): boolean {
    return companionSymptoms.value.has(symptomKey);
  }

  const companionSymptomNames = computed(() =>
    Array.from(companionSymptoms.value).map((key) => {
      const symptom = input.getSymptoms().find((item) => item.key === key);
      return symptom ? symptom.name : key;
    }),
  );

  function getSymptomRecommendations(symptomKey: string): TSymptom[] {
    const related = input.associations[symptomKey];
    if (!related) return [];

    const selectedKeys = new Set(input.getSelectedSymptoms().map((symptom) => symptom.key));
    const allTemplates = input.getSymptoms();

    return related
      .filter((key) => !selectedKeys.has(key))
      .slice(0, recommendationLimit)
      .map((key) => allTemplates.find((symptom) => symptom.key === key))
      .filter((symptom): symptom is TSymptom => Boolean(symptom));
  }

  function removeCompanionSymptom(symptomKey: string): void {
    if (!companionSymptoms.value.has(symptomKey)) {
      return;
    }
    const next = new Set(companionSymptoms.value);
    next.delete(symptomKey);
    companionSymptoms.value = next;
  }

  function resetCompanionSymptoms(): void {
    companionSymptoms.value = new Set();
  }

  return {
    companionSymptomNames,
    companionSymptoms,
    getSymptomRecommendations,
    isCompanionSelected,
    removeCompanionSymptom,
    resetCompanionSymptoms,
    toggleCompanionSymptom,
  };
}

export type CompanionSymptomsState = ReturnType<typeof useCompanionSymptoms>;
