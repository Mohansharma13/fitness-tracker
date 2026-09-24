import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getMealsForDate } from '../repositories/mealRepository';
import { getWorkoutsForDate } from '../repositories/workoutRepository';
import { addMealTemplateToDate, applyWorkoutTemplate, createMealTemplateFromMeal, createWorkoutTemplateFromWorkout, deleteMealTemplate, deleteWorkoutTemplate, getMealTemplates, getWorkoutTemplates, replaceMealTemplateFromMeal, replaceWorkoutTemplateFromWorkout, type MealTemplate, type WorkoutTemplate } from '../repositories/templateRepository';
import type { MealWithItems } from '../types/meal';
import type { WorkoutLog } from '../types/workout';
import { getTodayDate } from '../utils/date';
import { getSettings } from '../repositories/settingsRepository';
import { weightFromStorage, type WeightUnit } from '../utils/weight';

export default function TemplatesScreen() {
  const db = useSQLiteContext();
  const [mealTemplates, setMealTemplates] = useState<MealTemplate[]>([]);
  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplate[]>([]);
  const [meals, setMeals] = useState<MealWithItems[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [editingMealTemplateId, setEditingMealTemplateId] = useState<string | null>(null);
  const [editingWorkoutTemplateId, setEditingWorkoutTemplateId] = useState<string | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  useEffect(() => { getSettings(db).then((settings) => setWeightUnit(settings.weightUnit)).catch((error) => console.error(error)); }, [db]);

  const load = useCallback(async () => {
    try {
      const [mt, wt, ms, ws] = await Promise.all([
        getMealTemplates(db), getWorkoutTemplates(db), getMealsForDate(db, getTodayDate()), getWorkoutsForDate(db, getTodayDate()),
      ]);
      setMealTemplates(mt); setWorkoutTemplates(wt); setMeals(ms); setWorkouts(ws);
    } catch (error) { console.error('Failed to load templates:', error); Alert.alert('Could not load templates', 'Please try again.'); }
  }, [db]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const action = async (fn: () => Promise<void>, done: string) => {
    try { await fn(); await load(); Alert.alert('Saved', done); }
    catch (error) { console.error(error); Alert.alert('Could not complete action', error instanceof Error ? error.message : 'Please try again.'); }
  };
  const askDelete = (label: string, fn: () => Promise<void>) => Alert.alert('Delete template', `Delete “${label}”?`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void action(fn, 'Template deleted.'); } },
  ]);

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/explore')}><Text style={styles.back}>← More</Text></Pressable>
    <Text style={styles.title}>Templates</Text>
    <Text style={styles.subtitle}>Save today’s meals and workouts, then reuse them later.</Text>

    <Text style={styles.heading}>Meal templates</Text>
    {meals.map((meal) => <View key={meal.id} style={styles.sourceCard}>
      <Text style={styles.name}>{meal.mealName}</Text><Text style={styles.muted}>{meal.items.length} food items</Text>
      <Action label="Save this meal as a template" onPress={() => action(() => createMealTemplateFromMeal(db, meal.id, meal.mealName), 'Meal template created.')} />
    </View>)}
    {mealTemplates.map((template) => <View key={template.id} style={styles.card}>
      <Text style={styles.name}>{template.name}</Text><Text style={styles.muted}>{template.itemCount} food items</Text>
      {template.items.map((item, index) => <Text key={`${template.id}-${index}`} style={styles.detail}>{item.foodName} · {item.quantity} g</Text>)}
      <View style={styles.actions}>
        <Action label="Add to today" onPress={() => action(() => addMealTemplateToDate(db, template.id, getTodayDate()), 'Meal added to today.')} />
        <Action label="Edit contents" onPress={() => setEditingMealTemplateId(editingMealTemplateId === template.id ? null : template.id)} />
        <Action label="Delete" destructive onPress={() => askDelete(template.name, () => deleteMealTemplate(db, template.id))} />
      </View>
      {editingMealTemplateId === template.id && <View style={styles.editChoices}>
        <Text style={styles.muted}>Replace this template with a meal logged today:</Text>
        {meals.map((meal) => <Action key={meal.id} label={meal.mealName} onPress={() => action(() => replaceMealTemplateFromMeal(db, template.id, meal.id), 'Meal template updated.')} />)}
      </View>}
    </View>)}
    {!meals.length && !mealTemplates.length && <Text style={styles.empty}>Log a meal to create your first meal template.</Text>}

    <Text style={styles.heading}>Workout templates</Text>
    {workouts.map((workout) => <View key={workout.id} style={styles.sourceCard}>
      <Text style={styles.name}>{workout.workoutType}</Text><Text style={styles.muted}>{workout.exercises.length} exercises</Text>
      <Action label="Save this workout as a template" onPress={() => action(() => createWorkoutTemplateFromWorkout(db, workout, workout.workoutType), 'Workout template created.')} />
    </View>)}
    {workoutTemplates.map((template) => <View key={template.id} style={styles.card}>
      <Text style={styles.name}>{template.name}</Text><Text style={styles.muted}>{template.exercises.length} exercises</Text>
      {template.exercises.map((exercise) => <Text key={exercise.id} style={styles.detail}>{exercise.exerciseName} · {exercise.sets}×{exercise.reps}{exercise.weight == null ? '' : ` · ${weightFromStorage(exercise.weight, weightUnit).toFixed(1)} ${weightUnit}`}</Text>)}
      <View style={styles.actions}>
        <Action label="Start today" onPress={() => action(() => applyWorkoutTemplate(db, template.id, getTodayDate()), 'Workout created from template.')} />
        <Action label="Edit contents" onPress={() => setEditingWorkoutTemplateId(editingWorkoutTemplateId === template.id ? null : template.id)} />
        <Action label="Delete" destructive onPress={() => askDelete(template.name, () => deleteWorkoutTemplate(db, template.id))} />
      </View>
      {editingWorkoutTemplateId === template.id && <View style={styles.editChoices}>
        <Text style={styles.muted}>Replace this template with a workout logged today:</Text>
        {workouts.map((workout) => <Action key={workout.id} label={workout.workoutType} onPress={() => action(() => replaceWorkoutTemplateFromWorkout(db, template.id, workout), 'Workout template updated.')} />)}
      </View>}
    </View>)}
    {!workouts.length && !workoutTemplates.length && <Text style={styles.empty}>Log a workout to create your first workout template.</Text>}
  </ScrollView>;
}

