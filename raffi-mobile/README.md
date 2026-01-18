# Raffi Mobile 📱

A mobile companion app for [Raffi](../raffi), the desktop streaming application. Built with React Native and Expo.

## Features

- 🎬 **Browse Content**: Popular movies and TV shows from Stremio Cinemeta
- 📺 **Continue Watching**: Sync your watch progress across devices
- 🔍 **Search**: Find any movie or TV show instantly
- ▶️ **Native Playback**: Built-in video player with seek, play/pause controls
- 🌙 **Dark Theme**: Netflix-style dark UI matching the desktop app
- 🔐 **Authentication**: Supabase auth synced with desktop app
- 📦 **Addon Support**: Use Stremio addons for streaming sources

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm start
   ```

3. Open on device/emulator:
   - Press `i` for iOS Simulator
   - Press `a` for Android Emulator
   - Scan QR code with Expo Go app on your phone

## Project Structure

```
app/                    # Expo Router file-based routing
├── (tabs)/            # Tab navigation screens
│   ├── index.tsx      # Home screen
│   ├── search.tsx     # Search screen
│   ├── downloads.tsx  # Downloads screen
│   └── profile.tsx    # Profile/settings screen
├── meta/[id].tsx      # Movie/series detail page
├── player.tsx         # Video player
└── login.tsx          # Authentication

components/            # Reusable UI components
├── home/             # Home screen components
│   ├── Hero.tsx
│   ├── ContentRow.tsx
│   └── ContinueWatching.tsx
└── common/           # Shared components
    ├── LoadingSpinner.tsx
    ├── PosterCard.tsx
    └── SearchBar.tsx

lib/                  # Core functionality
├── api.ts           # Cinemeta API client
├── db.ts            # Supabase database operations
├── supabase.ts      # Supabase client config
├── types.ts         # TypeScript types
└── stores/          # Zustand state management
    ├── authStore.ts
    ├── libraryStore.ts
    └── addonsStore.ts

constants/
└── theme.ts         # Design system (colors, typography, spacing)
```

## Streaming Server

For torrent streams, the app connects to the Raffi desktop server for transcoding.
Update `STREAMING_SERVER` in `app/player.tsx` with your server IP:

```typescript
const STREAMING_SERVER = 'http://YOUR_IP:6969';
```

## Tech Stack

- **React Native** with Expo SDK 54
- **Expo Router** - File-based routing
- **Expo Video** - Native video playback
- **Zustand** - State management
- **Supabase** - Authentication & database
- **React Native Reanimated** - Animations

## Building

### Development Build

```bash
npx expo run:ios
npx expo run:android
```

### Production Build

```bash
eas build --platform ios
eas build --platform android
```

## Notes

- **EAC3/Dolby Audio**: Most modern phones support EAC3 natively
- **Transcoding**: For unsupported codecs, streams are transcoded via the desktop server
- **Offline**: Downloads feature coming soon

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
