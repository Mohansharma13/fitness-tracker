import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { exportBackup, importBackup, validateBackup } from '../services/backupService';

export default function BackupScreen() {
  const db = useSQLiteContext();
  const [json, setJson] = useState('');
  const [exportJson, setExportJson] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false);
  const [backupReady, setBackupReady] = useState(false);
  const createExport = async () => {
    try { setBusy(true); setExportJson(await exportBackup(db)); setBackupReady(true); Alert.alert('Backup is ready', 'Use Share backup to save it to Files, cloud storage, or another safe place.'); }
    catch (error) { console.error(error); Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not create a backup.'); }
    finally { setBusy(false); }
  };
  const shareExport = async () => {
    if (!backupReady || !exportJson) return Alert.alert('Create a backup first', 'Generate a backup before sharing it.');
    try { await Share.share({ title: 'Fitness Tracker backup', message: exportJson }); }
    catch (error) { console.error(error); Alert.alert('Could not share backup', 'Please create the backup again and retry.'); }
  };
  const restore = () => {
    try {
      const data = validateBackup(json);
      const count = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
      const warning = mode === 'replace' ? 'This replaces all local tracker data.' : 'Rows with matching IDs are kept; saved app preferences are restored.';
      Alert.alert(mode === 'replace' ? 'Replace local data?' : 'Merge backup?', `${count} records found. ${warning}`, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Continue', style: mode === 'replace' ? 'destructive' : 'default', onPress: async () => {
          try { setBusy(true); await importBackup(db, json, mode); Alert.alert('Restore complete', 'Your backup data has been restored.'); setJson(''); }
          catch (error) { console.error(error); Alert.alert('Restore failed', error instanceof Error ? error.message : 'No data was imported.'); }
          finally { setBusy(false); }
        } },
      ]);
    } catch (error) { Alert.alert('Invalid backup', error instanceof Error ? error.message : 'Check the pasted JSON.'); }
  };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable accessibilityRole="button" onPress={() => router.replace('/explore')}><Text style={styles.back}>‹  More</Text></Pressable>
    <Text style={styles.title}>Backup & restore</Text><Text style={styles.subtitle}>Move your tracker data safely to another device.</Text>
    <View style={styles.card}>
      <Text style={styles.heading}>Save a backup</Text><Text style={styles.body}>Create a private copy of your logs, saved foods, routines, and settings. Keep it somewhere outside the app.</Text>
      <Pressable onPress={createExport} disabled={busy} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{backupReady ? 'Create new backup' : 'Create backup'}</Text>}</Pressable>
      {backupReady && <Pressable onPress={shareExport} disabled={busy} style={styles.secondaryButton}><Text style={styles.secondaryText}>Share or save backup</Text></Pressable>}
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>Restore a backup</Text><Text style={styles.body}>Paste a backup JSON below, then choose how it should be applied.</Text>
      <TextInput value={json} onChangeText={setJson} multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false} placeholder="Paste backup JSON here" style={styles.jsonInput} />
      <Text style={styles.label}>Restore mode</Text><View style={styles.row}>
        <Choice label="Merge" active={mode === 'merge'} onPress={() => setMode('merge')} /><Choice label="Replace all" active={mode === 'replace'} onPress={() => setMode('replace')} />
      </View>
      <Text style={styles.modeHint}>{mode === 'merge' ? 'Adds missing records and restores app preferences. Existing log IDs are preserved.' : 'Deletes current tracker data, then restores everything in this backup.'}</Text>
      <Pressable onPress={restore} disabled={busy || !json.trim()} style={[styles.button, (!json.trim() || busy) && styles.disabled]}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Validate and restore</Text>}</Pressable>
    </View>
    <Text style={styles.privacy}>Backup files contain personal health data. Store them somewhere private.</Text>
  </ScrollView>;
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.choice, active && styles.active]}><Text style={[styles.choiceText, active && styles.activeText]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 18, paddingTop: 52, paddingBottom: 40 }, back: { color: '#25634C', fontWeight: '600', marginBottom: 15 }, title: { color: '#111827', fontSize: 28, fontWeight: '700' }, subtitle: { color: '#6B7280', marginTop: 4, marginBottom: 17 }, card: { backgroundColor: '#FFF', borderRadius: 14, padding: 15, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 }, heading: { color: '#111827', fontSize: 17, fontWeight: '700', marginBottom: 4 }, body: { color: '#6B7280', lineHeight: 19, marginVertical: 4, fontSize: 13 }, button: { backgroundColor: '#25634C', borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 45, padding: 12, marginTop: 11 }, buttonText: { color: '#FFF', fontWeight: '700' }, secondaryButton: { borderWidth: 1, borderColor: '#25634C', borderRadius: 10, alignItems: 'center', padding: 11, marginTop: 8 }, secondaryText: { color: '#25634C', fontWeight: '700' }, jsonInput: { minHeight: 130, maxHeight: 240, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 11, color: '#111827', backgroundColor: '#FAFAFA', marginTop: 8 }, label: { color: '#374151', fontWeight: '600', marginTop: 13, marginBottom: 8, fontSize: 13 }, row: { flexDirection: 'row', gap: 8 }, choice: { borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9 }, choiceText: { color: '#374151', fontWeight: '600' }, active: { backgroundColor: '#EAF4EF', borderColor: '#25634C' }, activeText: { color: '#1D513D' }, modeHint: { color: '#6B7280', fontSize: 12, lineHeight: 17, marginTop: 8 }, disabled: { opacity: 0.55 }, privacy: { color: '#9CA3AF', fontSize: 12, textAlign: 'center', marginHorizontal: 12, marginTop: 2 } });
