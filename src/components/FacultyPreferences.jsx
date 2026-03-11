import { useState } from 'react';
import { useApp } from '../data/store';
import { useSession } from '../data/session';
import { AVAILABILITY, M_PERIODS, T_PERIODS, QUAL_STATUS, SEMESTERS } from '../data/models';
import { courseNumberSort } from '../utils/courseSort';

const AVAIL_CYCLE = [AVAILABILITY.AVAILABLE, AVAILABILITY.PREFER, AVAILABILITY.UNAVAILABLE];
const AVAIL_LABELS = {
    [AVAILABILITY.PREFER]: 'Prefer',
    [AVAILABILITY.AVAILABLE]: 'Open',
    [AVAILABILITY.UNAVAILABLE]: 'No',
};

/**
 * Read semester-specific preference data with backward compatibility.
 * Old format: preferences[id] = { availability, courseInterests, auditInterests }
 * New format: preferences[id] = { fall: {...}, spring: {...} }
 */
function getSemPref(preferences, facultyId, semester) {
    const raw = preferences?.[facultyId];
    if (!raw) return { availability: {}, courseInterests: [], auditInterests: [] };
    // New format: has semester keys
    if (raw[semester] !== undefined) {
        return { availability: {}, courseInterests: [], auditInterests: [], ...raw[semester] };
    }
    // Old flat format — treat as shared across semesters
    if (raw.availability !== undefined || raw.courseInterests !== undefined) {
        return { availability: {}, courseInterests: [], auditInterests: [], ...raw };
    }
    return { availability: {}, courseInterests: [], auditInterests: [] };
}

