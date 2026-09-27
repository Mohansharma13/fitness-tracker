import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteNote, getNotes, saveNote, type Note } from '../repositories/notesRepository';
import { generateId } from '../utils/id';

export default function NotesScreen() {
  const db = useSQLiteContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [draftId, setDraftId] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const insets = useSafeAreaInsets();
  const draftRef = useRef({ id: '', title: '', content: '', editing: false });
  useEffect(() => { draftRef.current = { id: draftId, title, content, editing: editorOpen }; }, [draftId, title, content, editorOpen]);

  // Refresh when the tab regains focus so edits made in the note editor show immediately.
  const refresh = useCallback(() => { void getNotes(db).then(setNotes).catch((error) => console.error('Failed to load notes:', error)); }, [db]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const openNote = (note?: Note) => { setEditing(note ?? null); setDraftId(note?.id ?? generateId()); setTitle(note?.title ?? ''); setContent(note?.content ?? ''); setSaveState('saved'); setEditorOpen(true); };
  const persistDraft = useCallback(async (draft = draftRef.current) => {
    if (!draft.editing || (!draft.title.trim() && !draft.content.trim())) return;
    setSaveState('saving');
    try {
      await saveNote(db, { id: draft.id, title: draft.title, content: draft.content });
      setSaveState('saved');
      refresh();
    } catch (error) {
      console.error('Failed to auto-save note:', error);
      setSaveState('saving');
    }
  }, [db, refresh]);

  // Persist typing shortly after it stops, and again when the app backgrounds.
  useEffect(() => {
    if (!editorOpen || (!title.trim() && !content.trim())) return;
    const timer = setTimeout(() => { void persistDraft(); }, 500);
    return () => clearTimeout(timer);
  }, [editorOpen, title, content, persistDraft]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void persistDraft();
    });
    return () => subscription.remove();
  }, [persistDraft]);

  const closeEditor = async () => {
    await persistDraft();
    setEditorOpen(false);
    setEditing(null);
  };
  const remove = (note: Note) => Alert.alert('Delete note?', 'This note will be removed.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void deleteNote(db, note.id).then(refresh).catch((error) => { console.error('Failed to delete note:', error); Alert.alert('Could not delete note', 'Please try again.'); }); } },
  ]);

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
      <View><Text style={styles.title}>Notes</Text><Text style={styles.subtitle}>Ideas and reminders</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Create note" onPress={() => openNote()} style={styles.add}><Ionicons name="add" size={19} color="#fff" /><Text style={styles.addText}>New note</Text></Pressable>
    </View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
      {notes.length === 0 ? <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={21} color="#25634C" /></View><Text style={styles.emptyTitle}>Nothing here yet</Text><Text style={styles.emptyText}>Jot down a reminder or thought. Your notes save as you type.</Text><Pressable onPress={() => openNote()} style={styles.emptyButton}><Ionicons name="add" size={18} color="#fff" /><Text style={styles.emptyButtonText}>Write a note</Text></Pressable></View> : notes.map((note) => <Pressable key={note.id} onPress={() => openNote(note)} style={styles.card}>
        <View style={styles.noteIcon}><Ionicons name="document-text-outline" size={18} color="#25634C" /></View>
        <View style={styles.noteCopy}>
          <Text style={styles.noteTitle} numberOfLines={1}>{note.title || 'Untitled note'}</Text>
          <Text style={styles.noteContent} numberOfLines={2}>{note.content || 'No details'}</Text>
          <Text style={styles.date}>{new Date(note.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${note.title || 'note'}`} hitSlop={5} onPress={(event) => { event.stopPropagation(); remove(note); }} style={styles.deleteButton}><Ionicons name="trash-outline" size={17} color="#8A929D" /></Pressable>
      </Pressable>)}
    </ScrollView>
    <Modal visible={editorOpen} animationType="slide" onRequestClose={() => { void closeEditor(); }}>
      <KeyboardAvoidingView style={[styles.modal, { paddingTop: Math.max(insets.top, 16) }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalHeader}>
          <View style={styles.editorHeading}><Text style={styles.modalTitle}>{editing ? 'Edit note' : 'New note'}</Text><Text style={styles.modalHint}>Saved automatically</Text></View>
          <Text accessibilityLiveRegion="polite" style={styles.saveStatus}>{saveState === 'saved' ? 'Saved' : 'Saving…'}</Text>
        </View>
        <ScrollView style={styles.editorScroll} contentContainerStyle={[styles.editorContent, { paddingBottom: 16 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <TextInput value={title} onChangeText={(value) => { setTitle(value); setSaveState('saving'); }} placeholder="Title" placeholderTextColor="#9CA3AF" style={styles.titleInput} maxLength={100} autoFocus returnKeyType="next" blurOnSubmit />
          <TextInput value={content} onChangeText={(value) => { setContent(value); setSaveState('saving'); }} placeholder="Start writing..." placeholderTextColor="#9CA3AF" style={styles.bodyInput} multiline textAlignVertical="top" />
        </ScrollView>
        <View style={[styles.editorActions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close note" onPress={() => { void closeEditor(); }} style={styles.closeButton}><Ionicons name="checkmark" size={17} color="#25634C" /><Text style={styles.closeButtonText}>Close</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' }, header: { paddingHorizontal: 18, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: '#111827', fontSize: 26, fontWeight: '700' }, subtitle: { color: '#6B7280', fontSize: 13, marginTop: 2 }, add: { backgroundColor: '#25634C', minHeight: 42, paddingHorizontal: 13, gap: 5, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, addText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 }, list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8, flexGrow: 1 }, card: { backgroundColor: '#fff', borderRadius: 13, paddingVertical: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 11 }, noteIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center' }, noteCopy: { flex: 1, minWidth: 0 }, deleteButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, noteTitle: { color: '#111827', fontSize: 15, fontWeight: '700' }, noteContent: { color: '#69727E', fontSize: 13, lineHeight: 18, marginTop: 2 }, date: { color: '#9CA3AF', fontSize: 11, marginTop: 5 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, paddingBottom: 70 }, emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, emptyTitle: { fontSize: 17, fontWeight: '700', color: '#111827' }, emptyText: { color: '#6B7280', textAlign: 'center', lineHeight: 20, marginTop: 5 }, emptyButton: { marginTop: 15, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#25634C', borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 4 }, emptyButtonText: { color: '#fff', fontWeight: '600' }, modal: { flex: 1, backgroundColor: '#F7F8FA', paddingHorizontal: 18 }, editorScroll: { flex: 1 }, editorContent: { flexGrow: 1 }, modalHeader: { minHeight: 60, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E8EAED' }, editorHeading: { gap: 2 }, modalTitle: { color: '#111827', fontSize: 19, fontWeight: '700' }, modalHint: { color: '#7B8490', fontSize: 12 }, titleInput: { color: '#111827', fontSize: 18, fontWeight: '600', borderBottomColor: '#E5E7EB', borderBottomWidth: 1, paddingHorizontal: 2, paddingVertical: 13, marginBottom: 4 }, bodyInput: { minHeight: 220, flexGrow: 1, color: '#374151', fontSize: 16, lineHeight: 24, paddingHorizontal: 2, paddingTop: 12, textAlignVertical: 'top' }, saveStatus: { color: '#6B7280', fontSize: 12 }, editorActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E8EAED' }, closeButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }, closeButtonText: { color: '#25634C', fontSize: 14, fontWeight: '700' },
});
