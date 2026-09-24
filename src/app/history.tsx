import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { saveHistoricalMeasures } from '../repositories/historyRepository';
import { getDailyLogByDate } from '../repositories/dailyLogRepository';
import { getWeeklySummary } from '../services/analyticsService';
import { getWeeklyTrackingGoals, saveWeeklyTrackingGoals, type WeeklyTrackingGoals } from '../repositories/weeklyTrackingGoalRepository';
import { getTodayDate, isValidDateString, shiftDate } from '../utils/date';
import { getSettings } from '../repositories/settingsRepository';
import { weightFromStorage, weightToStorage, type WeightUnit } from '../utils/weight';

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const [weekEndDate, setWeekEndDate] = useState(getTodayDate());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(getTodayDate().slice(0, 7));
  const [date, setDate] = useState(getTodayDate());
  const selectedDateRef = useRef(date);
  const [weight, setWeight] = useState('');
  const [steps, setSteps] = useState('');
  const [dateLoading, setDateLoading] = useState(false);
  const dateRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalLoadError, setGoalLoadError] = useState(false);
  const [goals, setGoals] = useState<WeeklyTrackingGoals>({ calorieTarget: null, stepTarget: null, targetWeight: null, workoutTarget: null });
  const [goalForm, setGoalForm] = useState({ calories: '', steps: '', weight: '', workouts: '' });
  const summaryRequestRef = useRef(0);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [weekly, setWeekly] = useState<Awaited<ReturnType<typeof getWeeklySummary>> | null>(null);
  useEffect(() => { getSettings(db).then((settings) => setWeightUnit(settings.weightUnit)).catch((error) => console.error(error)); }, [db]);

  const load = useCallback(async () => {
    const request = ++summaryRequestRef.current;
    setLoading(true);
    try {
      const end = localDate(weekEndDate);
      const [summary, savedGoals] = await Promise.all([getWeeklySummary(db, end), getWeeklyTrackingGoals(db)]);
      if (request !== summaryRequestRef.current) return;
      setWeekly(summary); setGoals(savedGoals);
      setGoalForm({ calories: savedGoals.calorieTarget == null ? '' : String(savedGoals.calorieTarget), steps: savedGoals.stepTarget == null ? '' : String(savedGoals.stepTarget), weight: savedGoals.targetWeight == null ? '' : String(weightFromStorage(savedGoals.targetWeight, weightUnit)), workouts: savedGoals.workoutTarget == null ? '' : String(savedGoals.workoutTarget) });
      setLoadError(false); setGoalLoadError(false);
    }
    catch (error) { if (request === summaryRequestRef.current) { console.error('Failed to load weekly averages:', error); setLoadError(true); setGoalLoadError(true); } }
    finally { if (request === summaryRequestRef.current) setLoading(false); }
  }, [db, weekEndDate, weightUnit]);

  const loadSelectedDate = useCallback(async (selectedDate: string) => {
    if (!isValidDateString(selectedDate)) { dateRequestRef.current += 1; setDateLoading(false); return; }
    const request = ++dateRequestRef.current;
    try {
      setDateLoading(true);
      const existing = await getDailyLogByDate(db, selectedDate);
      if (request !== dateRequestRef.current) return;
      setWeight(existing?.weight == null ? '' : String(weightFromStorage(existing.weight, weightUnit)));
      setSteps(existing && existing.steps > 0 ? String(existing.steps) : '');
    } catch (error) { if (request === dateRequestRef.current) { console.error(error); Alert.alert('Could not load this day', 'Please try again.'); } }
    finally { if (request === dateRequestRef.current) setDateLoading(false); }
  }, [db, weightUnit]);

  const changeDate = (nextDate: string) => {
    if (!isValidDateString(nextDate) || nextDate > getTodayDate()) return;
    selectedDateRef.current = nextDate;
    setDate(nextDate);
    void loadSelectedDate(nextDate);
  };

  useFocusEffect(useCallback(() => { load(); void loadSelectedDate(selectedDateRef.current); }, [load, loadSelectedDate]));

  const movePeriod = (offset: number) => {
    const next = shiftDate(weekEndDate, offset);
    const end = next > getTodayDate() ? getTodayDate() : next;
    setWeekEndDate(end);
    setCalendarMonth(end.slice(0, 7));
    changeDate(end);
  };

  const selectPeriodEnd = (selectedDate: string) => {
    setWeekEndDate(selectedDate);
    setCalendarMonth(selectedDate.slice(0, 7));
    setCalendarOpen(false);
    changeDate(selectedDate);
  };

  const showToday = () => selectPeriodEnd(getTodayDate());

  const chooseDay = (selectedDate: string) => {
    selectedDateRef.current = selectedDate;
    setDate(selectedDate);
    setEditorOpen(true);
    void loadSelectedDate(selectedDate);
  };

  const saveGoals = async () => {
    const parse = (value: string, label: string, integer = false): number | null => {
      if (!value.trim()) return null;
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0 || (integer && !Number.isInteger(amount))) throw new Error(`${label} must be a positive ${integer ? 'whole number' : 'number'}, or blank.`);
      return amount;
    };
    try {
      const nextGoals: WeeklyTrackingGoals = {
        calorieTarget: parse(goalForm.calories, 'Calories'),
        stepTarget: parse(goalForm.steps, 'Steps', true),
        targetWeight: goalForm.weight.trim() ? weightToStorage(parse(goalForm.weight, 'Weight')!, weightUnit) : null,
        workoutTarget: parse(goalForm.workouts, 'Workouts', true),
      };
      setGoalSaving(true);
      await saveWeeklyTrackingGoals(db, nextGoals);
      setGoals(nextGoals);
      setGoalsOpen(false);
    } catch (error) { Alert.alert('Check weekly goals', error instanceof Error ? error.message : 'Please check the values and try again.'); }
    finally { setGoalSaving(false); }
  };

  const save = async () => {
    const enteredWeight = weight.trim() ? Number(weight) : undefined;
    const nextWeight = enteredWeight === undefined ? undefined : weightToStorage(enteredWeight, weightUnit);
    const nextSteps = steps.trim() ? Number(steps) : null;
    if (!validDate(date)) return Alert.alert('Check date', 'Use a valid date in YYYY-MM-DD format.');
    if (date > getTodayDate()) return Alert.alert('Future date', 'Choose today or an earlier date to save tracking data.');
    if (nextWeight !== undefined && (!Number.isFinite(nextWeight) || nextWeight <= 0)) return Alert.alert('Check weight', 'Enter a weight greater than zero or leave it blank to keep the current value.');
    if (nextSteps !== null && (!Number.isInteger(nextSteps) || nextSteps < 0)) return Alert.alert('Check steps', 'Enter whole non-negative steps or leave blank to keep the current value.');
    try {
      const current = await getDailyLogByDate(db, date);
      await saveHistoricalMeasures(db, date, nextWeight, nextSteps ?? current?.steps ?? 0);
      setEditorOpen(false); await load(); await loadSelectedDate(date); Alert.alert('Saved', `Tracking data saved for ${formatDate(date)}.`);
    }
    catch (error) { console.error(error); Alert.alert('Could not save', 'Please try again.'); }
  };

  const loggedDays = weekly?.dailyCalories.filter((day) => day.calories > 0).length ?? 0;
  const periodLabel = weekly ? `${formatShortDate(weekly.dailyCalories[0].date)} – ${formatShortDate(weekly.dailyCalories[6].date)}` : '';

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/explore')}><Text style={styles.back}>← More</Text></Pressable>
    <Text style={styles.title}>Weekly averages</Text>
    <View style={styles.weekSwitcher}><Pressable accessibilityLabel="Earlier 7-day period" onPress={() => movePeriod(-1)} style={styles.weekArrow}><Ionicons name="chevron-back" size={18} color="#25634C" /></Pressable><View style={styles.weekLabelWrap}><Text style={styles.weekDates}>{periodLabel || 'Choose a date range'}</Text><Text style={styles.weekCaption}>7-day average</Text></View><Pressable accessibilityLabel="Later 7-day period" disabled={weekEndDate >= getTodayDate()} onPress={() => movePeriod(1)} style={[styles.weekArrow, weekEndDate >= getTodayDate() && styles.disabled]}><Ionicons name="chevron-forward" size={18} color="#25634C" /></Pressable>{weekEndDate !== getTodayDate() && <Pressable onPress={showToday} style={styles.thisWeekButton}><Text style={styles.thisWeekText}>Today</Text></Pressable>}</View>
    <View style={styles.dateSelect}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: calendarOpen }} onPress={() => setCalendarOpen((open) => !open)} style={styles.dateButton}>
        <View style={styles.dateButtonIcon}><Ionicons name="calendar-outline" size={18} color="#25634C" /></View>
        <View style={styles.dateButtonCopy}><Text style={styles.dateSelectLabel}>7-day period ends</Text><Text style={styles.dateButtonValue}>{formatDate(weekEndDate)}</Text></View>
        <Ionicons name={calendarOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
      </Pressable>
      {calendarOpen && <View style={styles.calendar}>
        <View style={styles.calendarHeader}><Pressable accessibilityLabel="Previous month" onPress={() => setCalendarMonth((month) => shiftMonth(month, -1))} style={styles.monthArrow}><Ionicons name="chevron-back" size={17} color="#374151" /></Pressable><Text style={styles.monthTitle}>{formatMonth(calendarMonth)}</Text><Pressable accessibilityLabel="Next month" disabled={calendarMonth >= getTodayDate().slice(0, 7)} onPress={() => setCalendarMonth((month) => shiftMonth(month, 1))} style={[styles.monthArrow, calendarMonth >= getTodayDate().slice(0, 7) && styles.disabled]}><Ionicons name="chevron-forward" size={17} color="#374151" /></Pressable></View>
        <View style={styles.calendarGrid}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekdayLabel}>{day}</Text>)}{calendarDays(calendarMonth).map((day, index) => {
          if (!day) return <View key={`blank-${index}`} style={styles.calendarCell} />;
          const future = day > getTodayDate();
          const selected = day === weekEndDate;
          return <Pressable key={day} disabled={future} onPress={() => selectPeriodEnd(day)} style={[styles.calendarCell, selected && styles.calendarSelected, future && styles.calendarDisabled]}><Text style={[styles.calendarDayText, selected && styles.calendarSelectedText, future && styles.futureDayText]}>{Number(day.slice(-2))}</Text></Pressable>;
        })}</View>
        <Text style={styles.calendarHint}>Averages include the selected date and the 6 days before it.</Text>
      </View>}
    </View>
    {loading ? <View style={styles.loadingCard}><ActivityIndicator color="#25634C" /><Text style={styles.muted}>Calculating your week…</Text></View> : loadError ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Couldn’t load your averages</Text><Text style={styles.muted}>Your saved data is still on this device.</Text><Pressable onPress={load} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable></View> : weekly && <>
      <View style={styles.insightRow}><View style={styles.insightIcon}><Ionicons name="calendar-outline" size={17} color="#25634C" /></View><Text style={styles.insightText}>{loggedDays === 0 ? 'Log a meal to start building your weekly view.' : `${loggedDays} of 7 days with calories recorded`}</Text></View>
      <View style={styles.metricGrid}>
        <MetricCard icon="flame-outline" label="Calories / day" value={Math.round(weekly.averageMacros.calories).toLocaleString()} unit="kcal" goal={goals.calorieTarget == null ? 'No target' : `Target ${Math.round(goals.calorieTarget).toLocaleString()} / day`} tint="#FFF4E8" color="#C66A16" />
        <MetricCard icon="footsteps-outline" label="Steps / day" value={Math.round(weekly.averageSteps).toLocaleString()} unit="steps" goal={goals.stepTarget == null ? 'No target' : `Target ${goals.stepTarget.toLocaleString()} / day`} tint="#EAF4EF" color="#25634C" />
        <MetricCard icon="scale-outline" label="Average weight" value={weekly.averageWeight == null ? '—' : weightFromStorage(weekly.averageWeight, weightUnit).toFixed(1)} unit={weekly.averageWeight == null ? 'No entries' : weightUnit} goal={goals.targetWeight == null ? 'No target' : `Target ${weightFromStorage(goals.targetWeight, weightUnit).toFixed(1)} ${weightUnit}`} tint="#EEF0FF" color="#5358A6" />
        <MetricCard icon="barbell-outline" label="Workouts" value={String(weekly.workoutCount)} unit="this week" goal={goals.workoutTarget == null ? 'No target' : `Target ${goals.workoutTarget} / week`} tint="#F2ECF9" color="#8155A5" />
      </View>
      <View style={styles.card}>
        <Pressable onPress={() => setGoalsOpen((open) => !open)} style={styles.sectionAction}><View><Text style={styles.sectionTitle}>Weekly goals</Text><Text style={styles.goalHint}>{Object.values(goals).some((value) => value !== null) ? 'Targets apply to the week you are viewing' : 'Set a few personal targets'}</Text></View><Text style={styles.editText}>{goalsOpen ? 'Close' : Object.values(goals).some((value) => value !== null) ? 'Edit' : 'Set goals'}</Text></Pressable>
        {goalsOpen && <View style={styles.goalForm}>
          <GoalInput label="Average calories per day" value={goalForm.calories} onChangeText={(value) => setGoalForm((form) => ({ ...form, calories: value }))} unit="kcal" />
          <GoalInput label="Average steps per day" value={goalForm.steps} onChangeText={(value) => setGoalForm((form) => ({ ...form, steps: value }))} unit="steps" integer />
          <GoalInput label="Average weight" value={goalForm.weight} onChangeText={(value) => setGoalForm((form) => ({ ...form, weight: value }))} unit={weightUnit} />
          <GoalInput label="Workouts per week" value={goalForm.workouts} onChangeText={(value) => setGoalForm((form) => ({ ...form, workouts: value }))} unit="workouts" integer />
          <Text style={styles.goalHint}>Leave any field blank to remove that target.</Text>
          <Pressable disabled={goalSaving || goalLoadError} onPress={saveGoals} style={[styles.button, (goalSaving || goalLoadError) && styles.disabled]}><Text style={styles.buttonText}>{goalSaving ? 'Saving…' : goalLoadError ? 'Goals unavailable' : 'Save goals'}</Text></Pressable>
        </View>}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Nutrition per day</Text>
        <View style={styles.macroGrid}>
          <Macro label="Protein" value={weekly.averageMacros.protein} unit="g" color="#2563EB" />
          <Macro label="Carbs" value={weekly.averageMacros.carbs} unit="g" color="#D97706" />
          <Macro label="Fat" value={weekly.averageMacros.fat} unit="g" color="#DB5B69" />
          <Macro label="Fibre" value={weekly.averageMacros.fibre} unit="g" color="#198754" />
        </View>
      </View>
      <WeeklyBarChart title="Calories by day" unit="kcal" days={weekly.dailyCalories.map((day) => ({ date: day.date, value: day.calories }))} color="#E69843" />
      <WeeklyBarChart title="Steps by day" unit="steps" days={weekly.dailySteps.map((day) => ({ date: day.date, value: day.steps }))} color="#35916E" />
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Edit a day</Text><Text style={styles.goalHint}>Choose a date to update its weight, steps, meals, or activity.</Text>
        {weekly.dailyCalories.map((day, index) => {
          const stepsForDay = weekly.dailySteps[index]?.steps ?? 0;
          const weightForDay = weekly.dailyWeights[index]?.weight;
          const selected = date === day.date;
          return <Pressable accessibilityRole="button" key={day.date} onPress={() => chooseDay(day.date)} style={[styles.dayRow, selected && styles.dayRowSelected]}>
            <View style={styles.dayDateWrap}><Text style={styles.dayRowTitle}>{formatDate(day.date)}</Text><Text style={styles.dayRowSub}>{day.date === getTodayDate() ? 'Today' : 'Tap to edit this day'}</Text></View>
            <View style={styles.dayStat}><Text style={styles.dayStatValue}>{Math.round(day.calories).toLocaleString()}</Text><Text style={styles.dayStatLabel}>kcal</Text></View>
            <View style={styles.dayStat}><Text style={styles.dayStatValue}>{Math.round(stepsForDay).toLocaleString()}</Text><Text style={styles.dayStatLabel}>steps</Text></View>
            <View style={styles.dayStat}><Text style={styles.dayStatValue}>{weightForDay == null ? '—' : weightFromStorage(weightForDay, weightUnit).toFixed(1)}</Text><Text style={styles.dayStatLabel}>{weightUnit}</Text></View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </Pressable>;
        })}
      </View>
    </>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: editorOpen }} onPress={() => setEditorOpen((open) => !open)} style={styles.editorToggle}><View style={styles.editorIcon}><Ionicons name="create-outline" size={18} color="#25634C" /></View><View style={styles.editorCopy}><Text style={styles.editorTitle}>Add a past entry</Text><Text style={styles.editorHint}>Record weight or steps for a date</Text></View><Ionicons name={editorOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" /></Pressable>
    {editorOpen && <View style={styles.card}>
      <Text style={styles.heading}>Update a day</Text>
      <Text style={styles.label}>Choose a date</Text>
      <View style={styles.dateRow}><Pressable accessibilityLabel="Previous day" onPress={() => changeDate(shiftDate(isValidDateString(date) ? date : getTodayDate(), -1))} style={styles.dateArrow}><Text style={styles.dateArrowText}>‹</Text></Pressable><View style={styles.dateField}><Text style={styles.datePretty}>{isValidDateString(date) ? formatDate(date) : 'Enter a valid date'}</Text><TextInput value={date} onChangeText={(value) => { dateRequestRef.current += 1; setDateLoading(false); selectedDateRef.current = value; setDate(value); }} onEndEditing={() => void loadSelectedDate(date)} placeholder="YYYY-MM-DD" autoCapitalize="none" style={styles.dateInput} /></View><Pressable onPress={() => changeDate(getTodayDate())} style={styles.todayButton}><Text style={styles.todayText}>Today</Text></Pressable><Pressable accessibilityLabel="Next day" accessibilityState={{ disabled: !isValidDateString(date) || date >= getTodayDate() }} disabled={!isValidDateString(date) || date >= getTodayDate()} onPress={() => changeDate(shiftDate(isValidDateString(date) ? date : getTodayDate(), 1))} style={[styles.dateArrow, (!isValidDateString(date) || date >= getTodayDate()) && styles.disabled]}><Text style={styles.dateArrowText}>›</Text></Pressable></View>
      <Text style={styles.label}>Weight ({weightUnit})</Text>
      <TextInput value={weight} onChangeText={setWeight} placeholder="Leave blank to keep existing value" keyboardType="decimal-pad" style={styles.input} />
      <Text style={styles.label}>Steps</Text>
      <TextInput value={steps} onChangeText={setSteps} placeholder="Leave blank to keep current steps" keyboardType="number-pad" style={styles.input} />
      <Pressable disabled={dateLoading} onPress={save} style={[styles.button, dateLoading && styles.disabled]}><Text style={styles.buttonText}>{dateLoading ? 'Loading day…' : 'Save day'}</Text></Pressable>
      <View style={styles.dayActions}><Pressable disabled={!isValidDateString(date) || date > getTodayDate()} onPress={() => router.push({ pathname: '/add-meal', params: { date, returnTo: 'history' } })} style={[styles.dayAction, (!isValidDateString(date) || date > getTodayDate()) && styles.disabled]}><Ionicons name="restaurant-outline" size={16} color="#25634C" /><Text style={styles.dayActionText}>Edit meals</Text></Pressable><Pressable disabled={!isValidDateString(date) || date > getTodayDate()} onPress={() => router.push({ pathname: '/workouts', params: { date, returnTo: 'history' } })} style={[styles.dayAction, (!isValidDateString(date) || date > getTodayDate()) && styles.disabled]}><Ionicons name="barbell-outline" size={16} color="#25634C" /><Text style={styles.dayActionText}>Edit activity</Text></Pressable></View>
    </View>}
  </ScrollView>;
}

