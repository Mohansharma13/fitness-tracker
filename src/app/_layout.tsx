import { Ionicons } from '@expo/vector-icons';
import { Tabs, type ErrorBoundaryProps } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { Suspense, useEffect } from 'react';
import { Appearance, Pressable, StyleSheet, Text, View } from 'react-native';

import { initializeDatabase } from '../database/database';
import { getSettings } from '../repositories/settingsRepository';
import { SelectedDateProvider } from '../contexts/SelectedDateContext';

// Keep the native app logo visible until SQLite and the first screen are ready.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <Suspense fallback={null}>
      <SQLiteProvider
        databaseName="fitness_tracker.db"
        onInit={initializeDatabase}
        useSuspense
      >
        <AppTabs />
      </SQLiteProvider>
    </Suspense>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('App startup failed:', error);
    void SplashScreen.hideAsync().catch((hideError) => console.warn('Could not hide the startup screen:', hideError));
  }, [error]);

  return (
    <View style={styles.errorScreen}>
      <Text style={styles.errorTitle}>Fitness Tracker could not start</Text>
      <Text style={styles.errorMessage}>Check your device storage, then try again.</Text>
      <Pressable accessibilityRole="button" onPress={() => void retry()} style={styles.retryButton}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

function AppTabs() {
  const db = useSQLiteContext();

  useEffect(() => {
    getSettings(db)
      .then((settings) => Appearance.setColorScheme(settings.theme === 'system' ? 'unspecified' : settings.theme))
      .catch((error) => console.error('Failed to load app settings:', error));
  }, [db]);

  useEffect(() => {
    void SplashScreen.hideAsync().catch((error) => console.warn('Could not hide the startup screen:', error));
  }, []);

  return (
    <SelectedDateProvider>
    <Tabs backBehavior="history" screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="foods" options={{ href: null }} />
      <Tabs.Screen
        name="add-meal"
        options={{
          title: 'Food',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="workout-history" options={{ href: null }} />
      <Tabs.Screen name="templates" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="backup" options={{ href: null }} />
      <Tabs.Screen name="export" options={{ href: null }} />
      <Tabs.Screen name="weekly-breakdown" options={{ href: null }} />
      <Tabs.Screen name="food-edit" options={{ href: null }} />
      <Tabs.Screen name="exercise-library" options={{ href: null }} />
      <Tabs.Screen name="clear-data" options={{ href: null }} />
    </Tabs>
    </SelectedDateProvider>
  );
}

const styles = StyleSheet.create({
  errorScreen: { flex: 1, backgroundColor: '#F7F8FA', alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { color: '#111827', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  errorMessage: { color: '#6B7280', fontSize: 14, textAlign: 'center', marginTop: 8 },
  retryButton: { backgroundColor: '#25634C', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11, marginTop: 18 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
});
