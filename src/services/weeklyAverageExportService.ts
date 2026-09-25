import type { SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { getWeeklyAverages } from './rangeAnalyticsService';
import { weightFromStorage, type WeightUnit } from '../utils/weight';

export type WeeklyAverageFile = { filename: string; rowCount: number; contents: string; uri?: string };

function cell(value: string | number | null): string {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function createWeeklyAverageCsv(db: SQLiteDatabase, startDate: string, endDate: string, weightUnit: WeightUnit = 'kg'): Promise<WeeklyAverageFile> {
  const weeks = await getWeeklyAverages(db, startDate, endDate);
  const lines = [[
    'Week', 'Start date', 'End date', 'Days', 'Average calories per day (kcal)',
    'Average protein per day (g)', 'Average carbohydrates per day (g)', 'Average fat per day (g)',
    'Average fibre per day (g)', 'Average steps per day', `Average weight (${weightUnit})`, 'Workouts',
  ].map(cell).join(',')];
  for (const week of weeks) {
    lines.push([
      `Week ${week.weekNumber}`, week.startDate, week.endDate, week.dayCount,
      Math.round(week.averageCalories), Math.round(week.averageProtein), Math.round(week.averageCarbs),
      Math.round(week.averageFat), Math.round(week.averageFibre), Math.round(week.averageSteps),
      week.averageWeight == null ? null : Number(weightFromStorage(week.averageWeight, weightUnit).toFixed(1)), week.workoutCount,
    ].map(cell).join(','));
  }
  return {
    filename: `Fitness-Tracker-Weekly-Averages-${startDate}-to-${endDate}.csv`,
    rowCount: weeks.length,
    contents: lines.join('\r\n'),
  };
}

export async function createWeeklyAverageFile(db: SQLiteDatabase, startDate: string, endDate: string, weightUnit: WeightUnit = 'kg'): Promise<WeeklyAverageFile> {
  if (!FileSystem.cacheDirectory) throw new Error('Temporary file storage is not available on this device.');
  const data = await createWeeklyAverageCsv(db, startDate, endDate, weightUnit);
  const uri = `${FileSystem.cacheDirectory}${data.filename}`;
  await FileSystem.writeAsStringAsync(uri, data.contents, { encoding: FileSystem.EncodingType.UTF8 });
  return { ...data, uri };
}

export async function saveWeeklyAverageToDirectory(file: WeeklyAverageFile, directoryUri: string): Promise<void> {
  const outputUri = await FileSystem.StorageAccessFramework.createFileAsync(
    directoryUri,
    file.filename.replace(/\.csv$/i, ''),
    'text/csv',
  );
  await FileSystem.writeAsStringAsync(outputUri, file.contents, { encoding: FileSystem.EncodingType.UTF8 });
}
