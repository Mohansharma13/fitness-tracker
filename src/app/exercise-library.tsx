import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteExerciseFromLibrary, getExerciseLibrary, saveExerciseToLibrary } from '../repositories/workoutRepository';

export default function ExerciseLibraryScreen() {
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [items, setItems] = useState<{ id: string; name: string; useCount: number }[]>([]);
  const load = useCallback(async () => { try { setItems(await getExerciseLibrary(db)); } catch (error) { console.error(error); Alert.alert('Could not load exercise library', 'Please try again.'); } }, [db]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const add = async () => {
    if (!name.trim()) return Alert.alert('Name required', 'Enter an exercise name.');
    try { await saveExerciseToLibrary(db, name); setName(''); await load(); }
    catch (error) { console.error(error); Alert.alert('Could not add exercise', 'Please try again.'); }
  };
  const remove = (item: { id: string; name: string }) => Alert.alert('Remove exercise', `Remove ${item.name} from your library? Existing workout history will stay.`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { await deleteExerciseFromLibrary(db, item.id); await load(); } },
  ]);
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/explore')}><Text style={styles.back}>← More</Text></Pressable>
    <Text style={styles.title}>Exercise Library</Text><Text style={styles.subtitle}>Reuse common exercise names in workout logs.</Text>
    <View style={styles.card}><TextInput value={name} onChangeText={setName} placeholder="e.g. Bench Press" style={styles.input} /><Pressable onPress={add} style={styles.button}><Text style={styles.buttonText}>Add Exercise</Text></Pressable></View>
    {items.length === 0 ? <Text style={styles.empty}>Exercises you add or log will appear here.</Text> : items.map((item) => <View key={item.id} style={styles.row}>
      <View style={styles.info}><Text style={styles.name}>{item.name}</Text><Text style={styles.muted}>{item.useCount} logged {item.useCount === 1 ? 'time' : 'times'}</Text></View>
      <Pressable onPress={() => remove(item)}><Text style={styles.delete}>Remove</Text></Pressable>
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 20, paddingTop: 52, paddingBottom: 40 }, back: { color: '#374151', fontWeight: '600', marginBottom: 14 }, title: { color: '#111827', fontSize: 29, fontWeight: '700' }, subtitle: { color: '#6B7280', marginTop: 5, marginBottom: 20 }, card: { backgroundColor: '#FFF', borderRadius: 14, padding: 15, marginBottom: 14 }, input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, padding: 11, color: '#111827' }, button: { backgroundColor: '#111827', borderRadius: 9, padding: 12, alignItems: 'center', marginTop: 10 }, buttonText: { color: '#FFF', fontWeight: '700' }, row: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, info: { flex: 1 }, name: { color: '#111827', fontWeight: '700' }, muted: { color: '#6B7280', marginTop: 4, fontSize: 12 }, delete: { color: '#DC2626', fontWeight: '600', padding: 4 }, empty: { color: '#6B7280', textAlign: 'center', marginTop: 14 } });
