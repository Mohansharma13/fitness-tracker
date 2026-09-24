export interface FitnessGoal {
  id: string;
  calorieTarget: number | null;
  proteinTarget: number | null;
  carbTarget: number | null;
  fatTarget: number | null;
  stepTarget: number | null;
  workoutTarget: number | null;
  targetWeight: number | null;
  updatedAt: string;
}
