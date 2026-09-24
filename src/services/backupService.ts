import type { SQLiteDatabase } from 'expo-sqlite';

const TABLES = [
  'daily_logs', 'foods', 'meals', 'meal_items', 'meal_templates', 'template_items',
  'workout_logs', 'exercises', 'exercise_library', 'workout_templates', 'workout_template_exercises', 'weekly_tracking_goals', 'app_settings',
] as const;
const DELETE_ORDER = [...TABLES].reverse();

export async function exportBackup(db: SQLiteDatabase): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const table of TABLES) data[table] = await db.getAllAsync<any>(`SELECT * FROM ${table}`);
  return JSON.stringify({ app: 'fitness-tracker', schemaVersion: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

export function validateBackup(text: string): Record<string, any[]> {
  let value: any;
  try { value = JSON.parse(text); } catch { throw new Error('The pasted text is not valid JSON.'); }
  if (value?.app !== 'fitness-tracker' || value?.schemaVersion !== 1 || !value?.data || typeof value.data !== 'object') {
    throw new Error('This is not a supported Fitness Tracker backup.');
  }
  const data: Record<string, any[]> = {};
  for (const table of TABLES) {
    const rows = value.data[table];
    if ((table === 'exercise_library' || table === 'app_settings' || table === 'weekly_tracking_goals') && rows === undefined) { data[table] = []; continue; }
    if (!Array.isArray(rows)) throw new Error(`Backup is missing the ${table} data.`);
    if (rows.some((row) => !row || typeof row !== 'object' || typeof row.id !== 'string')) throw new Error(`Backup contains an invalid row in ${table}.`);
    data[table] = rows;
  }
  // Goals were part of an older release but are no longer a supported app feature.
  // Ignore them when restoring a legacy backup so the rest of that backup remains usable.
  return data;
}

export async function importBackup(db: SQLiteDatabase, text: string, mode: 'merge' | 'replace'): Promise<void> {
  const data = validateBackup(text);
  await db.withTransactionAsync(async () => {
    if (mode === 'replace') {
      for (const table of DELETE_ORDER) await db.runAsync(`DELETE FROM ${table}`);
    }
    for (const table of TABLES) {
      for (const row of data[table]) {
        const columns = Object.keys(row);
        if (!columns.length || columns.some((column) => !/^[a-z_]+$/.test(column))) throw new Error(`Backup contains an unsupported column in ${table}.`);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map((column) => row[column] ?? null);
        if (mode === 'merge' && table === 'app_settings' && columns.includes('id')) {
          const updates = columns.filter((column) => column !== 'id').map((column) => `${column} = excluded.${column}`).join(', ');
          await db.runAsync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`, ...values);
        } else {
          const verb = mode === 'merge' ? 'INSERT OR IGNORE' : 'INSERT';
          await db.runAsync(`${verb} INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, ...values);
        }
      }
    }
  });
}
