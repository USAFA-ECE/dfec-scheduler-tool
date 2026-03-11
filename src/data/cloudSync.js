import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

// All shared app state lives in one Firestore document.
const STATE_DOC = isFirebaseConfigured ? doc(db, 'dfec', 'state') : null;

/**
 * Subscribe to real-time state from Firestore.
 *
 * - Fires onData(state) immediately with the current document, then on every
 *   remote change.
 * - Fires onStatus('loading' | 'synced' | 'offline') to reflect connection state.
 * - Returns an unsubscribe function (call on unmount).
 *
 * If Firebase is not yet configured, immediately marks status as 'offline'
 * and returns a no-op unsubscribe so the app degrades to localStorage-only.
 */
export function subscribeToCloud(onData, onStatus) {
    if (!isFirebaseConfigured || !STATE_DOC) {
        onStatus('offline');
        return () => {};
    }

    onStatus('loading');
    return onSnapshot(
        STATE_DOC,
        (snap) => {
            if (snap.exists()) {
                onData(snap.data());
            }
            onStatus('synced');
        },
        (err) => {
            console.warn('[Firestore] snapshot error:', err);
            onStatus('offline');
        },
    );
}

/**
 * Persist state to Firestore.
 * activeSemester is excluded — it's per-user UI state, not shared data.
 */
export async function saveToCloud(state) {
    if (!isFirebaseConfigured || !STATE_DOC) return;
    // eslint-disable-next-line no-unused-vars
    const { activeSemester, ...toSave } = state;
    await setDoc(STATE_DOC, toSave);
}
