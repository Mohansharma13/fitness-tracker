import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { createCsvExportFile, saveCsvExportToDirectory } from '../services/csvExportService';

type ExportFile = Awaited<ReturnType<typeof createCsvExportFile>>;

export default function ExportScreen() {
  const db = useSQLiteContext();
  const [exportFile, setExportFile] = useState<ExportFile | null>(null);
  const [busyAction, setBusyAction] = useState<'create' | 'share' | 'download' | null>(null);
  const busy = busyAction !== null;

  const createReport = async () => {
    try {
      setBusyAction('create');
      const file = await createCsvExportFile(db);
      setExportFile(file);
      Alert.alert('Report is ready', `${file.filename} contains ${file.rowCount} date-wise rows and can be opened in Excel or Sheets.`);
    } catch (error) {
      console.error('Failed to create daily report:', error);
      Alert.alert('Could not create report', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyAction(null);
    }
  };

  const shareReport = async () => {
    if (!exportFile) return;
    try {
      setBusyAction('share');
      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('Sharing is unavailable', 'This device cannot share files from the app right now.');
        return;
      }
      await Sharing.shareAsync(exportFile.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Share Fitness Tracker daily report',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      console.error('Failed to share daily report:', error);
      Alert.alert('Could not share report', 'Please create the report again and retry.');
    } finally {
      setBusyAction(null);
    }
  };

  const downloadReport = async () => {
    if (!exportFile) return;
    try {
      setBusyAction('download');
      if (Platform.OS === 'android') {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const saved = await saveCsvExportToDirectory(exportFile, permission.directoryUri);
        Alert.alert('Download complete', `${saved.filename}\n\n${saved.rowCount} date-wise rows were saved to your selected folder.`);
        return;
      }
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([exportFile.contents], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = exportFile.filename;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('Saving is unavailable', 'This device cannot open the save or share menu right now.');
        return;
      }
      await Sharing.shareAsync(exportFile.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Save Fitness Tracker daily report',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      console.error('Failed to download daily report:', error);
      Alert.alert('Could not download report', error instanceof Error ? error.message : 'Please try again and choose a folder with write access.');
    } finally {
      setBusyAction(null);
    }
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/explore')}><Text style={styles.back}>‹  More</Text></Pressable>
    <Text style={styles.title}>Export daily report</Text>
    <Text style={styles.subtitle}>Create a date-by-date CSV you can open in Excel or Sheets.</Text>

    <View style={styles.card}>
      <View style={styles.icon}><Text style={styles.iconText}>↓</Text></View>
      <Text style={styles.heading}>Daily tracking report</Text>
      <Text style={styles.body}>One row per date with calories, protein, carbohydrates, fat, fibre, workout details, body weight, steps, and notes.</Text>
      <Pressable accessibilityRole="button" onPress={createReport} disabled={busy} style={[styles.primaryButton, busy && styles.disabled]}>
        {busyAction === 'create' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>{exportFile ? 'Create a fresh report' : 'Create report'}</Text>}
      </Pressable>
      {exportFile && <View style={styles.fileCard}>
        <Text style={styles.fileName}>{exportFile.filename}</Text>
        <Text style={styles.fileMeta}>{exportFile.rowCount} dates · Excel-compatible CSV</Text>
        <Pressable accessibilityRole="button" onPress={shareReport} disabled={busy} style={[styles.shareButton, busy && styles.disabled]}>
          {busyAction === 'share' ? <ActivityIndicator color="#1D4ED8" /> : <Text style={styles.shareText}>Share report</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={downloadReport} disabled={busy} style={[styles.downloadButton, busy && styles.disabled]}>
          {busyAction === 'download' ? <ActivityIndicator color="#166534" /> : <Text style={styles.downloadText}>{Platform.OS === 'android' ? 'Download to device' : Platform.OS === 'web' ? 'Download to device' : 'Save to Files or share'}</Text>}
        </Pressable>
      </View>}
    </View>
    <Text style={styles.footnote}>Weight is shown in kilograms. Blank cells mean no value was recorded for that date.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 18, paddingTop: 52, paddingBottom: 40 },
  back: { color: '#25634C', fontWeight: '600', marginBottom: 15 },
  title: { color: '#111827', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#6B7280', marginTop: 4, marginBottom: 17 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 15, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  iconText: { color: '#25634C', fontSize: 20, fontWeight: '700' },
  heading: { color: '#111827', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  body: { color: '#6B7280', lineHeight: 19, marginVertical: 4, fontSize: 13 },
  primaryButton: { backgroundColor: '#25634C', borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 45, padding: 12, marginTop: 11 },
  primaryText: { color: '#FFF', fontWeight: '700' },
  fileCard: { marginTop: 12, padding: 11, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  fileName: { color: '#1F2937', fontWeight: '700', fontSize: 13 },
  fileMeta: { color: '#6B7280', fontSize: 12, marginTop: 3 },
  shareButton: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 9, alignItems: 'center', justifyContent: 'center', minHeight: 43, padding: 10, marginTop: 11 },
  shareText: { color: '#1D4ED8', fontWeight: '700' },
  downloadButton: { backgroundColor: '#ECFDF3', borderWidth: 1, borderColor: '#A6F4C5', borderRadius: 9, alignItems: 'center', justifyContent: 'center', minHeight: 43, padding: 10, marginTop: 8 },
  downloadText: { color: '#166534', fontWeight: '700' },
  disabled: { opacity: 0.55 },
  footnote: { color: '#9CA3AF', textAlign: 'center', marginHorizontal: 12, marginTop: 2, fontSize: 12, lineHeight: 17 },
});
