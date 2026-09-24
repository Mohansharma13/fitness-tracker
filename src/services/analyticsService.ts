import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getMealsForDate,
} from '../repositories/mealRepository';

import {
  getDailyLogByDate,
} from '../repositories/dailyLogRepository';
import { getWorkoutCountForDate } from '../repositories/workoutRepository';

import {
  calculateDailyMacros,
} from './macroService';

export async function getDailyDashboard(
  db: SQLiteDatabase,
  date: string
) {
  const dailyLog = await getDailyLogByDate(db, date);
  const meals = await getMealsForDate(db, date);
  const workoutCount = await getWorkoutCountForDate(db, date);

  const dailyMacros = calculateDailyMacros(meals);

  return {
    date,
    dailyLog,
    meals,
    workoutCount,

    mealCount: meals.length,

    dailyMacros,
  };
}

export async function getWeeklySummary(db: SQLiteDatabase, date = new Date()): Promise<{
  averageMacros: { calories: number; protein: number; carbs: number; fat: number; fibre: number };
  averageSteps: number;
  averageWeight: number | null;
  workoutCount: number;
  dailyCalories: { date: string; calories: number }[];
  dailySteps: { date: string; steps: number }[];
  dailyWeights: { date: string; weight: number | null }[];
}> {
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dates = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(end);
    day.setDate(day.getDate() - (6 - offset));
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  });
  const dashboards = await Promise.all(dates.map((day) => getDailyDashboard(db, day)));
  const averageMacros = dashboards.reduce((sum, item) => ({
    calories: sum.calories + item.dailyMacros.calories / 7,
    protein: sum.protein + item.dailyMacros.protein / 7,
    carbs: sum.carbs + item.dailyMacros.carbs / 7,
    fat: sum.fat + item.dailyMacros.fat / 7,
    fibre: sum.fibre + item.dailyMacros.fibre / 7,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
  const rows = await db.getAllAsync<{ date: string; steps: number | null; weight: number | null }>(
    'SELECT date, steps, weight FROM daily_logs WHERE deleted_at IS NULL AND date BETWEEN ? AND ?', dates[0], dates[6]
  );
  const workout = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM workout_logs w JOIN daily_logs d ON d.id = w.daily_log_id
     WHERE w.deleted_at IS NULL AND d.deleted_at IS NULL AND d.date BETWEEN ? AND ?`, dates[0], dates[6]
  );
  const measuredWeights = rows.map((row) => row.weight).filter((value): value is number => value !== null);
  const logsByDate = new Map(rows.map((row) => [row.date, row]));
  return {
    averageMacros,
    averageSteps: rows.reduce((sum, row) => sum + (row.steps ?? 0), 0) / 7,
    averageWeight: measuredWeights.length ? measuredWeights.reduce((sum, value) => sum + value, 0) / measuredWeights.length : null,
    workoutCount: workout?.count ?? 0,
    dailyCalories: dashboards.map((item) => ({ date: item.date, calories: item.dailyMacros.calories })),
    dailySteps: dates.map((day) => ({ date: day, steps: logsByDate.get(day)?.steps ?? 0 })),
    dailyWeights: dates.map((day) => ({ date: day, weight: logsByDate.get(day)?.weight ?? null })),
  };
}
