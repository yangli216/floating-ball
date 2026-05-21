import Pinyin from 'tiny-pinyin';

export interface SymptomFilterItem {
  name: string;
  systemCategory?: string[];
  applicablePopulation?: {
    genders?: string[];
  };
}

export interface FilterSymptomsInput<TSymptom extends SymptomFilterItem> {
  symptoms: TSymptom[];
  searchQuery: string;
  selectedCategories: string[];
  patientGenderCode?: string;
}

function resolveCompatibleGenderCodes(patientGenderCode?: string): string[] {
  if (!patientGenderCode) return [];
  if (patientGenderCode === 'M') return ['M', '1'];
  if (patientGenderCode === 'F') return ['F', '2'];
  return [patientGenderCode];
}

function matchesSearchQuery(name: string, query: string): boolean {
  const normalizedName = name.toLowerCase();
  if (normalizedName.includes(query)) return true;

  if (!Pinyin.isSupported()) return false;

  const pinyinFull = Pinyin.convertToPinyin(name, '', true);
  if (pinyinFull.includes(query)) return true;

  const pinyinInitials = Pinyin.convertToPinyin(name, ' ', true)
    .split(' ')
    .map((char: string) => char[0])
    .join('');
  return pinyinInitials.includes(query);
}

export function filterSymptoms<TSymptom extends SymptomFilterItem>({
  symptoms,
  searchQuery,
  selectedCategories,
  patientGenderCode,
}: FilterSymptomsInput<TSymptom>): TSymptom[] {
  let result = symptoms;

  if (!searchQuery && selectedCategories.length > 0) {
    result = result.filter((symptom) =>
      Array.isArray(symptom.systemCategory)
      && symptom.systemCategory.some((category) => selectedCategories.includes(category)),
    );
  }

  const compatibleGenders = resolveCompatibleGenderCodes(patientGenderCode);
  if (compatibleGenders.length > 0) {
    result = result.filter((symptom) => {
      const genders = symptom.applicablePopulation?.genders;
      if (!genders || genders.length === 0) {
        return true;
      }
      return compatibleGenders.some((gender) => genders.includes(gender));
    });
  }

  const query = searchQuery.trim().toLowerCase();
  if (!query) return result;

  return result.filter((symptom) => matchesSearchQuery(symptom.name, query));
}
