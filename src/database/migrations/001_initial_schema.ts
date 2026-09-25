import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrateDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS daily_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,
      date TEXT NOT NULL UNIQUE,

      weight REAL,
      steps INTEGER,

      workout_completed INTEGER NOT NULL DEFAULT 0,
      workout_duration REAL,

      notes TEXT,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local'
    );

    CREATE INDEX IF NOT EXISTS idx_daily_logs_date
    ON daily_logs(date);

    CREATE INDEX IF NOT EXISTS idx_daily_logs_user_id
    ON daily_logs(user_id);


    CREATE TABLE IF NOT EXISTS foods (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,

      name TEXT NOT NULL,
      serving_size REAL NOT NULL DEFAULT 100,

      calories REAL NOT NULL DEFAULT 0,
      protein REAL NOT NULL DEFAULT 0,
      carbs REAL NOT NULL DEFAULT 0,
      fat REAL NOT NULL DEFAULT 0,
      fibre REAL NOT NULL DEFAULT 0,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local'
    );

    CREATE INDEX IF NOT EXISTS idx_foods_name
    ON foods(name);

    CREATE INDEX IF NOT EXISTS idx_foods_user_id
    ON foods(user_id);


    CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,

      daily_log_id TEXT NOT NULL,
      meal_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      quick_calories REAL,
      quick_protein REAL,
      quick_carbs REAL,
      quick_fat REAL,
      quick_fibre REAL,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',

      FOREIGN KEY (daily_log_id)
        REFERENCES daily_logs(id)
        ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_meals_daily_log_id
    ON meals(daily_log_id);


    CREATE TABLE IF NOT EXISTS meal_items (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,

      meal_id TEXT NOT NULL,
      food_id TEXT NOT NULL,

      quantity REAL NOT NULL DEFAULT 1,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',

      FOREIGN KEY (meal_id)
        REFERENCES meals(id)
        ON DELETE CASCADE,

      FOREIGN KEY (food_id)
        REFERENCES foods(id)
    );

    CREATE INDEX IF NOT EXISTS idx_meal_items_meal_id
    ON meal_items(meal_id);

    CREATE INDEX IF NOT EXISTS idx_meal_items_food_id
    ON meal_items(food_id);


    CREATE TABLE IF NOT EXISTS meal_templates (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,

      name TEXT NOT NULL,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local'
    );


    CREATE TABLE IF NOT EXISTS template_items (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,

      template_id TEXT NOT NULL,
      food_id TEXT NOT NULL,

      quantity REAL NOT NULL DEFAULT 1,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',

      FOREIGN KEY (template_id)
        REFERENCES meal_templates(id)
        ON DELETE CASCADE,

      FOREIGN KEY (food_id)
        REFERENCES foods(id)
    );


    CREATE TABLE IF NOT EXISTS workout_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,

      daily_log_id TEXT NOT NULL,

      workout_type TEXT,
      duration REAL,
      estimated_calories REAL,
      notes TEXT,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',

      FOREIGN KEY (daily_log_id)
        REFERENCES daily_logs(id)
        ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,

      workout_log_id TEXT NOT NULL,

      exercise_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      sets INTEGER,
      reps INTEGER,
      weight REAL,
      notes TEXT,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',

      FOREIGN KEY (workout_log_id)
        REFERENCES workout_logs(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exercise_library (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local'
    );

    CREATE INDEX IF NOT EXISTS idx_exercise_library_name
    ON exercise_library(name);


    CREATE TABLE IF NOT EXISTS workout_templates (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,

      name TEXT NOT NULL,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local'
    );


    CREATE TABLE IF NOT EXISTS workout_template_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,

      template_id TEXT NOT NULL,

      exercise_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      sets INTEGER,
      reps INTEGER,
      weight REAL,
      notes TEXT,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',

      FOREIGN KEY (template_id)
        REFERENCES workout_templates(id)
        ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,

      calorie_target REAL,
      protein_target REAL,
      carb_target REAL,
      fat_target REAL,
      step_target INTEGER,
      workout_target INTEGER,
      target_weight REAL,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local'
    );


    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY NOT NULL,

      user_id TEXT,

      name TEXT,
      weight_unit TEXT NOT NULL DEFAULT 'kg',
      theme TEXT NOT NULL DEFAULT 'system',

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weekly_tracking_goals (
      id TEXT PRIMARY KEY NOT NULL,
      calorie_target REAL,
      step_target INTEGER,
      target_weight REAL,
      workout_target INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const foodColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(foods)');
  if (!foodColumns.some((column) => column.name === 'favorite')) {
    await db.execAsync('ALTER TABLE foods ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
  }
  const goalColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(goals)');
  if (!goalColumns.some((column) => column.name === 'workout_target')) {
    await db.execAsync('ALTER TABLE goals ADD COLUMN workout_target INTEGER');
  }
  const mealColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(meals)');
  if (!mealColumns.some((column) => column.name === 'sort_order')) {
    await db.execAsync('ALTER TABLE meals ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }
  for (const column of ['quick_calories', 'quick_protein', 'quick_carbs', 'quick_fat', 'quick_fibre']) {
    if (!mealColumns.some((existing) => existing.name === column)) {
      await db.execAsync(`ALTER TABLE meals ADD COLUMN ${column} REAL`);
    }
  }
  const exerciseColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(exercises)');
  if (!exerciseColumns.some((column) => column.name === 'sort_order')) {
    await db.execAsync('ALTER TABLE exercises ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }
  const workoutTemplateExerciseColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(workout_template_exercises)');
  if (!workoutTemplateExerciseColumns.some((column) => column.name === 'sort_order')) {
    await db.execAsync('ALTER TABLE workout_template_exercises ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }
}
