import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { useSelectedDate } from '../contexts/SelectedDateContext';
import { weightFromStorage, weightToStorage, type WeightUnit } from '../utils/weight';
import { applyWorkoutTemplate, createWorkoutTemplateFromWorkout, getWorkoutTemplates, type WorkoutTemplate } from '../repositories/templateRepository';
import { getTodayDate, shiftDate } from '../utils/date';

const QUICK_WORKOUTS = ['Strength', 'Run', 'Walk', 'Cycling'];

function displayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function WorkoutsScreen() {
  const db = useSQLiteContext();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { selectedDate, setSelectedDate } = useSelectedDate();

  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplate[]>([]);
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
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  });
  const requestId = useRef(0);
  const loadQueue = useRef<Promise<void>>(Promise.resolve());

  const today = getTodayDate();
  const selectedDateObject = (() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  })();
  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarCells: (Date | null)[] = [
    ...Array.from({ length: monthStart.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1)),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);
  const monthTitle = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const isCurrentMonth = calendarMonth.getFullYear() === new Date().getFullYear() && calendarMonth.getMonth() === new Date().getMonth();

  const goBack = () => {
    router.replace(returnTo === 'history' ? '/history' : '/');
  };

  useEffect(() => {
    getSettings(db).then((settings) => setWeightUnit(settings.weightUnit)).catch((error) => console.error('Failed to load settings:', error));
  }, [db]);

  const loadWorkouts = useCallback(async () => {
    const request = ++requestId.current;
    const runLoad = async () => {
      if (request !== requestId.current) return;
      try {
        setLoading(true);
        setLoadError(false);
        const result = await getWorkoutsForDate(db, selectedDate);
        const templates = await getWorkoutTemplates(db);
        if (request === requestId.current) {
          setWorkouts(result);
          setWorkoutTemplates(templates);
        }
      } catch (error) {
        console.error('Failed to load workouts:', error);
        if (request === requestId.current) setLoadError(true);
      } finally {
        if (request === requestId.current) setLoading(false);
      }
    };
    const queuedLoad = loadQueue.current.then(runLoad, runLoad);
    loadQueue.current = queuedLoad.then(() => undefined, () => undefined);
    await queuedLoad;
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
      Alert.alert('Workout saved', `Recorded for ${displayDate(selectedDate)}. Add exercises, then save it as a routine if you want to reuse it on other dates.`);
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

  const saveWorkoutTemplate = async (workout: WorkoutLog) => {
    if (!workout.exercises.length) {
      Alert.alert('Add exercises first', 'Add at least one exercise to this workout before saving a reusable template.');
      return;
    }
    try {
      await createWorkoutTemplateFromWorkout(db, workout, workout.workoutType);
      await loadWorkouts();
      Alert.alert('Routine saved', `${workout.workoutType} is now available for any date in Saved routines.`);
    } catch (error) {
      console.error('Failed to save workout template:', error);
      Alert.alert('Could not save template', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const startWorkoutTemplate = async (template: WorkoutTemplate) => {
    if (!template.exercises.length) {
      Alert.alert('Template is empty', 'Add exercises to this template in Manage before using it.');
      return;
    }
    try {
      await applyWorkoutTemplate(db, template.id, selectedDate);
      await loadWorkouts();
      Alert.alert('Workout added', `${template.name} was added to ${selectedDate}.`);
    } catch (error) {
      console.error('Failed to start workout template:', error);
      Alert.alert('Could not start workout', error instanceof Error ? error.message : 'Please try again.');
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
            <Text style={styles.subtitle}>Log and review your workouts</Text>
          </View>
        </View>

        <View style={styles.dateNavigator}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous day" style={styles.dateArrow} onPress={() => setSelectedDate(shiftDate(selectedDate, -1))}>
            <Ionicons name="chevron-back" size={18} color="#374151" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Choose workout date, currently ${displayDate(selectedDate)}`} style={styles.datePickerButton} onPress={() => { setCalendarMonth(selectedDateObject); setCalendarVisible(true); }}>
            <Ionicons name="calendar-outline" size={17} color="#25634C" />
            <View style={styles.datePickerCopy}>
              <Text style={styles.datePickerTitle}>{selectedDate === today ? 'Today' : displayDate(selectedDate)}</Text>
              <Text style={styles.datePickerSubtitle}>{selectedDate === today ? displayDate(selectedDate) : 'Tap to choose another date'}</Text>
            </View>
            <Ionicons name="chevron-down" size={16} color="#6B7280" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Next day" style={[styles.dateArrow, selectedDate >= today && styles.dateArrowDisabled]} onPress={() => { if (selectedDate < today) setSelectedDate(shiftDate(selectedDate, 1)); }} disabled={selectedDate >= today}>
            <Ionicons name="chevron-forward" size={18} color={selectedDate >= today ? '#C4C9D0' : '#374151'} />
          </Pressable>
        </View>

        <View style={styles.logCard}>
          <View style={styles.logHeading}><Text style={styles.sectionTitle}>Log a workout</Text><Text style={styles.logDate}>{selectedDate === today ? 'Today' : displayDate(selectedDate)}</Text></View>
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

        <View style={styles.templateSection}>
          <View style={styles.templateHeadingRow}>
            <View><Text style={styles.sectionTitle}>Saved routines</Text><Text style={styles.templateHint}>Reusable on any date</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Manage saved workout templates" style={styles.manageTemplates} onPress={() => router.push('/templates?section=workouts')}>
              <Ionicons name="settings-outline" size={15} color="#25634C" /><Text style={styles.manageTemplatesText}>Manage</Text>
            </Pressable>
          </View>
          {workoutTemplates.length === 0 ? <Text style={styles.noTemplates}>After adding exercises, tap the bookmark on a workout to save it here for reuse.</Text> : workoutTemplates.map((template) => <View key={template.id} style={styles.templateCard}>
            <View style={styles.templateCopy}><Text style={styles.templateName}>{template.name}</Text><Text style={styles.templateExercises} numberOfLines={2}>{template.exercises.map((exercise) => `${exercise.exerciseName} ${exercise.sets ?? '—'}×${exercise.reps ?? '—'}`).join(' · ')}</Text></View>
            <Pressable style={styles.templateStart} onPress={() => startWorkoutTemplate(template)} accessibilityRole="button" accessibilityLabel={`Add ${template.name} to ${selectedDate}`}><Ionicons name="add" size={16} color="#FFFFFF" /><Text style={styles.templateStartText}>Add</Text></Pressable>
          </View>)}
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
              {workout.exercises.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Save ${workout.workoutType} as a reusable routine`} style={styles.bookmarkButton} onPress={() => saveWorkoutTemplate(workout)}>
                <Ionicons name="bookmark-outline" size={17} color="#25634C" />
              </Pressable>}
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
      <Modal visible={calendarVisible} transparent animationType="fade" onRequestClose={() => setCalendarVisible(false)}>
        <View style={styles.calendarBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCalendarVisible(false)} accessibilityLabel="Close calendar" />
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <View><Text style={styles.calendarTitle}>Choose a date</Text><Text style={styles.calendarSubtitle}>Select the day for this workout</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close date picker" onPress={() => setCalendarVisible(false)} style={styles.calendarClose}><Ionicons name="close" size={20} color="#4B5563" /></Pressable>
            </View>
            <View style={styles.monthNav}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous month" style={styles.monthArrow} onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={18} color="#374151" /></Pressable>
              <Text style={styles.monthTitle}>{monthTitle}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={isCurrentMonth} style={[styles.monthArrow, isCurrentMonth && styles.dateArrowDisabled]} onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}><Ionicons name="chevron-forward" size={18} color={isCurrentMonth ? '#C4C9D0' : '#374151'} /></Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}
              {calendarCells.map((day, index) => {
                if (!day) return <View key={`blank-${index}`} style={styles.calendarDayCell} />;
                const dateValue = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                const future = dateValue > today;
                const selected = dateValue === selectedDate;
                const isToday = dateValue === today;
                return <Pressable key={dateValue} disabled={future} accessibilityRole="button" accessibilityLabel={displayDate(dateValue)} accessibilityState={{ selected, disabled: future }} style={styles.calendarDayCell} onPress={() => { setSelectedDate(dateValue); setCalendarVisible(false); }}>
                  <View style={[styles.calendarDay, selected && styles.calendarDaySelected, isToday && !selected && styles.calendarDayToday]}><Text style={[styles.calendarDayText, selected && styles.calendarDayTextSelected, future && styles.calendarDayTextDisabled]}>{day.getDate()}</Text></View>
                </Pressable>;
              })}
            </View>
            <View style={styles.calendarFooter}>
              <Pressable style={styles.todayButton} onPress={() => { setSelectedDate(today); setCalendarMonth(new Date()); setCalendarVisible(false); }}><Text style={styles.todayButtonText}>Go to today</Text></Pressable>
              <Pressable style={styles.calendarDone} onPress={() => setCalendarVisible(false)}><Text style={styles.calendarDoneText}>Done</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  dateNavigator: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13, backgroundColor: '#FFFFFF', padding: 6, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12 },
  dateArrow: { width: 37, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  dateArrowDisabled: { opacity: 0.55 },
  datePickerButton: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 5 },
  datePickerCopy: { flex: 1 },
  datePickerTitle: { color: '#111827', fontSize: 13, fontWeight: '700' },
  datePickerSubtitle: { color: '#6B7280', fontSize: 10, marginTop: 2 },
  logCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 18 },
  logHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  logDate: { color: '#6B7280', fontSize: 11, fontWeight: '600' },
  templateSection: { marginBottom: 20 },
  templateHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  templateHint: { color: '#6B7280', fontSize: 11, marginTop: 3 },
  manageTemplates: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: '#CFE2D8', borderRadius: 9, backgroundColor: '#F3FAF6' },
  manageTemplatesText: { color: '#25634C', fontWeight: '700', fontSize: 12 },
  noTemplates: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 11, padding: 12, color: '#6B7280', fontSize: 12, lineHeight: 18 },
  templateCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 11, padding: 11, marginTop: 7 },
  templateCopy: { flex: 1 },
  templateName: { color: '#111827', fontWeight: '700', fontSize: 13 },
  templateExercises: { color: '#6B7280', fontSize: 11, marginTop: 4, lineHeight: 15 },
  templateStart: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#25634C' },
  templateStartText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
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
  workoutSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  workoutSummary: { flex: 1, minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 9 },
  workoutIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  workoutSummaryCopy: { flex: 1 },
  workoutName: { color: '#111827', fontSize: 14, fontWeight: '700' },
  workoutMeta: { color: '#6B7280', fontSize: 11, marginTop: 3 },
  bookmarkButton: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F3FAF6', borderWidth: 1, borderColor: '#CFE2D8' },
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
  calendarBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(17, 24, 39, 0.45)' },
  calendarCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 17, borderWidth: 1, borderColor: '#E5E7EB' },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarTitle: { color: '#111827', fontSize: 18, fontWeight: '700' },
  calendarSubtitle: { color: '#6B7280', fontSize: 12, marginTop: 3 },
  calendarClose: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, marginBottom: 7 },
  monthArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  monthTitle: { color: '#111827', fontSize: 14, fontWeight: '700' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center', color: '#6B7280', fontSize: 11, fontWeight: '700', paddingVertical: 7 },
  calendarDayCell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' },
  calendarDay: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  calendarDaySelected: { backgroundColor: '#25634C' },
  calendarDayToday: { borderWidth: 1, borderColor: '#25634C' },
  calendarDayText: { color: '#374151', fontSize: 13, fontWeight: '500' },
  calendarDayTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  calendarDayTextDisabled: { color: '#D1D5DB' },
  calendarFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  todayButton: { paddingVertical: 9, paddingHorizontal: 10 },
  todayButtonText: { color: '#25634C', fontSize: 13, fontWeight: '700' },
  calendarDone: { backgroundColor: '#111827', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 17 },
  calendarDoneText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
