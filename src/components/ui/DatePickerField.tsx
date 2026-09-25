import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTodayDate } from '../../utils/date';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimumDate?: string;
  maximumDate?: string;
  disabled?: boolean;
};

export function DatePickerField({ label, value, onChange, minimumDate, maximumDate = getTodayDate(), disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const days = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    const leading = new Date(year, monthNumber - 1, 1).getDay();
    const count = new Date(year, monthNumber, 0).getDate();
    return [...Array.from({ length: leading }, () => ''), ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)];
  }, [month]);

  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const nextMonthAllowed = nextMonth <= maximumDate.slice(0, 7);

  const chooseDate = (date: string) => {
    onChange(date);
    setOpen(false);
  };

  return <>
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${formatDate(value)}. Choose date`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => { setMonth(value.slice(0, 7)); setOpen(true); }} style={[styles.button, disabled && styles.disabled]}>
        <Ionicons name="calendar-outline" size={17} color="#25634C" />
        <Text style={styles.value}>{formatDate(value)}</Text>
        <Ionicons name="chevron-down" size={15} color="#6B7280" />
      </Pressable>
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close date picker" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
        <View style={styles.modalCard}>
          <View style={styles.modalTitleRow}>
            <View style={styles.modalTitleIcon}><Ionicons name="calendar" size={18} color="#25634C" /></View>
            <View style={styles.modalTitleCopy}><Text style={styles.modalTitle}>{label}</Text><Text style={styles.modalSubtitle}>Select a date</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close date picker" onPress={() => setOpen(false)} style={styles.closeButton}><Ionicons name="close" size={19} color="#6B7280" /></Pressable>
          </View>
          <View style={styles.monthHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(previousMonth)} style={styles.monthArrow}><Ionicons name="chevron-back" size={18} color="#374151" /></Pressable>
            <Text style={styles.monthText}>{formatMonth(month)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={!nextMonthAllowed} onPress={() => setMonth(nextMonth)} style={[styles.monthArrow, !nextMonthAllowed && styles.disabled]}><Ionicons name="chevron-forward" size={18} color="#374151" /></Pressable>
          </View>
          <View style={styles.grid}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}
            {days.map((date, index) => {
              if (!date) return <View key={`empty-${index}`} style={styles.dayCell} />;
              const disabled = date > maximumDate || (minimumDate != null && date < minimumDate);
              const selected = date === value;
              const isToday = date === getTodayDate();
              return <Pressable key={date} accessibilityRole="button" accessibilityLabel={formatDate(date)} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => chooseDate(date)} style={[styles.dayCell, selected && styles.selectedCell, isToday && !selected && styles.todayCell, disabled && styles.disabled]}>
                <Text style={[styles.dayText, selected && styles.selectedText, disabled && styles.disabledText]}>{Number(date.slice(-2))}</Text>
              </Pressable>;
            })}
          </View>
          <View style={styles.footer}>
            <Text style={styles.selectedDate}>{formatDate(value)}</Text>
            <Pressable accessibilityRole="button" onPress={() => chooseDate(getTodayDate())} disabled={getTodayDate() > maximumDate || (minimumDate != null && getTodayDate() < minimumDate)} style={[styles.todayButton, (getTodayDate() > maximumDate || (minimumDate != null && getTodayDate() < minimumDate)) && styles.disabled]}><Text style={styles.todayText}>Today</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 0 }, label: { color: '#4B5563', fontSize: 11, fontWeight: '700', marginBottom: 5 },
  button: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10 },
  value: { color: '#111827', fontSize: 12, fontWeight: '600', flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.42)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: '#FFF', borderRadius: 18, padding: 16, elevation: 8 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, modalTitleIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center' },
  modalTitleCopy: { flex: 1 }, modalTitle: { color: '#111827', fontWeight: '700', fontSize: 15 }, modalSubtitle: { color: '#6B7280', fontSize: 11, marginTop: 2 },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderRadius: 10 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 8 }, monthArrow: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }, monthText: { color: '#111827', fontWeight: '700', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.2857%', textAlign: 'center', color: '#9CA3AF', fontSize: 10, fontWeight: '700', paddingVertical: 8 },
  dayCell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, dayText: { color: '#374151', fontSize: 13 }, selectedCell: { backgroundColor: '#25634C' }, selectedText: { color: '#FFF', fontWeight: '700' }, todayCell: { backgroundColor: '#EAF4EF' }, disabled: { opacity: 0.35 }, disabledText: { color: '#9CA3AF' },
  footer: { borderTopWidth: 1, borderTopColor: '#F1F3F5', marginTop: 10, paddingTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectedDate: { color: '#6B7280', fontSize: 12 }, todayButton: { backgroundColor: '#EAF4EF', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9 }, todayText: { color: '#1D513D', fontWeight: '700', fontSize: 12 },
});
