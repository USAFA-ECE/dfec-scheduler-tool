import { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef } from 'react';
import { SEMESTERS, DEFAULT_SCHEDULER_SETTINGS } from './models';
import seedData from './defaultState.json';
import { subscribeToCloud, saveToCloud } from './cloudSync';

const AppContext = createContext(null);

const STORAGE_KEY = 'dfec-scheduler-data';

// Build a role lookup from seed data so migrations can restore missing roles.
const seedRoleById = Object.fromEntries(
    (seedData.faculty ?? []).map(f => [f.id, f.role ?? 'instructor'])
);

/** Ensure every faculty member has a role, restoring from seed if missing. */
function repairFacultyRoles(faculty) {
    return faculty.map(f => ({
        ...f,
        role: f.role ?? seedRoleById[f.id] ?? 'instructor',
    }));
}

function getInitialState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // If saved state has real faculty data, use it (with role repair)
            if (parsed.faculty?.length > 0) {
                return { ...defaultState, ...parsed, faculty: repairFacultyRoles(parsed.faculty) };
            }
        }
    } catch (e) {
        console.warn('Failed to load saved state:', e);
    }
    // Seed from bundled defaultState.json (first load or empty saved state)
    return { ...defaultState, ...seedData };
}

const defaultState = {
    faculty: [],
    courses: [],
    qualifications: {}, // key: `${facultyId}-${courseId}`, value: qual status
    preferences: {},    // key: facultyId, value: { fall: { availability, courseInterests, auditInterests }, spring: { ... } }
                        // backward-compat: may also be flat { availability, courseInterests, auditInterests } (treated as shared)
    constraints: {},    // key: courseId, value: constraint object
    schedule: [],       // array of assignments
    activeSemester: SEMESTERS.SPRING,
    rooms: [],
    schedulerSettings: { ...DEFAULT_SCHEDULER_SETTINGS },
};

function reducer(state, action) {
    switch (action.type) {
        case 'SET_FACULTY':
            return { ...state, faculty: action.payload };
        case 'ADD_FACULTY': {
            const updated = [...state.faculty, action.payload];
            updated.sort((a, b) => a.name.localeCompare(b.name));
            return { ...state, faculty: updated };
        }
        case 'UPDATE_FACULTY':
            return { ...state, faculty: state.faculty.map(f => f.id === action.payload.id ? { ...f, ...action.payload } : f) };
        case 'DELETE_FACULTY':
            return { ...state, faculty: state.faculty.filter(f => f.id !== action.payload) };
        case 'SET_COURSES':
            return { ...state, courses: action.payload };
        case 'ADD_COURSE':
            return { ...state, courses: [...state.courses, action.payload] };
        case 'UPDATE_COURSE':
            return { ...state, courses: state.courses.map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c) };
        case 'DELETE_COURSE':
            return { ...state, courses: state.courses.filter(c => c.id !== action.payload) };
        case 'SET_QUALIFICATION':
            return { ...state, qualifications: { ...state.qualifications, [action.payload.key]: action.payload.status } };
        case 'SET_QUALIFICATIONS':
            return { ...state, qualifications: action.payload };
        case 'SET_PREFERENCE':
            return { ...state, preferences: { ...state.preferences, [action.payload.facultyId]: action.payload.data } };
        case 'SET_PREFERENCES':
            return { ...state, preferences: action.payload };
        case 'SET_CONSTRAINT':
            return { ...state, constraints: { ...state.constraints, [action.payload.courseId]: action.payload.data } };
        case 'SET_CONSTRAINTS':
            return { ...state, constraints: action.payload };
        case 'SET_SCHEDULE':
            return { ...state, schedule: action.payload };
        case 'SET_ACTIVE_SEMESTER':
            return { ...state, activeSemester: action.payload };
        case 'SET_ROOMS':
            return { ...state, rooms: action.payload };
        case 'SET_SCHEDULER_SETTINGS':
            return { ...state, schedulerSettings: { ...state.schedulerSettings, ...action.payload } };
        case 'ADD_ROOM':
            return { ...state, rooms: [...state.rooms, action.payload] };
        case 'UPDATE_ROOM':
            return { ...state, rooms: state.rooms.map(r => r.id === action.payload.id ? { ...r, ...action.payload } : r) };
        case 'DELETE_ROOM':
            return { ...state, rooms: state.rooms.filter(r => r.id !== action.payload) };
        case 'LOAD_STATE': {
            const loaded = action.payload;
            return {
                ...defaultState,
                ...loaded,
                faculty: repairFacultyRoles(loaded.faculty ?? []),
            };
        }
        case 'RESET_STATE':
            return { ...defaultState };
        default:
            return state;
    }
}

export function AppProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, null, getInitialState);
    const [syncStatus, setSyncStatus] = useState('loading');

    // Set to true after the first Firestore snapshot arrives.
    // Prevents writing stale localStorage state back to Firestore on cold start.
    const syncReadyRef = useRef(false);

    // Counts in-flight remote dispatches so the save effect can skip writing
    // them back to Firestore (loop prevention).
    const pendingRemoteRef = useRef(0);

    // ── Real-time Firestore subscription ─────────────────────────────────────
    useEffect(() => {
        const unsub = subscribeToCloud(
            (remoteData) => {
                syncReadyRef.current = true;
                pendingRemoteRef.current++;
                dispatch({ type: 'LOAD_STATE', payload: remoteData });
            },
            setSyncStatus,
        );
        return unsub;
    }, []);

    // ── Persist on state changes ──────────────────────────────────────────────
    useEffect(() => {
        // Always mirror to localStorage (offline fallback)
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save state:', e);
        }

        // Don't write to Firestore until the initial cloud snapshot has arrived.
        // This prevents a stale localStorage state from overwriting cloud data.
        if (!syncReadyRef.current) return;

        // Skip if this state change came from Firestore (prevents write loops).
        if (pendingRemoteRef.current > 0) {
            pendingRemoteRef.current--;
            return;
        }

        setSyncStatus('syncing');
        const timer = setTimeout(async () => {
            try {
                await saveToCloud(state);
                setSyncStatus('synced');
            } catch (e) {
                console.warn('[Firestore] save failed:', e);
                setSyncStatus('offline');
            }
        }, 1500);
        return () => clearTimeout(timer);
    }, [state]);

    const exportState = useCallback(() => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dfec-schedule-${state.activeSemester}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [state]);

    const importState = useCallback((file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    dispatch({ type: 'LOAD_STATE', payload: data });
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsText(file);
        });
    }, []);

    return (
        <AppContext.Provider value={{ state, dispatch, exportState, importState, syncStatus }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
}
