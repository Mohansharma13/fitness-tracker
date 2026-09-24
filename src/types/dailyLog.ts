export interface DailyLog {
  id: string;
  userId: string | null;

  date: string;

  weight: number | null;
  steps: number;

  workoutCompleted: boolean;
  workoutDuration: number | null;

  notes: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface CreateDailyLogInput {
  date: string;
}