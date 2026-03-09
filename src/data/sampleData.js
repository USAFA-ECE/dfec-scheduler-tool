import defaultState from './defaultState.json';
import { SEMESTERS } from './models';

const SAVED_DATASET_KEY = 'dfec-saved-dataset';

// ===================== LOAD FUNCTION =====================
export function loadPreviousDataset(dispatch) {
    let data = defaultState;
    try {
        const saved = localStorage.getItem(SAVED_DATASET_KEY);
        if (saved) {
            data = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Failed to load saved dataset, using default:', e);
    }
    dispatch({ type: 'SET_FACULTY', payload: data.faculty || [] });
    dispatch({ type: 'SET_COURSES', payload: data.courses || [] });
    dispatch({ type: 'SET_QUALIFICATIONS', payload: data.qualifications || {} });
    dispatch({ type: 'SET_PREFERENCES', payload: data.preferences || {} });
    dispatch({ type: 'SET_CONSTRAINTS', payload: data.constraints || {} });
    dispatch({ type: 'SET_ROOMS', payload: data.rooms || [] });
    dispatch({ type: 'SET_ACTIVE_SEMESTER', payload: data.activeSemester || SEMESTERS.FALL });
    dispatch({ type: 'SET_SCHEDULE', payload: data.schedule || [] });
}

// ===================== SAVE FUNCTION =====================
export function saveCurrentDataset(state) {
    try {
        localStorage.setItem(SAVED_DATASET_KEY, JSON.stringify(state));
        return true;
    } catch (e) {
        console.error('Failed to save dataset:', e);
        return false;
    }
}

// Check if a saved dataset exists
export function hasSavedDataset() {
    return localStorage.getItem(SAVED_DATASET_KEY) !== null;
}
