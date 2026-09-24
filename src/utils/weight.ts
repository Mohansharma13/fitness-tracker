export type WeightUnit = 'kg' | 'lb';
const KG_PER_LB = 0.45359237;

export function weightFromStorage(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kg / KG_PER_LB : kg;
}

export function weightToStorage(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value * KG_PER_LB : value;
}
