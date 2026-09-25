import type { SQLiteDatabase } from 'expo-sqlite';

const allTablesDeleteOrder = [
  'goals',
  'app_settings',
  'weekly_tracking_goals',
  'workout_template_exercises',
  'workout_templates',
  'exercise_library',
  'exercises',
  'workout_logs',
  'template_items',
  'meal_templates',
  'meal_items',
  'meals',
  'foods',
  'daily_logs',
] as const;

export async function clearDayData(db: SQLiteDatabase, date: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM daily_logs WHERE date = ?', date);
  });
}

export async function clearAllAppData(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of allTablesDeleteOrder) await db.runAsync(`DELETE FROM ${table}`);
  });
}
