import { useCallback, useEffect, useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { getDailyDashboard } from '../services/analyticsService';
import { getTodayDate } from '../utils/date';

export function useDailyDashboard(
  date: string = getTodayDate()
) {
  const db = useSQLiteContext();

  const [dashboard, setDashboard] =
    useState<Awaited<
      ReturnType<typeof getDailyDashboard>
    > | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadDashboard = useCallback(async () => {
    const request = ++requestId.current;
    try {
      setLoading(true);
      setError(null);

      const result = await getDailyDashboard(
        db,
        date
      );

      if (request === requestId.current) setDashboard(result);
    } catch (error) {
      console.error(
        'Failed to load dashboard:',
        error
      );
      if (request === requestId.current) setError('Could not load this day. Please try again. Your saved data stays on this device.');
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [db, date]);

  useEffect(() => () => { requestId.current += 1; }, []);

  return {
    dashboard,
    loading,
    error,
    reload: loadDashboard,
  };
}
