import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getSettings, saveSettings } from '../repositories/settingsRepository';
import type { AppSettings } from '../types/settings';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [weightUnit, setWeightUnit] = useState<AppSettings['weightUnit']>('kg');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try { const settings = await getSettings(db); setName(settings.name); setWeightUnit(settings.weightUnit); }
    catch (error) { console.error(error); Alert.alert('Could not load settings', 'Check your device storage and try again.'); }
    finally { setLoading(false); }
  }, [db]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const save = async () => {
    if (saving) return;
    try {
      setSaving(true);
      const current = await getSettings(db);
      await saveSettings(db, { name: name.slice(0, 60), weightUnit, theme: current.theme });
      Alert.alert('Settings saved', 'Your name and weight unit have been updated.');
    } catch (error) { console.error(error); Alert.alert('Could not save settings', 'Please try again.'); }
    finally { setSaving(false); }
  };
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
  <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <Pressable accessibilityRole="button" onPress={() => router.replace('/explore')}><Text style={styles.back}>‹  More</Text></Pressable>
    <Text style={styles.title}>Settings</Text><Text style={styles.subtitle}>A few preferences for your tracker.</Text>
    {loading ? <ActivityIndicator color="#25634C" /> : <View style={styles.card}>
      <Text style={styles.label}>Your name <Text style={styles.optional}>· optional</Text></Text>
      <TextInput value={name} onChangeText={setName} placeholder="Add your name" maxLength={60} returnKeyType="done" style={styles.input} />
      <Text style={[styles.label, styles.unitLabel]}>Weight unit</Text>
      <Text style={styles.hint}>Used when you enter and view your weight.</Text>
      <View style={styles.choiceRow}>{(['kg', 'lb'] as const).map((unit) => <Pressable key={unit} accessibilityRole="radio" accessibilityState={{ checked: weightUnit === unit }} onPress={() => setWeightUnit(unit)} style={[styles.choice, weightUnit === unit && styles.active]}><Text style={[styles.choiceText, weightUnit === unit && styles.activeText]}>{unit === 'kg' ? 'Kilograms (kg)' : 'Pounds (lb)'}</Text></Pressable>)}</View>
      <Pressable disabled={saving} onPress={save} style={[styles.button, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Save changes</Text>}</Pressable>
    </View>}
  </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 18, paddingTop: 52, paddingBottom: 40 }, back: { color: '#25634C', fontWeight: '600', marginBottom: 15 }, title: { color: '#111827', fontSize: 29, fontWeight: '700' }, subtitle: { color: '#6B7280', marginTop: 4, marginBottom: 18 }, card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' }, label: { color: '#374151', fontWeight: '600', marginBottom: 7 }, optional: { color: '#9CA3AF', fontWeight: '400' }, input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: '#111827', backgroundColor: '#FAFAFA' }, unitLabel: { marginTop: 20, marginBottom: 3 }, hint: { color: '#6B7280', fontSize: 12, marginBottom: 10 }, choiceRow: { gap: 8 }, choice: { borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 13, paddingVertical: 12, borderRadius: 10 }, choiceText: { color: '#374151', fontWeight: '600' }, active: { backgroundColor: '#EAF4EF', borderColor: '#25634C' }, activeText: { color: '#1D513D' }, button: { backgroundColor: '#25634C', borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: 12, marginTop: 20 }, buttonText: { color: '#FFF', fontWeight: '700' }, disabled: { opacity: 0.65 } });
