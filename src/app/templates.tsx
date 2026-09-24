import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getMealsForDate } from '../repositories/mealRepository';
import { getWorkoutsForDate } from '../repositories/workoutRepository';
import { addMealTemplateToDate, applyWorkoutTemplate, createMealTemplateFromMeal, createWorkoutTemplateFromWorkout, deleteMealTemplate, deleteWorkoutTemplate, getMealTemplates, getWorkoutTemplates, replaceMealTemplateFromMeal, updateWorkoutTemplateContents, type MealTemplate, type WorkoutTemplate } from '../repositories/templateRepository';
import type { MealWithItems } from '../types/meal';
import type { WorkoutLog } from '../types/workout';
import { getSettings } from '../repositories/settingsRepository';
import { weightFromStorage, type WeightUnit } from '../utils/weight';
import { useSelectedDate } from '../contexts/SelectedDateContext';
import { weightToStorage } from '../utils/weight';

type WorkoutExerciseDraft = { key: string; exerciseName: string; sets: string; reps: string; weight: string };

export default function TemplatesScreen() {
  const db = useSQLiteContext();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const workoutOnly = section === 'workouts';
  const { selectedDate } = useSelectedDate();
  const [mealTemplates, setMealTemplates] = useState<MealTemplate[]>([]);
  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplate[]>([]);
  const [meals, setMeals] = useState<MealWithItems[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [editingMealTemplateId, setEditingMealTemplateId] = useState<string | null>(null);
  const [editingWorkoutTemplateId, setEditingWorkoutTemplateId] = useState<string | null>(null);
  const [draftTemplateName, setDraftTemplateName] = useState('');
  const [draftExercises, setDraftExercises] = useState<WorkoutExerciseDraft[]>([]);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const reusableMeals = meals.filter((meal) => !meal.quickMacros && meal.items.length > 0);
  useEffect(() => { getSettings(db).then((settings) => setWeightUnit(settings.weightUnit)).catch((error) => console.error(error)); }, [db]);

  const load = useCallback(async () => {
    try {
      if (workoutOnly) {
        const wt = await getWorkoutTemplates(db);
        const ws = await getWorkoutsForDate(db, selectedDate);
        setWorkoutTemplates(wt);
        setWorkouts(ws);
        return;
      }
      const [mt, wt, ms, ws] = await Promise.all([
        getMealTemplates(db), getWorkoutTemplates(db), getMealsForDate(db, selectedDate), getWorkoutsForDate(db, selectedDate),
      ]);
      setMealTemplates(mt); setWorkoutTemplates(wt); setMeals(ms); setWorkouts(ws);
    } catch (error) { console.error('Failed to load templates:', error); Alert.alert('Could not load templates', 'Please try again.'); }
  }, [db, selectedDate, workoutOnly]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const action = async (fn: () => Promise<void>, done: string) => {
    try { await fn(); await load(); Alert.alert('Saved', done); }
    catch (error) { console.error(error); Alert.alert('Could not complete action', error instanceof Error ? error.message : 'Please try again.'); }
  };
  const askDelete = (label: string, fn: () => Promise<void>) => Alert.alert('Delete template', `Delete â€œ${label}â€?`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void action(fn, 'Template deleted.'); } },
  ]);

  const beginWorkoutTemplateEdit = (template: WorkoutTemplate) => {
    setEditingWorkoutTemplateId(template.id);
    setDraftTemplateName(template.name);
    setDraftExercises(template.exercises.map((exercise) => ({
      key: exercise.id,
      exerciseName: exercise.exerciseName,
      sets: String(exercise.sets ?? ''),
      reps: String(exercise.reps ?? ''),
      weight: exercise.weight == null ? '' : String(weightFromStorage(exercise.weight, weightUnit)),
    })));
  };

  const updateDraftExercise = (key: string, field: keyof Omit<WorkoutExerciseDraft, 'key'>, value: string) => {
    setDraftExercises((current) => current.map((exercise) => exercise.key === key ? { ...exercise, [field]: value } : exercise));
  };

  const saveWorkoutTemplateEdit = async (templateId: string) => {
    const exercises = draftExercises.map((exercise) => ({
      exerciseName: exercise.exerciseName.trim(),
      sets: Number(exercise.sets),
      reps: Number(exercise.reps),
      weight: exercise.weight.trim() ? weightToStorage(Number(exercise.weight), weightUnit) : null,
    }));
    if (exercises.some((exercise) => !exercise.exerciseName || !Number.isInteger(exercise.sets) || exercise.sets < 1 || !Number.isInteger(exercise.reps) || exercise.reps < 1 || (exercise.weight !== null && (!Number.isFinite(exercise.weight) || exercise.weight < 0)))) {
      Alert.alert('Check the exercise details', 'Enter an exercise name, positive whole-number sets and reps, and a valid optional weight for each exercise.');
      return;
    }
    try {
      await updateWorkoutTemplateContents(db, templateId, draftTemplateName, exercises);
      setEditingWorkoutTemplateId(null);
      await load();
      Alert.alert('Routine updated', 'Your saved routine is ready to use.');
    } catch (error) {
      Alert.alert('Could not update routine', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
  <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <Pressable accessibilityRole="button" onPress={() => router.replace(workoutOnly ? '/workouts' : '/explore')}><Text style={styles.back}>{workoutOnly ? 'Back to Activity' : 'Back to More'}</Text></Pressable>
    <Text style={styles.title}>{workoutOnly ? 'Workout routines' : 'Templates'}</Text>
    <Text style={styles.subtitle}>{workoutOnly ? `Edit saved routines or add one to ${selectedDate}.` : `Save meals and workouts, then reuse them on ${selectedDate} or another day.`}</Text>

    {!workoutOnly && <>
    <Text style={styles.heading}>Meal templates</Text>
    {reusableMeals.map((meal) => <View key={meal.id} style={styles.sourceCard}>
      <Text style={styles.name}>{meal.mealName}</Text><Text style={styles.muted}>{meal.items.length} food items</Text>
      <Action label="Save this meal as a template" onPress={() => action(() => createMealTemplateFromMeal(db, meal.id, meal.mealName), 'Meal template created.')} />
    </View>)}
    {mealTemplates.map((template) => <View key={template.id} style={styles.card}>
      <Text style={styles.name}>{template.name}</Text><Text style={styles.muted}>{template.itemCount} food items</Text>
      {template.items.map((item, index) => <Text key={`${template.id}-${index}`} style={styles.detail}>{item.foodName} Â· {item.quantity} g</Text>)}
      <View style={styles.actions}>
        <Action label={`Add to ${selectedDate}`} onPress={() => action(() => addMealTemplateToDate(db, template.id, selectedDate), `Meal added to ${selectedDate}.`)} />
        <Action label="Edit contents" onPress={() => setEditingMealTemplateId(editingMealTemplateId === template.id ? null : template.id)} />
        <Action label="Delete" destructive onPress={() => askDelete(template.name, () => deleteMealTemplate(db, template.id))} />
      </View>
      {editingMealTemplateId === template.id && <View style={styles.editChoices}>
        <Text style={styles.muted}>Replace this template with a meal logged today:</Text>
        {reusableMeals.map((meal) => <Action key={meal.id} label={meal.mealName} onPress={() => action(() => replaceMealTemplateFromMeal(db, template.id, meal.id), 'Meal template updated.')} />)}
      </View>}
    </View>)}
    {!reusableMeals.length && !mealTemplates.length && <Text style={styles.empty}>Log a meal using foods from your library to create your first meal template.</Text>}
    </>}

    <Text style={styles.heading}>Workout routines</Text>
    {workouts.map((workout) => <View key={workout.id} style={styles.sourceCard}>
      <Text style={styles.name}>{workout.workoutType}</Text><Text style={styles.muted}>{workout.exercises.length} exercises</Text>
      <Action label="Save this workout as a template" onPress={() => action(() => createWorkoutTemplateFromWorkout(db, workout, workout.workoutType), 'Workout template created.')} />
    </View>)}
    {workoutTemplates.map((template) => <View key={template.id} style={styles.card}>
      <Text style={styles.name}>{template.name}</Text><Text style={styles.muted}>{template.exercises.length} exercises</Text>
      {template.exercises.map((exercise) => <Text key={exercise.id} style={styles.detail}>{exercise.exerciseName} Â· {exercise.sets}Ã—{exercise.reps}{exercise.weight == null ? '' : ` Â· ${weightFromStorage(exercise.weight, weightUnit).toFixed(1)} ${weightUnit}`}</Text>)}
      <View style={styles.actions}>
        <Action label={`Start on ${selectedDate}`} onPress={() => action(() => applyWorkoutTemplate(db, template.id, selectedDate), `Workout added to ${selectedDate}.`)} />
        <Action label={editingWorkoutTemplateId === template.id ? 'Editing' : 'Edit routine'} onPress={() => editingWorkoutTemplateId === template.id ? setEditingWorkoutTemplateId(null) : beginWorkoutTemplateEdit(template)} />
        <Action label="Delete" destructive onPress={() => askDelete(template.name, () => deleteWorkoutTemplate(db, template.id))} />
      </View>
      {editingWorkoutTemplateId === template.id && <View style={styles.editChoices}>
        <Text style={styles.editHeading}>Routine name</Text>
        <TextInput value={draftTemplateName} onChangeText={setDraftTemplateName} placeholder="Routine name" style={styles.editInput} />
        {draftExercises.map((exercise) => <View key={exercise.key} style={styles.exerciseEditor}>
          <View style={styles.exerciseEditorHeading}>
            <Text style={styles.editHeading}>Exercise</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${exercise.exerciseName || 'exercise'}`} onPress={() => setDraftExercises((current) => current.filter((item) => item.key !== exercise.key))} style={styles.removeButton}><Text style={styles.removeText}>Remove</Text></Pressable>
          </View>
          <TextInput value={exercise.exerciseName} onChangeText={(value) => updateDraftExercise(exercise.key, 'exerciseName', value)} placeholder="Exercise name" style={styles.editInput} />
          <View style={styles.numberFields}>
            <TextInput value={exercise.sets} onChangeText={(value) => updateDraftExercise(exercise.key, 'sets', value)} placeholder="Sets" keyboardType="number-pad" style={[styles.editInput, styles.numberInput]} />
            <TextInput value={exercise.reps} onChangeText={(value) => updateDraftExercise(exercise.key, 'reps', value)} placeholder="Reps" keyboardType="number-pad" style={[styles.editInput, styles.numberInput]} />
            <TextInput value={exercise.weight} onChangeText={(value) => updateDraftExercise(exercise.key, 'weight', value)} placeholder={`Weight (${weightUnit})`} keyboardType="decimal-pad" style={[styles.editInput, styles.weightInput]} />
          </View>
        </View>)}
        <Action label="Add exercise" onPress={() => setDraftExercises((current) => [...current, { key: `new-${Date.now()}-${current.length}`, exerciseName: '', sets: '3', reps: '10', weight: '' }])} />
        <View style={styles.actions}>
          <Action label="Save changes" onPress={() => { void saveWorkoutTemplateEdit(template.id); }} />
          <Action label="Cancel" onPress={() => setEditingWorkoutTemplateId(null)} />
        </View>
      </View>}
    </View>)}
    {!workouts.length && !workoutTemplates.length && <Text style={styles.empty}>Log a workout to create your first workout template.</Text>}
  </ScrollView>
  </KeyboardAvoidingView>;
}

function Action({ label, onPress, destructive = false }: { label: string; onPress: () => void; destructive?: boolean }) {
  return <Pressable onPress={onPress} style={[styles.button, destructive && styles.destructive]}><Text style={destructive ? styles.destructiveText : styles.buttonText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' }, scroll: { flex: 1 }, content: { padding: 20, paddingTop: 54, paddingBottom: 120 },
  back: { color: '#374151', fontWeight: '600', marginBottom: 14 }, title: { color: '#111827', fontSize: 30, fontWeight: '700' },
  subtitle: { color: '#6B7280', marginTop: 5, marginBottom: 24, lineHeight: 20 }, heading: { color: '#111827', fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 15, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10 },
  sourceCard: { backgroundColor: '#F0F3F7', borderRadius: 14, padding: 15, marginBottom: 10 }, name: { color: '#111827', fontWeight: '700', fontSize: 16 }, muted: { color: '#6B7280', marginTop: 4 }, detail: { color: '#4B5563', marginTop: 5, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, editChoices: { marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#E5E7EB' }, button: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, marginTop: 10, alignSelf: 'flex-start' },
  editHeading: { color: '#374151', fontSize: 12, fontWeight: '700' }, editInput: { minHeight: 42, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, backgroundColor: '#FFF', paddingHorizontal: 10, paddingVertical: 8, color: '#111827', fontSize: 13, marginTop: 6 },
  exerciseEditor: { marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' }, exerciseEditorHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, removeButton: { paddingHorizontal: 8, paddingVertical: 5 }, removeText: { color: '#B42318', fontSize: 12, fontWeight: '600' },
  numberFields: { flexDirection: 'row', gap: 7, marginTop: 2 }, numberInput: { flex: 1 }, weightInput: { flex: 1.4 },
  buttonText: { color: '#374151', fontWeight: '600' }, destructive: { borderColor: '#FCA5A5' }, destructiveText: { color: '#DC2626', fontWeight: '600' }, empty: { color: '#6B7280', marginBottom: 12 },
});
