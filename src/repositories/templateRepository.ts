import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '../utils/id';
import { getOrCreateDailyLog } from './dailyLogRepository';
import { addMealItem, createMeal } from './mealRepository';
import { createExerciseLog, createWorkoutLog, getExercisesForWorkout } from './workoutRepository';
import type { ExerciseLog, WorkoutLog } from '../types/workout';

export interface MealTemplate {
  id: string;
  name: string;
  itemCount: number;
  createdAt: string;
  items: { foodName: string; quantity: number }[];
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: ExerciseLog[];
  createdAt: string;
}

export async function createMealTemplateFromMeal(db: SQLiteDatabase, mealId: string, templateName: string): Promise<void> {
  const meal = await db.getFirstAsync<{ meal_name: string }>('SELECT meal_name FROM meals WHERE id = ? AND deleted_at IS NULL', mealId);
  if (!meal) throw new Error('Meal not found');
  const items = await db.getAllAsync<{ food_id: string; quantity: number }>('SELECT food_id, quantity FROM meal_items WHERE meal_id = ? AND deleted_at IS NULL', mealId);
  const id = generateId();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO meal_templates (id, user_id, name, created_at, updated_at, deleted_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)', id, null, templateName.trim() || meal.meal_name, now, now, null, 'local');
    for (const item of items) {
      await db.runAsync('INSERT INTO template_items (id, user_id, template_id, food_id, quantity, created_at, updated_at, deleted_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', generateId(), null, id, item.food_id, item.quantity, now, now, null, 'local');
    }
  });
}

export async function getMealTemplates(db: SQLiteDatabase): Promise<MealTemplate[]> {
  const templates = await db.getAllAsync<any>(
    `SELECT t.id, t.name, t.created_at AS createdAt,
      (SELECT COUNT(*) FROM template_items i WHERE i.template_id = t.id AND i.deleted_at IS NULL) AS itemCount
     FROM meal_templates t WHERE t.deleted_at IS NULL ORDER BY t.name COLLATE NOCASE`
  );
  const result: MealTemplate[] = [];
  for (const template of templates) {
    const items = await db.getAllAsync<any>(
      `SELECT f.name AS foodName, i.quantity FROM template_items i JOIN foods f ON f.id = i.food_id
       WHERE i.template_id = ? AND i.deleted_at IS NULL ORDER BY i.created_at`, template.id
    );
    result.push({ ...template, items });
  }
  return result;
}

export async function addMealTemplateToDate(db: SQLiteDatabase, templateId: string, date: string): Promise<void> {
  const template = await db.getFirstAsync<{ name: string }>('SELECT name FROM meal_templates WHERE id = ? AND deleted_at IS NULL', templateId);
  if (!template) throw new Error('Meal template not found');
  const items = await db.getAllAsync<{ food_id: string; quantity: number }>('SELECT food_id, quantity FROM template_items WHERE template_id = ? AND deleted_at IS NULL', templateId);
  if (!items.length) throw new Error('This meal template has no foods');
  const log = await getOrCreateDailyLog(db, { date });
  const meal = await createMeal(db, log.id, template.name);
  for (const item of items) await addMealItem(db, meal.id, item.food_id, item.quantity);
}

export async function deleteMealTemplate(db: SQLiteDatabase, templateId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE template_items SET deleted_at = ?, updated_at = ?, sync_status = 'local' WHERE template_id = ? AND deleted_at IS NULL", now, now, templateId);
    await db.runAsync("UPDATE meal_templates SET deleted_at = ?, updated_at = ?, sync_status = 'local' WHERE id = ? AND deleted_at IS NULL", now, now, templateId);
  });
}

export async function replaceMealTemplateFromMeal(db: SQLiteDatabase, templateId: string, mealId: string): Promise<void> {
  const meal = await db.getFirstAsync<{ meal_name: string }>('SELECT meal_name FROM meals WHERE id = ? AND deleted_at IS NULL', mealId);
  if (!meal) throw new Error('Meal not found');
  const items = await db.getAllAsync<{ food_id: string; quantity: number }>('SELECT food_id, quantity FROM meal_items WHERE meal_id = ? AND deleted_at IS NULL', mealId);
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE meal_templates SET name = ?, updated_at = ?, sync_status = 'local' WHERE id = ? AND deleted_at IS NULL", meal.meal_name, now, templateId);
    await db.runAsync("UPDATE template_items SET deleted_at = ?, updated_at = ?, sync_status = 'local' WHERE template_id = ? AND deleted_at IS NULL", now, now, templateId);
    for (const item of items) await db.runAsync('INSERT INTO template_items (id, user_id, template_id, food_id, quantity, created_at, updated_at, deleted_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', generateId(), null, templateId, item.food_id, item.quantity, now, now, null, 'local');
  });
}

