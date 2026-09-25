# Fitness Tracker

An Android-first, offline fitness and food tracker. Your logs are stored locally on your device.

## Download the APK

[**Download Fitness Tracker for Android**](https://drive.google.com/file/d/1_a45TPc0AKzBGteoa3txvAPT_V9dQes2/view?usp=sharing)

The APK is hosted on Google Drive. If Google Drive asks for access, the file owner needs to set General access to **Anyone with the link**. The download link will keep working when the APK is replaced in the same Drive file.

## Features

- Log meals, foods, calories, protein, carbohydrates, fat, and fibre.
- Track weight, steps, workouts, and exercises by date.
- Review daily graphs and rolling seven-day averages.
- Set weekly tracking targets.
- Back up and restore app data as JSON.
- Use core tracking features offline; data stays in the local SQLite database.

## Development

### Requirements

- Node.js and npm
- Android emulator or Android device for app testing

### Run the app

From the `Projects/FitnessTracker` directory:

```powershell
npm install
npx expo start --android
```

If Metro has stale state, run:

```powershell
npx expo start --android -c
```

### Build an APK

The EAS `preview` profile creates an installable APK for direct distribution:

```powershell
npx eas-cli@latest login
npx eas-cli@latest project:init
npx eas-cli@latest build --platform android --profile preview
```

The Android application ID is `com.mohansharma.fitnesstracker`. After the cloud build completes, download the APK from the EAS build page and replace the existing APK in Google Drive to keep the download link stable.

### Project checks

```powershell
npx expo lint
npx tsc --noEmit
```

## Project structure

```text
src/app/             Expo Router screens
src/database/        SQLite initialization and schema
src/hooks/           Screen data hooks
src/repositories/    SQLite data access
src/services/        Nutrition, analytics, and backup logic
src/types/           TypeScript data models
src/utils/           Dates, IDs, and unit conversion
```

## Privacy

The app stores tracking data on the device. Backups may contain personal health information; store them in a private location.

Made by Mohan Sharma.
