// @ts-ignore
import diagnosesRaw from '../assets/diagnoses.csv?raw';
// @ts-ignore
import medicinesRaw from '../assets/medicines.csv?raw';
// @ts-ignore
import itemsRaw from '../assets/items.csv?raw';

export interface DiagnosisItem {
  id: string;
  code: string;
  name: string;
  keywords?: string[];
}

export interface MedicineItem {
  id: string;
  name: string;
  genericName: string;
  spec: string;
  price: number;
  unit: string;
  type: string;
  keywords?: string[];
}

export interface MedicalItem {
  id: string;
  name: string;
  price: number;
  category: string;
  keywords?: string[];
}

export interface MedicalCatalog {
  diagnoses: DiagnosisItem[];
  medicines: MedicineItem[];
  items: MedicalItem[];
}

class MedicalDataService {
  private catalog: MedicalCatalog;
  
  constructor() {
    this.catalog = {
      diagnoses: this.loadDiagnoses(),
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

  private loadMedicines(): MedicineItem[] {
    const records = this.parseCSV(medicinesRaw);
    return records.map(r => ({
      id: r.id,
      name: r.name,
      genericName: r.genericName,
      spec: r.spec,
      price: parseFloat(r.price) || 0,
      unit: r.unit,
      type: r.type,
      keywords: this.parseKeywords(r.keywords)
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
      d.name === normalizedQuery || d.code === normalizedQuery
    );
    if (exact) return exact;

    // 2. Best fuzzy match
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
   * Find best matching medicine
   * @param query AI output string
   */
  public matchMedicine(query: string): MedicineItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();

    // 1. Exact match
    const exact = this.catalog.medicines.find(m => 
      m.name === normalizedQuery || m.genericName === normalizedQuery
    );
    if (exact) return exact;

    // 2. Best fuzzy match
    let bestMatch: MedicineItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.medicines) {
      // Check generic name (higher weight) and product name
      const genericScore = this.calculateScore(normalizedQuery, item.genericName, item.keywords);
      const nameScore = this.calculateScore(normalizedQuery, item.name, item.keywords);
      const score = Math.max(genericScore, nameScore);

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
      const score = this.calculateScore(normalizedQuery, item.name, item.keywords);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

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
