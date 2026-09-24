import type { SQLiteDatabase } from 'expo-sqlite';
import { getDailyHistory, saveHistoricalMeasures } from './historyRepository';

export async function saveStepsForDate(db: SQLiteDatabase, date: string, steps: number): Promise<void> {
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM daily_logs WHERE date = ? AND deleted_at IS NULL', date);
  if (rows[0]) {
    const now = new Date().toISOString();
    await db.runAsync("UPDATE daily_logs SET steps = ?, updated_at = ?, sync_status = 'local' WHERE id = ?", steps, now, rows[0].id);
  } else {
    await saveHistoricalMeasures(db, date, null, steps);
  }
}

export async function getStepHistory(db: SQLiteDatabase, limit = 90) {
  return (await getDailyHistory(db, limit)).filter((row) => row.steps > 0).map(({ date, steps }) => ({ date, steps }));
}
