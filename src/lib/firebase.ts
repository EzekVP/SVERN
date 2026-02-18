import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Auth } from 'firebase/auth';
import * as FirebaseAuth from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const hasConfig = Object.values(firebaseConfig).every(Boolean);

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

if (hasConfig) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
  if (Platform.OS === 'web') {
    auth = FirebaseAuth.getAuth(app);
  } else {
    try {
      const getReactNativePersistence = (
        FirebaseAuth as unknown as {
          getReactNativePersistence?: (storage: typeof AsyncStorage) => unknown;
        }
      ).getReactNativePersistence;
      auth = getReactNativePersistence
        ? FirebaseAuth.initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage) as any,
          })
        : FirebaseAuth.getAuth(app);
    } catch {
      auth = FirebaseAuth.getAuth(app);
    }
  }

  db = getFirestore(app);
}

export { app, auth, db, hasConfig };
