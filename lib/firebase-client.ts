import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const requiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
];

const appCheckSiteKey =
  process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY?.trim() ?? "";

export const isFirebaseConfigured = requiredConfig.every(
  (value) => typeof value === "string" && value.trim().length > 0,
);

export const firebaseAuthUsersUrl = firebaseConfig.projectId
  ? `https://console.firebase.google.com/project/${encodeURIComponent(firebaseConfig.projectId)}/authentication/users`
  : "https://console.firebase.google.com/";

let persistencePromise: Promise<void> | null = null;
let appCheckInitialized = false;

function requireBrowser() {
  if (typeof window === "undefined") {
    throw new Error("Firebase só pode ser iniciado no navegador.");
  }
  if (!isFirebaseConfigured) {
    throw new Error("A configuração do Firebase ainda não foi informada.");
  }
}

function primaryApp(): FirebaseApp {
  requireBrowser();
  const existing = getApps().find((app) => app.name === "[DEFAULT]");
  const app = existing ?? initializeApp(firebaseConfig);
  if (appCheckSiteKey && !appCheckInitialized) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  }
  return app;
}

export function firebaseAuth(): Auth {
  const auth = getAuth(primaryApp());
  persistencePromise ??= setPersistence(auth, browserLocalPersistence);
  return auth;
}

export async function waitForAuthPersistence() {
  firebaseAuth();
  await persistencePromise;
}

export function firebaseDb(): Firestore {
  return getFirestore(primaryApp());
}
