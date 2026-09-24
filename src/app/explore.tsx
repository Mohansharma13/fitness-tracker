import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { createCsvExportFile } from '../services/csvExportService';

const sections = [
  { title: 'Tracking', items: [
    { title: 'Weekly tracking averages', detail: 'Calories, macros, weight, and steps', icon: 'stats-chart-outline' as const, route: '/history' },
  ] },
  { title: 'App', items: [
    { title: 'Backup & restore', detail: 'Save or recover your data', icon: 'cloud-upload-outline' as const, route: '/backup' },
  ] },
];

export default function MoreScreen() {
  const db = useSQLiteContext();
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      const file = await createCsvExportFile(db);
      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('Sharing is unavailable', 'This device cannot share files from the app right now.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Fitness Tracker data',
        UTI: 'public.comma-separated-values-text',
      });
      Alert.alert('Export ready', `${file.filename} contains ${file.rowCount} records and can be opened in Excel or Sheets.`);
    } catch (error) {
      console.error('Failed to export tracker data:', error);
      Alert.alert('Could not export data', 'Please check your device storage and try again.');
    } finally {
      setExporting(false);
    }
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.title}>More</Text>
    <Text style={styles.subtitle}>Weekly averages, export, and backup</Text>
    {sections.map((section) => <View key={section.title}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.group}>{section.items.map((item, index) => <Pressable key={item.route} style={[styles.row, index > 0 && styles.divided]} onPress={() => router.push(item.route as never)}>
        <View style={styles.icon}><Ionicons name={item.icon} size={19} color="#25634C" /></View>
        <View style={styles.copy}><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.detail}>{item.detail}</Text></View>
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </Pressable>)}</View>
    </View>)}
    <View>
      <Text style={styles.sectionTitle}>Data</Text>
      <View style={styles.group}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: exporting }} disabled={exporting} style={styles.row} onPress={() => void exportData()}>
          <View style={styles.icon}><Ionicons name="document-text-outline" size={19} color="#25634C" /></View>
          <View style={styles.copy}><Text style={styles.itemTitle}>Export data to Excel</Text><Text style={styles.detail}>Save a CSV file with your tracking history</Text></View>
          {exporting ? <ActivityIndicator color="#25634C" /> : <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />}
        </Pressable>
      </View>
    </View>
    <Text style={styles.footnote}>Your tracker data is stored on this device.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 18, paddingTop: 56, paddingBottom: 40 }, title: { color: '#111827', fontSize: 29, fontWeight: '700' }, subtitle: { color: '#6B7280', marginTop: 4, marginBottom: 18 }, sectionTitle: { color: '#6B7280', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 14, marginBottom: 7, marginLeft: 3 }, group: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 12 }, row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 }, divided: { borderTopWidth: 1, borderTopColor: '#F1F3F5' }, icon: { height: 36, width: 36, borderRadius: 11, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, itemTitle: { color: '#111827', fontWeight: '600', fontSize: 15 }, detail: { color: '#6B7280', fontSize: 12, marginTop: 3 }, footnote: { color: '#9CA3AF', textAlign: 'center', marginTop: 20, fontSize: 12 } });
