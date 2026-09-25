import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { DatePickerField } from '../components/ui/DatePickerField';
import { clearAllAppData, clearDayData } from '../services/dataManagementService';
import { getTodayDate } from '../utils/date';

export default function ClearDataScreen() {
  const db = useSQLiteContext();
  const [date, setDate] = useState(getTodayDate());
  const [busy, setBusy] = useState(false);

  const runClear = async (clear: () => Promise<void>, label: string) => {
    if (busy) return;
    try {
      setBusy(true);
      await clear();
      Alert.alert('Data cleared', `${label} has been removed from this device.`);
    } catch (error) {
      console.error('Failed to clear app data:', error);
      Alert.alert('Could not clear data', 'Nothing was changed. Check your device storage and try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmClearDay = () => {
    if (busy) return;
    Alert.alert('Clear this day?', `This permanently removes all meals, workouts, weight, and steps saved for ${date}. Other dates, saved foods, and plans will stay.\n\nThis cannot be undone. Consider creating a backup first.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear this day', style: 'destructive', onPress: () => void runClear(() => clearDayData(db, date), `Data for ${date}`) },
    ]);
  };

  const confirmClearAll = () => {
    if (busy) return;
    Alert.alert('Clear all app data?', 'This permanently deletes all dates of meal and workout history, weight and steps, saved foods, templates, goals, and app preferences from this device. This cannot be undone. Create a backup first if you may need any of it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: () => Alert.alert('Final confirmation', 'Are you sure you want to permanently remove all Fitness Tracker data from this device?', [
        { text: 'Keep my data', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: () => void runClear(() => clearAllAppData(db), 'All app data') },
      ]) },
    ]);
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.replace('/explore')}><Text style={styles.back}>‹  More</Text></Pressable>
    <Text style={styles.title}>Clear app data</Text>
    <Text style={styles.subtitle}>Clear one day of tracking or start fresh by removing everything.</Text>

    <View style={styles.notice}>
      <View style={styles.noticeIcon}><Ionicons name="information-circle-outline" size={20} color="#9A5B13" /></View>
      <Text style={styles.noticeText}>Deleted data cannot be restored unless you have a backup. You’ll see a warning and confirmation before anything is removed.</Text>
    </View>

    <View style={styles.card}>
      <View style={styles.cardHeading}>
        <View style={styles.icon}><Ionicons name="calendar-outline" size={19} color="#B42318" /></View>
        <View style={styles.copy}><Text style={styles.cardTitle}>Clear one day</Text><Text style={styles.detail}>Remove all tracking data for a selected date.</Text></View>
      </View>
      <View style={styles.dateField}><DatePickerField label="Day to clear" value={date} onChange={setDate} disabled={busy} /></View>
      <Text style={styles.helper}>Includes that day’s meals, workouts, weight, and steps. Other dates and saved plans stay.</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={confirmClearDay} style={[styles.dayButton, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#B42318" /> : <Text style={styles.dayButtonText}>Clear selected day</Text>}
      </Pressable>
    </View>

    <View style={styles.allCard}>
      <View style={styles.cardHeading}><View style={styles.icon}><Ionicons name="trash-outline" size={19} color="#B42318" /></View><View style={styles.copy}><Text style={styles.allTitle}>Clear everything</Text><Text style={styles.detail}>Remove all dates, saved foods and plans, goals, and preferences.</Text></View></View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={confirmClearAll} style={[styles.allButton, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.allButtonText}>Clear all app data</Text>}
      </Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 18, paddingTop: 52, paddingBottom: 40 }, back: { color: '#25634C', fontWeight: '600', marginBottom: 15 },
  title: { color: '#111827', fontSize: 27, fontWeight: '700' }, subtitle: { color: '#6B7280', marginTop: 4, marginBottom: 16, fontSize: 13, lineHeight: 19 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#FFF8EB', borderColor: '#F3D8A8', borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 14 }, noticeIcon: { paddingTop: 1 }, noticeText: { color: '#75521E', flex: 1, fontSize: 11, lineHeight: 16 },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, padding: 14 }, cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, icon: { height: 36, width: 36, borderRadius: 10, backgroundColor: '#FEF0EF', alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, cardTitle: { color: '#111827', fontWeight: '700', fontSize: 15 }, detail: { color: '#6B7280', fontSize: 11, lineHeight: 16, marginTop: 3 },
  dateField: { marginTop: 16 }, helper: { color: '#6B7280', fontSize: 10, lineHeight: 15, marginTop: 8 }, dayButton: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#D92D20', backgroundColor: '#FFF7F6', marginTop: 12 }, dayButtonText: { color: '#B42318', fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.55 },
  allCard: { marginTop: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F0C9C6', borderRadius: 14, padding: 14 }, allTitle: { color: '#991B1B', fontWeight: '700', fontSize: 15 }, allButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#B42318', marginTop: 14 }, allButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});
