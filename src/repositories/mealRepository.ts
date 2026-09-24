import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  Meal,
  MealItem,
  MealMacros,
  MealWithItems,
} from '../types/meal';

import { generateId } from '../utils/id';


function mapMeal(row: any): Meal {
  return {
    id: row.id,
    dailyLogId: row.daily_log_id,

    mealName: row.meal_name,
    notes: row.notes,
    quickMacros: row.quick_calories == null ? null : {
      calories: row.quick_calories,
      protein: row.quick_protein ?? 0,
      carbs: row.quick_carbs ?? 0,
      fat: row.quick_fat ?? 0,
      fibre: row.quick_fibre ?? 0,
    },

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMealItem(row: any): MealItem {
  return {
    id: row.id,
    mealId: row.meal_id,
    foodId: row.food_id,
    quantity: row.quantity,

    food: row.food_id
      ? {
          id: row.food_id,
          userId: row.user_id,

          name: row.food_name,
          servingSize: row.serving_size,

          calories: row.calories,
          protein: row.protein,
          carbs: row.carbs,
          fat: row.fat,
          fibre: row.fibre,

          createdAt: row.food_created_at,
          updatedAt: row.food_updated_at,
        }
      : undefined,
  };
}

export async function createMeal(
  db: SQLiteDatabase,
  dailyLogId: string,
  mealName: string,
  quickMacros: MealMacros | null = null
): Promise<Meal> {
  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO meals (
        id,
        user_id,
        daily_log_id,
        meal_name,
        notes,
        quick_calories,
        quick_protein,
        quick_carbs,
        quick_fat,
        quick_fibre,
        created_at,
        updated_at,
        deleted_at,
        sync_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    id,
    null,
    dailyLogId,
    mealName,
    null,
    quickMacros?.calories ?? null,
    quickMacros?.protein ?? null,
    quickMacros?.carbs ?? null,
    quickMacros?.fat ?? null,
    quickMacros?.fibre ?? null,
    now,
    now,
    null,
    'local'
  );

  const row = await db.getFirstAsync<any>(
    `
      SELECT *
      FROM meals
      WHERE id = ?
    `,
    id
  );

  if (!row) {
    throw new Error('Failed to create meal');
  }

  return mapMeal(row);
}

export async function getMealsForDate(
  db: SQLiteDatabase,
  date: string
): Promise<MealWithItems[]> {
  const meals = await db.getAllAsync<any>(
    `
      SELECT m.*
      FROM meals m
      INNER JOIN daily_logs d
        ON d.id = m.daily_log_id
      WHERE d.date = ?
        AND d.deleted_at IS NULL
        AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC
    `,
    date
  );

  const result: MealWithItems[] = [];

  for (const mealRow of meals) {
    const items = await db.getAllAsync<any>(
      `
        SELECT
          mi.*,

          f.name AS food_name,
          f.user_id,
          f.serving_size,
          f.calories,
          f.protein,
          f.carbs,
          f.fat,
          f.fibre,
          f.created_at AS food_created_at,
          f.updated_at AS food_updated_at

        FROM meal_items mi

        INNER JOIN foods f
          ON f.id = mi.food_id

        WHERE mi.meal_id = ?
          AND mi.deleted_at IS NULL
      `,
      mealRow.id
    );

    result.push({
      ...mapMeal(mealRow),
      items: items.map(mapMealItem),
    });
  }

  return result;
}

export async function addMealItem(
  db: SQLiteDatabase,
  mealId: string,
  foodId: string,
  quantity: number
): Promise<MealItem> {
  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO meal_items (
        id,
        user_id,
        meal_id,
        food_id,
        quantity,
        created_at,
        updated_at,
        deleted_at,
        sync_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    id,
    null,
    mealId,
    foodId,
    quantity,
    now,
    now,
    null,
    'local'
  );

  return {
    id,
    mealId,
    foodId,
    quantity,
  };
}

export async function updateMealItemQuantity(
  db: SQLiteDatabase,
  mealItemId: string,
  quantity: number
): Promise<void> {
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE meal_items
      SET
        quantity = ?,
        updated_at = ?,
        sync_status = 'local'
      WHERE id = ?
    `,
    quantity,
    now,
    mealItemId
  );
}

export async function deleteMealItem(
  db: SQLiteDatabase,
  mealItemId: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE meal_items
      SET
        deleted_at = ?,
        updated_at = ?,
        sync_status = 'local'
      WHERE id = ?
    `,
    now,
    now,
    mealItemId
  );
}

export async function getMealById(
  db: SQLiteDatabase,
  mealId: string
): Promise<MealWithItems | null> {
  const meal = await db.getFirstAsync<{
    id: string;
    daily_log_id: string;
    meal_name: string;
    notes: string | null;
    quick_calories: number | null;
    quick_protein: number | null;
    quick_carbs: number | null;
    quick_fat: number | null;
    quick_fibre: number | null;
    created_at: string;
    updated_at: string;
  }>(
    `
    SELECT
      id,
      daily_log_id,
      meal_name,
      notes,
      quick_calories,
      quick_protein,
      quick_carbs,
      quick_fat,
      quick_fibre,
      created_at,
      updated_at
    FROM meals
    WHERE id = ?
      AND deleted_at IS NULL
    `,
    mealId
  );

  if (!meal) {
    return null;
  }

  const items = await db.getAllAsync<{
    id: string;
    meal_id: string;
    food_id: string;
    quantity: number;

    food_name: string;
    food_serving_size: number;
    food_calories: number;
    food_protein: number;
    food_carbs: number;
    food_fat: number;
    food_fibre: number;
    food_created_at: string;
    food_updated_at: string;
  }>(
    `
    SELECT
      mi.id,
      mi.meal_id,
      mi.food_id,
      mi.quantity,

      f.name AS food_name,
      f.serving_size AS food_serving_size,
      f.calories AS food_calories,
      f.protein AS food_protein,
      f.carbs AS food_carbs,
      f.fat AS food_fat,
      f.fibre AS food_fibre,
      f.created_at AS food_created_at,
      f.updated_at AS food_updated_at

    FROM meal_items mi

    JOIN foods f
      ON f.id = mi.food_id

    WHERE mi.meal_id = ?
      AND mi.deleted_at IS NULL

    ORDER BY mi.created_at ASC
    `,
    mealId
  );

  return {
    id: meal.id,
    dailyLogId: meal.daily_log_id,
    mealName: meal.meal_name,
    notes: meal.notes,
    quickMacros: meal.quick_calories == null ? null : {
      calories: meal.quick_calories,
      protein: meal.quick_protein ?? 0,
      carbs: meal.quick_carbs ?? 0,
      fat: meal.quick_fat ?? 0,
      fibre: meal.quick_fibre ?? 0,
    },
    createdAt: meal.created_at,
    updatedAt: meal.updated_at,

    items: items.map((item) => ({
      id: item.id,
      mealId: item.meal_id,
      foodId: item.food_id,
      quantity: item.quantity,

      food: {
        id: item.food_id,
        userId: null,
        name: item.food_name,
        servingSize: item.food_serving_size,
        calories: item.food_calories,
        protein: item.food_protein,
        carbs: item.food_carbs,
        fat: item.food_fat,
        fibre: item.food_fibre,
        createdAt: item.food_created_at,
        updatedAt: item.food_updated_at,
      },
    })),
  };
}

export async function deleteMeal(
  db: SQLiteDatabase,
  mealId: string
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
      UPDATE meal_items
      SET
        deleted_at = ?,
        updated_at = ?,
        sync_status = 'pending'
      WHERE meal_id = ?
        AND deleted_at IS NULL
      `,
      new Date().toISOString(),
      new Date().toISOString(),
      mealId
    );

    await db.runAsync(
      `
      UPDATE meals
      SET
        deleted_at = ?,
        updated_at = ?,
        sync_status = 'pending'
      WHERE id = ?
        AND deleted_at IS NULL
      `,
      new Date().toISOString(),
      new Date().toISOString(),
      mealId
    );
  });
}

export async function updateMeal(
  db: SQLiteDatabase,
  mealId: string,
  mealName: string,
  items: {
    foodId: string;
    quantity: number;
  }[],
  quickMacros: MealMacros | null = null
): Promise<void> {
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    // Update meal name
    await db.runAsync(
      `
      UPDATE meals
      SET
        meal_name = ?,
        quick_calories = ?,
        quick_protein = ?,
        quick_carbs = ?,
        quick_fat = ?,
        quick_fibre = ?,
        updated_at = ?,
        sync_status = 'local'
      WHERE id = ?
        AND deleted_at IS NULL
      `,
      mealName,
      quickMacros?.calories ?? null,
      quickMacros?.protein ?? null,
      quickMacros?.carbs ?? null,
      quickMacros?.fat ?? null,
      quickMacros?.fibre ?? null,
      now,
      mealId
    );

    // Soft-delete existing meal items
    await db.runAsync(
      `
      UPDATE meal_items
      SET
        deleted_at = ?,
        updated_at = ?,
        sync_status = 'local'
      WHERE meal_id = ?
        AND deleted_at IS NULL
      `,
      now,
      now,
      mealId
    );

    // Insert the current items
    for (const item of items) {
      const itemId = generateId();

      await db.runAsync(
        `
        INSERT INTO meal_items (
          id,
          user_id,
          meal_id,
          food_id,
          quantity,
          created_at,
          updated_at,
          deleted_at,
          sync_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        itemId,
        null,
        mealId,
        item.foodId,
        item.quantity,
        now,
        now,
        null,
        'local'
      );
    }
  });
}
