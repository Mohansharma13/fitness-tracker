import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { deleteNote, getNotes, saveNote, type Note } from '../repositories/notesRepository';

export default function NotesScreen() {
  const db = useSQLiteContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Refresh when the tab regains focus so edits made in the note editor show immediately.
  const refresh = useCallback(() => { void getNotes(db).then(setNotes).catch((error) => console.error('Failed to load notes:', error)); }, [db]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const openNote = (note?: Note) => { setEditing(note ?? null); setTitle(note?.title ?? ''); setContent(note?.content ?? ''); setEditorOpen(true); };
  const save = async () => {
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    try { await saveNote(db, { id: editing?.id, title: title.trim(), content: content.trim() }); setEditorOpen(false); setEditing(null); refresh(); }
    catch (error) { console.error('Failed to save note:', error); Alert.alert('Could not save note', 'Please try again.'); }
    finally { setSaving(false); }
  };
  const remove = (note: Note) => Alert.alert('Delete note?', 'This note will be removed.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void deleteNote(db, note.id).then(refresh).catch((error) => { console.error('Failed to delete note:', error); Alert.alert('Could not delete note', 'Please try again.'); }); } },
  ]);

  return <View style={styles.screen}>
    <View style={styles.header}><View><Text style={styles.title}>Notes</Text><Text style={styles.subtitle}>Keep your thoughts and reminders</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Create note" onPress={() => openNote()} style={styles.add}><Ionicons name="add" size={25} color="#fff" /></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.list}>
      {notes.length === 0 ? <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={26} color="#25634C" /></View><Text style={styles.emptyTitle}>No notes yet</Text><Text style={styles.emptyText}>Create a note for reminders, ideas, or anything you want to keep.</Text><Pressable onPress={() => openNote()} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Create your first note</Text></Pressable></View> : notes.map((note) => <Pressable key={note.id} onPress={() => openNote(note)} style={styles.card}>
        <View style={styles.cardTop}><Text style={styles.noteTitle} numberOfLines={1}>{note.title || 'Untitled note'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Delete note" hitSlop={10} onPress={() => remove(note)}><Ionicons name="trash-outline" size={18} color="#9CA3AF" /></Pressable></View>
        {!!note.content && <Text style={styles.noteContent} numberOfLines={4}>{note.content}</Text>}
        <Text style={styles.date}>{new Date(note.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
      </Pressable>)}
    </ScrollView>
    <Modal visible={editorOpen} animationType="slide" onRequestClose={() => setEditorOpen(false)}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}><Pressable onPress={() => setEditorOpen(false)}><Text style={styles.cancel}>Cancel</Text></Pressable><Text style={styles.modalTitle}>{editing ? 'Edit note' : 'New note'}</Text><Pressable disabled={saving || (!title.trim() && !content.trim())} onPress={() => void save()}><Text style={[styles.save, (saving || (!title.trim() && !content.trim())) && styles.disabled]}>Save</Text></Pressable></View>
        <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor="#9CA3AF" style={styles.titleInput} maxLength={100} autoFocus />
        <TextInput value={content} onChangeText={setContent} placeholder="Write your note..." placeholderTextColor="#9CA3AF" style={styles.bodyInput} multiline textAlignVertical="top" />
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' }, header: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: '#111827', fontSize: 29, fontWeight: '700' }, subtitle: { color: '#6B7280', marginTop: 4 }, add: { backgroundColor: '#25634C', width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, list: { paddingHorizontal: 18, paddingBottom: 30, gap: 11, flexGrow: 1 }, card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', padding: 15 }, cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, noteTitle: { color: '#111827', fontSize: 16, fontWeight: '700', flex: 1 }, noteContent: { color: '#4B5563', fontSize: 14, lineHeight: 21, marginTop: 8 }, date: { color: '#9CA3AF', fontSize: 12, marginTop: 10 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, paddingBottom: 70 }, emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827' }, emptyText: { color: '#6B7280', textAlign: 'center', lineHeight: 20, marginTop: 6 }, emptyButton: { marginTop: 18, paddingVertical: 11, paddingHorizontal: 16, backgroundColor: '#25634C', borderRadius: 10 }, emptyButtonText: { color: '#fff', fontWeight: '600' }, modal: { flex: 1, backgroundColor: '#F7F8FA', paddingTop: Platform.OS === 'ios' ? 55 : 25, paddingHorizontal: 18 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48 }, modalTitle: { color: '#111827', fontSize: 16, fontWeight: '700' }, cancel: { color: '#6B7280', fontSize: 15 }, save: { color: '#25634C', fontSize: 15, fontWeight: '700' }, disabled: { opacity: 0.4 }, titleInput: { color: '#111827', fontSize: 22, fontWeight: '700', paddingVertical: 18 }, bodyInput: { flex: 1, color: '#374151', fontSize: 16, lineHeight: 24, paddingTop: 4 },
});
