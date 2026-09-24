import type { SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

const HEADERS = [
  'Record type', 'Date', 'Name', 'Item', 'Quantity', 'Unit', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fibre (g)',
  'Steps', 'Workout completed', 'Body weight (kg)', 'Duration (min)', 'Sets', 'Reps', 'Exercise weight (kg)', 'Notes',
];

type CsvRow = (string | number | null | undefined)[];

function csvCell(value: CsvRow[number]): string {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: CsvRow): string {
  return values.map(csvCell).join(',');
}

function mealItemMacros(item: any, macro: 'calories' | 'protein' | 'carbs' | 'fat' | 'fibre'): number | null {
  const servingSize = Number(item.serving_size);
  if (!Number.isFinite(servingSize) || servingSize <= 0 || item[macro] == null) return null;
  return Number(item[macro]) * Number(item.quantity) / servingSize;
}

export async function createCsvExportFile(db: SQLiteDatabase): Promise<{ uri: string; filename: string; rowCount: number }> {
  if (!FileSystem.cacheDirectory) throw new Error('Temporary file storage is not available on this device.');

  const lines = [csvRow(HEADERS)];
  let rowCount = 0;
  const add = (values: CsvRow) => { lines.push(csvRow(values)); rowCount += 1; };

  const days = await db.getAllAsync<any>(
    'SELECT date, weight, steps, workout_completed, workout_duration, notes FROM daily_logs WHERE deleted_at IS NULL ORDER BY date'
  );
  for (const day of days) {
    add(['Daily summary', day.date, 'Daily tracking', null, null, null, null, null, null, null, null, day.steps, day.workout_completed ? 'Yes' : 'No', day.weight, day.workout_duration, null, null, null, day.notes]);
  }

  const foods = await db.getAllAsync<any>(
    'SELECT name, serving_size, calories, protein, carbs, fat, fibre FROM foods WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE'
  );
  for (const food of foods) {
    add(['Food library', null, food.name, null, food.serving_size, 'g serving', food.calories, food.protein, food.carbs, food.fat, food.fibre]);
  }

  const meals = await db.getAllAsync<any>(
    `SELECT m.id, m.meal_name, m.notes, m.quick_calories, m.quick_protein, m.quick_carbs, m.quick_fat, m.quick_fibre, d.date
     FROM meals m JOIN daily_logs d ON d.id = m.daily_log_id
     WHERE m.deleted_at IS NULL AND d.deleted_at IS NULL ORDER BY d.date, m.created_at`
  );
  for (const meal of meals) {
    const items = await db.getAllAsync<any>(
      `SELECT i.quantity, f.name AS food_name, f.serving_size, f.calories, f.protein, f.carbs, f.fat, f.fibre
       FROM meal_items i LEFT JOIN foods f ON f.id = i.food_id
       WHERE i.meal_id = ? AND i.deleted_at IS NULL ORDER BY i.created_at`,
      meal.id
    );
    if (items.length) {
      for (const item of items) {
        add(['Meal item', meal.date, meal.meal_name, item.food_name ?? 'Deleted food', item.quantity, 'g',
          mealItemMacros(item, 'calories'), mealItemMacros(item, 'protein'), mealItemMacros(item, 'carbs'), mealItemMacros(item, 'fat'), mealItemMacros(item, 'fibre'),
          null, null, null, null, null, null, meal.notes]);
      }
    } else {
      add(['Meal', meal.date, meal.meal_name, null, null, null, meal.quick_calories, meal.quick_protein, meal.quick_carbs, meal.quick_fat, meal.quick_fibre, null, null, null, null, null, null, meal.notes]);
    }
  }

  const workouts = await db.getAllAsync<any>(
    `SELECT w.id, w.workout_type, w.duration, w.notes, d.date
     FROM workout_logs w JOIN daily_logs d ON d.id = w.daily_log_id
     WHERE w.deleted_at IS NULL AND d.deleted_at IS NULL ORDER BY d.date, w.created_at`
  );
  for (const workout of workouts) {
    add(['Workout', workout.date, workout.workout_type ?? 'Workout', null, null, null, null, null, null, null, null, null, null, workout.duration, null, null, null, workout.notes]);
    const exercises = await db.getAllAsync<any>(
      'SELECT exercise_name, sets, reps, weight, notes FROM exercises WHERE workout_log_id = ? AND deleted_at IS NULL ORDER BY created_at',
      workout.id
    );
    for (const exercise of exercises) {
      add(['Exercise', workout.date, workout.workout_type ?? 'Workout', exercise.exercise_name, null, null, null, null, null, null, null, null, null, null, exercise.sets, exercise.reps, exercise.weight, exercise.notes]);
    }
  }

  const mealTemplates = await db.getAllAsync<any>('SELECT id, name FROM meal_templates WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
  for (const template of mealTemplates) {
    const items = await db.getAllAsync<any>(
      `SELECT f.name AS food_name, i.quantity, f.serving_size, f.calories, f.protein, f.carbs, f.fat, f.fibre
       FROM template_items i LEFT JOIN foods f ON f.id = i.food_id
       WHERE i.template_id = ? AND i.deleted_at IS NULL ORDER BY i.created_at`,
      template.id
    );
    if (!items.length) add(['Meal template', null, template.name]);
    for (const item of items) {
      add(['Meal template item', null, template.name, item.food_name ?? 'Deleted food', item.quantity, 'g',
        mealItemMacros(item, 'calories'), mealItemMacros(item, 'protein'), mealItemMacros(item, 'carbs'), mealItemMacros(item, 'fat'), mealItemMacros(item, 'fibre')]);
    }
  }

  const workoutTemplates = await db.getAllAsync<any>('SELECT id, name FROM workout_templates WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
  for (const template of workoutTemplates) {
    add(['Workout routine', null, template.name]);
    const exercises = await db.getAllAsync<any>(
      'SELECT exercise_name, sets, reps, weight, notes FROM workout_template_exercises WHERE template_id = ? AND deleted_at IS NULL ORDER BY created_at',
      template.id
    );
    for (const exercise of exercises) {
      add(['Routine exercise', null, template.name, exercise.exercise_name, null, null, null, null, null, null, null, null, null, null, exercise.sets, exercise.reps, exercise.weight, exercise.notes]);
    }
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `Fitness-Tracker-Export-${dateStamp}.csv`;
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, `\uFEFF${lines.join('\r\n')}`, { encoding: FileSystem.EncodingType.UTF8 });
  return { uri, filename, rowCount };
}