export default function FacultyPreferences({ initialFacultyId } = {}) {
    const { state, dispatch } = useApp();
    const { isAdmin } = useSession();
    const { faculty, courses, qualifications, preferences, activeSemester } = state;
    const [selectedFacultyId, setSelectedFacultyId] = useState(initialFacultyId || faculty[0]?.id || null);

    // Instructors can only view/edit their own record
    function handleSelectFaculty(id) {
        if (!isAdmin && id !== initialFacultyId) return;
        setSelectedFacultyId(id);
    }

    const selectedFaculty = faculty.find(f => f.id === selectedFacultyId);
    const pref = getSemPref(preferences, selectedFacultyId, activeSemester);

    // Save changes to the active semester's preference slice while preserving the other semester
    function savePref(updates) {
        const otherSemester = activeSemester === SEMESTERS.FALL ? SEMESTERS.SPRING : SEMESTERS.FALL;
        const currentSem = getSemPref(preferences, selectedFacultyId, activeSemester);
        const otherSem = getSemPref(preferences, selectedFacultyId, otherSemester);
        dispatch({
            type: 'SET_PREFERENCE',
            payload: {
                facultyId: selectedFacultyId,
                data: {
                    [activeSemester]: { ...currentSem, ...updates },
                    [otherSemester]: otherSem,
                },
            },
        });
    }

    function toggleAvailability(period) {
        const current = pref.availability[period] || AVAILABILITY.AVAILABLE;
        const idx = AVAIL_CYCLE.indexOf(current);
        const next = AVAIL_CYCLE[(idx + 1) % AVAIL_CYCLE.length];
        savePref({ availability: { ...pref.availability, [period]: next } });
    }

    function toggleCourseInterest(courseId) {
        const interests = pref.courseInterests || [];
        savePref({
            courseInterests: interests.includes(courseId)
                ? interests.filter(id => id !== courseId)
                : [...interests, courseId],
        });
    }

    function toggleAuditInterest(courseId) {
        const interests = pref.auditInterests || [];
        savePref({
            auditInterests: interests.includes(courseId)
                ? interests.filter(id => id !== courseId)
                : [...interests, courseId],
        });
    }

    // Courses offered in the active semester
    const activeCourses = courses.filter(c =>
        c.semester === activeSemester || c.semester === 'both'
    );

    // Courses this faculty is qualified to teach this semester (Q, CD, or AWT)
    const qualifiedCourses = activeCourses.filter(c => {
        const status = qualifications[`${selectedFacultyId}-${c.id}`];
        return status === QUAL_STATUS.QUALIFIED ||
               status === QUAL_STATUS.COURSE_DIRECTOR ||
               status === QUAL_STATUS.AUDIT_WHILE_TEACH;
    }).sort(courseNumberSort);

    // Courses this faculty is not teaching — potential audit interests
    const auditCandidates = activeCourses.filter(c => {
        const status = qualifications[`${selectedFacultyId}-${c.id}`];
        return status !== QUAL_STATUS.QUALIFIED &&
               status !== QUAL_STATUS.COURSE_DIRECTOR &&
               status !== QUAL_STATUS.AUDIT_WHILE_TEACH;
    }).sort(courseNumberSort);

    if (faculty.length === 0) {
        return (
            <div className="card">
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <h3 className="empty-state-title">No Faculty Members</h3>
                    <p className="empty-state-text">Add faculty members in the Qualifications tab first.</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Faculty Preferences</h1>
                    <p className="page-description">
                        Set availability and course interests per semester for each faculty member
                    </p>
                </div>
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
            </div>

            <div className="split-layout">
                {/* Faculty sidebar */}
                <div className="split-sidebar">
                    <div className="mb-1" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Faculty Members
                    </div>
                    <div className="faculty-list">
                        {[...faculty].sort((a, b) => a.name.localeCompare(b.name)).map(f => {
                            const isOwn = f.id === initialFacultyId;
                            const locked = !isAdmin && !isOwn;
                            return (
                                <div
                                    key={f.id}
                                    className={`faculty-list-item ${selectedFacultyId === f.id ? 'selected' : ''}`}
                                    onClick={() => handleSelectFaculty(f.id)}
                                    style={{ opacity: locked ? 0.38 : 1, cursor: locked ? 'default' : 'pointer' }}
                                    title={locked ? 'You can only edit your own preferences' : undefined}
                                >
                                    <div className="faculty-avatar">
                                        {f.name.split(',')[0]?.[0] || '?'}
                                    </div>
                                    <div className="faculty-info">
                                        <div className="faculty-info-name">{f.name}</div>
                                        <div className="faculty-info-detail">
                                            {f.duty || 'Faculty'} · Max {f.maxSections} sections
                                        </div>
                                    </div>
                                    {locked && (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>🔒</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Preferences panel */}
                <div>
                    {selectedFaculty && (
                        <>
                            {/* Period Availability */}
                            <div className="card mb-2">
                                <div className="card-header">
                                    <h3 className="card-title">
                                        Period Availability — {selectedFaculty.name}
                                    </h3>
                                    <div className="flex gap-1">
                                        <span className="tag tag-green">■ Prefer</span>
                                        <span className="tag" style={{ background: 'var(--avail-available-bg)', color: 'var(--avail-available)' }}>■ Open</span>
                                        <span className="tag tag-red">■ Unavailable</span>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1rem' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>M-Day (Mon/Wed/Fri)</div>
                                    <div className="avail-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                                        {M_PERIODS.map(p => (
                                            <div key={p} className="avail-header">{p}</div>
                                        ))}
                                        {M_PERIODS.map(p => {
                                            const status = pref.availability[p] || AVAILABILITY.AVAILABLE;
                                            return (
                                                <div
                                                    key={p}
                                                    className={`avail-cell ${status}`}
                                                    onClick={() => toggleAvailability(p)}
                                                    title={`${p}: ${status}`}
                                                >
                                                    {AVAIL_LABELS[status]}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>T-Day (Tue/Thu)</div>
                                    <div className="avail-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                                        {T_PERIODS.map(p => (
                                            <div key={p} className="avail-header">{p}</div>
                                        ))}
                                        {T_PERIODS.map(p => {
                                            const status = pref.availability[p] || AVAILABILITY.AVAILABLE;
                                            return (
                                                <div
                                                    key={p}
                                                    className={`avail-cell ${status}`}
                                                    onClick={() => toggleAvailability(p)}
                                                    title={`${p}: ${status}`}
                                                >
                                                    {AVAIL_LABELS[status]}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Teaching Interests */}
                            <div className="card mb-2">
                                <div className="card-header">
                                    <h3 className="card-title">Teaching Interests</h3>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {activeSemester === SEMESTERS.FALL ? 'Fall' : 'Spring'} Semester
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                    Select courses you prefer to teach this semester. Selected courses get scheduling priority;
                                    if any are selected, unselected qualified courses receive a lower priority (but can still be assigned).
                                </p>
                                {qualifiedCourses.length === 0 ? (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        No qualified courses for {activeSemester === SEMESTERS.FALL ? 'Fall' : 'Spring'} — set qualifications in the Qualifications tab.
                                    </p>
                                ) : (
                                    <div className="flex gap-1 flex-wrap">
                                        {qualifiedCourses.map(c => {
                                            const selected = pref.courseInterests?.includes(c.id);
                                            return (
                                                <button
                                                    key={c.id}
                                                    className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-secondary'}`}
                                                    onClick={() => toggleCourseInterest(c.id)}
                                                >
                                                    {c.number}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Audit Interests */}
                            <div className="card">
                                <div className="card-header">
                                    <h3 className="card-title">Audit Interests</h3>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {activeSemester === SEMESTERS.FALL ? 'Fall' : 'Spring'} Semester
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                    Select courses you'd like to audit this semester. This is informational only — the DO uses the
                                    Audit Interest Summary on the Qualifications tab to assign actual audit qualifications.
                                </p>
                                {auditCandidates.length === 0 ? (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        No additional courses to audit for {activeSemester === SEMESTERS.FALL ? 'Fall' : 'Spring'}.
                                    </p>
                                ) : (
                                    <div className="flex gap-1 flex-wrap">
                                        {auditCandidates.map(c => {
                                            const selected = pref.auditInterests?.includes(c.id);
                                            return (
                                                <button
                                                    key={c.id}
                                                    className={`btn btn-sm ${selected ? 'btn-success' : 'btn-secondary'}`}
                                                    onClick={() => toggleAuditInterest(c.id)}
                                                    style={{ opacity: selected ? 1 : 0.7 }}
                                                >
                                                    {c.number}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

        </div>
    );
}
