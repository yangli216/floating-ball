// @ts-ignore
import diagnosesRaw from '../assets/diagnoses.csv?raw';
// @ts-ignore
import medicinesRaw from '../assets/medicines.csv?raw';
// @ts-ignore
import itemsRaw from '../assets/items.csv?raw';
// @ts-ignore
import tcmDiagnosesRaw from '../assets/tcm-diagnoses.csv?raw';
// @ts-ignore
import tcmSyndromesRaw from '../assets/tcm-syndromes.csv?raw';
// @ts-ignore
import tcmTreatmentsRaw from '../assets/tcm-treatments.csv?raw';

export interface DiagnosisItem {
  id: string;
  code: string;
  name: string;
  keywords?: string[];
}

export interface TCMDiagnosisItem {
  id: string;
  code: string;
  name: string;
  keywords?: string[];
}

export interface TCMSyndromeItem {
  id: string;
  code: string;
  name: string;
  keywords?: string[];
}

export interface TCMTreatmentItem {
  id: string;
  code: string;
  name: string;
  keywords?: string[];
}

export interface MedicineItem {
  id: string;
  name: string;
  spec: string;
}

export interface MedicalItem {
  id: string;
  name: string;
  category: string;
}

export interface MedicalCatalog {
  diagnoses: DiagnosisItem[];
  tcmDiagnoses: TCMDiagnosisItem[];
  tcmSyndromes: TCMSyndromeItem[];
  tcmTreatments: TCMTreatmentItem[];
  medicines: MedicineItem[];
  items: MedicalItem[];
}

class MedicalDataService {
  private catalog: MedicalCatalog;

  constructor() {
    this.catalog = {
      diagnoses: this.loadDiagnoses(),
      tcmDiagnoses: this.loadTCMDiagnoses(),
      tcmSyndromes: this.loadTCMSyndromes(),
      tcmTreatments: this.loadTCMTreatments(),
      medicines: this.loadMedicines(),
      items: this.loadItems()
    };
  }

