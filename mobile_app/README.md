# AbhiTrade Mobile App

React Native / Expo mobile client for the AbhiTrade trading platform.

## Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- For Android: Android Studio + emulator (or physical device with Expo Go)
- For iOS (Mac only): Xcode + simulator

## Setup

```bash
cd mobile_app
npm install
```

## Running

```bash
# Start Expo dev server (scan QR with Expo Go app on your phone)
npm start

# Android emulator
npm run android

# iOS simulator (Mac only)
npm run ios
```

## Connecting to the backend

The mobile app talks to the same Next.js backend as the web app.

| Environment     | `apiBaseUrl` in `app.json`      |
|---|---|
| Android emulator | `http://10.0.2.2:3000/api`     |
| iOS simulator    | `http://localhost:3000/api`     |
| Physical device  | `http://<your-local-ip>:3000/api` |

**To use a physical device**, update `app.json`:
```json
"extra": {
  "apiBaseUrl": "http://192.168.1.X:3000/api"
}
```
Replace `192.168.1.X` with your PC's local IP address (`ipconfig` on Windows, `ifconfig` on Mac/Linux).

The Next.js backend must be running (`npm run dev` in the project root) and accessible on your network.

## Architecture

```
mobile_app/
├── app/                    # Expo Router screens (file-based)
│   ├── _layout.tsx         # Root layout + auth guard
│   ├── login.tsx           # Login / Sign-up with OTP
│   └── (tabs)/
│       ├── _layout.tsx     # Bottom tab bar
│       ├── index.tsx       # Dashboard
│       ├── watchlist.tsx   # Watchlist
│       ├── markets.tsx     # Option Chain
│       ├── orders.tsx      # Orders
│       └── profile.tsx     # Profile & Settings
├── components/             # Reusable components
│   ├── ui/                 # Button, Badge, Card, OtpInput
│   ├── market/             # IndexChip, OptionRow
│   ├── watchlist/          # WatchlistRow
│   └── orders/             # OrderCard
├── store/                  # Zustand state
│   ├── useAuthStore.ts     # User session (persisted to SecureStore)
│   ├── useMarketStore.ts   # Market data + mock ticker
│   └── useTradingStore.ts  # Live/Paper mode + orders
├── lib/
│   ├── api.ts              # API client (fetch wrapper)
│   └── storage.ts          # expo-secure-store wrapper
├── hooks/
│   └── useSession.ts       # Session hydration on app start
└── constants/
    └── colors.ts           # Design system colors
```

## Authentication Flow

1. User enters email → `POST /api/auth/send-otp`
2. User enters 6-digit OTP → `POST /api/auth/verify-otp`
3. On success: user saved to `useAuthStore` (persisted via SecureStore)
4. Session cookie `at_sid` (httpOnly) managed by the backend
5. On app restart: `GET /api/auth/me` validates session; 401 → redirect to login

## Trading Modes

- **Paper mode** (default): Mock prices tick every 400ms with simulated volatility
- **Live mode**: Mock ticker stops; prices should come from Angel One API (connect via Profile → Angel One)

## Features

| Screen | Features |
|---|---|
| Login | Email OTP sign-in + sign-up, 2-min resend timer, dev OTP banner |
| Dashboard | Index chips, portfolio summary, quick actions, recent orders |
| Watchlist | Real-time prices (paper mode), search, sort, buy/sell actions |
| Markets | Option chain with ITM/ATM/OTM highlighting, buy CE/PE |
| Orders | Active / History / Trades tabs, cancel orders |
| Profile | User info, KYC, settings, Paper/Live toggle, logout |