function MetricCard({ icon, label, value, unit, goal, tint, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; unit: string; goal: string; tint: string; color: string }) {
  return <View style={styles.metricCard}><View style={[styles.metricIcon, { backgroundColor: tint }]}><Ionicons name={icon} size={17} color={color} /></View><Text style={styles.metricLabel}>{label}</Text><View style={styles.metricValueRow}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricUnit}>{unit}</Text></View><Text numberOfLines={1} style={styles.metricGoal}>{goal}</Text></View>;
}

function GoalInput({ label, value, onChangeText, unit, integer = false }: { label: string; value: string; onChangeText: (value: string) => void; unit: string; integer?: boolean }) {
  return <View style={styles.goalInputWrap}><Text style={styles.goalInputLabel}>{label}</Text><View style={styles.goalInputRow}><TextInput value={value} onChangeText={onChangeText} keyboardType={integer ? 'number-pad' : 'decimal-pad'} placeholder="Not set" style={styles.goalInput} /><Text style={styles.goalInputUnit}>{unit}</Text></View></View>;
}

function Macro({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return <View style={styles.macroItem}><View style={[styles.macroDot, { backgroundColor: color }]} /><Text style={styles.macroLabel}>{label}</Text><Text style={styles.macroValue}>{Math.round(value)} {unit}</Text></View>;
}

function WeeklyBarChart({ title, unit, days, color }: { title: string; unit: string; days: { date: string; value: number }[]; color: string }) {
  const max = Math.max(...days.map((day) => day.value), 1);
  return <View style={styles.card}>
    <View style={styles.chartHeading}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.chartUnit}>{unit}</Text></View>
    <View style={styles.weekChart}>{days.map((day) => <View key={day.date} style={styles.dayColumn}>
      <Text style={styles.dayValue}>{day.value > 0 ? compactNumber(day.value) : '—'}</Text>
      <View style={styles.dayBarArea}><View style={[styles.dayBar, { height: `${day.value > 0 ? Math.max(6, day.value / max * 100) : 3}%`, backgroundColor: color, opacity: day.value > 0 ? 1 : 0.18 }]} /></View>
      <Text style={styles.dayLabel}>{weekday(day.date)}</Text>
    </View>)}</View>
  </View>;
}

