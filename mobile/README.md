# Bantoo Books Mobile

Expo (React Native) app for **iOS and Android**. Connects to the same backend as the web app at `books.bantoobooks.com`.

## Features (v1)

- Sign in / sign up
- Dashboard summary (assets, profit, counts)
- Customers — list and add
- Receipts and payments — list (create on web for now)

## Setup

```bash
cd mobile
npm install
npm start
```

Then:

- Press **i** for iOS simulator (Mac + Xcode required)
- Press **a** for Android emulator
- Scan the QR code with **Expo Go** on a physical phone

## API URL

Defaults to production: `https://books.bantoobooks.com`

For local backend during development:

```bash
EXPO_PUBLIC_API_URL=http://YOUR_MAC_IP:3000 npm start
```

## App Store / Play Store (later)

1. `npx eas login`
2. `npx eas build:configure`
3. `npx eas build --platform android`
4. `npx eas build --platform ios`

Requires an [Expo Application Services](https://expo.dev/eas) account.

## Deploy API first

The mobile app needs the `/api/v1/*` routes on the live site. Push `ledger/` changes to GitHub and redeploy Vercel before testing against production.
