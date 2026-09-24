export interface Food {
  id: string;
  userId: string | null;

  name: string;
  servingSize: number;

  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  favorite?: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface CreateFoodInput {
  name: string;
  servingSize: number;

  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre?: number;
}