export async function createWorkoutTemplateFromWorkout(db: SQLiteDatabase, workout: WorkoutLog, name: string): Promise<void> {
  const exercises = await getExercisesForWorkout(db, workout.id);
  const templateName = name.trim() || workout.workoutType;
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM workout_templates WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL LIMIT 1',
    templateName
  );
  if (existing) {
    await replaceWorkoutTemplateFromWorkout(db, existing.id, workout);
    return;
  }
  const id = generateId();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO workout_templates (id, user_id, name, created_at, updated_at, deleted_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)', id, null, templateName, now, now, null, 'local');
    for (const exercise of exercises) {
      await db.runAsync('INSERT INTO workout_template_exercises (id, user_id, template_id, exercise_name, sets, reps, weight, notes, created_at, updated_at, deleted_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', generateId(), null, id, exercise.exerciseName, exercise.sets, exercise.reps, exercise.weight, exercise.notes, now, now, null, 'local');
    }
  });
}

export async function getWorkoutTemplates(db: SQLiteDatabase): Promise<WorkoutTemplate[]> {
  const templates = await db.getAllAsync<any>('SELECT * FROM workout_templates WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
  const result: WorkoutTemplate[] = [];
  for (const template of templates) {
    const rows = await db.getAllAsync<any>('SELECT * FROM workout_template_exercises WHERE template_id = ? AND deleted_at IS NULL ORDER BY created_at', template.id);
    result.push({ id: template.id, name: template.name, createdAt: template.created_at, exercises: rows.map((row) => ({ id: row.id, workoutLogId: '', exerciseName: row.exercise_name, sets: row.sets, reps: row.reps, weight: row.weight, notes: row.notes })) });
  }
  return result;
}

export async function applyWorkoutTemplate(db: SQLiteDatabase, templateId: string, date: string): Promise<void> {
  const template = await db.getFirstAsync<{ name: string }>('SELECT name FROM workout_templates WHERE id = ? AND deleted_at IS NULL', templateId);
  if (!template) throw new Error('Workout template not found');
  const exercises = await db.getAllAsync<any>('SELECT * FROM workout_template_exercises WHERE template_id = ? AND deleted_at IS NULL', templateId);
  const workout = await createWorkoutLog(db, { date, workoutType: template.name, duration: null, notes: null });
  for (const exercise of exercises) await createExerciseLog(db, { workoutLogId: workout.id, exerciseName: exercise.exercise_name, sets: exercise.sets, reps: exercise.reps, weight: exercise.weight, notes: exercise.notes });
}

export async function deleteWorkoutTemplate(db: SQLiteDatabase, templateId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE workout_template_exercises SET deleted_at = ?, updated_at = ?, sync_status = 'local' WHERE template_id = ? AND deleted_at IS NULL", now, now, templateId);
    await db.runAsync("UPDATE workout_templates SET deleted_at = ?, updated_at = ?, sync_status = 'local' WHERE id = ? AND deleted_at IS NULL", now, now, templateId);
  });
}

export async function updateWorkoutTemplateContents(
  db: SQLiteDatabase,
  templateId: string,
  name: string,
  exercises: { exerciseName: string; sets: number; reps: number; weight: number | null }[]
): Promise<void> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Enter a name for this routine.');
  if (!exercises.length) throw new Error('Add at least one exercise to this routine.');
  const duplicate = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM workout_templates WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL AND id != ? LIMIT 1',
    trimmedName,
    templateId
  );
  if (duplicate) throw new Error('Another routine already uses this name. Choose a different name.');

  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE workout_templates SET name = ?, updated_at = ?, sync_status = 'local' WHERE id = ? AND deleted_at IS NULL",
      trimmedName,
      now,
      templateId
    );
    await db.runAsync(
      "UPDATE workout_template_exercises SET deleted_at = ?, updated_at = ?, sync_status = 'local' WHERE template_id = ? AND deleted_at IS NULL",
      now,
      now,
      templateId
    );
    for (const exercise of exercises) {
      await db.runAsync(
        'INSERT INTO workout_template_exercises (id, user_id, template_id, exercise_name, sets, reps, weight, notes, created_at, updated_at, deleted_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        generateId(), null, templateId, exercise.exerciseName.trim(), exercise.sets, exercise.reps, exercise.weight, null, now, now, null, 'local'
      );
    }
  });
}

export async function replaceWorkoutTemplateFromWorkout(db: SQLiteDatabase, templateId: string, workout: WorkoutLog): Promise<void> {
  const exercises = await getExercisesForWorkout(db, workout.id);
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE workout_templates SET name = ?, updated_at = ?, sync_status = 'local' WHERE id = ? AND deleted_at IS NULL", workout.workoutType, now, templateId);
    await db.runAsync("UPDATE workout_template_exercises SET deleted_at = ?, updated_at = ?, sync_status = 'local' WHERE template_id = ? AND deleted_at IS NULL", now, now, templateId);
    for (const exercise of exercises) await db.runAsync('INSERT INTO workout_template_exercises (id, user_id, template_id, exercise_name, sets, reps, weight, notes, created_at, updated_at, deleted_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', generateId(), null, templateId, exercise.exerciseName, exercise.sets, exercise.reps, exercise.weight, exercise.notes, now, now, null, 'local');
  });
}
