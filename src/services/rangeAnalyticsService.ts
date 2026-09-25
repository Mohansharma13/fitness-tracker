import type { SQLiteDatabase } from 'expo-sqlite';
import { isValidDateString, shiftDate } from '../utils/date';

export type DateMetrics = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  steps: number;
  weight: number | null;
  workouts: number;
};

export type RangeAverage = {
  startDate: string;
  endDate: string;
  dayCount: number;
  averageCalories: number;
  averageProtein: number;
  averageCarbs: number;
  averageFat: number;
  averageFibre: number;
  averageSteps: number;
  averageWeight: number | null;
  workoutCount: number;
};

export type WeeklyAverage = RangeAverage & { weekNumber: number };

function validateRange(startDate: string, endDate: string) {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) throw new Error('Enter both dates in YYYY-MM-DD format.');
  if (startDate > endDate) throw new Error('Start date must be on or before the end date.');
  const days = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1;
  if (days > 3660) throw new Error('Choose a date range of 10 years or less.');
  return days;
}

export async function getDailyMetricsInRange(db: SQLiteDatabase, startDate: string, endDate: string): Promise<DateMetrics[]> {
  const dayCount = validateRange(startDate, endDate);
  const stored = await db.getAllAsync<DateMetrics>(`
    WITH meal_totals AS (
      SELECT m.daily_log_id,
        SUM(CASE WHEN m.quick_calories IS NOT NULL THEN m.quick_calories ELSE COALESCE(f.calories * i.quantity / NULLIF(f.serving_size, 0), 0) END) AS calories,
        SUM(CASE WHEN m.quick_calories IS NOT NULL THEN COALESCE(m.quick_protein, 0) ELSE COALESCE(f.protein * i.quantity / NULLIF(f.serving_size, 0), 0) END) AS protein,
        SUM(CASE WHEN m.quick_calories IS NOT NULL THEN COALESCE(m.quick_carbs, 0) ELSE COALESCE(f.carbs * i.quantity / NULLIF(f.serving_size, 0), 0) END) AS carbs,
        SUM(CASE WHEN m.quick_calories IS NOT NULL THEN COALESCE(m.quick_fat, 0) ELSE COALESCE(f.fat * i.quantity / NULLIF(f.serving_size, 0), 0) END) AS fat,
        SUM(CASE WHEN m.quick_calories IS NOT NULL THEN COALESCE(m.quick_fibre, 0) ELSE COALESCE(f.fibre * i.quantity / NULLIF(f.serving_size, 0), 0) END) AS fibre
      FROM meals m
      LEFT JOIN meal_items i ON i.meal_id = m.id AND i.deleted_at IS NULL AND m.quick_calories IS NULL
      LEFT JOIN foods f ON f.id = i.food_id
      WHERE m.deleted_at IS NULL
      GROUP BY m.daily_log_id
    )
    SELECT d.date, COALESCE(mt.calories, 0) AS calories, COALESCE(mt.protein, 0) AS protein,
      COALESCE(mt.carbs, 0) AS carbs, COALESCE(mt.fat, 0) AS fat, COALESCE(mt.fibre, 0) AS fibre,
      COALESCE(d.steps, 0) AS steps, d.weight, COUNT(DISTINCT w.id) AS workouts
    FROM daily_logs d
    LEFT JOIN meal_totals mt ON mt.daily_log_id = d.id
    LEFT JOIN workout_logs w ON w.daily_log_id = d.id AND w.deleted_at IS NULL
    WHERE d.deleted_at IS NULL AND d.date BETWEEN ? AND ?
    GROUP BY d.id
    ORDER BY d.date
  `, startDate, endDate);

  const byDate = new Map(stored.map((row) => [row.date, row]));
  return Array.from({ length: dayCount }, (_, index) => {
    const date = shiftDate(startDate, index);
    return byDate.get(date) ?? { date, calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, steps: 0, weight: null, workouts: 0 };
  });
}

export function averageMetrics(days: DateMetrics[], startDate: string, endDate: string): RangeAverage {
  const count = days.length;
  const measuredWeights = days.flatMap((day) => day.weight == null ? [] : [day.weight]);
  const sum = (key: 'calories' | 'protein' | 'carbs' | 'fat' | 'fibre' | 'steps') => days.reduce((total, day) => total + day[key], 0) / count;
  return {
    startDate, endDate, dayCount: count,
    averageCalories: sum('calories'), averageProtein: sum('protein'), averageCarbs: sum('carbs'),
    averageFat: sum('fat'), averageFibre: sum('fibre'), averageSteps: sum('steps'),
    averageWeight: measuredWeights.length ? measuredWeights.reduce((total, value) => total + value, 0) / measuredWeights.length : null,
    workoutCount: days.reduce((total, day) => total + day.workouts, 0),
  };
}

export async function getRangeAverage(db: SQLiteDatabase, startDate: string, endDate: string): Promise<RangeAverage> {
  const days = await getDailyMetricsInRange(db, startDate, endDate);
  return averageMetrics(days, startDate, endDate);
}

export async function getWeeklyAverages(db: SQLiteDatabase, startDate: string, endDate: string): Promise<WeeklyAverage[]> {
  const days = await getDailyMetricsInRange(db, startDate, endDate);
  const weeks: WeeklyAverage[] = [];
  for (let offset = 0, weekNumber = 1; offset < days.length; offset += 7, weekNumber += 1) {
    const weekDays = days.slice(offset, offset + 7);
    weeks.push({ ...averageMetrics(weekDays, weekDays[0].date, weekDays[weekDays.length - 1].date), weekNumber });
  }
  return weeks;
}
