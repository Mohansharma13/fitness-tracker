import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getTodayDate, isValidDateString, shiftDate } from '../utils/date';
import { DatePickerField } from '../components/ui/DatePickerField';
import { getWeeklyAverages, type WeeklyAverage } from '../services/rangeAnalyticsService';
import { createWeeklyAverageFile, saveWeeklyAverageToDirectory } from '../services/weeklyAverageExportService';
import { getSettings } from '../repositories/settingsRepository';
import { weightFromStorage, type WeightUnit } from '../utils/weight';

function firstOfMonth(date: string) { return `${date.slice(0, 7)}-01`; }

export default function WeeklyBreakdownScreen() {
  const db = useSQLiteContext();
  const [initialRange] = useState(() => ({ start: firstOfMonth(getTodayDate()), end: getTodayDate() }));
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [weeks, setWeeks] = useState<WeeklyAverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const rangeRequestRef = useRef(0);

  useEffect(() => {
    const request = ++rangeRequestRef.current;
    getWeeklyAverages(db, initialRange.start, initialRange.end)
      .then((result) => { if (request === rangeRequestRef.current) setWeeks(result); })
      .catch((loadError) => { if (request === rangeRequestRef.current) setError(loadError instanceof Error ? loadError.message : 'Could not calculate weekly averages.'); })
      .finally(() => { if (request === rangeRequestRef.current) setLoading(false); });
    return () => { rangeRequestRef.current += 1; };
  }, [db, initialRange]);

  useFocusEffect(useCallback(() => {
    let active = true;
    getSettings(db).then((settings) => { if (active) setWeightUnit(settings.weightUnit); }).catch((settingsError) => console.error('Failed to load weight unit:', settingsError));
    return () => { active = false; };
  }, [db]));

  const loadWeeks = useCallback(async (start = startDate, end = endDate) => {
    if (!isValidDateString(start) || !isValidDateString(end)) return setError('Choose valid start and end dates.');
    if (start > end) return setError('Start date must be on or before the end date.');
    if (end > getTodayDate()) return setError('Choose today or an earlier end date.');
    const request = ++rangeRequestRef.current;
    try {
      setLoading(true);
      setError('');
      setWeeks([]);
      const result = await getWeeklyAverages(db, start, end);
      if (request === rangeRequestRef.current) setWeeks(result);
    } catch (loadError) {
      if (request === rangeRequestRef.current) setError(loadError instanceof Error ? loadError.message : 'Could not calculate weekly averages.');
    } finally {
      if (request === rangeRequestRef.current) setLoading(false);
    }
  }, [db, startDate, endDate]);

  const changeStartDate = (value: string) => {
    rangeRequestRef.current += 1;
    setLoading(false);
    setError('');
    setWeeks([]);
    setStartDate(value);
    if (value > endDate) setEndDate(value);
  };

  const changeEndDate = (value: string) => {
    rangeRequestRef.current += 1;
    setLoading(false);
    setError('');
    setWeeks([]);
    setEndDate(value);
  };

  const applyPreset = (days: number | 'month') => {
    const end = getTodayDate();
    const start = days === 'month' ? firstOfMonth(end) : shiftDate(end, -(days - 1));
    setStartDate(start);
    setEndDate(end);
    setWeeks([]);
    void loadWeeks(start, end);
  };

  const exportWeeks = async () => {
    try {
      setExporting(true);
      const file = await createWeeklyAverageFile(db, startDate, endDate, weightUnit);
      if (Platform.OS === 'android') {
        const access = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!access.granted) return;
        await saveWeeklyAverageToDirectory(file, access.directoryUri);
        Alert.alert('Export saved', `${file.filename}\n\n${file.rowCount} weekly averages were saved to your selected folder.`);
        return;
      }
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([file.contents], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = file.filename;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('Sharing is unavailable', 'This device cannot share files from the app right now.');
        return;
      }
      await Sharing.shareAsync(file.uri!, { mimeType: 'text/csv', dialogTitle: 'Export weekly averages', UTI: 'public.comma-separated-values-text' });
    } catch (exportError) {
      console.error('Failed to export weekly averages:', exportError);
      Alert.alert('Could not export averages', exportError instanceof Error ? exportError.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/explore')}><Text style={styles.back}>‹  More</Text></Pressable>
    <Text style={styles.title}>Week-by-week averages</Text>
    <Text style={styles.subtitle}>Compare consecutive 7-day averages across any date range you choose.</Text>

    <View style={styles.card}>
      <Text style={styles.heading}>Choose a date range</Text>
      <View style={styles.dateRow}>
        <DatePickerField label="Start date" value={startDate} onChange={changeStartDate} disabled={loading || exporting} />
        <DatePickerField label="End date" value={endDate} minimumDate={startDate} onChange={changeEndDate} disabled={loading || exporting} />
      </View>
      <View style={styles.presetRow}>
        <Preset label="This month" disabled={loading || exporting} onPress={() => applyPreset('month')} />
        <Preset label="30 days" disabled={loading || exporting} onPress={() => applyPreset(30)} />
        <Preset label="90 days" disabled={loading || exporting} onPress={() => applyPreset(90)} />
      </View>
      <Text style={styles.hint}>Weeks start on your selected start date. The last week can be shorter.</Text>
      <Pressable accessibilityRole="button" onPress={() => void loadWeeks()} disabled={loading} style={[styles.primaryButton, loading && styles.disabled]}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Update weekly averages</Text>}
      </Pressable>
    </View>

    {!!error && <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View>}
    {!loading && !error && weeks.length === 0 && <View style={styles.emptyCard}><Ionicons name="calendar-outline" size={22} color="#25634C" /><Text style={styles.emptyTitle}>No weekly results yet</Text><Text style={styles.emptyText}>Choose a date range and update the averages to see your weeks here.</Text></View>}
    {weeks.length > 0 && <>
      <View style={styles.resultsHeading}><Text style={styles.heading}>Weekly results</Text><Text style={styles.hint}>{weeks.length} {weeks.length === 1 ? 'week' : 'weeks'}</Text></View>
      {weeks.map((week) => <View key={week.weekNumber} style={styles.weekCard}>
        <View style={styles.weekHeader}><Text style={styles.weekTitle}>Week {week.weekNumber}</Text><Text style={styles.weekDates}>{formatWeekRange(week.startDate, week.endDate)}</Text></View>
        <Text style={styles.metricPrimary}>{Math.round(week.averageCalories).toLocaleString()} <Text style={styles.metricUnit}>kcal/day</Text></Text>
        <View style={styles.metricsGrid}>
          <Metric label="Protein" value={`${Math.round(week.averageProtein)} g`} />
          <Metric label="Carbohydrates" value={`${Math.round(week.averageCarbs)} g`} />
          <Metric label="Fat" value={`${Math.round(week.averageFat)} g`} />
          <Metric label="Fibre" value={`${Math.round(week.averageFibre)} g`} />
          <Metric label="Average weight" value={week.averageWeight == null ? '—' : `${weightFromStorage(week.averageWeight, weightUnit).toFixed(1)} ${weightUnit}`} />
          <Metric label="Steps/day" value={Math.round(week.averageSteps).toLocaleString()} />
          <Metric label="Workouts" value={String(week.workoutCount)} />
          <Metric label="Days" value={String(week.dayCount)} />
        </View>
      </View>)}
      <Pressable accessibilityRole="button" onPress={() => void exportWeeks()} disabled={exporting || loading} style={[styles.exportButton, (exporting || loading) && styles.disabled]}>
        {exporting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>{Platform.OS === 'android' ? 'Export weekly averages to device' : 'Export weekly averages'}</Text>}
      </Pressable>
    </>}
  </ScrollView>;
}

function Preset({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.preset, disabled && styles.disabled]}><Text style={styles.presetText}>{label}</Text></Pressable>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function formatWeekRange(start: string, end: string) {
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${formatDateLabel(start, true)} – ${formatDateLabel(end, true)}`;
  return `${formatDateLabel(start)} – ${formatDateLabel(end)}`;
}

function formatDateLabel(value: string, includeYear = false) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' as const } : {}) });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 14, paddingTop: 48, paddingBottom: 28 },
  back: { color: '#25634C', fontWeight: '600', marginBottom: 15 },
  title: { color: '#111827', fontSize: 25, fontWeight: '700' },
  subtitle: { color: '#6B7280', marginTop: 3, marginBottom: 12, lineHeight: 17, fontSize: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 9 },
  heading: { color: '#111827', fontSize: 15, fontWeight: '700' },
  dateRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  preset: { backgroundColor: '#F0F7F3', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  presetText: { color: '#1D513D', fontWeight: '600', fontSize: 10 },
  hint: { color: '#6B7280', fontSize: 10, lineHeight: 14, marginTop: 6 },
  primaryButton: { backgroundColor: '#25634C', borderRadius: 9, alignItems: 'center', justifyContent: 'center', minHeight: 40, padding: 9, marginTop: 9 },
  primaryText: { color: '#FFF', fontWeight: '700', textAlign: 'center' },
  resultsHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginVertical: 3 },
  weekCard: { backgroundColor: '#FFF', borderRadius: 11, padding: 10, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 7 },
  emptyCard: { backgroundColor: '#FFF', borderRadius: 13, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10 },
  emptyTitle: { color: '#111827', fontSize: 14, fontWeight: '700', marginTop: 8 },
  emptyText: { color: '#6B7280', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 4 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  weekTitle: { color: '#1D513D', fontSize: 13, fontWeight: '700' },
  weekDates: { color: '#6B7280', fontSize: 9 },
  metricPrimary: { color: '#111827', fontSize: 20, fontWeight: '700', marginTop: 6 },
  metricUnit: { color: '#6B7280', fontSize: 11, fontWeight: '500' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: '#F1F3F5' },
  metric: { width: '25%', paddingRight: 3 },
  metricLabel: { color: '#6B7280', fontSize: 9 },
  metricValue: { color: '#1F2937', fontSize: 10, fontWeight: '700', marginTop: 1 },
  exportButton: { backgroundColor: '#25634C', borderRadius: 9, alignItems: 'center', justifyContent: 'center', minHeight: 42, padding: 10, marginTop: 2 },
  errorCard: { padding: 10, backgroundColor: '#FEF2F2', borderRadius: 9, marginBottom: 8 },
  errorText: { color: '#B42318', fontSize: 11, lineHeight: 15 },
  disabled: { opacity: 0.55 },
});
