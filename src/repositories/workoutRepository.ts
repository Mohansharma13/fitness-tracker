import type { SQLiteDatabase } from 'expo-sqlite';

import type { ExerciseLog, WorkoutLog } from '../types/workout';
import { generateId } from '../utils/id';
import { getOrCreateDailyLog, updateDailyLog } from './dailyLogRepository';

function mapWorkout(row: any): WorkoutLog {
  return {
    id: row.id,
    dailyLogId: row.daily_log_id,
    workoutType: row.workout_type ?? 'Workout',
    duration: row.duration,
    notes: row.notes,
    createdAt: row.created_at,
    exercises: [],
  };
}

function mapExercise(row: any): ExerciseLog {
  return {
    id: row.id,
    workoutLogId: row.workout_log_id,
    exerciseName: row.exercise_name,
    sets: row.sets,
    reps: row.reps,
    weight: row.weight,
    notes: row.notes,
  };
}

export async function getExercisesForWorkout(db: SQLiteDatabase, workoutLogId: string): Promise<ExerciseLog[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM exercises
     WHERE workout_log_id = ? AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    workoutLogId
  );
  return rows.map(mapExercise);
}

export async function getExerciseLibrary(db: SQLiteDatabase): Promise<{ id: string; name: string; useCount: number }[]> {
  return db.getAllAsync<{ id: string; name: string; useCount: number }>(
    `SELECT library.id, library.name,
      (SELECT COUNT(*) FROM exercises e WHERE lower(e.exercise_name) = lower(library.name) AND e.deleted_at IS NULL) AS useCount
     FROM exercise_library library WHERE library.deleted_at IS NULL ORDER BY library.name COLLATE NOCASE`
  );
}

export async function saveExerciseToLibrary(db: SQLiteDatabase, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Exercise name cannot be empty');
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM exercise_library WHERE name = ? COLLATE NOCASE', trimmed);
  const now = new Date().toISOString();
  if (existing) {
    await db.runAsync("UPDATE exercise_library SET deleted_at = NULL, updated_at = ?, sync_status = 'local' WHERE id = ?", now, existing.id);
  } else {
    await db.runAsync("INSERT INTO exercise_library (id, name, created_at, updated_at, deleted_at, sync_status) VALUES (?, ?, ?, ?, ?, 'local')", generateId(), trimmed, now, now, null);
  }
}

export async function deleteExerciseFromLibrary(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync("UPDATE exercise_library SET deleted_at = ?, updated_at = ?, sync_status = 'local' WHERE id = ? AND deleted_at IS NULL", now, now, id);
}

export async function getWorkoutsForDate(db: SQLiteDatabase, date: string): Promise<WorkoutLog[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT w.* FROM workout_logs w
     INNER JOIN daily_logs d ON d.id = w.daily_log_id
     WHERE d.date = ? AND d.deleted_at IS NULL AND w.deleted_at IS NULL
     ORDER BY w.created_at DESC`,
    date
  );
  const workouts = rows.map(mapWorkout);
  for (const workout of workouts) {
    workout.exercises = await getExercisesForWorkout(db, workout.id);
  }
  return workouts;
}

export async function getWorkoutCountForDate(db: SQLiteDatabase, date: string): Promise<number> {
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM workout_logs w
     INNER JOIN daily_logs d ON d.id = w.daily_log_id
     WHERE d.date = ? AND d.deleted_at IS NULL AND w.deleted_at IS NULL`,
    date
  );
  return result?.count ?? 0;
}

export async function getRecentWorkoutHistory(db: SQLiteDatabase, limit = 60): Promise<(WorkoutLog & { date: string })[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT w.*, d.date FROM workout_logs w JOIN daily_logs d ON d.id = w.daily_log_id
     WHERE w.deleted_at IS NULL AND d.deleted_at IS NULL ORDER BY d.date DESC, w.created_at DESC LIMIT ?`,
    limit
  );
  const result = rows.map((row) => ({ ...mapWorkout(row), date: row.date }));
  for (const workout of result) workout.exercises = await getExercisesForWorkout(db, workout.id);
  return result;
}

export async function createExerciseLog(
  db: SQLiteDatabase,
  input: { workoutLogId: string; exerciseName: string; sets: number | null; reps: number | null; weight: number | null }
): Promise<ExerciseLog> {
  await saveExerciseToLibrary(db, input.exerciseName);
  const id = generateId();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO exercises (
      id, user_id, workout_log_id, exercise_name, sets, reps, weight, notes,
      created_at, updated_at, deleted_at, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, null, input.workoutLogId, input.exerciseName.trim(), input.sets, input.reps,
    input.weight, null, now, now, null, 'local'
  );
  const row = await db.getFirstAsync<any>('SELECT * FROM exercises WHERE id = ?', id);
  if (!row) throw new Error('Failed to create exercise log');
  return mapExercise(row);
}

export async function deleteExerciseLog(db: SQLiteDatabase, exerciseId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE exercises SET deleted_at = ?, updated_at = ?, sync_status = 'local'
     WHERE id = ? AND deleted_at IS NULL`,
    now, now, exerciseId
  );
}

export async function createWorkoutLog(
  db: SQLiteDatabase,
  input: { date: string; workoutType: string; duration: number | null; notes: string | null }
): Promise<WorkoutLog> {
  const dailyLog = await getOrCreateDailyLog(db, { date: input.date });
  const id = generateId();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO workout_logs (
        id, user_id, daily_log_id, workout_type, duration, estimated_calories,
        notes, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, null, dailyLog.id, input.workoutType.trim(), input.duration, null,
      input.notes, now, now, null, 'local'
    );

    const summary = await db.getFirstAsync<{ count: number; duration: number | null }>(
      `SELECT COUNT(*) AS count, SUM(duration) AS duration FROM workout_logs
       WHERE daily_log_id = ? AND deleted_at IS NULL`,
      dailyLog.id
    );
    await updateDailyLog(db, dailyLog.id, {
      workoutCompleted: (summary?.count ?? 0) > 0,
      workoutDuration: summary?.duration ?? null,
    });
  });

  const row = await db.getFirstAsync<any>('SELECT * FROM workout_logs WHERE id = ?', id);
  if (!row) throw new Error('Failed to create workout log');
  return mapWorkout(row);
}

export async function deleteWorkoutLog(db: SQLiteDatabase, workoutId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    const workout = await db.getFirstAsync<{ daily_log_id: string }>(
      'SELECT daily_log_id FROM workout_logs WHERE id = ? AND deleted_at IS NULL',
      workoutId
    );
    if (!workout) return;

    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE workout_logs SET deleted_at = ?, updated_at = ?, sync_status = 'local'
       WHERE id = ? AND deleted_at IS NULL`,
      now, now, workoutId
    );
    const summary = await db.getFirstAsync<{ count: number; duration: number | null }>(
      `SELECT COUNT(*) AS count, SUM(duration) AS duration FROM workout_logs
       WHERE daily_log_id = ? AND deleted_at IS NULL`,
      workout.daily_log_id
    );
    await updateDailyLog(db, workout.daily_log_id, {
      workoutCompleted: (summary?.count ?? 0) > 0,
      workoutDuration: summary?.duration ?? null,
    });
  });
}
