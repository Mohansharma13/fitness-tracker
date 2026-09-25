// ============================================================
// React Native UI components
// ============================================================
//
// These are the building blocks we use to create the screen.
//
// ActivityIndicator -> loading spinner
// Alert             -> popup confirmation dialog
// Pressable         -> clickable/tappable button
// ScrollView        -> allows the whole dashboard to scroll
// StyleSheet        -> stores our screen styling
// Text              -> displays text
// View              -> basic layout/container component
//
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


// ============================================================
// React hooks
// ============================================================
//
// useCallback is used to create a function that React can
// safely reuse without creating a completely new function
// every time the screen renders.
//
import { useCallback, useEffect, useState } from 'react';


// ============================================================
// Expo Router
// ============================================================
//
// router:
// Used when we want to navigate to another screen.
//
// useFocusEffect:
// Runs code whenever this screen becomes active/focused.
//
// This is useful for our dashboard because when we return
// from the Add Meal/Edit Meal screen, we want the dashboard
// to refresh and show the latest data.
//
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';


// ============================================================
// SQLite
// ============================================================
//
// useSQLiteContext gives this screen access to the SQLite
// database that was created in _layout.tsx.
//
// We don't directly write SQL queries here.
//
// Instead:
//
// Dashboard
//    ↓
// Hook
//    ↓
// Service
//    ↓
// Repository
//    ↓
// SQLite
//
// This keeps the project organized and makes it easier to
// add cloud/database syncing later.
//
import { useSQLiteContext } from 'expo-sqlite';


// ============================================================
// Our application logic
// ============================================================
//
// useDailyDashboard:
// Loads all information needed for today's dashboard.
//
// calculateMealMacros:
// Calculates the calories/macros of one meal.
//
// deleteMeal:
// Deletes a meal through the repository layer.
//
import { useDailyDashboard } from '../hooks/useDailyDashboard';
import { calculateMealMacros } from '../services/macroService';
import { deleteMeal, moveMeal } from '../repositories/mealRepository';
import { getOrCreateDailyLog, updateDailyLog } from '../repositories/dailyLogRepository';
import { getTodayDate, shiftDate } from '../utils/date';
import { getWeeklySummary } from '../services/analyticsService';
import { getSettings } from '../repositories/settingsRepository';
import { weightFromStorage, weightToStorage, type WeightUnit } from '../utils/weight';
import { getWorkoutsForDate } from '../repositories/workoutRepository';
import { useSelectedDate } from '../contexts/SelectedDateContext';


// ============================================================
// Helper: format whole numbers
// ============================================================
//
// Example:
//
// 2500 -> "2,500"
//
// This makes large numbers such as calories easier to read.
//
function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}


// ============================================================
// Helper: format decimal numbers
// ============================================================
//
// Example:
//
// 123.456 -> "123.5"
//
// We use this for protein, carbs and fat.
//
function formatDecimal(value: number): string {
  return value.toFixed(1);
}


