# Developer guide

This guide describes how the Fitness Tracker code is organized and where to start when changing a feature. The app is an Expo Router / React Native app; user data is stored locally in SQLite and the UI works offline.

## How a screen gets data

Most data-backed screens follow this path:

```text
src/app screen → src/hooks or src/services → src/repositories → SQLite
```

- **Screens (`src/app/`)** render the UI, handle user input, and navigate with Expo Router. File names become routes: `index.tsx` is `/`, `weekly-breakdown.tsx` is `/weekly-breakdown`, and so on. `_layout.tsx` sets up the SQLite provider, selected-date context, error boundary, and tab navigation.
- **Hooks (`src/hooks/`)** connect screen lifecycle/state to reusable data-loading logic. For example, `useDailyDashboard` loads one selected day's summary and meals.
- **Services (`src/services/`)** combine repository data or implement rules that do not belong in a screen: macro calculations, analytics, CSV export, backup validation/import, and data deletion.
- **Repositories (`src/repositories/`)** own SQL reads and writes for a feature. Prefer adding queries here rather than embedding SQL in a screen.
- **Types (`src/types/`)** define the models passed between screens, services, and repositories. SQLite uses snake_case columns; repository mappers expose camelCase models where needed.

## Where features live

| Area | Main files |
| --- | --- |
| Today's summary and daily logging | `src/app/index.tsx`, `src/hooks/useDailyDashboard.ts`, `src/services/analyticsService.ts`, `src/repositories/dailyLogRepository.ts` |
| Meals and food library | `src/app/add-meal.tsx`, `src/app/foods.tsx`, `src/app/food-edit.tsx`, `src/repositories/mealRepository.ts`, `src/repositories/foodRepository.ts`, `src/services/macroService.ts` |
| Workouts and templates | `src/app/workouts.tsx`, `src/app/templates.tsx`, `src/app/workout-history.tsx`, `src/repositories/workoutRepository.ts`, `src/repositories/templateRepository.ts` |
| Notes | `src/app/notes.tsx`, `src/repositories/notesRepository.ts` |
| History and analytics | `src/app/history.tsx`, `src/app/weekly-breakdown.tsx`, `src/services/rangeAnalyticsService.ts` |
| Backup, exports, and deletion | `src/app/backup.tsx`, `src/app/export.tsx`, `src/app/clear-data.tsx`, `src/services/backupService.ts`, `src/services/csvExportService.ts`, `src/services/dataManagementService.ts` |
| Shared UI and presentation | `src/components/`, `src/constants/theme.ts`, `src/hooks/use-theme.ts` |

## Database and data rules

- `src/database/database.ts` is the SQLite initialization entry point. It invokes `migrateDatabase` in `src/database/migrations/001_initial_schema.ts` before screens use the database.
- Keep schema changes in the migration module. Initialization runs on app launch, so schema creation and upgrades must tolerate an existing user's database.
- Keep queries parameterized (`?` placeholders) when values come from users or app state.
- Records with `deleted_at` are soft-deleted. Normal reads should filter them out; backup/restore and clear-data behavior should account for the stored rows as appropriate.
- Notes are local records too: include them in backup and full-data deletion paths when changing those features.
- Dates used as keys are `YYYY-MM-DD` strings. Use helpers from `src/utils/date.ts` for local calendar-day operations; avoid parsing a date-only string as a UTC timestamp for UI display.
- Body weight is stored in kilograms. Convert for display/input with `src/utils/weight.ts`, using the saved preference from `settingsRepository`.
- `backupService` imports inside a transaction so a failed restore does not leave a partial database. It validates table/column names before building SQL; preserve that validation when extending backups.

## Platform-specific files

React Native platform extensions let Metro choose a matching implementation. Files such as `app-tabs.tsx` and `app-tabs.web.tsx`, or `animated-icon.tsx` and `animated-icon.web.tsx`, share a purpose but can use platform-specific APIs. Keep web changes paired with native behavior where both platforms support the feature.

## Making a change

1. Find the route or component that owns the user interaction.
2. Put persistence in the matching repository; put shared calculations or workflows in a service.
3. Update the TypeScript model if data shape changes.
4. Update the schema, backup/restore, export, and clear-data paths when adding stored fields or tables.
5. Add comments for decisions that are not apparent from the code (ordering constraints, compatibility behavior, date math, or stale-request handling). Avoid comments that merely restate a variable or UI label.
6. Run `npx expo lint` and `npx tsc --noEmit` from `Projects/FitnessTracker`.
