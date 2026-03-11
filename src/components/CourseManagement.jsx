import { useState } from 'react';
import { useApp } from '../data/store';
import { useSession } from '../data/session';
import { SEMESTERS, PERIODS, QUAL_STATUS, createCourse } from '../data/models';
import { courseNumberSort } from '../utils/courseSort';
import { computeSectionsNeeded } from '../utils/courseUtils';

export default function CourseManagement() {
    const { state, dispatch } = useApp();
    const { isAdmin } = useSession();
    const { courses, constraints, qualifications, faculty, activeSemester } = state;
    const [showAddCourse, setShowAddCourse] = useState(false);
    const [editingCourse, setEditingCourse] = useState(null);
    const [deletingCourse, setDeletingCourse] = useState(null);
    const [editingEnrollment, setEditingEnrollment] = useState(null); // courseId | null
    const [enrollmentInput, setEnrollmentInput] = useState('');
    const [newCourse, setNewCourse] = useState({
        number: '', name: '', semester: 'both', enrollment: 0,
        classCap: 0, room: '', examType: '',
        isDoublePeriod: false, session: 'Regular 40 Lessons',
    });

    const activeCourses = courses.filter(c => c.semester === activeSemester || c.semester === 'both');

    // Find course director for a given course
    function getCourseDirector(courseId) {
        for (const f of faculty) {
            const key = `${f.id}-${courseId}`;
            if (qualifications[key] === QUAL_STATUS.COURSE_DIRECTOR) {
                return f;
            }
        }
        return null;
    }

    function toggleOffered(courseId) {
        const course = courses.find(c => c.id === courseId);
        if (course) {
            dispatch({ type: 'UPDATE_COURSE', payload: { id: courseId, isOffered: !(course.isOffered !== false) } });
        }
    }

    function saveCourse() {
        if (!newCourse.number.trim()) return;
        if (editingCourse) {
            dispatch({ type: 'UPDATE_COURSE', payload: { ...newCourse, id: editingCourse, enrollmentUnmatched: false } });
        } else {
            dispatch({ type: 'ADD_COURSE', payload: createCourse(newCourse) });
        }
        resetForm();
    }

    function resetForm() {
        setNewCourse({
            number: '', name: '', semester: 'both', enrollment: 0,
            classCap: 0, room: '', examType: '',
            isDoublePeriod: false, session: 'Regular 40 Lessons',
        });
        setEditingCourse(null);
        setShowAddCourse(false);
    }

    function editCourse(course) {
        setNewCourse(course);
        setEditingCourse(course.id);
        setShowAddCourse(true);
    }

    function deleteCourse(id) {
        setDeletingCourse(id);
    }

    function confirmDeleteCourse() {
        if (deletingCourse) {
            dispatch({ type: 'DELETE_COURSE', payload: deletingCourse });
            setDeletingCourse(null);
        }
    }

    // Determine if a period is auto-blocked for a course (single-section → no M1/T1)
    function isAutoBlocked(course, period) {
        const sections = computeSectionsNeeded(course.enrollment, course.classCap);
        return sections === 1 && (period === 'M1' || period === 'T1');
    }

    function toggleBlockedPeriod(courseId, period) {
        // Prevent toggling auto-blocked periods
        const course = courses.find(c => c.id === courseId);
        if (course && isAutoBlocked(course, period)) return;

        const existing = constraints[courseId] || { courseId, blockedPeriods: [], notes: '' };
        const blocked = existing.blockedPeriods.includes(period)
            ? existing.blockedPeriods.filter(p => p !== period)
            : [...existing.blockedPeriods, period];
        dispatch({
            type: 'SET_CONSTRAINT',
            payload: { courseId, data: { ...existing, blockedPeriods: blocked } }
        });
    }

    function commitEnrollment(courseId) {
        const val = parseInt(enrollmentInput, 10);
        if (!isNaN(val) && val >= 0) {
            dispatch({ type: 'UPDATE_COURSE', payload: { id: courseId, enrollment: val, enrollmentUnmatched: false } });
        }
        setEditingEnrollment(null);
    }

    function updateConstraintNotes(courseId, notes) {
        const existing = constraints[courseId] || { courseId, blockedPeriods: [], notes: '' };
        dispatch({
            type: 'SET_CONSTRAINT',
            payload: { courseId, data: { ...existing, notes } }
        });
    }

    const offeredCourses = activeCourses.filter(c => c.isOffered !== false).sort(courseNumberSort);
    const notOfferedCourses = activeCourses.filter(c => c.isOffered === false).sort(courseNumberSort);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Course Management</h1>
                    <p className="page-description">Manage course offerings, sections, and scheduling constraints</p>
                </div>
                <div className="flex gap-1">
                    <div className="semester-toggle">
                        <button
                            className={`semester-btn ${activeSemester === SEMESTERS.FALL ? 'active' : ''}`}
                            onClick={() => dispatch({ type: 'SET_ACTIVE_SEMESTER', payload: SEMESTERS.FALL })}
                        >Fall</button>
                        <button
                            className={`semester-btn ${activeSemester === SEMESTERS.SPRING ? 'active' : ''}`}
                            onClick={() => dispatch({ type: 'SET_ACTIVE_SEMESTER', payload: SEMESTERS.SPRING })}
                        >Spring</button>
                    </div>
                    {isAdmin && (
                        <button className="btn btn-primary" onClick={() => setShowAddCourse(true)}>
                            + Add Course
                        </button>
                    )}
                </div>
            </div>

            {activeCourses.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">📚</div>
                        <h3 className="empty-state-title">No Courses</h3>
                        <p className="empty-state-text">Add courses for the {activeSemester} semester.</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Course Table */}
                    <div className="card mb-2" style={{ padding: '0.5rem' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 50 }}>Offered</th>
                                        <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 80 }}>Course</th>
                                        <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>Name</th>
                                        <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 120 }}>Director</th>
                                        <th style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 70 }}>Enroll</th>
                                        <th style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 50 }}>Cap</th>
                                        <th style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 50 }}>Sec</th>
                                        <th style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 60 }}>Room</th>
                                        <th style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 80 }}>Double Period</th>
                                        <th style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 60 }}>Exam</th>
                                        <th style={{ width: 60 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...offeredCourses, ...notOfferedCourses].map(c => {
                                        const isOff = c.isOffered === false;
                                        const cd = getCourseDirector(c.id);
                                        return (
                                            <tr key={c.id} style={{
                                                borderBottom: '1px solid var(--border-color)',
                                                opacity: isOff ? 0.45 : 1,
                                                transition: 'opacity 0.2s',
                                            }}>
                                                <td style={{ textAlign: 'center', padding: '6px 8px' }}>
                                                    <span
                                                        onClick={() => isAdmin && toggleOffered(c.id)}
                                                        style={{
                                                            display: 'inline-block',
                                                            background: isOff ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                                                            color: isOff ? '#ef4444' : '#22c55e',
                                                            border: `1px solid ${isOff ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
                                                            borderRadius: '4px',
                                                            padding: '3px 6px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 600,
                                                            cursor: isAdmin ? 'pointer' : 'default',
                                                            minWidth: 36,
                                                        }}
                                                        title={isAdmin ? (isOff ? 'Click to mark as offered' : 'Click to mark as not offered') : undefined}
                                                    >
                                                        {isOff ? 'OFF' : 'ON'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                                    {c.number}
                                                </td>
                                                <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                                                    {c.name || '—'}
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    {cd
                                                        ? <span style={{ color: '#fbbf24', fontSize: '0.82rem' }}>★ {cd.name}</span>
                                                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                                </td>
                                                <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                                                    {isAdmin && editingEnrollment === c.id ? (
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            autoFocus
                                                            value={enrollmentInput}
                                                            onChange={e => { if (e.target.value === '' || /^\d+$/.test(e.target.value)) setEnrollmentInput(e.target.value); }}
                                                            onBlur={() => commitEnrollment(c.id)}
                                                            onKeyDown={e => { if (e.key === 'Enter') commitEnrollment(c.id); if (e.key === 'Escape') setEditingEnrollment(null); }}
                                                            style={{ width: 52, textAlign: 'center', padding: '2px 4px', fontSize: '0.85rem', background: 'var(--bg-elevated)', border: '1px solid #60a5fa', borderRadius: 4, color: 'var(--text-primary)' }}
                                                        />
                                                    ) : (
                                                        <span
                                                            onClick={() => { if (isAdmin) { setEditingEnrollment(c.id); setEnrollmentInput(String(c.enrollment)); } }}
                                                            title={c.enrollmentUnmatched ? 'Not found in SIS — estimated at 15. Click to edit.' : isAdmin ? 'Click to edit' : undefined}
                                                            style={{
                                                                display: 'inline-block',
                                                                minWidth: 36,
                                                                padding: '2px 6px',
                                                                borderRadius: 4,
                                                                cursor: isAdmin ? 'pointer' : 'default',
                                                                ...(c.enrollmentUnmatched ? {
                                                                    background: 'rgba(239,68,68,0.18)',
                                                                    border: '1px solid rgba(239,68,68,0.4)',
                                                                    color: '#fca5a5',
                                                                    fontWeight: 600,
                                                                } : {}),
                                                            }}
                                                        >
                                                            {c.enrollment}
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'center', padding: '8px' }}>{c.classCap}</td>
                                                <td style={{ textAlign: 'center', padding: '8px', fontWeight: 600 }}>{computeSectionsNeeded(c.enrollment, c.classCap)}</td>
                                                <td style={{ textAlign: 'center', padding: '8px', color: c.room ? 'var(--text-primary)' : 'var(--text-muted)' }}>{c.room || 'Auto'}</td>
                                                <td style={{ textAlign: 'center', padding: '8px' }}>
                                                    {c.isDoublePeriod ?
                                                        <span style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', padding: '2px 6px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 }}>Yes</span>
                                                        : '—'}
                                                </td>
                                                <td style={{ textAlign: 'center', padding: '8px' }}>{c.examType || '—'}</td>
                                                <td style={{ padding: '4px' }}>
                                                    {isAdmin && (
                                                        <div style={{ display: 'flex', gap: 2 }}>
                                                            <button className="btn btn-ghost btn-sm" onClick={() => editCourse(c)}>✎</button>
                                                            <button className="btn btn-ghost btn-sm" onClick={() => deleteCourse(c.id)}>✕</button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Constraints */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Period Constraints</h3>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {isAdmin ? 'Click to toggle blocked periods per course' : 'View-only'}
                            </span>
                        </div>
                        <div className="constraint-list">
                            {offeredCourses.map(c => {
                                const constraint = constraints[c.id] || { blockedPeriods: [], notes: '' };
                                const autoBlockedCount = PERIODS.filter(p => isAutoBlocked(c, p) && !constraint.blockedPeriods.includes(p)).length;
                                const totalBlocked = constraint.blockedPeriods.length + autoBlockedCount;
                                return (
                                    <div key={c.id} className="constraint-item" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                                        <div className="flex items-center justify-between">
                                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.number}</span>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {autoBlockedCount > 0 && (
                                                    <span className="tag" style={{ fontSize: '0.65rem', background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)' }}>
                                                        1 section — no M1/T1
                                                    </span>
                                                )}
                                                {totalBlocked > 0 && (
                                                    <span className="tag tag-red" style={{ fontSize: '0.7rem' }}>
                                                        {totalBlocked} blocked
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="constraint-periods">
                                            {PERIODS.map(p => {
                                                const autoBl = isAutoBlocked(c, p);
                                                const manualBl = constraint.blockedPeriods.includes(p);
                                                return (
                                                    <div
                                                        key={p}
                                                        className={`period-chip ${manualBl ? 'blocked' : autoBl ? 'blocked' : 'open'}`}
                                                        onClick={() => isAdmin && toggleBlockedPeriod(c.id, p)}
                                                        title={autoBl ? 'Auto-blocked: single-section courses skip early morning' : manualBl ? 'Manually blocked' : 'Available'}
                                                        style={autoBl ? {
                                                            cursor: 'not-allowed',
                                                            opacity: 0.7,
                                                            background: 'repeating-linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.15) 3px, rgba(239,68,68,0.08) 3px, rgba(239,68,68,0.08) 6px)',
                                                            border: '1px dashed rgba(239,68,68,0.4)',
                                                        } : undefined}
                                                    >
                                                        {autoBl ? `🔒 ${p}` : p}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <input
                                            className="form-input"
                                            style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                            placeholder="Notes (optional)"
                                            value={constraint.notes}
                                            onChange={e => isAdmin && updateConstraintNotes(c.id, e.target.value)}
                                            readOnly={!isAdmin}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* Add/Edit Course Modal */}
            {showAddCourse && (
                <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) resetForm(); }}>
                    <div className="modal">
                        <h2 className="modal-title">{editingCourse ? 'Edit Course' : 'Add Course'}</h2>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Course Number</label>
                                <input
                                    className="form-input"
                                    value={newCourse.number}
                                    onChange={e => setNewCourse({ ...newCourse, number: e.target.value })}
                                    placeholder="e.g. ECE 315"
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Course Name</label>
                                <input
                                    className="form-input"
                                    value={newCourse.name}
                                    onChange={e => setNewCourse({ ...newCourse, name: e.target.value })}
                                    placeholder="e.g. Probability & Statistics"
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Semester</label>
                                <select
                                    className="form-select"
                                    value={newCourse.semester}
                                    onChange={e => setNewCourse({ ...newCourse, semester: e.target.value })}
                                >
                                    <option value="both">Both (Fall & Spring)</option>
                                    <option value="fall">Fall Only</option>
                                    <option value="spring">Spring Only</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Room</label>
                                <select
                                    className="form-input"
                                    value={newCourse.room}
                                    onChange={e => setNewCourse({ ...newCourse, room: e.target.value })}
                                >
                                    <option value="">— Auto-assign —</option>
                                    {[...state.rooms].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(r => (
                                        <option key={r.id} value={r.name}>{r.name} ({r.seats} seats)</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Enrollment</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="form-input"
                                    value={newCourse.enrollment}
                                    onChange={e => {
                                        const v = e.target.value;
                                        if (v === '' || /^\d+$/.test(v)) {
                                            setNewCourse({ ...newCourse, enrollment: v === '' ? '' : parseInt(v) });
                                        }
                                    }}
                                    onBlur={() => {
                                        if (newCourse.enrollment === '') setNewCourse({ ...newCourse, enrollment: 0 });
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Class Cap</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="form-input"
                                    value={newCourse.classCap}
                                    onChange={e => {
                                        const v = e.target.value;
                                        if (v === '' || /^\d+$/.test(v)) {
                                            setNewCourse({ ...newCourse, classCap: v === '' ? '' : parseInt(v) });
                                        }
                                    }}
                                    onBlur={() => {
                                        if (newCourse.classCap === '') setNewCourse({ ...newCourse, classCap: 0 });
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Sections Needed</label>
                                <div
                                    className="form-input"
                                    style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-hover)', cursor: 'default', color: 'var(--text-secondary)' }}
                                >
                                    {computeSectionsNeeded(newCourse.enrollment, newCourse.classCap)}
                                    <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>(auto)</span>
                                </div>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Exam Type</label>
                                <select
                                    className="form-select"
                                    value={newCourse.examType}
                                    onChange={e => setNewCourse({ ...newCourse, examType: e.target.value })}
                                >
                                    <option value="">None</option>
                                    <option value="Essay">Essay</option>
                                    <option value="Exam">Exam</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: 22 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={newCourse.isDoublePeriod}
                                        onChange={e => setNewCourse({ ...newCourse, isDoublePeriod: e.target.checked })}
                                        style={{ width: 18, height: 18 }}
                                    />
                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Double Period</span>
                                </label>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveCourse}>
                                {editingCourse ? 'Save Changes' : 'Add Course'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Course Confirmation Modal */}
            {deletingCourse && (
                <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setDeletingCourse(null); }}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <h2 className="modal-title">Remove Course?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            Are you sure you want to remove this course? This action cannot be undone.
                        </p>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDeletingCourse(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={confirmDeleteCourse} style={{ background: '#ef4444' }}>
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
