import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteFood, getFoodById, updateFood } from '../repositories/foodRepository';

export default function EditFoodScreen() {
  const db = useSQLiteContext();
  const { foodId, date: requestedDate, returnTo, fromMeal, editMealId } = useLocalSearchParams<{ foodId: string; date?: string; returnTo?: string; fromMeal?: string; editMealId?: string }>();
  const returnToFoods = useCallback(() => router.replace({ pathname: '/foods', params: { ...(typeof requestedDate === 'string' ? { date: requestedDate } : {}), ...(returnTo === 'history' ? { returnTo: 'history' } : {}), ...(fromMeal === '1' ? { fromMeal } : {}), ...(editMealId ? { editMealId } : {}) } } as never), [requestedDate, returnTo, fromMeal, editMealId]);
  const [form, setForm] = useState({ name: '', servingSize: '100', calories: '', protein: '', carbs: '', fat: '', fibre: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!foodId) return;
    try {
      const food = await getFoodById(db, foodId);
      if (!food) {
        Alert.alert('Food not found', 'It may have been deleted from your library.');
        returnToFoods();
        return;
      }
      setForm({ name: food.name, servingSize: String(food.servingSize), calories: String(food.calories), protein: String(food.protein), carbs: String(food.carbs), fat: String(food.fat), fibre: String(food.fibre) });
    } catch (error) {
      console.error('Could not load food:', error);
      Alert.alert('Could not load food', 'Return to your food library and try again.');
      returnToFoods();
    }
  }, [db, foodId, returnToFoods]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const servingSize = Number(form.servingSize);
    const numbers = [form.calories, form.protein, form.carbs, form.fat, form.fibre].map((value) => Number(value || 0));
    if (!form.name.trim() || !Number.isFinite(servingSize) || servingSize <= 0 || numbers.some((value) => !Number.isFinite(value) || value < 0)) return Alert.alert('Check food details', 'Enter a name, serving size greater than zero, and non-negative nutrition values.');
    try { setBusy(true); await updateFood(db, foodId, { name: form.name.trim(), servingSize, calories: numbers[0], protein: numbers[1], carbs: numbers[2], fat: numbers[3], fibre: numbers[4] }); returnToFoods(); }
    catch (error) { console.error(error); Alert.alert('Could not update food', 'Please try again.'); }
    finally { setBusy(false); }
  };
  const remove = () => Alert.alert('Delete food', `Delete ${form.name}? Existing meals stay saved, and this food is removed from your library.`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { setBusy(true); await deleteFood(db, foodId); returnToFoods(); } catch (error) { console.error(error); Alert.alert('Could not delete food', 'Please try again.'); } finally { setBusy(false); } } },
  ]);
  const fields: { key: keyof typeof form; label: string; numeric?: boolean }[] = [
    { key: 'name', label: 'Food name' }, { key: 'servingSize', label: 'Serving size (g)', numeric: true },
    { key: 'calories', label: 'Calories', numeric: true }, { key: 'protein', label: 'Protein (g)', numeric: true },
    { key: 'carbs', label: 'Carbs (g)', numeric: true }, { key: 'fat', label: 'Fat (g)', numeric: true }, { key: 'fibre', label: 'Fibre (g)', numeric: true },
  ];
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
  <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <Pressable accessibilityRole="button" onPress={returnToFoods}><Text style={styles.back}>← Foods</Text></Pressable><Text style={styles.title}>Edit Food</Text>
    <View style={styles.card}><Text style={styles.note}>Changes to nutrition values also update meals that use this food.</Text>{fields.map((field) => <View key={field.key}><Text style={styles.label}>{field.label}</Text><TextInput value={form[field.key]} onChangeText={(value) => set(field.key, value)} keyboardType={field.numeric ? 'decimal-pad' : 'default'} style={styles.input} /></View>)}
      <Pressable disabled={busy} onPress={save} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save changes'}</Text></Pressable>
      <Pressable disabled={busy} onPress={remove} style={[styles.deleteButton, busy && styles.disabled]}><Text style={styles.deleteText}>Delete food</Text></Pressable>
    </View>
  </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 20, paddingTop: 52, paddingBottom: 40 }, back: { color: '#374151', fontWeight: '600', marginBottom: 14 }, title: { color: '#111827', fontSize: 30, fontWeight: '700', marginBottom: 18 }, card: { backgroundColor: '#FFF', borderRadius: 15, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' }, note: { color: '#6B7280', backgroundColor: '#F3F4F6', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 17, marginBottom: 4 }, label: { color: '#4B5563', marginTop: 9, marginBottom: 5 }, input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, padding: 10, color: '#111827', backgroundColor: '#F9FAFB' }, button: { backgroundColor: '#111827', borderRadius: 10, alignItems: 'center', padding: 13, marginTop: 16 }, buttonText: { color: '#FFF', fontWeight: '700' }, deleteButton: { alignItems: 'center', padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10 }, deleteText: { color: '#DC2626', fontWeight: '700' }, disabled: { opacity: 0.55 } });