function compactNumber(value: number) { return value >= 10000 ? `${(value / 1000).toFixed(0)}k` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`; }
function weekday(value: string) { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1); }
function formatShortDate(value: string) { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function shiftMonth(value: string, amount: number) { const [year, month] = value.split('-').map(Number); const next = new Date(year, month - 1 + amount, 1); return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`; }
function formatMonth(value: string) { const [year, month] = value.split('-').map(Number); return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }
function calendarDays(value: string) {
  const [year, month] = value.split('-').map(Number);
  const offset = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  const total = Math.ceil((offset + count) / 7) * 7;
  return Array.from({ length: total }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > count ? null : `${value}-${String(day).padStart(2, '0')}`;
  });
}
function localDate(value: string) { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); }

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 18, paddingTop: 52, paddingBottom: 36 },
  back: { color: '#25634C', fontWeight: '600', marginBottom: 14 }, title: { color: '#111827', fontSize: 28, fontWeight: '700' }, subtitle: { color: '#6B7280', marginTop: 4, marginBottom: 13, fontSize: 13 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10 }, sectionTitle: { color: '#111827', fontSize: 15, fontWeight: '700' }, heading: { color: '#111827', fontSize: 17, fontWeight: '700', marginTop: 2, marginBottom: 8 },
  loadingCard: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB' }, emptyCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 }, emptyTitle: { color: '#111827', fontWeight: '700', fontSize: 15, marginBottom: 4 }, retryButton: { alignSelf: 'flex-start', backgroundColor: '#EAF4EF', borderRadius: 8, marginTop: 12, paddingVertical: 8, paddingHorizontal: 12 }, retryText: { color: '#1D513D', fontWeight: '700' },
  insightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }, insightIcon: { height: 28, width: 28, borderRadius: 9, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center' }, insightText: { color: '#4B5563', fontSize: 12, fontWeight: '600' }, metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 10 }, metricCard: { width: '48.5%', minHeight: 112, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', padding: 12 }, metricIcon: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginBottom: 7 }, metricLabel: { color: '#6B7280', fontSize: 11 }, metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 3 }, metricValue: { color: '#111827', fontSize: 20, fontWeight: '700' }, metricUnit: { color: '#6B7280', fontSize: 10 },
  metricGoal: { color: '#8B929A', fontSize: 9, marginTop: 3 }, weekSwitcher: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }, weekArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF4EF', borderRadius: 10 }, weekLabelWrap: { flex: 1, alignItems: 'center' }, weekDates: { color: '#111827', fontWeight: '700', fontSize: 14 }, weekCaption: { color: '#6B7280', fontSize: 10, marginTop: 2 }, thisWeekButton: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 }, thisWeekText: { color: '#374151', fontWeight: '600', fontSize: 11 }, dateSelect: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 11, marginBottom: 12 }, dateSelectLabel: { color: '#6B7280', fontSize: 10 }, dateButton: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }, dateButtonIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center' }, dateButtonCopy: { flex: 1 }, dateButtonValue: { color: '#111827', fontSize: 14, fontWeight: '700', marginTop: 2 }, calendar: { borderTopWidth: 1, borderColor: '#F1F3F5', marginTop: 10, paddingTop: 8 }, calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, monthArrow: { width: 32, height: 32, backgroundColor: '#F3F4F6', borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, monthTitle: { color: '#111827', fontSize: 14, fontWeight: '700' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, weekdayLabel: { width: `${100 / 7}%`, textAlign: 'center', color: '#9CA3AF', fontSize: 10, fontWeight: '600', paddingVertical: 6 }, calendarCell: { width: `${100 / 7}%`, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, calendarDayText: { color: '#374151', fontSize: 12 }, calendarSelected: { backgroundColor: '#25634C' }, calendarSelectedText: { color: '#FFF', fontWeight: '700' }, calendarDisabled: { opacity: 0.35 }, futureDayText: { color: '#9CA3AF' }, calendarHint: { color: '#9CA3AF', fontSize: 10, textAlign: 'center', marginTop: 7 },
  sectionAction: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, goalHint: { color: '#6B7280', fontSize: 11, marginTop: 4 }, editText: { color: '#25634C', fontWeight: '700', fontSize: 12 }, goalForm: { borderTopWidth: 1, borderColor: '#F1F3F5', marginTop: 12, paddingTop: 3 }, goalInputWrap: { marginTop: 9 }, goalInputLabel: { color: '#4B5563', fontWeight: '600', fontSize: 12, marginBottom: 5 }, goalInputRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, goalInput: { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, color: '#111827' }, goalInputUnit: { minWidth: 65, color: '#6B7280', fontSize: 11 },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 13, marginTop: 13 }, macroItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6 }, macroDot: { width: 7, height: 7, borderRadius: 4 }, macroLabel: { color: '#6B7280', fontSize: 12, flex: 1 }, macroValue: { color: '#111827', fontSize: 12, fontWeight: '700' }, chartHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, chartUnit: { color: '#9CA3AF', fontSize: 11 }, weekChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5, height: 112, marginTop: 9 }, dayColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }, dayValue: { color: '#6B7280', fontSize: 9, marginBottom: 4 }, dayBarArea: { height: 66, width: '70%', minWidth: 17, justifyContent: 'flex-end', backgroundColor: '#F3F4F6', borderRadius: 5, overflow: 'hidden' }, dayBar: { width: '100%', borderRadius: 5 }, dayLabel: { color: '#9CA3AF', fontSize: 10, marginTop: 5 }, weightDays: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, weightDay: { backgroundColor: '#F5F7F6', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 }, weightDate: { color: '#6B7280', fontSize: 10 }, weightValue: { color: '#111827', fontSize: 12, fontWeight: '700', marginTop: 2 },
  editorToggle: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 13, minHeight: 62, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2, marginBottom: 10 }, editorIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center' }, editorCopy: { flex: 1 }, editorTitle: { color: '#111827', fontWeight: '700', fontSize: 13 }, editorHint: { color: '#6B7280', fontSize: 11, marginTop: 2 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: 1, borderColor: '#F1F3F5', minHeight: 57, paddingVertical: 7, paddingHorizontal: 3 }, dayRowSelected: { backgroundColor: '#F1F8F4' }, dayDateWrap: { flex: 1, minWidth: 75 }, dayRowTitle: { color: '#111827', fontWeight: '600', fontSize: 11 }, dayRowSub: { color: '#9CA3AF', fontSize: 9, marginTop: 3 }, dayStat: { minWidth: 40, alignItems: 'flex-end' }, dayStatValue: { color: '#374151', fontWeight: '600', fontSize: 10 }, dayStatLabel: { color: '#9CA3AF', fontSize: 9, marginTop: 2 }, dayActions: { flexDirection: 'row', gap: 8, marginTop: 10 }, dayAction: { flex: 1, height: 40, backgroundColor: '#EAF4EF', borderRadius: 9, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }, dayActionText: { color: '#1D513D', fontWeight: '600', fontSize: 11 },
  label: { color: '#4B5563', marginTop: 8, marginBottom: 5, fontSize: 13 }, input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, padding: 11, color: '#111827' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }, dateArrow: { height: 38, width: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderRadius: 9 }, dateArrowText: { color: '#374151', fontSize: 23 }, dateField: { flex: 1, minWidth: 0 }, datePretty: { color: '#111827', fontSize: 14, fontWeight: '600' }, dateInput: { color: '#6B7280', fontSize: 11, paddingVertical: 2, marginTop: 1 }, todayButton: { backgroundColor: '#EAF4EF', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 10 }, todayText: { color: '#1D513D', fontWeight: '700', fontSize: 12 }, disabled: { opacity: 0.6 },
  button: { backgroundColor: '#25634C', borderRadius: 9, padding: 12, alignItems: 'center', marginTop: 12 }, buttonText: { color: '#FFF', fontWeight: '700' }, muted: { color: '#6B7280', fontSize: 12 },
});
