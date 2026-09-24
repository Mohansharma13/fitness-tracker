import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  CreateDailyLogInput,
  DailyLog,
} from '../types/dailyLog';

import { generateId } from '../utils/id';

function mapDailyLog(row: any): DailyLog {
  return {
    id: row.id,
    userId: row.user_id,

    date: row.date,

    weight: row.weight,
    steps: row.steps ?? 0,

    workoutCompleted: Boolean(row.workout_completed),
    workoutDuration: row.workout_duration,

    notes: row.notes,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getDailyLogByDate(
  db: SQLiteDatabase,
  date: string
): Promise<DailyLog | null> {
  const row = await db.getFirstAsync<any>(
    `
      SELECT *
      FROM daily_logs
      WHERE date = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    date
  );

  return row ? mapDailyLog(row) : null;
}

export async function getOrCreateDailyLog(
  db: SQLiteDatabase,
  input: CreateDailyLogInput
): Promise<DailyLog> {
  const existing = await getDailyLogByDate(db, input.date);

  if (existing) {
    return existing;
  }

  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO daily_logs (
        id,
        user_id,
        date,
        weight,
        steps,
        workout_completed,
        workout_duration,
        notes,
        created_at,
        updated_at,
        deleted_at,
        sync_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    id,
    null,
    input.date,
    null,
    0,
    0,
    null,
    null,
    now,
    now,
    null,
    'local'
  );

  const created = await getDailyLogByDate(db, input.date);

  if (!created) {
    throw new Error('Failed to create daily log');
  }

  return created;
}

export async function updateDailyLog(
  db: SQLiteDatabase,
  id: string,
  data: {
    weight?: number | null;
    steps?: number;
    workoutCompleted?: boolean;
    workoutDuration?: number | null;
    notes?: string | null;
  }
): Promise<void> {
  const existing = await db.getFirstAsync<any>(
    `
      SELECT *
      FROM daily_logs
      WHERE id = ?
      LIMIT 1
    `,
    id
  );

  if (!existing) {
    throw new Error('Daily log not found');
  }

  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE daily_logs
      SET
        weight = ?,
        steps = ?,
        workout_completed = ?,
        workout_duration = ?,
        notes = ?,
        updated_at = ?,
        sync_status = 'local'
      WHERE id = ?
    `,
    data.weight !== undefined ? data.weight : existing.weight,
    data.steps !== undefined ? data.steps : existing.steps,
    data.workoutCompleted !== undefined
      ? data.workoutCompleted ? 1 : 0
      : existing.workout_completed,
    data.workoutDuration !== undefined
      ? data.workoutDuration
      : existing.workout_duration,
    data.notes !== undefined ? data.notes : existing.notes,
    now,
    id
  );
}