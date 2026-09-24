import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getRecentWorkoutHistory } from '../repositories/workoutRepository';
import type { WorkoutLog } from '../types/workout';
import { getSettings } from '../repositories/settingsRepository';
import { weightFromStorage, type WeightUnit } from '../utils/weight';

type HistoricWorkout = WorkoutLog & { date: string };
export default function WorkoutHistoryScreen() {
  const db = useSQLiteContext();
  const [rows, setRows] = useState<HistoricWorkout[]>([]);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const groups = rows.reduce<Record<string, HistoricWorkout[]>>((result, workout) => {
    (result[workout.date] ??= []).push(workout);
    return result;
  }, {});
  useEffect(() => { getSettings(db).then((settings) => setWeightUnit(settings.weightUnit)).catch((error) => console.error(error)); }, [db]);
  const load = useCallback(async () => { try { setRows(await getRecentWorkoutHistory(db)); } catch (error) { console.error(error); Alert.alert('Could not load workout history', 'Check your device storage, then try again.'); } finally { setLoading(false); } }, [db]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/explore')}><Text style={styles.back}>← More</Text></Pressable>
    <Text style={styles.title}>Workout history</Text><Text style={styles.subtitle}>{rows.length ? `${rows.length} recent sessions · tap a session for details` : 'Your saved sessions appear here.'}</Text>
    {loading ? <ActivityIndicator color="#25634C" /> : !rows.length ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No workouts yet</Text><Text style={styles.empty}>Log a session in Activity and it will show up here.</Text><Pressable onPress={() => router.replace('/workouts')}><Text style={styles.link}>Go to Activity ›</Text></Pressable></View> : Object.entries(groups).map(([date, sessions]) => <View key={date}>
      <View style={styles.groupHeader}><Text style={styles.groupDate}>{formatDate(date)}</Text><Text style={styles.groupCount}>{sessions.length}</Text></View>
      {sessions.map((workout) => {
        const expanded = expandedId === workout.id;
        return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedId(expanded ? null : workout.id)} key={workout.id} style={styles.card}>
          <View style={styles.head}><Text style={styles.name}>{workout.workoutType}</Text><Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text></View>
          <Text style={styles.muted}>{workout.duration == null ? 'Duration not entered' : `${workout.duration} min`}  ·  {workout.exercises.length} {workout.exercises.length === 1 ? 'exercise' : 'exercises'}</Text>
          {expanded && <View style={styles.details}>{!!workout.notes && <Text style={styles.notes}>{workout.notes}</Text>}{workout.exercises.length ? workout.exercises.map((exercise) => <Text key={exercise.id} style={styles.exercise}>{exercise.exerciseName} · {exercise.sets ?? '–'} sets × {exercise.reps ?? '–'} reps{exercise.weight == null ? '' : ` · ${weightFromStorage(exercise.weight, weightUnit).toFixed(1)} ${weightUnit}`}</Text>) : <Text style={styles.empty}>No exercises recorded.</Text>}</View>}
        </Pressable>;
      })}
    </View>)}
  </ScrollView>;
}

function formatDate(value: string) { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 18, paddingTop: 52, paddingBottom: 44 }, back: { color: '#25634C', fontWeight: '600', marginBottom: 15 }, title: { color: '#111827', fontSize: 29, fontWeight: '700' }, subtitle: { color: '#6B7280', marginTop: 4, marginBottom: 16 }, groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 6, paddingHorizontal: 3 }, groupDate: { color: '#4B5563', fontWeight: '700', fontSize: 13 }, groupCount: { color: '#6B7280', fontSize: 12 }, card: { backgroundColor: '#FFF', borderRadius: 13, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' }, head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 5 }, name: { color: '#111827', fontWeight: '700', fontSize: 15, flex: 1 }, chevron: { color: '#6B7280', fontSize: 20, paddingHorizontal: 4 }, muted: { color: '#6B7280', fontSize: 13 }, details: { borderTopWidth: 1, borderTopColor: '#F1F3F5', marginTop: 10, paddingTop: 3 }, notes: { color: '#4B5563', marginTop: 7 }, exercise: { color: '#374151', marginTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 7, fontSize: 13 }, empty: { color: '#6B7280', marginTop: 8 }, emptyCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#E5E7EB' }, emptyTitle: { color: '#111827', fontWeight: '700', fontSize: 16 }, link: { color: '#25634C', fontWeight: '700', marginTop: 14 } });
