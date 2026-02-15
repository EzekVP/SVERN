# SVERN

Shared CommonBox app with:
- Firebase Auth login/signup
- Realtime Firestore updates (boxes, items, notifications, chat)
- Offline/local cache via Zustand persistence
- Light/Dark mode and responsive screens

## Run

1. Copy `.env.example` to `.env` and fill Firebase values.
2. Install dependencies:
   - `npm install`
3. Start app:
   - `npm run start`

If Firebase env values are missing, the app runs in local demo mode.