// ============================================================
// Dashboard Screen
// ============================================================
//
// This is the main screen of the Fitness Tracker app.
//
// The file is named index.tsx because Expo Router treats
// "index" as the default/home screen for this route.
//
export default function DashboardScreen() {

  // ----------------------------------------------------------
  // Get access to the SQLite database.
  // ----------------------------------------------------------
  //
  // The database itself was initialized higher up in
  // _layout.tsx using SQLiteProvider.
  //
  const db = useSQLiteContext();
  const { selectedDate, setSelectedDate } = useSelectedDate();
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [weekly, setWeekly] = useState<Awaited<ReturnType<typeof getWeeklySummary>> | null>(null);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const [weightChartWidth, setWeightChartWidth] = useState(300);
  const [selectedWeightDate, setSelectedWeightDate] = useState<string | null>(null);
  const [selectedStepDate, setSelectedStepDate] = useState<string | null>(null);


  // ----------------------------------------------------------
  // Load today's dashboard data.
  // ----------------------------------------------------------
  //
  // useDailyDashboard() gives us:
  //
  // dashboard -> today's data
  // loading   -> whether data is currently loading
  // reload    -> function to reload the dashboard
  //
  const {
    dashboard,
    loading,
    error: dashboardError,
    reload,
    reloadMeals,
  } = useDailyDashboard(selectedDate);

  const [weightInput, setWeightInput] = useState('');
  const [stepsInput, setStepsInput] = useState('0');
  const [durationInput, setDurationInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [workoutCompletedInput, setWorkoutCompletedInput] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    if (!dashboard || dashboard.date !== selectedDate) return;
    let active = true;
    const [year, month, day] = selectedDate.split('-').map(Number);
    getWeeklySummary(db, new Date(year, month - 1, day)).then((summary) => {
      if (active) setWeekly(summary);
    }).catch((error) => console.error('Failed to load weekly activity:', error));
    return () => { active = false; };
  }, [db, selectedDate, dashboard]);

  // This effect copies the asynchronously loaded daily log into editable form fields.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!dashboard || dashboard.date !== selectedDate) return;
    setWeightInput(dashboard.dailyLog?.weight == null ? '' : weightFromStorage(dashboard.dailyLog.weight, weightUnit).toFixed(1));
    setStepsInput(String(dashboard.dailyLog?.steps ?? 0));
    setDurationInput(dashboard.dailyLog?.workoutDuration == null ? '' : String(dashboard.dailyLog.workoutDuration));
    setNotesInput(dashboard.dailyLog?.notes ?? '');
    setWorkoutCompletedInput(dashboard.dailyLog?.workoutCompleted ?? false);
  }, [dashboard, selectedDate, weightUnit]);
  /* eslint-enable react-hooks/set-state-in-effect */


  // ==========================================================
  // Refresh dashboard whenever this screen becomes active
  // ==========================================================
  //
  // Example:
  //
  // 1. User is on Dashboard
  // 2. User opens Edit Meal
  // 3. User changes the meal
  // 4. User goes back
  //
  // When the Dashboard becomes active again, reload()
  // runs so the dashboard shows the updated meal.
  //
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getSettings(db).then((settings) => {
        if (active) { setWeightUnit(settings.weightUnit); setProfileName(settings.name); }
      }).catch((error) => console.error('Failed to load settings:', error));
      reload();
      return () => { active = false; };
    }, [db, reload])
  );


  // ==========================================================
  // Loading state
  // ==========================================================
  //
  // While SQLite/data is loading, show a loading spinner
  // instead of trying to display incomplete information.
  //
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (dashboardError || !dashboard) {
    return <View style={styles.loadError}><Text style={styles.loadErrorTitle}>Dashboard unavailable</Text><Text style={styles.loadErrorText}>{dashboardError ?? 'Your daily information could not be loaded.'}</Text><Pressable style={styles.activitySaveButton} onPress={reload}><Text style={styles.activitySaveText}>Try again</Text></Pressable></View>;
  }


  // ==========================================================
  // Get information from the dashboard object
  // ==========================================================
  //
  // The useDailyDashboard hook eventually gets this
  // information from analyticsService.
  //
  // dailyLog      -> today's weight, steps, workout etc.
  // meals         -> today's meals
  // mealCount     -> number of meals
  // dailyMacros   -> total calories/protein/carbs/fat
  //
  const {
    dailyLog,
    meals,
    mealCount,
    dailyMacros,
  } = dashboard;

  const selectedDateObject = (() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  })();
  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const calendarCells = Array.from(
    { length: monthStart.getDay() + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() },
    (_, index) => index < monthStart.getDay() ? null : index - monthStart.getDay() + 1
  );
  const formatDateLabel = (date: Date) => date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const selectCalendarDay = (day: number) => {
    const value = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (value > getTodayDate()) return;
    setSelectedDate(value);
    setCalendarVisible(false);
  };


  // ==========================================================
  // Delete Meal
  // ==========================================================
  //
  // This function is called when the user taps
  // "Delete Meal".
  //
  // We don't immediately delete the meal.
  //
  // First we show a confirmation popup so the user doesn't
  // accidentally delete something.
  //
  const handleDeleteMeal = (
    mealId: string,
    mealName: string
  ) => {

    Alert.alert(
      'Delete Meal',

      // Show the actual meal name in the confirmation message.
      `Are you sure you want to delete ${mealName}?`,

      [
        // ----------------------------------------------------
        // Cancel button
        // ----------------------------------------------------
        {
          text: 'Cancel',
          style: 'cancel',
        },

        // ----------------------------------------------------
        // Delete button
        // ----------------------------------------------------
        {
          text: 'Delete',
          style: 'destructive',

          // This function runs only after the user confirms.
          onPress: async () => {

            try {

              // Ask the repository to delete the meal.
              //
              // Keeping this operation inside the repository
              // means this screen doesn't need to know how
              // SQLite works internally.
              await deleteMeal(db, mealId);


              // Reload the dashboard after deletion so the
              // deleted meal disappears and the daily totals
              // are recalculated.
              await reload();

            } catch (error) {

              // If something goes wrong, print the error
              // in the development console.
              console.error(
                'Failed to delete meal:',
                error
              );
              Alert.alert('Could not delete meal', 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleSaveActivity = async () => {
    if (loading) return;
    const activityDate = selectedDate;
    const enteredWeight = weightInput.trim() === '' ? null : Number(weightInput);
    const weight = enteredWeight === null ? null : weightToStorage(enteredWeight, weightUnit);
    const steps = Number(stepsInput);
    const duration = durationInput.trim() === '' ? null : Number(durationInput);
    if ((weight !== null && (!Number.isFinite(weight) || weight <= 0)) || !Number.isInteger(steps) || steps < 0 || (duration !== null && (!Number.isFinite(duration) || duration <= 0))) {
      Alert.alert('Check your entries', 'Enter a positive weight, whole non-negative steps, and a workout duration greater than zero.');
      return;
    }
    try {
        setSavingActivity(true);
        const log = await getOrCreateDailyLog(db, { date: activityDate });
        const loggedWorkouts = await getWorkoutsForDate(db, activityDate);
        const hasWorkoutLogs = loggedWorkouts.length > 0;
        const workoutDuration = hasWorkoutLogs
          ? loggedWorkouts.reduce((total, workout) => total + (workout.duration ?? 0), 0) || null
          : duration;
        await updateDailyLog(db, log.id, { weight, steps, workoutCompleted: hasWorkoutLogs || workoutCompletedInput, workoutDuration, notes: notesInput.trim() || null });
      await reload();
      Alert.alert('Saved', `Activity for ${activityDate} has been updated.`);
    } catch (error) {
      console.error('Failed to save daily activity:', error);
      Alert.alert('Could not save', 'Your daily activity could not be saved. Please try again.');
    } finally {
      setSavingActivity(false);
    }
  };


  // ==========================================================
  // Main Dashboard UI
  // ==========================================================
  //
  // ScrollView is used because the dashboard can become quite
  // long when the user has several meals.
  //
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >

      {/* ======================================================
          App title
          ====================================================== */}

      <Text style={styles.title}>
          {profileName ? `${profileName}’s Tracker` : 'Fitness Tracker'}
      </Text>


      {/* Show that these values belong to today */}

      <Text style={styles.date}>{selectedDate === getTodayDate() ? 'Today' : 'Daily log'}</Text>
      <View style={styles.datePickerRow}>
        <Pressable style={styles.dateButton} onPress={() => setSelectedDate(shiftDate(selectedDate, -1))} accessibilityLabel="Previous day"><Text style={styles.dateButtonText}>‹</Text></Pressable>
        <Pressable style={styles.selectedDateButton} onPress={() => { setCalendarMonth(selectedDateObject); setCalendarVisible(true); }} accessibilityRole="button" accessibilityLabel={`Choose date, ${formatDateLabel(selectedDateObject)}`}>
          <Ionicons name="calendar-outline" size={18} color="#374151" />
          <Text style={styles.selectedDateText}>{formatDateLabel(selectedDateObject)}</Text>
          <Ionicons name="chevron-down" size={16} color="#6B7280" />
        </Pressable>
        <Pressable style={styles.dateButton} disabled={selectedDate >= getTodayDate()} onPress={() => setSelectedDate(shiftDate(selectedDate, 1))} accessibilityLabel="Next day" accessibilityState={{ disabled: selectedDate >= getTodayDate() }}><Text style={[styles.dateButtonText, selectedDate >= getTodayDate() && styles.disabledDateText]}>›</Text></Pressable>
      </View>
      {selectedDate !== getTodayDate() && <Pressable onPress={() => setSelectedDate(getTodayDate())}><Text style={styles.todayLink}>Go to today</Text></Pressable>}

      <Modal visible={calendarVisible} transparent animationType="fade" onRequestClose={() => setCalendarVisible(false)}>
        <View style={styles.calendarBackdrop}>
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <Pressable style={styles.calendarArrow} onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={20} color="#374151" /></Pressable>
              <Text style={styles.calendarMonth}>{calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
              <Pressable style={styles.calendarArrow} disabled={calendarMonth.getFullYear() === new Date().getFullYear() && calendarMonth.getMonth() >= new Date().getMonth()} onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} accessibilityLabel="Next month" accessibilityState={{ disabled: calendarMonth.getFullYear() === new Date().getFullYear() && calendarMonth.getMonth() >= new Date().getMonth() }}><Ionicons name="chevron-forward" size={20} color={calendarMonth.getFullYear() === new Date().getFullYear() && calendarMonth.getMonth() >= new Date().getMonth() ? '#D1D5DB' : '#374151'} /></Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.calendarWeekday}>{day}</Text>)}
              {calendarCells.map((day, index) => {
                if (day == null) return <View key={`blank-${index}`} style={styles.calendarCell} />;
                const dateValue = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = dateValue === selectedDate;
                const isToday = dateValue === getTodayDate();
                const isFuture = dateValue > getTodayDate();
                return <Pressable key={dateValue} disabled={isFuture} onPress={() => selectCalendarDay(day)} accessibilityLabel={dateValue} accessibilityState={{ disabled: isFuture, selected: isSelected }} style={[styles.calendarCell, isSelected && styles.calendarCellSelected, isToday && !isSelected && styles.calendarCellToday]}><Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, isFuture && styles.disabledDateText]}>{day}</Text></Pressable>;
              })}
            </View>
            <View style={styles.calendarActions}>
              <Pressable onPress={() => setCalendarVisible(false)} style={styles.calendarCancel}><Text style={styles.calendarCancelText}>Cancel</Text></Pressable>
              <Pressable onPress={() => { setSelectedDate(getTodayDate()); setCalendarVisible(false); }} style={styles.calendarToday}><Text style={styles.calendarTodayText}>Today</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Text style={styles.sectionTitle}>Last 7 days</Text>
      <View style={styles.card}>
        <Text style={styles.chartTitle}>Steps</Text>
        <View style={styles.chartBars}>{(weekly?.dailySteps ?? []).map((item) => <Pressable key={item.date} onPress={() => setSelectedStepDate(item.date)} style={styles.chartColumn} accessibilityRole="button" accessibilityLabel={`${item.date}: ${item.steps} steps`}><Text style={[styles.chartValue, selectedStepDate === item.date && styles.selectedChartValue]}>{item.steps ? formatNumber(item.steps) : '—'}</Text><View style={[styles.chartBar, selectedStepDate === item.date && styles.selectedChartBar, { height: Math.max(4, Math.min(100, item.steps / Math.max(1, ...(weekly?.dailySteps.map((entry) => entry.steps) ?? [1])) * 100)) }]} /><Text style={styles.chartDate}>{item.date.slice(5)}</Text></Pressable>)}</View>
        {selectedStepDate && <Text style={styles.chartHint}>{selectedStepDate}: {(weekly?.dailySteps.find((item) => item.date === selectedStepDate)?.steps ?? 0).toLocaleString()} steps</Text>}
        <Text style={styles.chartTitle}>Weight trend ({weightUnit})</Text>
        {(() => {
          const points = weekly?.dailyWeights ?? [];
          const values = points.map((item) => item.weight).filter((value): value is number => value !== null);
          const min = values.length ? Math.min(...values) : 0;
          const max = values.length ? Math.max(...values) : 1;
          const stepX = points.length > 1 ? weightChartWidth / (points.length - 1) : 0;
          const yFor = (value: number) => max === min ? 48 : 88 - ((value - min) / (max - min)) * 76;
          return <View>
            <View style={styles.lineChart} onLayout={(event) => setWeightChartWidth(event.nativeEvent.layout.width)}>
              {[24, 52, 80].map((top) => <View key={top} style={[styles.chartGuide, { top }]} />)}
              {points.map((point, index) => {
                if (index === points.length - 1 || point.weight == null || points[index + 1]?.weight == null) return null;
                const next = points[index + 1];
                const x1 = index * stepX;
                const x2 = (index + 1) * stepX;
                const y1 = yFor(point.weight);
                const y2 = yFor(next.weight!);
                const width = Math.hypot(x2 - x1, y2 - y1);
                const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
                return <View key={`line-${point.date}`} style={[styles.lineSegment, { width, left: (x1 + x2 - width) / 2, top: (y1 + y2) / 2, transform: [{ rotate: `${angle}deg` }] }]} />;
              })}
              {points.map((point, index) => point.weight == null ? null : <Pressable key={point.date} onPress={() => setSelectedWeightDate(point.date)} accessibilityRole="button" accessibilityLabel={`${point.date}: ${weightFromStorage(point.weight!, weightUnit).toFixed(1)} ${weightUnit}`} style={[styles.pointWrap, { left: index * stepX - 20, top: yFor(point.weight) - 20 }]}><Text style={styles.pointValue}>{weightFromStorage(point.weight, weightUnit).toFixed(1)}</Text><View style={[styles.linePoint, selectedWeightDate === point.date && styles.selectedLinePoint]} /></Pressable>)}
            </View>
            <View style={styles.lineDateRow}>{points.map((point) => <Text key={point.date} style={styles.chartDate}>{point.date.slice(5)}</Text>)}</View>
            {values.length === 0 ? <Text style={styles.chartHint}>Log a weight to start your trend.</Text> : values.length === 1 ? <Text style={styles.chartHint}>First entry recorded. Log again on another day to see your trend.</Text> : null}
            {selectedWeightDate && <Text style={styles.chartHint}>{selectedWeightDate}: {(() => { const value = points.find((item) => item.date === selectedWeightDate)?.weight; return value == null ? '' : `${weightFromStorage(value, weightUnit).toFixed(1)} ${weightUnit}`; })()}</Text>}
          </View>;
        })()}
      </View>


      {/* ======================================================
          DAILY NUTRITION
          ====================================================== */}

      <Text style={styles.sectionTitle}>Nutrition</Text>
      <View style={styles.nutritionCard}>
        <View style={styles.calorieSummary}>
          <Text style={styles.calorieLabel}>Calories</Text>
          <Text style={styles.calorieValue}>{formatNumber(dailyMacros.calories)} <Text style={styles.calorieUnit}>kcal</Text></Text>
        </View>
        <View style={styles.nutritionDivider} />
        <View style={styles.nutritionMacros}>
          <NutritionValue label="Protein" value={`${formatDecimal(dailyMacros.protein)} g`} />
          <NutritionValue label="Carbs" value={`${formatDecimal(dailyMacros.carbs)} g`} />
          <NutritionValue label="Fat" value={`${formatDecimal(dailyMacros.fat)} g`} />
          <NutritionValue label="Fibre" value={`${formatDecimal(dailyMacros.fibre)} g`} />
        </View>
      </View>

      {/* ======================================================
          ACTIVITY
          ====================================================== */}

      <Text style={styles.sectionTitle}>
        Activity
      </Text>


      <View style={styles.card}>
        <View style={styles.activitySummary}>
          <View><Text style={styles.summaryLabel}>Weight</Text><Text style={styles.summaryValue}>{dailyLog?.weight == null ? 'Add weight' : `${weightFromStorage(dailyLog.weight, weightUnit).toFixed(1)} ${weightUnit}`}</Text></View>
          <View><Text style={styles.summaryLabel}>Steps</Text><Text style={styles.summaryValue}>{formatNumber(dailyLog?.steps ?? 0)}</Text></View>
          <View><Text style={styles.summaryLabel}>Workout</Text><Text style={styles.summaryValue}>{dashboard.workoutCount ? `${dashboard.workoutCount} logged` : '—'}</Text></View>
        </View>
        <View style={styles.activityActions}>
          <Pressable style={styles.workoutLink} onPress={() => setActivityExpanded((value) => !value)}>
            <Ionicons name="create-outline" size={17} color="#374151" />
            <Text style={styles.workoutLinkText}>{activityExpanded ? 'Close details' : 'Edit tracking'}</Text>
          </Pressable>
          <Pressable style={styles.workoutLink} onPress={() => router.push({ pathname: '/workouts', params: { date: selectedDate } } as never)}>
            <Ionicons name="barbell-outline" size={17} color="#374151" />
            <Text style={styles.workoutLinkText}>Log workout</Text>
          </Pressable>
        </View>
        {activityExpanded && <>
        <InputRow label={`Weight (${weightUnit})`} value={weightInput} onChangeText={setWeightInput} placeholder="e.g. 68.5" keyboardType="decimal-pad" />
        <InputRow label="Steps" value={stepsInput} onChangeText={setStepsInput} placeholder="0" keyboardType="number-pad" />
        <InputRow label="Workout duration (minutes)" value={durationInput} onChangeText={setDurationInput} placeholder="Optional" keyboardType="decimal-pad" />
        <Pressable style={styles.workoutToggle} onPress={() => setWorkoutCompletedInput((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: workoutCompletedInput }}>
          <Text style={styles.rowLabel}>Workout completed</Text>
          <Text style={styles.rowValue}>{workoutCompletedInput ? 'Yes ✓' : 'No'}</Text>
        </Pressable>
        <Text style={[styles.rowLabel, styles.notesLabel]}>Daily notes</Text>
        <TextInput value={notesInput} onChangeText={setNotesInput} placeholder="How did today go?" multiline style={styles.notesInput} />
        <Pressable style={[styles.activitySaveButton, (savingActivity || loading) && styles.disabledButton]} onPress={handleSaveActivity} disabled={savingActivity || loading}>
          <Text style={styles.activitySaveText}>{savingActivity ? 'Saving…' : 'Save Activity'}</Text>
        </Pressable>
        </>}
      </View>


      {/* ======================================================
          MEALS
          ====================================================== */}

      <View style={styles.section}>

        <View style={styles.mealsHeading}>
          <Text style={styles.sectionTitle}>Meals ({mealCount})</Text>
          <View style={styles.mealActions}>
            <Pressable style={styles.quickMealButton} onPress={() => router.push({ pathname: '/add-meal', params: { date: selectedDate, mode: 'quick' } } as never)}><Ionicons name="flash-outline" size={15} color="#374151" /><Text style={styles.quickMealText}>Quick log</Text></Pressable>
            <Pressable style={styles.addMealButton} onPress={() => router.push({ pathname: '/add-meal', params: { date: selectedDate } } as never)}><Ionicons name="add" size={18} color="#FFFFFF" /><Text style={styles.addMealText}>Add meal</Text></Pressable>
          </View>
        </View>


        {/* ----------------------------------------------------
            Empty state
            ---------------------------------------------------- */}

        {meals.length === 0 ? (

          <View style={styles.emptyCard}>

            <Text style={styles.emptyTitle}>
              No meals yet
            </Text>

            <Text style={styles.emptyText}>
              Add your first meal to start tracking.
            </Text>

          </View>

        ) : (

          /* --------------------------------------------------
             Display every meal
             -------------------------------------------------- */

          meals.map((meal) => {

            // Calculate nutrition for this individual meal.
            const mealMacros = calculateMealMacros(meal);


            return (
              <View
                key={meal.id}
                style={styles.mealCard}
              >

                {/* ============================================
                    Meal header
                    ============================================ */}

                <Pressable style={styles.mealHeader} onPress={() => setExpandedMealId((current) => current === meal.id ? null : meal.id)}>

                  {/* Meal name */}

                  <View style={styles.mealTitleBlock}>
                    <Text style={styles.mealName}>{meal.mealName}</Text>
                    <Text style={styles.mealCount}>{meal.quickMacros ? 'Quick entry' : `${meal.items.length} ${meal.items.length === 1 ? 'food' : 'foods'}`} · {expandedMealId === meal.id ? 'Tap to hide' : 'Tap for details'}</Text>
                  </View>


                  {/* Meal calorie total */}

                  <Text style={styles.mealCalories}>
                    {mealMacros.calories.toFixed(0)} kcal
                  </Text>

                  <Ionicons name={expandedMealId === meal.id ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" style={styles.mealChevron} />
                </Pressable>

                {expandedMealId === meal.id && <>

                <View style={styles.reorderRow}>
                  <Text style={styles.reorderLabel}>Meal order</Text>
                  <View style={styles.reorderActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Move ${meal.mealName} earlier`} disabled={meals[0]?.id === meal.id} style={[styles.reorderButton, meals[0]?.id === meal.id && styles.reorderButtonDisabled]} onPress={async () => { try { await moveMeal(db, meal.id, 'up'); await reloadMeals(); } catch (error) { console.error('Could not reorder meal:', error); Alert.alert('Could not reorder meal', 'Please try again.'); } }}>
                      <Ionicons name="arrow-up" size={16} color={meals[0]?.id === meal.id ? '#9CA3AF' : '#374151'} /><Text style={styles.reorderButtonText}>Earlier</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Move ${meal.mealName} later`} disabled={meals[meals.length - 1]?.id === meal.id} style={[styles.reorderButton, meals[meals.length - 1]?.id === meal.id && styles.reorderButtonDisabled]} onPress={async () => { try { await moveMeal(db, meal.id, 'down'); await reloadMeals(); } catch (error) { console.error('Could not reorder meal:', error); Alert.alert('Could not reorder meal', 'Please try again.'); } }}>
                      <Ionicons name="arrow-down" size={16} color={meals[meals.length - 1]?.id === meal.id ? '#9CA3AF' : '#374151'} /><Text style={styles.reorderButtonText}>Later</Text>
                    </Pressable>
                  </View>
                </View>

                {/* ============================================
                    Foods inside this meal
                    ============================================ */}

                <View style={styles.foodList}>

                  {meal.quickMacros && <Text style={styles.foodQuantity}>Nutrition entered as meal totals</Text>}

                  {meal.items.map((item) => (

                    <View
                      key={item.id}
                      style={styles.foodRow}
                    >

                      <View style={styles.foodInfo}>

                        {/* Food name */}

                        <Text style={styles.foodName}>
                          {item.food?.name ?? 'Unknown food'}
                        </Text>


                        {/* Amount consumed */}

                        <Text style={styles.foodQuantity}>
                          {item.quantity} g
                        </Text>

                      </View>


                      {/* ------------------------------------------------
                          Calories for this specific food
                          ------------------------------------------------

                          Food nutrition is stored for a particular
                          serving size.

                          Example:

                          Food serving = 100 g
                          Calories = 300

                          User ate = 50 g

                          Calories:

                          300 × (50 / 100)
                          = 150 kcal
                      */}

                      {item.food && (

                        <Text style={styles.foodCalories}>

                          {(
                            item.food.calories *
                            (
                              item.quantity /
                              item.food.servingSize
                            )
                          ).toFixed(0)}{' '}
                          kcal

                        </Text>

                      )}

                    </View>

                  ))}

                </View>


                {/* ============================================
                    Meal macros
                    ============================================ */}

                <View style={styles.mealMacroRow}>

                  <Macro
                    label="Protein"
                    value={`${mealMacros.protein.toFixed(1)}g`}
                  />

                  <Macro
                    label="Carbs"
                    value={`${mealMacros.carbs.toFixed(1)}g`}
                  />

                  <Macro
                    label="Fat"
                    value={`${mealMacros.fat.toFixed(1)}g`}
                  />

                  <Macro
                    label="Fibre"
                    value={`${mealMacros.fibre.toFixed(1)}g`}
                  />

                </View>


                {/* ============================================
                    EDIT MEAL BUTTON
                    ============================================ */}

                <Pressable
                  style={styles.editButton}

                  // Navigate to Add/Edit Meal screen.
                  //
                  // We pass the meal ID as a parameter.
                  //
                  // Because an editMealId is provided, the
                  // add-meal screen knows that it should load
                  // an existing meal instead of creating a new
                  // one.
                  onPress={() => {
                    router.push({
                      pathname: '/add-meal',
                      params: {
                        editMealId: meal.id,
                        date: selectedDate,
                      },
                    });
                  }}
                >

                  <Text style={styles.editButtonText}>
                    Edit Meal
                  </Text>

                </Pressable>


                {/* ============================================
                    DELETE MEAL BUTTON
                    ============================================ */}

                <Pressable
                  style={styles.deleteButton}

                  // When clicked, show the confirmation popup.
                  onPress={() =>
                    handleDeleteMeal(
                      meal.id,
                      meal.mealName
                    )
                  }
                >

                  <Text style={styles.deleteButtonText}>
                    Delete Meal
                  </Text>

                </Pressable>
                </>}

              </View>
            );
          })
        )}

      </View>

      <View style={styles.appFooter}>
        <Text style={styles.appFooterCredit}>Made by Mohan Sharma</Text>
        <Text style={styles.appFooterDetail}>Your tracking data stays on this device.</Text>
      </View>

    </ScrollView>
    </KeyboardAvoidingView>
  );
}


// ============================================================
// MacroCard Component
// ============================================================
//
// This is a reusable UI component.
//
// Instead of writing the same card design four times, we
// create one component and pass different values into it.
//
// Example:
//
// <MacroCard
//   label="Protein"
//   value="120 g"
// />
//
// The component then displays:
//
// Protein
// 120 g
//
function NutritionValue({ label, value }: { label: string; value: string }) {
  return <View style={styles.nutritionValue}><Text style={styles.nutritionLabel}>{label}</Text><Text style={styles.nutritionAmount}>{value}</Text></View>;
}

function InputRow({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType: 'decimal-pad' | 'number-pad' }) {
  return <View style={styles.inputRow}>
    <Text style={styles.rowLabel}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} style={styles.activityInput} />
  </View>;
}


// ============================================================
// Macro Component
// ============================================================
//
// This is a smaller version of MacroCard.
//
// It is used inside each meal to show:
//
// Protein    30g
// Carbs      50g
// Fat        15g
//
function Macro({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (
    <View style={styles.macro}>

      <Text style={styles.macroLabel}>
        {label}
      </Text>

      <Text style={styles.macroValue}>
        {value}
      </Text>

    </View>
  );
}


// ============================================================
// SCREEN STYLES
// ============================================================
//
// React Native doesn't use normal CSS files.
//
// Instead, styles are created using StyleSheet.create().
//
// Each property controls how a component looks or is positioned.
//
// Example:
//
// padding: 20
//
// means there should be 20 pixels of space inside the
// component around its content.
//
const styles = StyleSheet.create({
  datePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  dateButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  dateButtonText: { color: '#111827', fontSize: 25, fontWeight: '600', lineHeight: 29 },
  disabledDateText: { color: '#D1D5DB' },
  selectedDateButton: { flex: 1, minHeight: 46, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  selectedDateText: { flex: 1, color: '#111827', fontSize: 13, fontWeight: '600' },
  todayLink: { color: '#2563EB', fontWeight: '600', marginTop: 8, marginBottom: 4 },
  calendarBackdrop: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.42)', justifyContent: 'center', padding: 24 },
  calendarCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, width: '100%', maxWidth: 420, alignSelf: 'center' },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  calendarArrow: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F3F4F6' },
  calendarMonth: { color: '#111827', fontSize: 17, fontWeight: '700' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  calendarWeekday: { width: '14.2857%', height: 34, textAlign: 'center', textAlignVertical: 'center', color: '#9CA3AF', fontSize: 12, fontWeight: '600' },
  calendarCell: { width: '14.2857%', height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  calendarCellSelected: { backgroundColor: '#111827' },
  calendarCellToday: { borderWidth: 1, borderColor: '#4F7DF3' },
  calendarDayText: { color: '#374151', fontSize: 14 },
  calendarDayTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  calendarActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 12, paddingTop: 14 },
  calendarCancel: { paddingHorizontal: 14, paddingVertical: 10 },
  calendarCancelText: { color: '#6B7280', fontWeight: '600' },
  calendarToday: { backgroundColor: '#111827', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  calendarTodayText: { color: '#FFFFFF', fontWeight: '700' },
  chartTitle: { color: '#374151', fontWeight: '700', marginBottom: 4, marginTop: 5 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 130, marginBottom: 10 },
  chartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  chartValue: { color: '#6B7280', fontSize: 9, marginBottom: 3 },
  chartBar: { width: 16, minHeight: 4, borderRadius: 5, backgroundColor: '#4F7DF3' },
  selectedChartBar: { backgroundColor: '#1D4ED8', width: 20 },
  selectedChartValue: { color: '#1D4ED8', fontWeight: '700' },
  chartDate: { color: '#9CA3AF', fontSize: 9, marginTop: 4 },
  lineChart: { height: 104, width: '100%', position: 'relative', overflow: 'visible' },
  chartGuide: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#E5E7EB' },
  lineSegment: { position: 'absolute', height: 3, backgroundColor: '#4F7DF3', borderRadius: 2 },
  pointWrap: { position: 'absolute', width: 40, height: 40, alignItems: 'center' },
  pointValue: { color: '#4B5563', fontSize: 9, marginBottom: 2 },
  linePoint: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#4F7DF3' },
  selectedLinePoint: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: '#BFDBFE', backgroundColor: '#1D4ED8' },
  lineDateRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, marginBottom: 8 },
  chartHint: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 5 },
  nutritionCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  calorieSummary: { paddingBottom: 10 },
  calorieLabel: { color: '#6B7280', fontSize: 13 },
  calorieValue: { color: '#111827', fontSize: 27, fontWeight: '700', marginTop: 2 },
  calorieUnit: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
  nutritionDivider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 12 },
  nutritionMacros: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 10 },
  nutritionValue: { minWidth: '23%' },
  nutritionLabel: { color: '#9CA3AF', fontSize: 11 },
  nutritionAmount: { color: '#374151', fontSize: 13, fontWeight: '700', marginTop: 2 },
  activitySummary: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12 },
  summaryLabel: { color: '#6B7280', fontSize: 12 },
  summaryValue: { color: '#111827', fontWeight: '700', marginTop: 4 },
  activityActions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  workoutLink: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 9, paddingVertical: 10 },
  workoutLinkText: { color: '#374151', fontSize: 12, fontWeight: '600' },
  mealsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  mealActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reorderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  reorderLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  reorderActions: { flexDirection: 'row', gap: 8 },
  reorderButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F3F4F6' },
  reorderButtonDisabled: { opacity: 0.55 },
  reorderButtonText: { color: '#374151', fontSize: 12, fontWeight: '600' },
  quickMealButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 8, marginBottom: 10 },
  quickMealText: { color: '#374151', fontSize: 11, fontWeight: '700' },
  addMealButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: '#111827', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, marginBottom: 10 },
  addMealText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  // ----------------------------------------------------------
  // Main ScrollView
  // ----------------------------------------------------------

  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },


  // ----------------------------------------------------------
  // Content inside the ScrollView
  // ----------------------------------------------------------

  content: {
    padding: 20,

    // Extra space at the top.
    paddingTop: 70,

    // Extra space at the bottom so the final content isn't
    // directly against the edge of the screen.
    paddingBottom: 40,
  },
  appFooter: { alignItems: 'center', marginTop: 12, paddingTop: 16, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  appFooterCredit: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  appFooterDetail: { color: '#9CA3AF', fontSize: 11, marginTop: 4 },


  // ----------------------------------------------------------
  // Loading screen
  // ----------------------------------------------------------

  loading: {
    flex: 1,

    // Center loading spinner vertically.
    justifyContent: 'center',

    // Center loading spinner horizontally.
    alignItems: 'center',
  },


  // ----------------------------------------------------------
  // Main title
  // ----------------------------------------------------------

  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#111827',
  },


  // ----------------------------------------------------------
  // Date text
  // ----------------------------------------------------------

  date: {
    marginTop: 5,
    marginBottom: 8,
    fontSize: 14,
    color: '#6B7280',
  },


  // ----------------------------------------------------------
  // Section titles
  // ----------------------------------------------------------

  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    marginTop: 10,
  },


  // ----------------------------------------------------------
  // Nutrition card grid
  // ----------------------------------------------------------

  // ----------------------------------------------------------
  // Small macro label
  // ----------------------------------------------------------

  macroLabel: {
    fontSize: 14,
    color: '#6B7280',
  },


  // ----------------------------------------------------------
  // Macro value
  // ----------------------------------------------------------

  macroValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },


  // ----------------------------------------------------------
  // Generic information card
  // ----------------------------------------------------------

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,

    borderWidth: 1,
    borderColor: '#E5E7EB',
  },


  // Left side of a row
  rowLabel: {
    color: '#6B7280',
    fontSize: 15,
  },


  // Right side of a row
  rowValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
  },

  inputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  activityInput: { minWidth: 112, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, color: '#111827', textAlign: 'right', backgroundColor: '#F9FAFB' },
  workoutToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 4 },
  notesLabel: { marginTop: 8 },
  notesInput: { minHeight: 74, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 10, color: '#111827', textAlignVertical: 'top', backgroundColor: '#F9FAFB' },
  activitySaveButton: { marginTop: 14, backgroundColor: '#111827', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  activitySaveText: { color: '#FFFFFF', fontWeight: '700' },
  disabledButton: { opacity: 0.6 },
  loadError: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F7F8FA' },
  loadErrorTitle: { color: '#111827', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  loadErrorText: { color: '#6B7280', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },


  // ----------------------------------------------------------
  // Meals section
  // ----------------------------------------------------------

  section: {
    marginTop: 24,
  },


  // ----------------------------------------------------------
  // Individual meal card
  // ----------------------------------------------------------

  mealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,

    borderWidth: 1,
    borderColor: '#E5E7EB',
  },


  // ----------------------------------------------------------
  // Meal header
  // ----------------------------------------------------------

  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',

    // Meal name on left, calories on right.
    justifyContent: 'space-between',

    minHeight: 38,
  },

  mealTitleBlock: { flex: 1 },
  mealCount: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },
  mealChevron: { marginLeft: 8 },


  // Meal name
  mealName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },


  // Meal calories
  mealCalories: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },


  // ----------------------------------------------------------
  // Food list
  // ----------------------------------------------------------

  foodList: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },


  // ----------------------------------------------------------
  // Individual food row
  // ----------------------------------------------------------

  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',

    // Food information on left and calories on right.
    justifyContent: 'space-between',

    paddingVertical: 6,

    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },


  // Food name + quantity container
  foodInfo: {
    flex: 1,
  },


  // Food name
  foodName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },


  // Food quantity
  foodQuantity: {
    marginTop: 2,
    fontSize: 12,
    color: '#9CA3AF',
  },


  // Food calories
  foodCalories: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },


  // ----------------------------------------------------------
  // Meal macro row
  // ----------------------------------------------------------

  mealMacroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },


  // ----------------------------------------------------------
  // Empty meals card
  // ----------------------------------------------------------

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,

    alignItems: 'center',

    borderWidth: 1,
    borderColor: '#E5E7EB',
  },


  // Empty state title
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },


  // Empty state description
  emptyText: {
    marginTop: 8,
    textAlign: 'center',
    color: '#6B7280',
    lineHeight: 20,
  },


  // ----------------------------------------------------------
  // Small macro container used inside a meal
  // ----------------------------------------------------------

  macro: {
    alignItems: 'flex-start',
  },


  // ----------------------------------------------------------
  // Delete button
  // ----------------------------------------------------------

  deleteButton: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 10,

    borderWidth: 1,
    borderColor: '#FCA5A5',

    alignItems: 'center',
  },


  // Delete button text
  deleteButtonText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },


  // ----------------------------------------------------------
  // Edit button
  // ----------------------------------------------------------

  editButton: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 10,

    borderWidth: 1,
    borderColor: '#D1D5DB',

    alignItems: 'center',
  },


  // Edit button text
  editButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },

});
