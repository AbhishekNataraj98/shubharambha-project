# Shubharambha Mobile App

## Overview
React Native + Expo mobile app.
Sister app to the Next.js web app in apps/web/.
Same Supabase backend, same API routes.

## Web app API base URL
Use EXPO_PUBLIC_API_URL for all API calls.
Example: fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/register`)

## Navigation (expo-router file-based)
app/
  _layout.tsx           root layout, auth check
  (auth)/
    _layout.tsx
    login.tsx
    register.tsx
  (app)/
    (tabs)/
      _layout.tsx       bottom tab bar
      index.tsx         home/dashboard
      projects.tsx      projects list
      search.tsx        find contractors
      profile.tsx       my profile
    projects/
      [id]/
        index.tsx
        updates/
          new.tsx
        payments.tsx
    contractors/
      [id].tsx
    notifications/
      index.tsx

## Styling
NativeWind v4 — use className prop like Tailwind
Orange brand: #E8590C
SafeAreaView on every screen
Min touch target: 48px height on all buttons

## Current build status
- [ ] Supabase client setup
- [ ] Root auth layout
- [ ] Login screen
- [ ] Register screen  
- [ ] Bottom tab navigator
- [ ] Dashboard screen
- [ ] Projects list
- [ ] Project detail
- [ ] Daily updates feed
- [ ] Post update with camera
- [ ] Payment ledger
- [ ] Chat
- [ ] Contractor search
- [ ] Notifications
