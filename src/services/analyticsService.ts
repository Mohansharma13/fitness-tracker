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
import { averageMetrics, getDailyMetricsInRange } from './rangeAnalyticsService';

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
  const days = await getDailyMetricsInRange(db, dates[0], dates[6]);
  const averages = averageMetrics(days, dates[0], dates[6]);
  return {
    averageMacros: {
      calories: averages.averageCalories,
      protein: averages.averageProtein,
      carbs: averages.averageCarbs,
      fat: averages.averageFat,
      fibre: averages.averageFibre,
    },
    averageSteps: averages.averageSteps,
    averageWeight: averages.averageWeight,
    workoutCount: averages.workoutCount,
    dailyCalories: days.map(({ date: day, calories }) => ({ date: day, calories })),
    dailySteps: days.map(({ date: day, steps }) => ({ date: day, steps })),
    dailyWeights: days.map(({ date: day, weight }) => ({ date: day, weight })),
  };
}
