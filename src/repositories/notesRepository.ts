import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '../utils/id';

export type Note = { id: string; title: string; content: string; created_at: string; updated_at: string };

// Hide soft-deleted notes from the list while retaining their deletion timestamp in storage.
export function getNotes(db: SQLiteDatabase) {
  return db.getAllAsync<Note>('SELECT id, title, content, created_at, updated_at FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC');
}

export async function saveNote(db: SQLiteDatabase, input: { id?: string; title: string; content: string }) {
  const now = new Date().toISOString();
  // Keep the original creation time when editing; only new notes get a generated ID.
  if (input.id) {
    await db.runAsync('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?', input.title, input.content, now, input.id);
  } else {
    await db.runAsync('INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', generateId(), input.title, input.content, now, now);
  }
}

export function deleteNote(db: SQLiteDatabase, id: string) {
  // Soft deletion keeps the record available to backup/restore workflows.
  return db.runAsync('UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?', new Date().toISOString(), new Date().toISOString(), id);
}