  private loadDiagnoses(): DiagnosisItem[] {
    const records = this.parseCSV(diagnosesRaw);
    return records.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      keywords: this.parseKeywords(r.keywords)
    }));
  }

  private loadTCMDiagnoses(): TCMDiagnosisItem[] {
    const records = this.parseCSV(tcmDiagnosesRaw);
    return records.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      keywords: this.parseKeywords(r.keywords)
    }));
  }

  private loadTCMSyndromes(): TCMSyndromeItem[] {
    const records = this.parseCSV(tcmSyndromesRaw);
    return records.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      keywords: this.parseKeywords(r.keywords)
    }));
  }

  private loadTCMTreatments(): TCMTreatmentItem[] {
    const records = this.parseCSV(tcmTreatmentsRaw);
    return records.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      keywords: this.parseKeywords(r.keywords)
    }));
  }

  private loadMedicines(): MedicineItem[] {
    const records = this.parseCSV(medicinesRaw);
    return records.map(r => ({
      id: r.id,
      name: r.name,
      spec: r.spec
    }));
  }

  private loadItems(): MedicalItem[] {
    const records = this.parseCSV(itemsRaw);
    return records.map(r => ({
      id: r.id,
      name: r.name,
      price: parseFloat(r.price) || 0,
      category: r.category,
      keywords: this.parseKeywords(r.keywords)
    }));
  }

  private parseKeywords(str?: string): string[] | undefined {
    if (!str) return undefined;
    return str.split('|').map(s => s.trim()).filter(Boolean);
  }

  private parseCSV(content: string): Record<string, string>[] {
    const lines = content.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = this.parseCSVLine(lines[0]);
    const result: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = this.parseCSVLine(line);
      // Allow for some leniency in trailing commas or missing fields
      const obj: Record<string, string> = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      result.push(obj);
    }
    return result;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (inQuote) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            // Escaped quote
            current += '"';
            i++;
          } else {
            inQuote = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuote = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  public getAllDiagnoses(): DiagnosisItem[] {
    return this.catalog.diagnoses;
  }

  public getAllTCMDiagnoses(): TCMDiagnosisItem[] {
    return this.catalog.tcmDiagnoses;
  }

  public getAllTCMSyndromes(): TCMSyndromeItem[] {
    return this.catalog.tcmSyndromes;
  }

  public getAllTCMTreatments(): TCMTreatmentItem[] {
    return this.catalog.tcmTreatments;
  }

  public getAllMedicines(): MedicineItem[] {
    return this.catalog.medicines;
  }

  public getAllItems(): MedicalItem[] {
    return this.catalog.items;
  }

  /**
   * Find best matching diagnosis
   * @param query AI output string
   */
  public matchDiagnosis(query: string): DiagnosisItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();
    
    // 1. Exact match (name or code)
    const exact = this.catalog.diagnoses.find(d => 
      d.name.toLowerCase() === normalizedQuery || d.code.toLowerCase() === normalizedQuery
    );
    if (exact) return exact;

    // 2. Code prefix match (New)
    // If the query looks like a code (alphanumeric, maybe dot), try to find best code match
    // E.g. query "R50.9" matches "R50.900"
    // We want the shortest matching code that starts with query
    const codeMatches = this.catalog.diagnoses.filter(d => 
      d.code.toLowerCase().startsWith(normalizedQuery)
    );
    
    if (codeMatches.length > 0) {
      // Sort by code length (ascending) to get "R50.900" before "R50.900x001" if such hierarchy exists
      // Or just return the first one if length is same.
      codeMatches.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      return codeMatches[0];
    }

    // 3. Best fuzzy match
    let bestMatch: DiagnosisItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.diagnoses) {
      const score = this.calculateScore(normalizedQuery, item.name, item.keywords);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    // Threshold for acceptance
    return maxScore > 0.3 ? bestMatch : null;
  }

  /**
   * Get related diagnoses by ICD10 code prefix
   * @param code ICD10 code
   */
  public getRelatedDiagnoses(code: string): DiagnosisItem[] {
    if (!code) return [];
    // Use the first 3 characters as the prefix (e.g. "J06" from "J06.9")
    // If the code is shorter than 3 chars, use it as is.
    const prefix = code.split('.')[0];
    if (!prefix) return [];

    return this.catalog.diagnoses.filter(d => d.code.startsWith(prefix));
  }

  /**
   * Find best matching TCM diagnosis
   * @param query AI output string (e.g., "感冒 - 风寒束表证" or "感冒")
   */
  public matchTCMDiagnosis(query: string): TCMDiagnosisItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();

    // Extract disease name from "disease - syndrome" format
    // e.g., "感冒 - 风寒束表证" -> "感冒"
    const diseaseName = normalizedQuery.split('-')[0].trim();

    // 1. Exact match (name or code)
    const exact = this.catalog.tcmDiagnoses.find(d =>
      d.name.toLowerCase() === normalizedQuery ||
      d.name.toLowerCase() === diseaseName ||
      d.code.toLowerCase() === normalizedQuery
    );
    if (exact) return exact;

    // 2. Code prefix match
    const codeMatches = this.catalog.tcmDiagnoses.filter(d =>
      d.code.toLowerCase().startsWith(normalizedQuery)
    );

    if (codeMatches.length > 0) {
      codeMatches.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      return codeMatches[0];
    }

    // 3. Best fuzzy match
    let bestMatch: TCMDiagnosisItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.tcmDiagnoses) {
      // Try matching both full query and disease name
      const fullScore = this.calculateScore(normalizedQuery, item.name, item.keywords);
      const diseaseScore = this.calculateScore(diseaseName, item.name, item.keywords);
      const score = Math.max(fullScore, diseaseScore);

      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    // Threshold for acceptance
    return maxScore > 0.3 ? bestMatch : null;
  }

  /**
   * Get related TCM diagnoses by code prefix
   * @param code TCM diagnosis code (e.g., "A01.01.01")
   */
  public getRelatedTCMDiagnoses(code: string): TCMDiagnosisItem[] {
    if (!code) return [];
    // Use the first two segments as prefix (e.g., "A01.01" from "A01.01.01")
    const parts = code.split('.');
    const prefix = parts.slice(0, Math.max(2, parts.length - 1)).join('.');
    if (!prefix) return [];

    return this.catalog.tcmDiagnoses.filter(d => d.code.startsWith(prefix));
  }

  /**
   * Find best matching medicine
   * @param query AI output string
   */
  public matchMedicine(query: string): MedicineItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();

    // 1. Exact match
    const exact = this.catalog.medicines.find(m => 
      m.name === normalizedQuery
    );
    if (exact) return exact;

    // 2. Best fuzzy match
    let bestMatch: MedicineItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.medicines) {
      // Check product name
      const nameScore = this.calculateScore(normalizedQuery, item.name);

      // Check combined name + spec (to handle same name with different specs)
      const fullName = `${item.name} ${item.spec}`;
      const fullNameScore = this.calculateScore(normalizedQuery, fullName);

      const score = Math.max(nameScore, fullNameScore);

      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    return maxScore > 0.3 ? bestMatch : null;
  }

  /**
   * Find best matching examination/lab item
   * @param query AI output string
   */
  public matchItem(query: string): MedicalItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();

    // 1. Exact match
    const exact = this.catalog.items.find(i => i.name === normalizedQuery);
    if (exact) return exact;

    // 2. Best fuzzy match
    let bestMatch: MedicalItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.items) {
      const score = this.calculateScore(normalizedQuery, item.name);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    return maxScore > 0.3 ? bestMatch : null;
  }

  /**
   * Find best matching TCM syndrome
   * @param query AI output string (e.g., "风寒束表证" or "表虚证")
   */
  public matchTCMSyndrome(query: string): TCMSyndromeItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();

    // 1. Exact match (name or code)
    const exact = this.catalog.tcmSyndromes.find(s =>
      s.name.toLowerCase() === normalizedQuery ||
      s.code.toLowerCase() === normalizedQuery
    );
    if (exact) return exact;

    // 2. Code prefix match
    const codeMatches = this.catalog.tcmSyndromes.filter(s =>
      s.code.toLowerCase().startsWith(normalizedQuery)
    );

    if (codeMatches.length > 0) {
      codeMatches.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      return codeMatches[0];
    }

    // 3. Best fuzzy match
    let bestMatch: TCMSyndromeItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.tcmSyndromes) {
      const score = this.calculateScore(normalizedQuery, item.name, item.keywords);

      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    // Threshold for acceptance
    return maxScore > 0.3 ? bestMatch : null;
  }

  /**
   * Find best matching TCM treatment
   * @param query AI output string (e.g., "疏风解表" or "辛温解表法")
   */
  public matchTCMTreatment(query: string): TCMTreatmentItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();

    // 1. Exact match (name or code)
    const exact = this.catalog.tcmTreatments.find(t =>
      t.name.toLowerCase() === normalizedQuery ||
      t.code.toLowerCase() === normalizedQuery
    );
    if (exact) return exact;

    // 2. Code prefix match
    const codeMatches = this.catalog.tcmTreatments.filter(t =>
      t.code.toLowerCase().startsWith(normalizedQuery)
    );

    if (codeMatches.length > 0) {
      codeMatches.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      return codeMatches[0];
    }

    // 3. Best fuzzy match
    let bestMatch: TCMTreatmentItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.tcmTreatments) {
      const score = this.calculateScore(normalizedQuery, item.name, item.keywords);

      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    // Threshold for acceptance
    return maxScore > 0.3 ? bestMatch : null;
  }

  /**
   * Calculate similarity score (0-1)
   * Uses simple character overlap / Jaccard-like approach
   */
  private calculateScore(query: string, target: string, keywords?: string[]): number {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    
    // Direct inclusion
    if (t.includes(q)) return 0.9; // Target contains query (e.g. "Amoxicillin Capsules" contains "Amoxicillin")
    if (q.includes(t)) return 0.8; // Query contains target

    // Keyword match
    if (keywords) {
      for (const k of keywords) {
        if (q.includes(k.toLowerCase())) return 0.85;
      }
    }

    // Character overlap (Jaccard Index)
    const qSet = new Set(q.split(''));
    const tSet = new Set(t.split(''));
    let intersection = 0;
    for (const char of qSet) {
      if (tSet.has(char)) intersection++;
    }
    
    const union = qSet.size + tSet.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}

export const medicalDataService = new MedicalDataService();
