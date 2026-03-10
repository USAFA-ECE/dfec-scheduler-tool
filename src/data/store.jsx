import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { SEMESTERS, DEFAULT_SCHEDULER_SETTINGS } from './models';

const AppContext = createContext(null);

const STORAGE_KEY = 'dfec-scheduler-data';

function getInitialState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...defaultState, ...parsed };
        }
    } catch (e) {
        console.warn('Failed to load saved state:', e);
    }
    return defaultState;
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
        case 'ADD_FACULTY':
            return { ...state, faculty: [...state.faculty, action.payload] };
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
        case 'LOAD_STATE':
            return { ...defaultState, ...action.payload };
        case 'RESET_STATE':
            return { ...defaultState };
        default:
            return state;
    }
}

export function AppProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, null, getInitialState);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save state:', e);
        }
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
        <AppContext.Provider value={{ state, dispatch, exportState, importState }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
}
