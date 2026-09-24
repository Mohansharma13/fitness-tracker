/*
 * ============================================================
 * FOOD LIBRARY SCREEN
 * ============================================================
 *
 * This screen is responsible for managing the foods
 * stored in our local food library.
 *
 * The user can:
 *
 * 1. See all saved foods
 * 2. Search for foods
 * 3. Add a new food
 * 4. Store calories and macros for each food
 *
 * The food data is stored in SQLite.
 *
 * Architecture:
 *
 *     Food Library Screen
 *            ↓
 *     foodRepository.ts
 *            ↓
 *          SQLite
 *
 * This screen does NOT contain SQL.
 * The repository is responsible for communicating
 * with the database.
 *
 * ============================================================
 */


// React Native UI components.
//
// KeyboardAvoidingView
//     Helps keep input fields visible when the keyboard opens.
//
// Platform
//     Tells us whether the app is running on Android or iOS.
//
// Pressable
//     Creates a button that responds to taps.
//
// ScrollView
//     Allows the screen to scroll vertically.
//
// StyleSheet
//     Used to create our UI styles.
//
// Text
//     Displays text.
//
// TextInput
//     Allows the user to enter text or numbers.
//
// View
//     A general-purpose container.
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


// React hooks.
//
// useState
//     Stores information that can change on the screen.
//
// useEffect
//     Runs code when the component is loaded or when
//     a dependency changes.
//
// useRef
//     Stores a value that can change without causing
//     the screen to re-render.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Ionicons } from '@expo/vector-icons';


// Gives this screen access to our local SQLite database.
//
// SQLiteProvider is created in _layout.tsx.
// useSQLiteContext() lets this screen access that database.
import { useSQLiteContext } from 'expo-sqlite';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';


// These functions come from our Food Repository.
//
// The repository is responsible for talking to SQLite.
//
// createFood()
//     Saves a new food.
//
// getAllFoods()
//     Gets all saved foods.
//
// searchFoods()
//     Searches saved foods.
import {
  createFood,
  deleteFood,
  getAllFoods,
  getRecentlyUsedFoods,
  searchFoods,
  toggleFoodFavorite,
} from '../repositories/foodRepository';


// Import the Food TypeScript type.
//
// This describes what properties a Food object contains.
import type { Food } from '../types/food';

function formatFoodCalories(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}


