import type { SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

const HEADERS = [
  'Date', 'Calories consumed (kcal)', 'Protein (g)', 'Carbohydrates (g)', 'Fat (g)', 'Fibre (g)',
  'Workout completed', 'Workout type', 'Workout duration (min)',
  'Body weight (kg)', 'Steps', 'Daily notes',
];

type CsvCell = string | number | null | undefined;
type DailyExportRow = {
  date: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  workout_completed: number;
  workout_type: string | null;
  workout_duration: number | null;
  weight: number | null;
  steps: number | null;
  notes: string | null;
};

export type CsvExportData = { filename: string; rowCount: number; contents: string };

function csvCell(value: CsvCell): string {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: CsvCell[]): string {
  return values.map(csvCell).join(',');
}

export async function createCsvExportData(db: SQLiteDatabase): Promise<CsvExportData> {
  const rows = await db.getAllAsync<DailyExportRow>(`
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
    ), workout_totals AS (
      SELECT w.daily_log_id,
        GROUP_CONCAT(COALESCE(NULLIF(w.workout_type, ''), 'Workout'), '; ') AS workout_type,
        SUM(w.duration) AS workout_duration
      FROM workout_logs w
      WHERE w.deleted_at IS NULL
      GROUP BY w.daily_log_id
    )
    SELECT d.date, mt.calories, mt.protein, mt.carbs, mt.fat, mt.fibre,
      CASE WHEN d.workout_completed = 1 OR wt.workout_type IS NOT NULL THEN 1 ELSE 0 END AS workout_completed,
      wt.workout_type, wt.workout_duration,
      d.weight, d.steps, d.notes
    FROM daily_logs d
    LEFT JOIN meal_totals mt ON mt.daily_log_id = d.id
    LEFT JOIN workout_totals wt ON wt.daily_log_id = d.id
    WHERE d.deleted_at IS NULL
    ORDER BY d.date ASC
  `);

  // Leave the first header unquoted and omit a UTF-8 BOM: some Excel/mobile
  // CSV readers display the BOM as stray characters before the Date header.
  const header = HEADERS.map((value, index) => index === 0 ? value : csvCell(value)).join(',');
  const lines = [header, ...rows.map((row) => csvRow([
    row.date,
    row.calories,
    row.protein,
    row.carbs,
    row.fat,
    row.fibre,
    row.workout_completed ? 'Yes' : 'No',
    row.workout_type,
    row.workout_duration,
    row.weight,
    row.steps,
    row.notes,
  ]))];
  const dateStamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `Fitness-Tracker-Daily-Summary-${dateStamp}.csv`,
    rowCount: rows.length,
    contents: lines.join('\r\n'),
  };
}

export async function createCsvExportFile(db: SQLiteDatabase): Promise<CsvExportData & { uri: string }> {
  if (!FileSystem.cacheDirectory) throw new Error('Temporary file storage is not available on this device.');
  const data = await createCsvExportData(db);
  const uri = `${FileSystem.cacheDirectory}${data.filename}`;
  await FileSystem.writeAsStringAsync(uri, data.contents, { encoding: FileSystem.EncodingType.UTF8 });
  return { ...data, uri };
}

export async function saveCsvExportToDirectory(data: CsvExportData, directoryUri: string): Promise<{ filename: string; rowCount: number }> {
  const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    directoryUri,
    data.filename.replace(/\.csv$/i, ''),
    'text/csv',
  );
  await FileSystem.writeAsStringAsync(fileUri, data.contents, { encoding: FileSystem.EncodingType.UTF8 });
  return { filename: data.filename, rowCount: data.rowCount };
}
