import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import { getTodayDate } from '../utils/date';

type SelectedDateContextValue = {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
};

const SelectedDateContext = createContext<SelectedDateContextValue | null>(null);

export function SelectedDateProvider({ children }: PropsWithChildren) {
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  return (
    <SelectedDateContext.Provider value={{ selectedDate, setSelectedDate }}>
      {children}
    </SelectedDateContext.Provider>
  );
}

export function useSelectedDate() {
  const context = useContext(SelectedDateContext);
  if (!context) throw new Error('useSelectedDate must be used inside SelectedDateProvider');
  return context;
}
