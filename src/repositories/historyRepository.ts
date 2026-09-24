import type { SQLiteDatabase } from 'expo-sqlite';
import type { DailyLog } from '../types/dailyLog';
import { getOrCreateDailyLog, updateDailyLog } from './dailyLogRepository';

export async function getDailyHistory(db: SQLiteDatabase, limit = 30): Promise<DailyLog[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM daily_logs WHERE deleted_at IS NULL
     AND (weight IS NOT NULL OR COALESCE(steps, 0) > 0 OR workout_completed = 1 OR notes IS NOT NULL
       OR EXISTS (SELECT 1 FROM meals WHERE meals.daily_log_id = daily_logs.id AND meals.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM workout_logs WHERE workout_logs.daily_log_id = daily_logs.id AND workout_logs.deleted_at IS NULL))
     ORDER BY date DESC LIMIT ?`,
    limit
  );
  return rows.map((row) => ({
    id: row.id, userId: row.user_id, date: row.date, weight: row.weight, steps: row.steps ?? 0,
    workoutCompleted: Boolean(row.workout_completed), workoutDuration: row.workout_duration,
    notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export async function saveHistoricalMeasures(db: SQLiteDatabase, date: string, weight: number | null | undefined, steps: number): Promise<void> {
  const log = await getOrCreateDailyLog(db, { date });
  await updateDailyLog(db, log.id, { ...(weight === undefined ? {} : { weight }), steps });
}
