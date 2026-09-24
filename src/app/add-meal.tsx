import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useEffect, useRef, useState } from 'react';
import {
  router,
  useLocalSearchParams,
} from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { generateId } from '../utils/id';
import { getTodayDate, isValidDateString } from '../utils/date';

import {
  getAllFoods,
  searchFoods,
} from '../repositories/foodRepository';

import {
  getOrCreateDailyLog,
} from '../repositories/dailyLogRepository';

import {
  createMeal,
  addMealItem,
  getMealById,
  updateMeal,
} from '../repositories/mealRepository';

import type { Food } from '../types/food';

type SelectedFood = {
  id: string;
  food: Food;
  quantity: number;
};

const MEAL_TYPES = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Snack',
];

export default function AddMealScreen() {
  const db = useSQLiteContext();

  const {
    editMealId,
    date: requestedDate,
    returnTo: requestedReturnTo,
  } = useLocalSearchParams<{
    editMealId?: string;
    date?: string;
    returnTo?: string;
  }>();
  const mealDate = typeof requestedDate === 'string' && isValidDateString(requestedDate) ? requestedDate : getTodayDate();
  const returnToHistory = requestedReturnTo === 'history';
  const goBack = () => {
    if (returnToHistory && router.canGoBack()) router.back();
    else router.replace(returnToHistory ? '/history' : '/');
  };

  const [mealName, setMealName] =
    useState('Breakfast');

  const [search, setSearch] =
    useState('');

  const [foods, setFoods] =
    useState<Food[]>([]);

  const [selectedFoods, setSelectedFoods] =
    useState<SelectedFood[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);
  const searchRequestId = useRef(0);

  /*
   * Load existing meal when editing
   */
  useEffect(() => {
    if (!editMealId) {
      return;
    }

    const loadMeal = async () => {
      try {
        const meal = await getMealById(
          db,
          editMealId
        );

        if (!meal) {
          return;
        }

        setMealName(meal.mealName);

        setSelectedFoods(
          meal.items.map((item) => ({
            id: item.id,
            food: item.food!,
            quantity: item.quantity,
          }))
        );
      } catch (error) {
        console.error(
          'Failed to load meal:',
          error
        );
      }
    };

    loadMeal();
  }, [db, editMealId]);

  /*
   * Search foods
   */
  const handleSearch = async (
    value: string
  ) => {
    const requestId = ++searchRequestId.current;
    setSearch(value);

    try {
      setLoading(true);

      if (!value.trim()) {
        const results = await getAllFoods(db);
        if (requestId === searchRequestId.current) setFoods(results);
      } else {
        const results = await searchFoods(db, value.trim());
        if (requestId === searchRequestId.current) setFoods(results);
      }
    } catch (error) {
      console.error(
        'Failed to search foods:',
        error
      );
    } finally {
      if (requestId === searchRequestId.current) setLoading(false);
    }
  };

  /*
   * Add food
   *
   * Duplicate foods are allowed.
   */
  const addFood = (food: Food) => {
    searchRequestId.current += 1;
    setSelectedFoods((current) => [
      ...current,
      {
        id: generateId(),
        food,
        quantity: food.servingSize,
      },
    ]);

    setSearch('');
    setFoods([]);
  };

  /*
   * Update quantity for one
   * specific selected food.
   */
  const updateQuantity = (
    selectedFoodId: string,
    value: string
  ) => {
    const quantity = Number(value);

    setSelectedFoods((current) =>
      current.map((item) =>
        item.id === selectedFoodId
          ? {
              ...item,
              quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
            }
          : item
      )
    );
  };

  /*
   * Remove one specific food
   * from the meal.
   */
  const removeFood = (
    selectedFoodId: string
  ) => {
    setSelectedFoods((current) =>
      current.filter(
        (item) =>
          item.id !== selectedFoodId
      )
    );
  };

  /*
   * Calculate macros for one
   * selected food.
   */
  const calculateMacros = (
    item: SelectedFood
  ) => {
    const multiplier =
      item.quantity /
      item.food.servingSize;

    return {
      calories:
        item.food.calories *
        multiplier,

      protein:
        item.food.protein *
        multiplier,

      carbs:
        item.food.carbs *
        multiplier,

      fat:
        item.food.fat *
        multiplier,

      fibre:
        item.food.fibre *
        multiplier,
    };
  };

  /*
   * Calculate total macros
   * for the entire meal.
   */
  const mealTotal =
    selectedFoods.reduce(
      (total, item) => {
        const macros =
          calculateMacros(item);

        return {
          calories:
            total.calories +
            macros.calories,

          protein:
            total.protein +
            macros.protein,

          carbs:
            total.carbs +
            macros.carbs,

          fat:
            total.fat +
            macros.fat,

          fibre:
            total.fibre +
            macros.fibre,
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

  /*
   * Save or update meal.
   */
  const handleSaveMeal =
    async () => {
      if (!mealName.trim()) {
        Alert.alert('Meal name required', 'Enter a name for this meal.');
        return;
      }

      if (!editMealId && selectedFoods.length === 0) {
        Alert.alert('Add a food first', 'Choose at least one food for this meal.');
        return;
      }

      if (selectedFoods.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
        Alert.alert('Check food quantities', 'Each food quantity must be greater than zero grams.');
        return;
      }

      try {
        setSaving(true);

        /*
         * EDIT EXISTING MEAL
         */
        if (editMealId) {
          await updateMeal(
            db,
            editMealId,
            mealName,
            selectedFoods.map(
              (item) => ({
                foodId: item.food.id,
                quantity: item.quantity,
              })
            )
          );
        }

        /*
         * CREATE NEW MEAL
         */
        else {
          await db.withTransactionAsync(async () => {
            const dailyLog = await getOrCreateDailyLog(db, { date: mealDate });
            const meal = await createMeal(db, dailyLog.id, mealName.trim());
            for (const item of selectedFoods) {
              await addMealItem(db, meal.id, item.food.id, item.quantity);
            }
          });
        }

        goBack();
      } catch (error) {
        console.error(
          'Failed to save meal:',
          error
        );
        Alert.alert('Could not save meal', 'Your meal was not saved. Please try again.');
      } finally {
        setSaving(false);
      }
    };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : 'height'
      }
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        <Pressable
          onPress={goBack}
          style={styles.backButton}
        >
          <Text
            style={styles.backText}
          >
            ← {returnToHistory ? 'Weekly averages' : 'Today'}
          </Text>
        </Pressable>

        <Text style={styles.title}>
          {editMealId
            ? 'Edit Meal'
            : 'Add Meal'}
        </Text>

        <Text
          style={styles.subtitle}
        >
          {editMealId
            ? 'Update your meal.'
            : 'Log a meal or open your food library.'}
        </Text>

        {!editMealId && <Pressable
          onPress={() => router.push({ pathname: '/foods', params: { date: mealDate, ...(returnToHistory ? { returnTo: 'history' } : {}) } } as never)}
          style={styles.libraryButton}
        >
          <Text style={styles.libraryButtonText}>Open Food Library</Text>
        </Pressable>}

        {/* Meal Type */}

        <Text
          style={styles.sectionTitle}
        >
          Meal Type
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          style={
            styles.mealTypeScroll
          }
        >
          {MEAL_TYPES.map(
            (type) => (
              <Pressable
                key={type}
                onPress={() =>
                  setMealName(
                    type
                  )
                }
                style={[
                  styles.mealTypeButton,
                  mealName ===
                    type &&
                    styles.mealTypeButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.mealTypeText,
                    mealName ===
                      type &&
                      styles.mealTypeTextActive,
                  ]}
                >
                  {type}
                </Text>
              </Pressable>
            )
          )}
        </ScrollView>

        {/* Add Food */}

        <Text
          style={styles.sectionTitle}
        >
          Add Food
        </Text>

        <TextInput
          value={search}
          onChangeText={
            handleSearch
          }
          placeholder="Search your foods..."
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
        />

        {loading && (
          <Text
            style={styles.loadingText}
          >
            Searching...
          </Text>
        )}

        {search.trim().length >
          0 &&
          !loading &&
          foods.length === 0 && (
            <View
              style={styles.emptyCard}
            >
              <Text
                style={
                  styles.emptyText
                }
              >
                No foods found.
              </Text>
            </View>
          )}

        {foods.map((food) => (
          <Pressable
            key={food.id}
            style={
              styles.foodResult
            }
            onPress={() =>
              addFood(food)
            }
          >
            <View>
              <Text
                style={
                  styles.foodName
                }
              >
                {food.name}
              </Text>

              <Text
                style={
                  styles.foodServing
                }
              >
                Per {food.servingSize} g
              </Text>
            </View>

            <Text
              style={styles.addText}
            >
              + Add
            </Text>
          </Pressable>
        ))}

        {/* Selected Foods */}

        {selectedFoods.length >
          0 && (
          <>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Selected Foods
            </Text>

            {selectedFoods.map(
              (item) => {
                const macros =
                  calculateMacros(
                    item
                  );

                return (
                  <View
                    key={item.id}
                    style={
                      styles.selectedCard
                    }
                  >
                    <View
                      style={
                        styles.selectedHeader
                      }
                    >
                      <View
                        style={
                          styles.selectedInfo
                        }
                      >
                        <Text
                          style={
                            styles.foodName
                          }
                        >
                          {
                            item
                              .food
                              .name
                          }
                        </Text>

                        <Text
                          style={
                            styles.foodServing
                          }
                        >
                          {macros.calories.toFixed(
                            0
                          )}{' '}
                          kcal
                          {'  '}
                          {macros.protein.toFixed(
                            1
                          )}
                          g protein
                        </Text>
                      </View>

                      <Pressable
                        onPress={() =>
                          removeFood(
                            item.id
                          )
                        }
                      >
                        <Text
                          style={
                            styles.removeText
                          }
                        >
                          Remove
                        </Text>
                      </Pressable>
                    </View>

                    <Text
                      style={
                        styles.quantityLabel
                      }
                    >
                      Quantity (g)
                    </Text>

                    <TextInput
                      value={String(
                        item.quantity
                      )}
                      onChangeText={(
                        value
                      ) =>
                        updateQuantity(
                          item.id,
                          value
                        )
                      }
                      keyboardType="decimal-pad"
                      style={
                        styles.quantityInput
                      }
                    />

                    <View
                      style={
                        styles.macroRow
                      }
                    >
                      <Macro
                        label="Calories"
                        value={`${macros.calories.toFixed(
                          0
                        )} kcal`}
                      />

                      <Macro
                        label="Protein"
                        value={`${macros.protein.toFixed(
                          1
                        )}g`}
                      />

                      <Macro
                        label="Carbs"
                        value={`${macros.carbs.toFixed(
                          1
                        )}g`}
                      />

                      <Macro
                        label="Fat"
                        value={`${macros.fat.toFixed(
                          1
                        )}g`}
                      />

                      <Macro
                        label="Fibre"
                        value={`${macros.fibre.toFixed(1)}g`}
                      />
                    </View>
                  </View>
                );
              }
            )}

            {/* Meal Total */}

            <View
              style={
                styles.totalCard
              }
            >
              <Text
                style={
                  styles.totalTitle
                }
              >
                Meal Total
              </Text>

              <View
                style={
                  styles.totalGrid
                }
              >
                <Macro
                  label="Calories"
                  value={`${mealTotal.calories.toFixed(
                    0
                  )} kcal`}
                />

                <Macro
                  label="Protein"
                  value={`${mealTotal.protein.toFixed(
                    1
                  )}g`}
                />

                <Macro
                  label="Carbs"
                  value={`${mealTotal.carbs.toFixed(
                    1
                  )}g`}
                />

                <Macro
                  label="Fat"
                  value={`${mealTotal.fat.toFixed(
                    1
                  )}g`}
                />

                <Macro
                  label="Fibre"
                  value={`${mealTotal.fibre.toFixed(1)}g`}
                />
              </View>
            </View>

            {/* Save */}

            <Pressable
              style={[
                styles.saveButton,
                saving &&
                  styles.saveButtonDisabled,
              ]}
              onPress={
                handleSaveMeal
              }
              disabled={saving}
            >
              <Text
                style={
                  styles.saveButtonText
                }
              >
                {saving
                  ? 'Saving...'
                  : editMealId
                    ? 'Save Changes'
                    : 'Save Meal'}
              </Text>
            </Pressable>
          </>
        )}

        {editMealId && selectedFoods.length === 0 && (
          <Pressable
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSaveMeal}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Macro({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.macro}>
      <Text
        style={styles.macroLabel}
      >
        {label}
      </Text>

      <Text
        style={styles.macroValue}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  container: {
    flex: 1,
  },

  content: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 50,
  },

  backButton: {
    marginBottom: 15,
  },

  backText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },

  subtitle: {
    marginTop: 5,
    marginBottom: 25,
    color: '#6B7280',
    fontSize: 14,
  },

  libraryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },

  libraryButtonText: {
    color: '#374151',
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
    marginTop: 20,
    marginBottom: 10,
  },

  mealTypeScroll: {
    marginBottom: 5,
  },

  mealTypeButton: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },

  mealTypeButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },

  mealTypeText: {
    color: '#374151',
    fontWeight: '600',
  },

  mealTypeTextActive: {
    color: '#FFFFFF',
  },

  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },

  loadingText: {
    marginTop: 8,
    color: '#6B7280',
  },

  foodResult: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 15,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  foodName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  foodServing: {
    marginTop: 3,
    color: '#6B7280',
    fontSize: 13,
  },

  addText: {
    color: '#111827',
    fontWeight: '700',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginTop: 10,
    alignItems: 'center',
  },

  emptyText: {
    color: '#6B7280',
  },

  selectedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  selectedInfo: {
    flex: 1,
  },

  removeText: {
    color: '#DC2626',
    fontWeight: '600',
    fontSize: 13,
  },

  quantityLabel: {
    marginTop: 15,
    marginBottom: 6,
    fontSize: 13,
    color: '#6B7280',
  },

  quantityInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
  },

  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },

  macro: {
    alignItems: 'flex-start',
  },

  macroLabel: {
    fontSize: 10,
    color: '#9CA3AF',
  },

  macroValue: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },

  totalCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    marginTop: 10,
  },

  totalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 15,
  },

  totalGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  saveButton: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },
});