function Action({ label, onPress, destructive = false }: { label: string; onPress: () => void; destructive?: boolean }) {
  return <Pressable onPress={onPress} style={[styles.button, destructive && styles.destructive]}><Text style={destructive ? styles.destructiveText : styles.buttonText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 20, paddingTop: 54, paddingBottom: 44 },
  back: { color: '#374151', fontWeight: '600', marginBottom: 14 }, title: { color: '#111827', fontSize: 30, fontWeight: '700' },
  subtitle: { color: '#6B7280', marginTop: 5, marginBottom: 24, lineHeight: 20 }, heading: { color: '#111827', fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 15, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10 },
  sourceCard: { backgroundColor: '#F0F3F7', borderRadius: 14, padding: 15, marginBottom: 10 }, name: { color: '#111827', fontWeight: '700', fontSize: 16 }, muted: { color: '#6B7280', marginTop: 4 }, detail: { color: '#4B5563', marginTop: 5, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, editChoices: { marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#E5E7EB' }, button: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, marginTop: 10, alignSelf: 'flex-start' },
  buttonText: { color: '#374151', fontWeight: '600' }, destructive: { borderColor: '#FCA5A5' }, destructiveText: { color: '#DC2626', fontWeight: '600' }, empty: { color: '#6B7280', marginBottom: 12 },
});
