import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import * as SecureStore from "expo-secure-store";

// Firebase config — replace with your project's config
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID",
};

// Initialize Firebase (only once)
if (getApps().length === 0) {
  initializeApp(firebaseConfig);
}

const auth = getAuth();

export async function signIn(
  email: string,
  password: string
): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdToken();
  await SecureStore.setItemAsync("firebase_id_token", token);
  return credential.user;
}

export async function signUp(
  email: string,
  password: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
  const token = await credential.user.getIdToken();
  await SecureStore.setItemAsync("firebase_id_token", token);
  return credential.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
  await SecureStore.deleteItemAsync("firebase_id_token");
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const token = await user.getIdToken();
      await SecureStore.setItemAsync("firebase_id_token", token);
    }
    callback(user);
  });
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}
