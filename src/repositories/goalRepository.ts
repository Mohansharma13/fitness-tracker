import type { SQLiteDatabase } from 'expo-sqlite';
import type { FitnessGoal } from '../types/goal';
import { generateId } from '../utils/id';

export async function getGoal(db: SQLiteDatabase): Promise<FitnessGoal | null> {
  const row = await db.getFirstAsync<any>('SELECT * FROM goals WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1');
  return row ? {
    id: row.id,
    calorieTarget: row.calorie_target,
    proteinTarget: row.protein_target,
    carbTarget: row.carb_target,
    fatTarget: row.fat_target,
    stepTarget: row.step_target,
    workoutTarget: row.workout_target,
    targetWeight: row.target_weight,
    updatedAt: row.updated_at,
  } : null;
}

export async function saveGoal(db: SQLiteDatabase, targets: Omit<FitnessGoal, 'id' | 'updatedAt'>): Promise<void> {
  const existing = await getGoal(db);
  const now = new Date().toISOString();
  if (existing) {
    await db.runAsync(
      `UPDATE goals SET calorie_target = ?, protein_target = ?, carb_target = ?, fat_target = ?, step_target = ?, workout_target = ?, target_weight = ?, updated_at = ?, sync_status = 'local' WHERE id = ?`,
      targets.calorieTarget, targets.proteinTarget, targets.carbTarget, targets.fatTarget, targets.stepTarget, targets.workoutTarget, targets.targetWeight, now, existing.id
    );
  } else {
    await db.runAsync(
      `INSERT INTO goals (id, user_id, calorie_target, protein_target, carb_target, fat_target, step_target, workout_target, target_weight, created_at, updated_at, deleted_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      generateId(), null, targets.calorieTarget, targets.proteinTarget, targets.carbTarget, targets.fatTarget, targets.stepTarget, targets.workoutTarget, targets.targetWeight, now, now, null, 'local'
    );
  }
}
