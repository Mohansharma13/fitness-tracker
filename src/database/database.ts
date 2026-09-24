// This gives us one central place for database initialization.
// SQLite database provider
import { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './migrations/001_initial_schema';

export async function initializeDatabase(
  db: SQLiteDatabase
): Promise<void> {
  await migrateDatabase(db);
}