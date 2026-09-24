export interface AppSettings {
  id: string;
  name: string;
  weightUnit: 'kg' | 'lb';
  theme: 'system' | 'light' | 'dark';
  updatedAt: string;
}
