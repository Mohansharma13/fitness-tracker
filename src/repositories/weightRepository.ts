import type { SQLiteDatabase } from 'expo-sqlite';
import { getDailyHistory, saveHistoricalMeasures } from './historyRepository';

export async function saveWeightForDate(db: SQLiteDatabase, date: string, weight: number | null): Promise<void> {
  const rows = await db.getAllAsync<{ id: string; steps: number | null }>('SELECT id, steps FROM daily_logs WHERE date = ? AND deleted_at IS NULL', date);
  if (rows[0]) {
    const now = new Date().toISOString();
    await db.runAsync("UPDATE daily_logs SET weight = ?, updated_at = ?, sync_status = 'local' WHERE id = ?", weight, now, rows[0].id);
  } else {
    await saveHistoricalMeasures(db, date, weight, 0);
  }
}

export async function getWeightHistory(db: SQLiteDatabase, limit = 90) {
  return (await getDailyHistory(db, limit)).filter((row) => row.weight !== null).map(({ date, weight }) => ({ date, weight: weight as number }));
}
