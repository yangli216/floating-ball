export type RiskCategory =
  | 'allergy'
  | 'chronic'
  | 'medication'
  | 'population'
  | 'vital'
  | 'other'
  | string;

export interface RiskItem {
  level: 1 | 2 | 3;
  category: RiskCategory;
  content: string;
}
