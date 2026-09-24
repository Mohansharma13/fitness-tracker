import type { SQLiteDatabase } from 'expo-sqlite';

export interface WeeklyTrackingGoals {
  calorieTarget: number | null;
  stepTarget: number | null;
  targetWeight: number | null;
  workoutTarget: number | null;
}

const GOALS_ID = 'weekly-tracking-goals';

export async function getWeeklyTrackingGoals(db: SQLiteDatabase): Promise<WeeklyTrackingGoals> {
  const row = await db.getFirstAsync<any>('SELECT calorie_target, step_target, target_weight, workout_target FROM weekly_tracking_goals WHERE id = ?', GOALS_ID);
  return {
    calorieTarget: row?.calorie_target ?? null,
    stepTarget: row?.step_target ?? null,
    targetWeight: row?.target_weight ?? null,
    workoutTarget: row?.workout_target ?? null,
  };
}

export async function saveWeeklyTrackingGoals(db: SQLiteDatabase, goals: WeeklyTrackingGoals): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO weekly_tracking_goals (id, calorie_target, step_target, target_weight, workout_target, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET calorie_target = excluded.calorie_target, step_target = excluded.step_target,
       target_weight = excluded.target_weight, workout_target = excluded.workout_target, updated_at = excluded.updated_at`,
    GOALS_ID, goals.calorieTarget, goals.stepTarget, goals.targetWeight, goals.workoutTarget, now, now
  );
}