// ============================================================
// MAIN FOOD LIBRARY SCREEN
// ============================================================
//
// Expo Router uses this component for:
//
//     src/app/foods.tsx
//
// Because this file is named foods.tsx,
// the route is:
//
//     /foods
export default function FoodsScreen() {
  const { date: requestedDate, returnTo } = useLocalSearchParams<{ date?: string; returnTo?: string }>();
  const returnToMeals = () => router.replace({ pathname: '/add-meal', params: { ...(typeof requestedDate === 'string' ? { date: requestedDate } : {}), ...(returnTo === 'history' ? { returnTo: 'history' } : {}) } } as never);

  // ----------------------------------------------------------
  // DATABASE
  // ----------------------------------------------------------
  //
  // Get access to the local SQLite database.
  //
  // We will pass "db" to repository functions.
  const db = useSQLiteContext();


  // ----------------------------------------------------------
  // FOOD LIST
  // ----------------------------------------------------------
  //
  // Stores the foods currently displayed on the screen.
  //
  // Example:
  //
  // [
  //   Paneer,
  //   Banana,
  //   Milk
  // ]
  //
  // Initially the list is empty.
  const [foods, setFoods] =
    useState<Food[]>([]);
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [expandedFoodId, setExpandedFoodId] = useState<string | null>(null);
  const [addFormExpanded, setAddFormExpanded] = useState(false);

  // ----------------------------------------------------------
  // SEARCH TEXT
  // ----------------------------------------------------------
  //
  // Stores whatever the user types into the
  // "Search foods..." input.
  //
  // Example:
  //
  //     "paneer"
  //
  const [search, setSearch] =
    useState('');


  // ----------------------------------------------------------
  // NEW FOOD FORM
  // ----------------------------------------------------------
  //
  // These states store the values entered by the user
  // when creating a new food.
  //
  // TextInput components return strings,
  // so these values are stored as strings first.
  const [name, setName] =
    useState('');


  // Default serving size is 100g.
  //
  // The user can change this.
  const [servingSize, setServingSize] =
    useState('100');


  // Nutrition values.
  //
  // These are entered by the user for the
  // selected serving size.
  const [calories, setCalories] =
    useState('');

  const [protein, setProtein] =
    useState('');

  const [carbs, setCarbs] =
    useState('');

  const [fat, setFat] =
    useState('');

  const [fibre, setFibre] =
    useState('');


  // ----------------------------------------------------------
  // LOADING STATE
  // ----------------------------------------------------------
  //
  // true:
  //     Food search/loading is happening.
  //
  // false:
  //     Loading has finished.
  const [loading, setLoading] =
    useState(false);
  const [savingFood, setSavingFood] = useState(false);


  // ==========================================================
  // SEARCH REQUEST ID
  // ==========================================================
  //
  // This is a slightly more advanced concept.
  //
  // Imagine the user types:
  //
  //     p
  //     pa
  //     pan
  //     pane
  //     paneer
  //
  // Multiple database searches may happen.
  //
  // Sometimes an older request could finish AFTER
  // a newer request.
  //
  // Example:
  //
  // Search A = "pan"
  // Search B = "paneer"
  //
  // If Search A finishes last, it could incorrectly
  // replace the results from Search B.
  //
  // searchRequestId prevents that.
  //
  // useRef is used because changing this value should
  // NOT cause the screen to render again.
  const searchRequestId =
    useRef(0);
  const hasFocusedOnce = useRef(false);


  // ==========================================================
  // LOAD FOODS
  // ==========================================================
  //
  // This function loads foods from SQLite.
  //
  // If query is empty:
  //
  //     get all foods
  //
  // Otherwise:
  //
  //     search for matching foods
  const loadFoods = useCallback(async (
    query: string = search
  ) => {

    // Increase the request number.
    //
    // Every new search gets a new ID.
    const requestId =
      ++searchRequestId.current;


    try {

      // Tell the UI that loading has started.
      setLoading(true);


      // This variable will hold the database result.
      let result: Food[];


      // ------------------------------------------------------
      // NO SEARCH TEXT
      // ------------------------------------------------------
      //
      // If the search box is empty,
      // load every food.
      if (
        query.trim().length === 0
      ) {

        result =
          await getAllFoods(db);

      }

      // ------------------------------------------------------
      // SEARCH TEXT EXISTS
      // ------------------------------------------------------
      //
      // Search the database for matching foods.
      else {

        result =
          await searchFoods(
            db,
            query.trim()
          );
      }


      // ------------------------------------------------------
      // CHECK IF THIS IS STILL THE LATEST SEARCH
      // ------------------------------------------------------
      //
      // Only update the screen if this result belongs
      // to the newest search request.
      //
      // This prevents old search results from replacing
      // newer results.
      if (
        requestId ===
        searchRequestId.current
      ) {

        setFoods(result);
      }


    } catch (error) {

      // If SQLite/search fails,
      // show the error in the development console.
      console.error(
        'Failed to load foods:',
        error
      );


    } finally {

      // Only turn off the loading indicator if
      // this is still the latest request.
      if (
        requestId ===
        searchRequestId.current
      ) {

        setLoading(false);
      }
    }
  }, [db, search]);

  useFocusEffect(useCallback(() => {
    if (!hasFocusedOnce.current) {
      hasFocusedOnce.current = true;
      return;
    }
    const query = search.trim();
    const requestId = ++searchRequestId.current;
    const request = query ? searchFoods(db, query) : getAllFoods(db);
    request.then((result) => { if (requestId === searchRequestId.current) setFoods(result); }).catch((error) => console.error('Failed to refresh foods:', error));
    getRecentlyUsedFoods(db).then(setRecentFoods).catch((error) => console.error('Failed to load recent foods:', error));
  }, [db, search]));

  useEffect(() => {
    getRecentlyUsedFoods(db).then(setRecentFoods).catch((error) => console.error('Failed to load recent foods:', error));
  }, [db]);


  // ==========================================================
  // AUTOMATIC SEARCH
  // ==========================================================
  //
  // This effect runs whenever "search" changes.
  //
  // Instead of searching immediately for every single
  // keystroke, we wait 200 milliseconds.
  //
  // This is called a simple debounce.
  //
  // It reduces unnecessary database searches.
  useEffect(() => {

    // Create a timer.
    const timer =
      setTimeout(() => {

        // Perform the search after 200ms.
        loadFoods(search);

      }, 200);


    // --------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------
    //
    // If the user types another character before
    // 200ms has passed, cancel the previous timer.
    //
    // Example:
    //
    // User types:
    //
    //     p
    //     pa
    //     pan
    //
    // We don't want to wait for and run
    // three unnecessary searches.
    return () =>
      clearTimeout(timer);


  // Run this effect whenever search changes.
  }, [loadFoods, search]);


  // ==========================================================
  // CREATE NEW FOOD
  // ==========================================================
  //
  // This function runs when the user presses:
  //
  //     Save Food
  //
  const handleCreateFood = async () => {

    // Remove spaces from the beginning/end
    // of the food name.
    const trimmedName =
      name.trim();


    // A food must have a name.
    //
    // If the name is empty,
    // stop without saving.
    if (!trimmedName) {
      Alert.alert('Name required', 'Enter a name for this food.');
      return;
    }


    // Convert serving size from string to number.
    //
    // TextInput gives us:
    //
    //     "100"
    //
    // We need:
    //
    //     100
    const serving =
      Number(servingSize);


    // Serving size must be greater than zero.
    if (!Number.isFinite(serving) || serving <= 0) {
      Alert.alert('Check serving size', 'Enter a serving size greater than zero grams.');
      return;
    }

    const nutrition = [calories, protein, carbs, fat, fibre].map((value) => value.trim() === '' ? 0 : Number(value));
    if (nutrition.some((value) => !Number.isFinite(value) || value < 0)) {
      Alert.alert('Check nutrition values', 'Nutrition values must be valid non-negative numbers.');
      return;
    }


    try {
      setSavingFood(true);

      // Send the food to the repository.
      //
      // The repository will insert it into SQLite.
      await createFood(db, {

        // Food name.
        name: trimmedName,

        // Serving size in grams.
        servingSize: serving,

        // Convert all nutrition fields
        // from strings into numbers.
        //
        // If the user leaves a field empty,
        // Number('') becomes 0.
        calories: nutrition[0],
        protein: nutrition[1],
        carbs: nutrition[2],
        fat: nutrition[3],
        fibre: nutrition[4],
      });


      // ======================================================
      // CLEAR THE FORM
      // ======================================================
      //
      // After saving successfully,
      // reset all fields so the user can add
      // another food.
      setName('');

      setServingSize('100');

      setCalories('');

      setProtein('');

      setCarbs('');

      setFat('');

      setFibre('');


      // ======================================================
      // REFRESH FOOD LIST
      // ======================================================
      //
      // The new food has been saved to SQLite.
      //
      // Now load the food list again so it appears
      // immediately on the screen.
      await loadFoods(search);
      setRecentFoods(await getRecentlyUsedFoods(db));


    } catch (error) {

      // Show any database error in the console.
      console.error(
        'Failed to create food:',
        error
      );
      Alert.alert('Could not save food', 'Please check the details and try again.');
    } finally {
      setSavingFood(false);
    }
  };


  // ==========================================================
  // SCREEN UI
  // ==========================================================
  //
  // Everything below describes what the user sees.
  return (

    // --------------------------------------------------------
    // KEYBOARD AVOIDING VIEW
    // --------------------------------------------------------
    //
    // This helps prevent the Android/iOS keyboard
    // from covering text fields.
    <KeyboardAvoidingView
      style={styles.screen}

      // iOS and Android handle the keyboard differently.
      //
      // We use:
      //
      //     padding
      //
      // on iOS
      //
      // and:
      //
      //     height
      //
      // on Android.
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : 'height'
      }
    >


      {/* 
        ------------------------------------------------------
        MAIN SCROLL VIEW
        ------------------------------------------------------

        The Food Library can contain many foods,
        so the user needs to be able to scroll.
      */}
      <ScrollView

        style={styles.container}

        contentContainerStyle={
          styles.content
        }

        // Allows the user to tap buttons/results
        // while the keyboard is still open.
        keyboardShouldPersistTaps="handled"

        // Controls how the keyboard is dismissed.
        //
        // On Android:
        //     dragging the screen hides the keyboard.
        //
        // On iOS:
        //     interactive keyboard dismissal is used.
        keyboardDismissMode={
          Platform.OS === 'ios'
            ? 'interactive'
            : 'on-drag'
        }

        // Hide the default scrollbar.
        showsVerticalScrollIndicator={
          false
        }
      >


        {/* ==================================================
            HEADER
            ================================================== */}

        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to meal logging" onPress={returnToMeals} style={styles.libraryBack}><Ionicons name="chevron-back" size={18} color="#25634C" /></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Food Library</Text>
            <Text style={styles.subtitle}>Search or manage saved foods.</Text>
          </View>
          <Pressable style={styles.addFoodToggle} onPress={() => setAddFormExpanded((expanded) => !expanded)}>
            <Ionicons name={addFormExpanded ? 'close' : 'add'} size={19} color="#FFFFFF" />
            <Text style={styles.addFoodToggleText}>{addFormExpanded ? 'Close' : 'Add food'}</Text>
          </Pressable>
        </View>


        {/* ==================================================
            SEARCH
            ================================================== */}

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#9CA3AF" />
          {/* 
            Search input.

            Every time the user types,
            setSearch() updates the search state.

            That state change then triggers
            our useEffect above.
          */}
          <TextInput
            value={search}

            onChangeText={(value) => { setSearch(value); if (value.trim()) setAddFormExpanded(false); }}

            placeholder="Search foods..."

            placeholderTextColor="#9CA3AF"

            // Don't automatically capitalize
            // food names.
            autoCapitalize="none"

            // Don't automatically correct food names.
            autoCorrect={false}

            // Show a search button on the keyboard.
            returnKeyType="search"

            style={
              styles.searchInput
            }
          />

        </View>

        {!search.trim() && recentFoods.length > 0 && <View style={styles.recentCard}>
          <Text style={styles.recentTitle}>Recent</Text>
          <View style={styles.recentList}>{recentFoods.slice(0, 5).map((food) => <Pressable key={food.id} style={styles.recentChip} onPress={() => setSearch(food.name)}><Text style={styles.recentText} numberOfLines={1}>{food.name}</Text></Pressable>)}</View>
        </View>}


        {/* ==================================================
            ADD FOOD FORM
            ================================================== */}

        {/* 
          IMPORTANT:

          We only show the Add Food form when
          the search box is empty.

          This keeps the interface cleaner.

          When the user starts searching,
          the Add Food form disappears and
          search results take its place.
        */}
        {addFormExpanded && (

          <View style={styles.form}>

            <Text
              style={styles.formTitle}
            >
              Add Food
            </Text>


            {/* Food name */}

            <TextInput
              value={name}

              onChangeText={
                setName
              }

              placeholder="Food name"

              placeholderTextColor="#9CA3AF"

              style={styles.input}
            />


            {/* Serving size */}

            <TextInput
              value={servingSize}

              onChangeText={
                setServingSize
              }

              placeholder="Serving size"

              placeholderTextColor="#9CA3AF"

              // Numeric keyboard.
              keyboardType="decimal-pad"

              style={styles.input}
            />


            {/* 
              Explain that all nutrition values
              should correspond to the serving size
              entered above.
            */}
            <Text
              style={styles.hint}
            >
              Enter nutrition values for the
              serving size above.
            </Text>


            {/* Calories */}

            <TextInput
              value={calories}

              onChangeText={
                setCalories
              }

              placeholder="Calories"

              placeholderTextColor="#9CA3AF"

              keyboardType="decimal-pad"

              style={styles.input}
            />


            {/* Protein */}

            <TextInput
              value={protein}

              onChangeText={
                setProtein
              }

              placeholder="Protein (g)"

              placeholderTextColor="#9CA3AF"

              keyboardType="decimal-pad"

              style={styles.input}
            />


            {/* Carbohydrates */}

            <TextInput
              value={carbs}

              onChangeText={
                setCarbs
              }

              placeholder="Carbs (g)"

              placeholderTextColor="#9CA3AF"

              keyboardType="decimal-pad"

              style={styles.input}
            />


            {/* Fat */}

            <TextInput
              value={fat}

              onChangeText={
                setFat
              }

              placeholder="Fat (g)"

              placeholderTextColor="#9CA3AF"

              keyboardType="decimal-pad"

              style={styles.input}
            />


            {/* Fibre */}

            <TextInput
              value={fibre}

              onChangeText={
                setFibre
              }

              placeholder="Fibre (g)"

              placeholderTextColor="#9CA3AF"

              keyboardType="decimal-pad"

              style={styles.input}
            />


            {/* Save Food button */}

            <Pressable
              style={[styles.button, savingFood && { opacity: 0.6 }]}

              // When pressed,
              // create the food in SQLite.
              onPress={
                handleCreateFood
              }
              disabled={savingFood}
            >
              <Text
                style={
                  styles.buttonText
                }
              >
                {savingFood ? 'Saving…' : 'Save Food'}
              </Text>
            </Pressable>

          </View>
        )}


        {/* ==================================================
            FOOD LIST HEADER
            ================================================== */}

        <View
          style={styles.listHeader}
        >

          <Text
            style={styles.sectionTitle}
          >

            {/* 
              If searching:

                  Search Results

              Otherwise:

                  Your Foods
            */}
            {search.trim() ? `Results (${foods.length})` : `Saved foods (${foods.length})`}

          </Text>


          {/* 
            Show "Searching..." while
            the database search is running.
          */}
          {loading && (
            <Text
              style={
                styles.loadingText
              }
            >
              Searching...
            </Text>
          )}

        </View>


        {/* ==================================================
            EMPTY STATE OR FOOD LIST
            ================================================== */}

        {/* 
          If there are no foods AND we're not loading,
          show an empty state.
        */}
        {foods.length === 0 &&
        !loading ? (

          <View
            style={styles.emptyCard}
          >

            <Text
              style={
                styles.emptyTitle
              }
            >

              {/* 
                Different title depending
                on whether we're searching.
              */}
              {search.trim()
                ? 'No foods found'
                : 'No foods yet'}

            </Text>


            <Text
              style={
                styles.emptyText
              }
            >

              {search.trim()
                ? `No food matches "${search}".`
                : 'Add a food to your library, or search to find one.'}

            </Text>

          </View>

        ) : (

          // ==================================================
          // FOOD LIST
          // ==================================================
          //
          // map() creates one card for every food.
          foods.map((item) => (

            <View key={item.id} style={styles.foodCard}>
              <View style={styles.foodSummaryRow}>
                <Pressable style={styles.foodSummary} onPress={() => setExpandedFoodId((current) => current === item.id ? null : item.id)} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.calories} calories per ${item.servingSize} grams`}>
                  <View style={styles.foodSummaryText}>
                    <Text style={styles.foodName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.foodServing}>Per {item.servingSize} g</Text>
                  </View>
                  <Text style={styles.foodCalories}>{formatFoodCalories(item.calories)} kcal</Text>
                </Pressable>
                <Pressable style={styles.favoriteButton} onPress={async () => { try { await toggleFoodFavorite(db, item.id); await loadFoods(search); } catch (error) { console.error(error); Alert.alert('Could not update favorite', 'Please try again.'); } }} accessibilityRole="button" accessibilityLabel={item.favorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}>
                  <Ionicons name={item.favorite ? 'star' : 'star-outline'} size={19} color={item.favorite ? '#E8A317' : '#9CA3AF'} />
                </Pressable>
                <Pressable style={styles.expandFoodButton} onPress={() => setExpandedFoodId((current) => current === item.id ? null : item.id)} accessibilityLabel={expandedFoodId === item.id ? 'Hide food details' : 'Show food details'}>
                  <Ionicons name={expandedFoodId === item.id ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
                </Pressable>
              </View>
              {expandedFoodId === item.id && <>
                <View style={styles.expandedMacroRow}>
                  <Macro label="Protein" value={`${item.protein} g`} />
                  <Macro label="Carbs" value={`${item.carbs} g`} />
                  <Macro label="Fat" value={`${item.fat} g`} />
                  <Macro label="Fibre" value={`${item.fibre} g`} />
                </View>
                <View style={styles.foodActions}>
                  <Pressable style={styles.foodAction} onPress={() => router.push({ pathname: '/food-edit', params: { foodId: item.id, date: requestedDate, returnTo } } as never)}><Ionicons name="create-outline" size={15} color="#374151" /><Text style={styles.foodActionText}>Edit</Text></Pressable>
                  <Pressable style={[styles.foodAction, styles.foodDeleteAction]} onPress={() => Alert.alert('Delete food', `Remove ${item.name} from your library? Existing meals will stay saved.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteFood(db, item.id); await loadFoods(search); } catch (error) { console.error(error); Alert.alert('Could not delete food', 'Please try again.'); } } },
                  ])}><Ionicons name="trash-outline" size={15} color="#DC2626" /><Text style={styles.foodDeleteText}>Delete</Text></Pressable>
                </View>
              </>}
            </View>
          ))
        )}

      </ScrollView>

    </KeyboardAvoidingView>
  );
}


