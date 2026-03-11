import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// ── Firebase configuration ────────────────────────────────────────────────────
// 1. Go to https://console.firebase.google.com/
// 2. Create a project → Add a Web app → copy the config below.
// 3. In Firestore Database → Rules, set:
//      allow read, write: if true;
//
// These values are safe to commit — Firebase security is enforced by
// Firestore Security Rules, not by keeping the config secret.
// See: https://firebase.google.com/docs/projects/api-keys
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey:            'AIzaSyBXqLgJEeGTgcd-tcIikJSvt8Sm93HEEzA',
    authDomain:        'dfec-scheduler-tool.firebaseapp.com',
    projectId:         'dfec-scheduler-tool',
    storageBucket:     'dfec-scheduler-tool.firebasestorage.app',
    messagingSenderId: '528302606848',
    appId:             '1:528302606848:web:3931b1a0bbbb39dcf866e5',
    measurementId:     'G-9YC5M89B6N',
};

// True once you've replaced the placeholder values above.
export const isFirebaseConfigured =
    !firebaseConfig.projectId.startsWith('REPLACE_WITH');

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
