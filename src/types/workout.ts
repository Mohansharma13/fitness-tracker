export interface WorkoutLog {
  id: string;
  dailyLogId: string;
  workoutType: string;
  duration: number | null;
  notes: string | null;
  createdAt: string;
  exercises: ExerciseLog[];
}

export interface ExerciseLog {
  id: string;
  workoutLogId: string;
  exerciseName: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  notes: string | null;
}