// ============================================================
// MACRO COMPONENT
// ============================================================
//
// This is a small reusable component.
//
// Instead of writing the same UI four times,
// we can use:
//
//     <Macro
//       label="Protein"
//       value="25g"
//     />
//
// This keeps our Food Library code easier to read.
function Macro({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (

    <View style={styles.macro}>

      {/* Macro name */}

      <Text
        style={
          styles.macroLabel
        }
      >
        {label}
      </Text>


      {/* Macro value */}

      <Text
        style={
          styles.macroValue
        }
      >
        {value}
      </Text>

    </View>
  );
}


// ============================================================
// STYLES
// ============================================================
//
// React Native uses JavaScript/TypeScript objects
// for styling instead of normal CSS files.
//
// StyleSheet.create() creates all the styles
// used by this screen.
const styles = StyleSheet.create({

  // ----------------------------------------------------------
  // SCREEN
  // ----------------------------------------------------------

  screen: {
    // Fill the entire available screen.
    flex: 1,

    // Light gray background.
    backgroundColor: '#F7F8FA',
  },


  container: {
    // Allow ScrollView to fill the screen.
    flex: 1,
  },


  content: {
    // Space around the content.
    padding: 20,

    // Space at the top.
    paddingTop: 60,

    // Space at the bottom.
    paddingBottom: 50,
  },


  // ----------------------------------------------------------
  // HEADER
  // ----------------------------------------------------------

  title: {
    fontSize: 25,
    fontWeight: '700',
    color: '#111827',
  },


  subtitle: {
    marginTop: 3,
    marginBottom: 12,
    color: '#6B7280',
    fontSize: 14,
  },


  // ----------------------------------------------------------
  // SEARCH
  // ----------------------------------------------------------

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  libraryBack: { height: 36, width: 36, borderRadius: 10, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  addFoodToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#111827', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  addFoodToggleText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 13, marginBottom: 8 },


  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },


  // ----------------------------------------------------------
  // ADD FOOD FORM
  // ----------------------------------------------------------

  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },


  formTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },


  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 15,
    color: '#111827',
  },


  // Explanation shown above the nutrition fields.
  hint: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 17,
  },


  // Save Food button.
  button: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },


  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },


  // ----------------------------------------------------------
  // FOOD LIST HEADER
  // ----------------------------------------------------------

  listHeader: {
    // Put title and loading text
    // next to each other.
    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    marginTop: 15,

    marginBottom: 10,
  },


  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
  },


  loadingText: {
    color: '#6B7280',
    fontSize: 13,
  },


  // ----------------------------------------------------------
  // FOOD CARD
  // ----------------------------------------------------------

  foodCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginBottom: 7,

    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recentCard: { backgroundColor: '#EEF2F7', borderRadius: 12, padding: 10, marginTop: 4 },
  recentTitle: { fontWeight: '700', color: '#6B7280', fontSize: 11, marginBottom: 6 },
  recentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  recentChip: { maxWidth: '48%', backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  recentText: { color: '#374151', fontSize: 12 },
  foodSummaryRow: { flexDirection: 'row', alignItems: 'center' },
  foodSummary: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  foodSummaryText: { flex: 1 },
  foodCalories: { color: '#374151', fontSize: 13, fontWeight: '700' },
  favoriteButton: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center' },
  expandFoodButton: { width: 30, height: 38, alignItems: 'center', justifyContent: 'center' },
  expandedMacroRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 9, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  foodActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7, marginTop: 5 },
  foodAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8 },
  foodActionText: { color: '#374151', fontWeight: '600' },
  foodDeleteAction: { borderColor: '#FCA5A5' },
  foodDeleteText: { color: '#DC2626', fontWeight: '600' },


  foodName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },


  foodServing: {
    color: '#6B7280',
    marginTop: 2,
    fontSize: 11,
  },


  // ----------------------------------------------------------
  // MACRO ROW
  // ----------------------------------------------------------

  macroRow: {
    // Put macros horizontally.
    flexDirection: 'row',

    // Spread them across the available width.
    justifyContent: 'space-between',

    marginTop: 10,
  },


  macro: {
    alignItems: 'flex-start',
  },


  macroLabel: {
    fontSize: 11,
    color: '#9CA3AF',
  },


  macroValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },


  // ----------------------------------------------------------
  // EMPTY STATE
  // ----------------------------------------------------------

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',

    borderWidth: 1,
    borderColor: '#E5E7EB',
  },


  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },


  emptyText: {
    marginTop: 6,
    color: '#6B7280',
    textAlign: 'center',
  },

});
