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

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  router,
  useFocusEffect,
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
import type { MealMacros } from '../types/meal';

type SelectedFood = {
  id: string;
  food: Food;
  quantity: string;
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
    mode: requestedMode,
  } = useLocalSearchParams<{
    editMealId?: string;
    date?: string;
    returnTo?: string;
    mode?: string;
  }>();
  const mealDate = typeof requestedDate === 'string' && isValidDateString(requestedDate) ? requestedDate : getTodayDate();
  const returnToHistory = requestedReturnTo === 'history';
  const goBack = () => {
    router.replace(returnToHistory ? '/history' : '/');
  };
  const finishSaving = () => {
    // This screen is a persistent Food tab. Remove edit/date/mode params before
    // leaving so reopening the tab starts a fresh meal instead of stale edit UI.
    router.setParams({ editMealId: undefined, date: undefined, returnTo: undefined, mode: undefined });
    goBack();
  };

  const [mealName, setMealName] =
    useState(requestedMode === 'quick' ? 'Lunch' : 'Breakfast');
  const [entryMode, setEntryMode] = useState<'foods' | 'quick'>(requestedMode === 'quick' ? 'quick' : 'foods');
  const [quickValues, setQuickValues] = useState({ calories: '', protein: '', carbs: '', fat: '', fibre: '' });

  const [search, setSearch] =
    useState('');

  const [foods, setFoods] =
    useState<Food[]>([]);

  const [selectedFoodsByMeal, setSelectedFoodsByMeal] =
    useState<Partial<Record<string, SelectedFood[]>>>({});
  const activeMealKey = editMealId ?? mealName;
  const selectedFoods = selectedFoodsByMeal[activeMealKey] ?? [];
  const draftMealCount = MEAL_TYPES.filter((type) => (selectedFoodsByMeal[type]?.length ?? 0) > 0).length;

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);
  const searchRequestId = useRef(0);
  const openingFoodLibrary = useRef(false);
  const resetDraftOnFocus = useRef(false);

  const resetNewMealDraft = useCallback(() => {
    setMealName(requestedMode === 'quick' ? 'Lunch' : 'Breakfast');
    setEntryMode(requestedMode === 'quick' ? 'quick' : 'foods');
    setQuickValues({ calories: '', protein: '', carbs: '', fat: '', fibre: '' });
    setSearch('');
    setFoods([]);
    setSelectedFoodsByMeal({});
    setSaving(false);
    searchRequestId.current += 1;
  }, [requestedMode]);

  useFocusEffect(useCallback(() => {
    if (!editMealId && resetDraftOnFocus.current) resetNewMealDraft();
    resetDraftOnFocus.current = false;
    return () => {
      if (openingFoodLibrary.current) {
        openingFoodLibrary.current = false;
      } else if (!editMealId) {
        resetDraftOnFocus.current = true;
      }
    };
  }, [editMealId, resetNewMealDraft]));

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
        if (meal.quickMacros) {
          setEntryMode('quick');
          setQuickValues({
            calories: String(meal.quickMacros.calories),
            protein: String(meal.quickMacros.protein),
            carbs: String(meal.quickMacros.carbs),
            fat: String(meal.quickMacros.fat),
            fibre: String(meal.quickMacros.fibre),
          });
        }

        setSelectedFoodsByMeal({
          [editMealId!]: meal.items.map((item) => ({
            id: item.id,
            food: item.food!,
            quantity: String(item.quantity),
          }))
        });
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
    if (!Number.isFinite(food.servingSize) || food.servingSize <= 0) {
      Alert.alert('Food serving size is invalid', 'Edit this food and enter a serving size greater than zero before adding it to a meal.');
      return;
    }
    searchRequestId.current += 1;
    setSelectedFoodsByMeal((current) => ({
      ...current,
      [activeMealKey]: [...(current[activeMealKey] ?? []), {
        id: generateId(),
        food,
        quantity: String(food.servingSize),
      }],
    }));

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
    setSelectedFoodsByMeal((current) => ({
      ...current,
      [activeMealKey]: (current[activeMealKey] ?? []).map((item) => item.id === selectedFoodId
        ? { ...item, quantity: value }
        : item),
    }));
  };

  /*
   * Remove one specific food
   * from the meal.
   */
  const removeFood = (
    selectedFoodId: string
  ) => {
    setSelectedFoodsByMeal((current) => ({
      ...current,
      [activeMealKey]: (current[activeMealKey] ?? []).filter((item) => item.id !== selectedFoodId),
    }));
  };

  /*
   * Calculate macros for one
   * selected food.
   */
  const calculateMacros = (
    item: SelectedFood
  ) => {
    const quantity = Number(item.quantity);
    const multiplier = Number.isFinite(quantity) && quantity > 0 && Number.isFinite(item.food.servingSize) && item.food.servingSize > 0
      ? quantity / item.food.servingSize
      : 0;

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

      const foodMeals = MEAL_TYPES
        .map((type) => ({ name: type, items: selectedFoodsByMeal[type] ?? [] }))
        .filter((meal) => meal.items.length > 0);

      if (entryMode === 'foods' && (editMealId ? selectedFoods.length === 0 : foodMeals.length === 0)) {
        Alert.alert('Add a food first', 'Choose at least one food for the selected meal.');
        return;
      }

      const invalidItems = editMealId ? selectedFoods : foodMeals.flatMap((meal) => meal.items);
      if (entryMode === 'foods' && invalidItems.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
        Alert.alert('Check food quantities', 'Each food quantity must be greater than zero grams.');
        return;
      }
      if (entryMode === 'foods' && invalidItems.some((item) => !Number.isFinite(item.food.servingSize) || item.food.servingSize <= 0)) {
        Alert.alert('Food serving size is invalid', 'Update the serving size for each affected food before saving this meal.');
        return;
      }

      try {
        setSaving(true);
        let quickMacros: MealMacros | null = null;
        if (entryMode === 'quick') {
          const parseValue = (value: string) => value.trim() === '' ? 0 : Number(value);
          const values: MealMacros = {
            calories: parseValue(quickValues.calories),
            protein: parseValue(quickValues.protein),
            carbs: parseValue(quickValues.carbs),
            fat: parseValue(quickValues.fat),
            fibre: parseValue(quickValues.fibre),
          };
          if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
            Alert.alert('Check nutrition values', 'Enter non-negative numbers, or leave values blank.');
            return;
          }
          if (!Object.values(values).some((value) => value > 0)) {
            Alert.alert('Add nutrition details', 'Enter at least one calorie or nutrient value for this meal.');
            return;
          }
          quickMacros = values;
        }

        /*
         * EDIT EXISTING MEAL
         */
        if (editMealId) {
          await updateMeal(
            db,
            editMealId,
            mealName,
            entryMode === 'quick' ? [] : selectedFoods.map(
              (item) => ({
                foodId: item.food.id,
                quantity: Number(item.quantity),
              })
            ),
            quickMacros
          );
        }

        /*
         * CREATE NEW MEAL
         */
        else {
          await db.withTransactionAsync(async () => {
            const dailyLog = await getOrCreateDailyLog(db, { date: mealDate });
            if (entryMode === 'quick') {
              await createMeal(db, dailyLog.id, mealName.trim(), quickMacros);
            } else {
              for (const mealDraft of foodMeals) {
                const meal = await createMeal(db, dailyLog.id, mealDraft.name, null);
                for (const item of mealDraft.items) {
                  await addMealItem(db, meal.id, item.food.id, Number(item.quantity));
                }
              }
            }
          });
        }

        finishSaving();
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

        {entryMode === 'foods' && <Pressable
          onPress={() => { openingFoodLibrary.current = true; router.push({ pathname: '/foods', params: { date: mealDate, fromMeal: '1', ...(editMealId ? { editMealId } : {}), ...(returnToHistory ? { returnTo: 'history' } : {}) } } as never); }}
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
                accessibilityRole="button"
                accessibilityState={{ selected: mealName === type }}
                accessibilityLabel={`${type}${selectedFoodsByMeal[type]?.length ? `, ${selectedFoodsByMeal[type].length} foods added` : ', no foods added yet'}`}
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
                  {type}{selectedFoodsByMeal[type]?.length ? ` · ${selectedFoodsByMeal[type].length}` : ''}
                </Text>
              </Pressable>
            )
          )}
        </ScrollView>
        {entryMode === 'foods' && <Text style={styles.mealTypeHint}>Foods are saved under the selected meal. Switching meals shows that meal’s own foods.</Text>}

        <View style={styles.modeSwitch}>
          <Pressable onPress={() => setEntryMode('foods')} style={[styles.modeButton, entryMode === 'foods' && styles.modeButtonActive]}>
            <Text style={[styles.modeText, entryMode === 'foods' && styles.modeTextActive]}>Use food library</Text>
          </Pressable>
          <Pressable onPress={() => setEntryMode('quick')} style={[styles.modeButton, entryMode === 'quick' && styles.modeButtonActive]}>
            <Text style={[styles.modeText, entryMode === 'quick' && styles.modeTextActive]}>Quick meal</Text>
          </Pressable>
        </View>

        {entryMode === 'quick' ? <>
          <View style={styles.quickHintCard}>
            <Text style={styles.quickHintTitle}>Log a meal without food cards</Text>
            <Text style={styles.quickHintText}>Enter the meal’s nutrition totals. You can leave values you don’t know blank.</Text>
          </View>
          <Text style={styles.sectionTitle}>Meal name</Text>
          <TextInput value={mealName} onChangeText={setMealName} placeholder="e.g. Homemade lunch" style={styles.searchInput} maxLength={60} />
          <Text style={styles.sectionTitle}>Meal nutrition</Text>
          <View style={styles.quickGrid}>
            {([
              ['calories', 'Calories', 'kcal'],
              ['protein', 'Protein', 'g'],
              ['carbs', 'Carbs', 'g'],
              ['fat', 'Fat', 'g'],
              ['fibre', 'Fibre', 'g'],
            ] as const).map(([key, label, unit]) => <View key={key} style={styles.quickField}>
              <Text style={styles.quickLabel}>{label}</Text>
              <View style={styles.quickInputRow}>
                <TextInput value={quickValues[key]} onChangeText={(value) => setQuickValues((current) => ({ ...current, [key]: value }))} placeholder="0" keyboardType="decimal-pad" style={styles.quickInput} />
                <Text style={styles.quickUnit}>{unit}</Text>
              </View>
            </View>)}
          </View>
          <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSaveMeal} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : editMealId ? 'Save Changes' : 'Add Meal'}</Text>
          </Pressable>
        </> : <>

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
                      value={item.quantity}
                      onChangeText={(
                        value
                      ) =>
                        updateQuantity(
                          item.id,
                          value
                        )
                      }
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      accessibilityLabel={`Quantity in grams for ${item.food.name}`}
                      style={[styles.quantityInput, (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) && styles.quantityInputInvalid]}
                    />
                    {(!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) && <Text style={styles.quantityError}>Enter a quantity greater than 0 g.</Text>}

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
                    : draftMealCount > 0 ? `Save ${draftMealCount} ${draftMealCount === 1 ? 'Meal' : 'Meals'}` : 'Add foods to continue'}
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
        </>}
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
  mealTypeHint: { color: '#6B7280', fontSize: 12, lineHeight: 17, marginTop: 2, marginBottom: 4 },

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

  modeSwitch: { flexDirection: 'row', backgroundColor: '#EEF0F3', borderRadius: 10, padding: 3, marginTop: 14, marginBottom: 7 },
  modeButton: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 8 },
  modeButtonActive: { backgroundColor: '#FFFFFF', shadowColor: '#111827', shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  modeText: { color: '#6B7280', fontWeight: '600', fontSize: 12 },
  modeTextActive: { color: '#111827' },
  quickHintCard: { backgroundColor: '#F0F7F3', borderRadius: 11, padding: 13, marginTop: 12 },
  quickHintTitle: { color: '#1F513E', fontSize: 13, fontWeight: '700' },
  quickHintText: { color: '#52665C', fontSize: 12, lineHeight: 17, marginTop: 4 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  quickField: { width: '47%', minWidth: 120 },
  quickLabel: { color: '#4B5563', fontSize: 12, fontWeight: '600', marginBottom: 5 },
  quickInputRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  quickInput: { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 10, color: '#111827', fontSize: 14 },
  quickUnit: { color: '#6B7280', fontSize: 12, width: 24 },

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
  quantityInputInvalid: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  quantityError: { color: '#B91C1C', fontSize: 12, marginTop: 5 },

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
