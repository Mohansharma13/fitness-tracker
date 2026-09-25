import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { createBackupFile, importBackup, saveBackupToDirectory, validateBackup } from '../services/backupService';

type BackupFile = Awaited<ReturnType<typeof createBackupFile>>;

async function readPickedBackup(file: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web' && file.file) return file.file.text();

  try {
    return await new File(file.uri).text();
  } catch (originalError) {
    if (Platform.OS !== 'android') throw originalError;

    // A few Android document providers return a URI without a persistent read
    // grant. Ask for access to the containing folder and read its SAF URI.
    const access = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!access.granted) throw new Error('File access was not granted. Try uploading the backup again and allow access to its folder.');

    const decodeName = (value: string) => {
      try { return decodeURIComponent(value).toLocaleLowerCase(); } catch { return value.toLocaleLowerCase(); }
    };
    const wantedName = decodeName(file.name);
    const folderFiles = await FileSystem.StorageAccessFramework.readDirectoryAsync(access.directoryUri);
    const matchingUri = folderFiles.find((uri) => decodeName(uri).endsWith(wantedName));
    if (!matchingUri) throw new Error(`Could not find ${file.name} in the folder you selected. Choose the folder containing that backup file.`);
    return await new File(matchingUri).text();
  }
}

export default function BackupScreen() {
  const db = useSQLiteContext();
  const [json, setJson] = useState('');
  const [backupFile, setBackupFile] = useState<BackupFile | null>(null);
  const [restoreFileName, setRestoreFileName] = useState<string | null>(null);
  const [restoreRecordCount, setRestoreRecordCount] = useState<number | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<'export' | 'share' | 'save' | 'pick' | 'restore' | null>(null);

  const createExport = async () => {
    try {
      setBusy(true);
      setBusyAction('export');
      const file = await createBackupFile(db);
      setBackupFile(file);
      Alert.alert('Backup is ready', `${file.filename} contains ${file.recordCount} records. Share it to save a copy outside the app.`);
    } catch (error) {
      console.error('Failed to create backup:', error);
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not create a backup.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const shareExport = async () => {
    if (!backupFile) return;
    try {
      setBusy(true);
      setBusyAction('share');
      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('Sharing is unavailable', 'This device cannot share files from the app right now.');
        return;
      }
      await Sharing.shareAsync(backupFile.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Save Fitness Tracker backup',
        UTI: 'public.json',
      });
    } catch (error) {
      console.error('Failed to share backup:', error);
      Alert.alert('Could not share backup', 'Please create the backup again and retry.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const saveToDevice = async () => {
    try {
      setBusy(true);
      setBusyAction('save');
      if (Platform.OS !== 'android') {
        const file = await createBackupFile(db);
        setBackupFile(file);
        if (!await Sharing.isAvailableAsync()) {
          Alert.alert('Sharing is unavailable', 'This device cannot share files from the app right now.');
          return;
        }
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Save Fitness Tracker backup',
          UTI: 'public.json',
        });
        return;
      }
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return;
      const saved = await saveBackupToDirectory(db, permission.directoryUri);
      Alert.alert('Backup saved', `${saved.filename}\n\n${saved.recordCount} records were saved to the folder you selected.`);
    } catch (error) {
      console.error('Failed to save backup to device:', error);
      Alert.alert('Could not save backup', error instanceof Error ? error.message : 'Choose a writable folder and try again.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const chooseBackupFile = async () => {
    try {
      setBusy(true);
      setBusyAction('pick');
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file) throw new Error('No file was selected. Choose a Fitness Tracker backup ending in .json.');
      if (file.size != null && file.size > 50 * 1024 * 1024) {
        Alert.alert('Backup file is too large', 'Choose a backup file smaller than 50 MB.');
        return;
      }
      const content = await readPickedBackup(file);
      const data = validateBackup(content);
      const count = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
      setJson(content);
      setRestoreFileName(file.name);
      setRestoreRecordCount(count);
    } catch (error) {
      console.error('Could not read backup file:', error);
      Alert.alert('Could not upload backup', error instanceof Error ? error.message : 'Choose a valid Fitness Tracker JSON backup ending in .json.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const restore = () => {
    try {
      const data = validateBackup(json);
      const count = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
      const warning = mode === 'replace'
        ? 'This will replace all tracker data currently on this device.'
        : 'This adds missing records and restores saved app preferences.';
      Alert.alert(mode === 'replace' ? 'Replace local data?' : 'Merge backup?', `${count} records found. ${warning}`, [
        { text: 'Cancel', style: 'cancel' },
        { text: mode === 'replace' ? 'Replace data' : 'Merge data', style: mode === 'replace' ? 'destructive' : 'default', onPress: async () => {
          try {
            setBusy(true);
            setBusyAction('restore');
            await importBackup(db, json, mode);
            Alert.alert('Restore complete', `${count} backup records were processed.`);
            setJson('');
            setRestoreFileName(null);
            setRestoreRecordCount(null);
          } catch (error) {
            console.error('Failed to restore backup:', error);
            Alert.alert('Restore failed', error instanceof Error ? error.message : 'No data was imported.');
          } finally {
            setBusy(false);
            setBusyAction(null);
          }
        } },
      ]);
    } catch (error) {
      Alert.alert('Invalid backup', error instanceof Error ? error.message : 'Check the selected file or pasted JSON.');
    }
  };

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Pressable accessibilityRole="button" onPress={() => router.replace('/explore')}><Text style={styles.back}>‹  More</Text></Pressable>
      <Text style={styles.title}>Backup & restore</Text>
      <Text style={styles.subtitle}>Move your tracker data safely to another device.</Text>

      <View style={styles.card}>
        <View style={styles.sectionIcon}><Text style={styles.sectionIconText}>↑</Text></View>
        <Text style={styles.heading}>Save a backup</Text>
        <Text style={styles.body}>Create a JSON file with your logs, foods, routines, settings, and saved order. Keep a copy somewhere outside the app.</Text>
        <Pressable accessibilityRole="button" onPress={createExport} disabled={busy} style={[styles.button, busy && styles.disabled]}>
          {busyAction === 'export' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{backupFile ? 'Create a new backup' : 'Create backup file'}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={saveToDevice} disabled={busy} style={[styles.deviceButton, busy && styles.disabled]}>
          {busyAction === 'save' ? <ActivityIndicator color="#166534" /> : <Text style={styles.deviceButtonText}>{Platform.OS === 'android' ? 'Save backup to device' : 'Save to Files or share'}</Text>}
        </Pressable>
        <Text style={styles.saveHint}>{Platform.OS === 'android' ? 'Choose a folder on your device. A new backup file will be saved there.' : 'Use the share menu to save a copy in Files or another location.'}</Text>
        {backupFile && <View style={styles.fileCard}>
          <Text style={styles.fileName}>{backupFile.filename}</Text>
          <Text style={styles.fileMeta}>{backupFile.recordCount} records · JSON backup</Text>
          <Pressable accessibilityRole="button" onPress={shareExport} disabled={busy} style={styles.secondaryButton}><Text style={styles.secondaryText}>Share or save file</Text></Pressable>
        </View>}
      </View>

      <View style={styles.card}>
        <View style={[styles.sectionIcon, styles.restoreIcon]}><Text style={[styles.sectionIconText, styles.restoreIconText]}>↓</Text></View>
        <Text style={styles.heading}>Restore a backup</Text>
        <Text style={styles.body}>Upload a Fitness Tracker backup (.json) from your device, or paste its JSON text below.</Text>
        <Pressable accessibilityRole="button" onPress={chooseBackupFile} disabled={busy} style={[styles.chooseButton, busy && styles.disabled]}>
          {busyAction === 'pick' ? <ActivityIndicator color="#25634C" /> : <Text style={styles.chooseButtonText}>{restoreFileName ? 'Choose a different backup' : 'Upload backup file'}</Text>}
        </Pressable>
        {restoreFileName && <View style={styles.fileStatus}><Text style={styles.fileStatusTitle}>Backup loaded</Text><Text style={styles.fileStatusText}>{restoreFileName} · {restoreRecordCount} records</Text></View>}
        <Text style={styles.orLabel}>OR PASTE JSON</Text>
        <TextInput
          value={json}
          onChangeText={(value) => { setJson(value); setRestoreFileName(null); setRestoreRecordCount(null); }}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Paste backup JSON"
          placeholder="Paste backup JSON here"
          style={styles.jsonInput}
        />
        <Text style={styles.label}>Restore mode</Text>
        <View style={styles.modeRow}>
          <Choice label="Merge" detail="Add missing records" active={mode === 'merge'} onPress={() => setMode('merge')} />
          <Choice label="Replace all" detail="Overwrite device data" active={mode === 'replace'} onPress={() => setMode('replace')} destructive />
        </View>
        <Text style={[styles.modeHint, mode === 'replace' && styles.replaceHint]}>{mode === 'merge' ? 'Existing records are kept. Matching IDs are not duplicated.' : 'This erases current tracker data before restoring the selected backup.'}</Text>
        <Pressable accessibilityRole="button" onPress={restore} disabled={busy || !json.trim()} style={[styles.button, (!json.trim() || busy) && styles.disabled, mode === 'replace' && styles.replaceButton]}>
          {busyAction === 'restore' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{mode === 'replace' ? 'Replace and restore' : 'Merge and restore'}</Text>}
        </Pressable>
      </View>
      <Text style={styles.privacy}>Backup files contain personal health data. Store them somewhere private.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function Choice({ label, detail, active, destructive = false, onPress }: { label: string; detail: string; active: boolean; destructive?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.choice, active && (destructive ? styles.choiceDestructiveActive : styles.choiceActive)]}>
    <Text style={[styles.choiceText, active && (destructive ? styles.choiceDestructiveText : styles.choiceActiveText)]}>{label}</Text>
    <Text style={styles.choiceDetail}>{detail}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 18, paddingTop: 52, paddingBottom: 40 },
  back: { color: '#25634C', fontWeight: '600', marginBottom: 15 },
  title: { color: '#111827', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#6B7280', marginTop: 4, marginBottom: 17 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 15, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  sectionIcon: { width: 33, height: 33, borderRadius: 10, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  sectionIconText: { color: '#25634C', fontSize: 20, fontWeight: '700' },
  restoreIcon: { backgroundColor: '#EEF2FF' },
  restoreIconText: { color: '#4F46E5' },
  heading: { color: '#111827', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  body: { color: '#6B7280', lineHeight: 19, marginVertical: 4, fontSize: 13 },
  button: { backgroundColor: '#25634C', borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 45, padding: 12, marginTop: 11 },
  buttonText: { color: '#FFF', fontWeight: '700' },
  secondaryButton: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 9, alignItems: 'center', padding: 11, marginTop: 9 },
  secondaryText: { color: '#1D4ED8', fontWeight: '700' },
  deviceButton: { backgroundColor: '#ECFDF3', borderWidth: 1, borderColor: '#A6F4C5', borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 45, padding: 12, marginTop: 9 },
  deviceButtonText: { color: '#166534', fontWeight: '700' },
  saveHint: { color: '#6B7280', fontSize: 11, lineHeight: 16, marginTop: 6 },
  fileCard: { marginTop: 11, padding: 11, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  fileName: { color: '#1F2937', fontWeight: '700', fontSize: 13 },
  fileMeta: { color: '#6B7280', fontSize: 12, marginTop: 3 },
  chooseButton: { backgroundColor: '#F0F7F3', borderWidth: 1, borderColor: '#B7D6C6', borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: 11, marginTop: 10 },
  chooseButtonText: { color: '#25634C', fontWeight: '700' },
  fileStatus: { marginTop: 9, padding: 10, backgroundColor: '#F0F7F3', borderRadius: 9 },
  fileStatusTitle: { color: '#1F513E', fontSize: 12, fontWeight: '700' },
  fileStatusText: { color: '#52665C', fontSize: 12, marginTop: 3 },
  orLabel: { color: '#9CA3AF', fontWeight: '700', fontSize: 10, letterSpacing: 0.7, textAlign: 'center', marginTop: 14 },
  jsonInput: { minHeight: 112, maxHeight: 220, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 11, color: '#111827', backgroundColor: '#FAFAFA', marginTop: 8 },
  label: { color: '#374151', fontWeight: '600', marginTop: 14, marginBottom: 8, fontSize: 13 },
  modeRow: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 11, paddingVertical: 10, borderRadius: 9, backgroundColor: '#FFF' },
  choiceText: { color: '#374151', fontWeight: '700', fontSize: 13 },
  choiceDetail: { color: '#6B7280', fontSize: 10, marginTop: 3 },
  choiceActive: { backgroundColor: '#EAF4EF', borderColor: '#25634C' },
  choiceActiveText: { color: '#1D513D' },
  choiceDestructiveActive: { backgroundColor: '#FEF2F2', borderColor: '#DC2626' },
  choiceDestructiveText: { color: '#B42318' },
  modeHint: { color: '#6B7280', fontSize: 12, lineHeight: 17, marginTop: 8 },
  replaceHint: { color: '#B42318' },
  replaceButton: { backgroundColor: '#B42318' },
  disabled: { opacity: 0.55 },
  privacy: { color: '#9CA3AF', fontSize: 12, textAlign: 'center', marginHorizontal: 12, marginTop: 2 },
});
