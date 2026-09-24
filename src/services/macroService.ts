import type { MealMacros, MealWithItems } from '../types/meal';

function calculateFoodMacros(
  food: {
    servingSize: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fibre: number;
  },
  quantity: number
): MealMacros {
  const multiplier = quantity / food.servingSize;

  return {
    calories: food.calories * multiplier,
    protein: food.protein * multiplier,
    carbs: food.carbs * multiplier,
    fat: food.fat * multiplier,
    fibre: food.fibre * multiplier,
  };
}

export function calculateMealMacros(
  meal: MealWithItems
): MealMacros {
  return meal.items.reduce(
    (total, item) => {
      if (!item.food) {
        return total;
      }

      const macros = calculateFoodMacros(
        item.food,
        item.quantity
      );

      return {
        calories: total.calories + macros.calories,
        protein: total.protein + macros.protein,
        carbs: total.carbs + macros.carbs,
        fat: total.fat + macros.fat,
        fibre: total.fibre + macros.fibre,
      };
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
    }
  );
}

export function calculateDailyMacros(
  meals: MealWithItems[]
): MealMacros {
  return meals.reduce(
    (total, meal) => {
      const macros = calculateMealMacros(meal);

      return {
        calories: total.calories + macros.calories,
        protein: total.protein + macros.protein,
        carbs: total.carbs + macros.carbs,
        fat: total.fat + macros.fat,
        fibre: total.fibre + macros.fibre,
      };
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
    }
  );
}

export function calculateAveragePerMeal(
  dailyMacros: MealMacros,
  mealCount: number
): MealMacros {
  if (mealCount === 0) {
    return {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
    };
  }

  return {
    calories: dailyMacros.calories / mealCount,
    protein: dailyMacros.protein / mealCount,
    carbs: dailyMacros.carbs / mealCount,
    fat: dailyMacros.fat / mealCount,
    fibre: dailyMacros.fibre / mealCount,
  };
}