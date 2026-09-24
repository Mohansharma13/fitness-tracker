import type { Food } from './food';

export interface Meal {
  id: string;
  dailyLogId: string;

  mealName: string;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface MealItem {
  id: string;
  mealId: string;
  foodId: string;

  quantity: number;

  food?: Food;
}

export interface MealWithItems extends Meal {
  items: MealItem[];
}

export interface MealMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}