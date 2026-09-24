import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  CreateFoodInput,
  Food,
} from '../types/food';

import { generateId } from '../utils/id';

function mapFood(row: any): Food {
  return {
    id: row.id,
    userId: row.user_id,

    name: row.name,
    servingSize: row.serving_size,

    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fibre: row.fibre,
    favorite: Boolean(row.favorite),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createFood(
  db: SQLiteDatabase,
  input: CreateFoodInput
): Promise<Food> {
  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO foods (
        id,
        user_id,
        name,
        serving_size,
        calories,
        protein,
        carbs,
        fat,
        fibre,
        created_at,
        updated_at,
        deleted_at,
        sync_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    id,
    null,
    input.name,
    input.servingSize,
    input.calories,
    input.protein,
    input.carbs,
    input.fat,
    input.fibre ?? 0,
    now,
    now,
    null,
    'local'
  );

  const food = await getFoodById(db, id);

  if (!food) {
    throw new Error('Failed to create food');
  }

  return food;
}

export async function getFoodById(
  db: SQLiteDatabase,
  id: string
): Promise<Food | null> {
  const row = await db.getFirstAsync<any>(
    `
      SELECT *
      FROM foods
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    id
  );

  return row ? mapFood(row) : null;
}

export async function searchFoods(
  db: SQLiteDatabase,
  search: string
): Promise<Food[]> {
  const rows = await db.getAllAsync<any>(
    `
      SELECT *
      FROM foods
      WHERE deleted_at IS NULL
        AND name LIKE ?
      ORDER BY favorite DESC, name ASC
      LIMIT 50
    `,
    `%${search}%`
  );

  return rows.map(mapFood);
}

export async function getAllFoods(
  db: SQLiteDatabase
): Promise<Food[]> {
  const rows = await db.getAllAsync<any>(
    `
      SELECT *
      FROM foods
      WHERE deleted_at IS NULL
      ORDER BY favorite DESC, name ASC
    `
  );

  return rows.map(mapFood);
}

export async function deleteFood(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE foods
      SET
        deleted_at = ?,
        updated_at = ?,
        sync_status = 'local'
      WHERE id = ?
    `,
    now,
    now,
    id
  );
}

export async function toggleFoodFavorite(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("UPDATE foods SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END, updated_at = ?, sync_status = 'local' WHERE id = ? AND deleted_at IS NULL", new Date().toISOString(), id);
}

export async function getRecentlyUsedFoods(db: SQLiteDatabase, limit = 10): Promise<Food[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT f.* FROM foods f
     INNER JOIN (SELECT mi.food_id, MAX(mi.created_at) AS last_used
       FROM meal_items mi JOIN meals m ON m.id = mi.meal_id
       WHERE mi.deleted_at IS NULL AND m.deleted_at IS NULL
       GROUP BY mi.food_id ORDER BY last_used DESC LIMIT ?) recent ON recent.food_id = f.id
     WHERE f.deleted_at IS NULL ORDER BY recent.last_used DESC`,
    limit
  );
  return rows.map(mapFood);
}

export async function updateFood(db: SQLiteDatabase, id: string, input: CreateFoodInput): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE foods SET name = ?, serving_size = ?, calories = ?, protein = ?, carbs = ?, fat = ?, fibre = ?, updated_at = ?, sync_status = 'local'
     WHERE id = ? AND deleted_at IS NULL`,
    input.name.trim(), input.servingSize, input.calories, input.protein, input.carbs, input.fat, input.fibre ?? 0, now, id
  );
}
