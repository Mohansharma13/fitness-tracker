import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { createExerciseLog, createWorkoutLog, deleteExerciseLog, deleteWorkoutLog, getWorkoutsForDate } from '../repositories/workoutRepository';
import { getSettings } from '../repositories/settingsRepository';
import type { WorkoutLog } from '../types/workout';
import { getTodayDate, isValidDateString } from '../utils/date';
import { weightFromStorage, weightToStorage, type WeightUnit } from '../utils/weight';

const QUICK_WORKOUTS = ['Strength', 'Run', 'Walk', 'Cycling'];

function displayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function WorkoutsScreen() {
  const db = useSQLiteContext();
  const { date: requestedDate, returnTo } = useLocalSearchParams<{ date?: string; returnTo?: string }>();
  const selectedDate = typeof requestedDate === 'string' && isValidDateString(requestedDate) ? requestedDate : getTodayDate();

  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingExercise, setSavingExercise] = useState(false);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [workoutName, setWorkoutName] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [detailsWorkoutId, setDetailsWorkoutId] = useState<string | null>(null);
  const [exerciseFormWorkoutId, setExerciseFormWorkoutId] = useState<string | null>(null);
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseSets, setExerciseSets] = useState('');
  const [exerciseReps, setExerciseReps] = useState('');
  const [exerciseWeight, setExerciseWeight] = useState('');
  const requestId = useRef(0);

  const goBack = () => {
    if (returnTo === 'history' && router.canGoBack()) router.back();
    else router.replace(returnTo === 'history' ? '/history' : '/');
  };

  useEffect(() => {
    getSettings(db).then((settings) => setWeightUnit(settings.weightUnit)).catch((error) => console.error('Failed to load settings:', error));
  }, [db]);

  const loadWorkouts = useCallback(async () => {
    const request = ++requestId.current;
    try {
      setLoading(true);
      setLoadError(false);
      const result = await getWorkoutsForDate(db, selectedDate);
      if (request === requestId.current) setWorkouts(result);
    } catch (error) {
      console.error('Failed to load workouts:', error);
      if (request === requestId.current) setLoadError(true);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [db, selectedDate]);

  useFocusEffect(useCallback(() => {
    void loadWorkouts();
    return () => { requestId.current += 1; };
  }, [loadWorkouts]));

  const saveWorkout = async () => {
    const trimmedName = workoutName.trim();
    const parsedDuration = duration.trim() ? Number(duration) : null;
    if (!trimmedName) {
      Alert.alert('Workout name required', 'Choose a workout type or enter a name.');
      return;
    }
    if (parsedDuration !== null && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)) {
      Alert.alert('Check duration', 'Enter a number of minutes greater than zero, or leave it blank.');
      return;
    }

    try {
      setSaving(true);
      await createWorkoutLog(db, { date: selectedDate, workoutType: trimmedName, duration: parsedDuration, notes: notes.trim() || null });
      setWorkoutName('');
      setDuration('');
      setNotes('');
      setNotesExpanded(false);
      await loadWorkouts();
      Alert.alert('Workout saved', `Workout recorded for ${selectedDate}.`);
    } catch (error) {
      console.error('Failed to save workout:', error);
      Alert.alert('Could not save workout', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteWorkout = (workout: WorkoutLog) => Alert.alert(
    'Delete workout',
    `Delete “${workout.workoutType}” from ${selectedDate}?`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteWorkoutLog(db, workout.id);
          setDetailsWorkoutId(null);
          setExerciseFormWorkoutId(null);
          await loadWorkouts();
        } catch (error) {
          console.error('Failed to delete workout:', error);
          Alert.alert('Could not delete workout', 'Please try again.');
        }
      } },
    ]
  );

  const saveExercise = async (workoutId: string) => {
    const trimmedName = exerciseName.trim();
    const sets = Number(exerciseSets);
    const reps = Number(exerciseReps);
    const enteredWeight = exerciseWeight.trim() ? Number(exerciseWeight) : null;
    const storedWeight = enteredWeight === null ? null : weightToStorage(enteredWeight, weightUnit);

    if (!trimmedName) {
      Alert.alert('Exercise name required', 'Enter an exercise name.');
      return;
    }
    if (!Number.isInteger(sets) || sets < 1 || !Number.isInteger(reps) || reps < 1) {
      Alert.alert('Check sets and reps', 'Enter whole numbers greater than zero.');
      return;
    }
    if (storedWeight !== null && (!Number.isFinite(storedWeight) || storedWeight < 0)) {
      Alert.alert('Check weight', 'Enter a valid non-negative weight, or leave it blank.');
      return;
    }

    try {
      setSavingExercise(true);
      await createExerciseLog(db, { workoutLogId: workoutId, exerciseName: trimmedName, sets, reps, weight: storedWeight });
      setExerciseName('');
      setExerciseSets('');
      setExerciseReps('');
      setExerciseWeight('');
      setExerciseFormWorkoutId(null);
      await loadWorkouts();
    } catch (error) {
      console.error('Failed to save exercise:', error);
      Alert.alert('Could not save exercise', 'Please try again.');
    } finally {
      setSavingExercise(false);
    }
  };

  const confirmDeleteExercise = (exerciseId: string, name: string) => Alert.alert(
    'Remove exercise',
    `Remove ${name} from this workout?`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await deleteExerciseLog(db, exerciseId);
          await loadWorkouts();
        } catch (error) {
          console.error('Failed to delete exercise:', error);
          Alert.alert('Could not remove exercise', 'Please try again.');
        }
      } },
    ]
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={17} color="#4B5563" />
          <Text style={styles.backText}>{returnTo === 'history' ? 'Weekly averages' : 'Today'}</Text>
        </Pressable>

        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.title}>Activity</Text>
            <Text style={styles.subtitle}>{displayDate(selectedDate)}</Text>
          </View>
          <View style={styles.dateBadge}><Ionicons name="calendar-outline" size={15} color="#4B5563" /><Text style={styles.dateBadgeText}>{selectedDate}</Text></View>
        </View>

        <View style={styles.logCard}>
          <Text style={styles.sectionTitle}>Log a workout</Text>
          <TextInput value={workoutName} onChangeText={setWorkoutName} placeholder="Workout name" returnKeyType="next" style={styles.input} />
          <View style={styles.quickChoices}>
            {QUICK_WORKOUTS.map((item) => <Pressable key={item} onPress={() => setWorkoutName(item)} style={[styles.quickChoice, workoutName === item && styles.quickChoiceActive]}><Text style={[styles.quickChoiceText, workoutName === item && styles.quickChoiceTextActive]}>{item}</Text></Pressable>)}
          </View>
          <View style={styles.durationRow}>
            <Text style={styles.durationLabel}>Duration</Text>
            <View style={styles.durationInputWrap}><TextInput value={duration} onChangeText={setDuration} placeholder="Optional" keyboardType="decimal-pad" style={styles.durationInput} /><Text style={styles.minutesLabel}>min</Text></View>
          </View>
          <Pressable style={styles.notesToggle} onPress={() => setNotesExpanded((expanded) => !expanded)}>
            <Ionicons name={notesExpanded ? 'remove-circle-outline' : 'add-circle-outline'} size={17} color="#4B5563" />
            <Text style={styles.notesToggleText}>{notesExpanded ? 'Hide notes' : 'Add notes (optional)'}</Text>
          </Pressable>
          {notesExpanded && <TextInput value={notes} onChangeText={setNotes} placeholder="What did you work on?" multiline style={[styles.input, styles.notesInput]} />}
          <Pressable style={[styles.saveButton, saving && styles.disabled]} onPress={saveWorkout} disabled={saving}>
            <Ionicons name="add" size={19} color="#FFFFFF" />
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save workout'}</Text>
          </Pressable>
        </View>

        <View style={styles.listHeading}>
          <Text style={styles.sectionTitle}>Your workouts</Text>
          <Text style={styles.countText}>{workouts.length}</Text>
        </View>

        {loading ? <ActivityIndicator style={styles.loader} /> : loadError ? (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Could not load workouts</Text><Pressable onPress={loadWorkouts} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable></View>
        ) : workouts.length === 0 ? (
          <View style={styles.emptyCard}><Ionicons name="barbell-outline" size={25} color="#9CA3AF" /><Text style={styles.emptyTitle}>No workouts yet</Text><Text style={styles.bodyText}>Your workouts for this day will appear here.</Text></View>
        ) : workouts.map((workout) => {
          const expanded = detailsWorkoutId === workout.id;
          return <View key={workout.id} style={styles.workoutCard}>
            <View style={styles.workoutSummaryRow}>
              <Pressable style={styles.workoutSummary} onPress={() => setDetailsWorkoutId(expanded ? null : workout.id)} accessibilityRole="button" accessibilityLabel={`${workout.workoutType}, ${workout.duration == null ? 'duration not entered' : `${workout.duration} minutes`}`}>
                <View style={styles.workoutIcon}><Ionicons name="barbell-outline" size={18} color="#374151" /></View>
                <View style={styles.workoutSummaryCopy}>
                  <Text style={styles.workoutName} numberOfLines={1}>{workout.workoutType}</Text>
                  <Text style={styles.workoutMeta}>{workout.duration == null ? 'Duration not entered' : `${workout.duration} min`}{workout.exercises.length ? ` · ${workout.exercises.length} ${workout.exercises.length === 1 ? 'exercise' : 'exercises'}` : ''}</Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
              </Pressable>
            </View>

            {expanded && <View style={styles.workoutDetails}>
              {!!workout.notes && <Text style={styles.noteText}>{workout.notes}</Text>}
              {workout.exercises.map((exercise) => <View key={exercise.id} style={styles.exerciseRow}>
                <View style={styles.exerciseInfo}>
                  <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>
                  <Text style={styles.bodyText}>{exercise.sets} sets × {exercise.reps} reps{exercise.weight == null ? '' : ` · ${weightFromStorage(exercise.weight, weightUnit).toFixed(1)} ${weightUnit}`}</Text>
                </View>
                <Pressable onPress={() => confirmDeleteExercise(exercise.id, exercise.exerciseName)} style={styles.removeExerciseButton} accessibilityLabel={`Remove ${exercise.exerciseName}`}><Ionicons name="close" size={18} color="#6B7280" /></Pressable>
              </View>)}

              <View style={styles.detailActions}>
                <Pressable style={styles.secondaryAction} onPress={() => setExerciseFormWorkoutId(exerciseFormWorkoutId === workout.id ? null : workout.id)}>
                  <Ionicons name={exerciseFormWorkoutId === workout.id ? 'close' : 'add'} size={17} color="#374151" />
                  <Text style={styles.secondaryActionText}>{exerciseFormWorkoutId === workout.id ? 'Cancel' : 'Add exercise'}</Text>
                </Pressable>
                <Pressable style={styles.deleteAction} onPress={() => confirmDeleteWorkout(workout)}><Ionicons name="trash-outline" size={16} color="#B42318" /><Text style={styles.deleteActionText}>Delete</Text></Pressable>
              </View>

              {exerciseFormWorkoutId === workout.id && <View style={styles.exerciseForm}>
                <TextInput value={exerciseName} onChangeText={setExerciseName} placeholder="Exercise name" style={styles.input} />
                <View style={styles.exerciseNumbers}>
                  <TextInput value={exerciseSets} onChangeText={setExerciseSets} placeholder="Sets" keyboardType="number-pad" style={[styles.input, styles.numberInput]} />
                  <TextInput value={exerciseReps} onChangeText={setExerciseReps} placeholder="Reps" keyboardType="number-pad" style={[styles.input, styles.numberInput]} />
                  <TextInput value={exerciseWeight} onChangeText={setExerciseWeight} placeholder={`Weight (${weightUnit})`} keyboardType="decimal-pad" style={[styles.input, styles.numberInput]} />
                </View>
                <Pressable style={[styles.saveExerciseButton, savingExercise && styles.disabled]} onPress={() => saveExercise(workout.id)} disabled={savingExercise}><Text style={styles.saveExerciseText}>{savingExercise ? 'Saving…' : 'Save exercise'}</Text></Pressable>
              </View>}
            </View>}
          </View>;
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 18, paddingTop: 46, paddingBottom: 40 },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 5 },
  backText: { color: '#4B5563', fontWeight: '600', fontSize: 13 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 15 },
  headingCopy: { flex: 1 },
  title: { fontSize: 27, fontWeight: '700', color: '#111827' },
  subtitle: { color: '#6B7280', marginTop: 3, fontSize: 13 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 7 },
  dateBadgeText: { color: '#4B5563', fontSize: 10, fontWeight: '600' },
  logCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, color: '#111827', fontSize: 14 },
  quickChoices: { flexDirection: 'row', gap: 7, marginTop: 8 },
  quickChoice: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#FFFFFF' },
  quickChoiceActive: { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC' },
  quickChoiceText: { color: '#4B5563', fontSize: 11, fontWeight: '600' },
  quickChoiceTextActive: { color: '#3730A3' },
  durationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  durationLabel: { color: '#4B5563', fontSize: 13, fontWeight: '600' },
  durationInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  durationInput: { minWidth: 84, textAlign: 'right', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, color: '#111827', fontSize: 13 },
  minutesLabel: { color: '#6B7280', fontSize: 12 },
  notesToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10 },
  notesToggleText: { color: '#4B5563', fontSize: 12, fontWeight: '600' },
  notesInput: { minHeight: 65, textAlignVertical: 'top', marginTop: 8 },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#111827', paddingVertical: 11, borderRadius: 9, marginTop: 12 },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.55 },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  countText: { backgroundColor: '#E5E7EB', color: '#4B5563', fontSize: 11, fontWeight: '700', borderRadius: 10, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  loader: { marginVertical: 20 },
  emptyCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 13, padding: 20, alignItems: 'center', gap: 7 },
  emptyTitle: { color: '#374151', fontWeight: '700', fontSize: 15 },
  bodyText: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  retryButton: { marginTop: 4, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#111827', borderRadius: 8 },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  workoutCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 7 },
  workoutSummaryRow: { flexDirection: 'row', alignItems: 'center' },
  workoutSummary: { flex: 1, minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 9 },
  workoutIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  workoutSummaryCopy: { flex: 1 },
  workoutName: { color: '#111827', fontSize: 14, fontWeight: '700' },
  workoutMeta: { color: '#6B7280', fontSize: 11, marginTop: 3 },
  workoutDetails: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 9 },
  noteText: { color: '#4B5563', fontSize: 12, marginBottom: 6 },
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  exerciseInfo: { flex: 1 },
  exerciseName: { color: '#374151', fontWeight: '600', fontSize: 12, marginBottom: 2 },
  removeExerciseButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  detailActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 9 },
  secondaryAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 },
  secondaryActionText: { color: '#374151', fontSize: 11, fontWeight: '600' },
  deleteAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  deleteActionText: { color: '#B42318', fontSize: 11, fontWeight: '600' },
  exerciseForm: { gap: 8, marginTop: 10, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10 },
  exerciseNumbers: { flexDirection: 'row', gap: 7 },
  numberInput: { flex: 1, minWidth: 0, paddingHorizontal: 7, fontSize: 12 },
  saveExerciseButton: { alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, paddingVertical: 10 },
  saveExerciseText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
});
