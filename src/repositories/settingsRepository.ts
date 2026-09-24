import type { SQLiteDatabase } from 'expo-sqlite';
import type { AppSettings } from '../types/settings';

const SETTINGS_ID = 'local-settings';

export async function getSettings(db: SQLiteDatabase): Promise<AppSettings> {
  const row = await db.getFirstAsync<any>('SELECT * FROM app_settings WHERE id = ?', SETTINGS_ID);
  if (!row) {
    const now = new Date().toISOString();
    await db.runAsync('INSERT INTO app_settings (id, user_id, name, weight_unit, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', SETTINGS_ID, null, '', 'kg', 'system', now, now);
    return { id: SETTINGS_ID, name: '', weightUnit: 'kg', theme: 'system', updatedAt: now };
  }
  return { id: row.id, name: row.name ?? '', weightUnit: row.weight_unit, theme: row.theme, updatedAt: row.updated_at };
}

export async function saveSettings(db: SQLiteDatabase, values: Pick<AppSettings, 'name' | 'weightUnit' | 'theme'>): Promise<void> {
  const settings = await getSettings(db);
  const now = new Date().toISOString();
  await db.runAsync('UPDATE app_settings SET name = ?, weight_unit = ?, theme = ?, updated_at = ? WHERE id = ?', values.name.trim(), values.weightUnit, values.theme, now, settings.id);
}
