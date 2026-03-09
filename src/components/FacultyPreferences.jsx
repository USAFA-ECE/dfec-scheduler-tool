import { useState } from 'react';
import { useApp } from '../data/store';
import { AVAILABILITY, M_PERIODS, T_PERIODS, QUAL_STATUS } from '../data/models';
import { courseNumberSort } from '../utils/courseSort';

const AVAIL_CYCLE = [AVAILABILITY.AVAILABLE, AVAILABILITY.PREFER, AVAILABILITY.UNAVAILABLE];
const AVAIL_LABELS = {
    [AVAILABILITY.PREFER]: 'Prefer',
    [AVAILABILITY.AVAILABLE]: 'Open',
    [AVAILABILITY.UNAVAILABLE]: 'No',
};

export default function FacultyPreferences() {
    const { state, dispatch } = useApp();
    const { faculty, courses, qualifications, preferences } = state;
    const [selectedFacultyId, setSelectedFacultyId] = useState(faculty[0]?.id || null);

    const selectedFaculty = faculty.find(f => f.id === selectedFacultyId);
    const pref = preferences[selectedFacultyId] || { availability: {}, courseInterests: [], auditInterests: [] };

    function toggleAvailability(period) {
        const current = pref.availability[period] || AVAILABILITY.AVAILABLE;
        const idx = AVAIL_CYCLE.indexOf(current);
        const next = AVAIL_CYCLE[(idx + 1) % AVAIL_CYCLE.length];
        const updated = {
            ...pref,
            availability: { ...pref.availability, [period]: next },
        };
        dispatch({ type: 'SET_PREFERENCE', payload: { facultyId: selectedFacultyId, data: updated } });
    }

    function toggleCourseInterest(courseId) {
        const interests = pref.courseInterests || [];
        const updated = interests.includes(courseId)
            ? interests.filter(id => id !== courseId)
            : [...interests, courseId];
        dispatch({ type: 'SET_PREFERENCE', payload: { facultyId: selectedFacultyId, data: { ...pref, courseInterests: updated } } });
    }

    function toggleAuditInterest(courseId) {
        const interests = pref.auditInterests || [];
        const updated = interests.includes(courseId)
            ? interests.filter(id => id !== courseId)
            : [...interests, courseId];
        dispatch({
            type: 'SET_PREFERENCE',
            payload: { facultyId: selectedFacultyId, data: { ...pref, auditInterests: updated } }
        });
    }

    // Get courses this faculty is qualified for
    const qualifiedCourses = courses.filter(c => {
        const key = `${selectedFacultyId}-${c.id}`;
        return qualifications[key] === QUAL_STATUS.QUALIFIED;
    }).sort(courseNumberSort);

    // Get courses this faculty is NOT qualified for (potential audit candidates)
    const auditCandidates = courses.filter(c => {
        const key = `${selectedFacultyId}-${c.id}`;
        return qualifications[key] !== QUAL_STATUS.QUALIFIED;
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
                        Set availability and course interests for each faculty member
                    </p>
                </div>
            </div>

            <div className="split-layout">
                {/* Faculty sidebar */}
                <div className="split-sidebar">
                    <div className="mb-1" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Faculty Members
                    </div>
                    <div className="faculty-list">
                        {faculty.map(f => (
                            <div
                                key={f.id}
                                className={`faculty-list-item ${selectedFacultyId === f.id ? 'selected' : ''}`}
                                onClick={() => setSelectedFacultyId(f.id)}
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
                            </div>
                        ))}
                    </div>
                </div>

                {/* Preferences panel */}
                <div>
                    {selectedFaculty && (
                        <>
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

                                {/* M-Day Row */}
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

                                {/* T-Day Row */}
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

                            {/* Course Interests */}
                            <div className="card mb-2">
                                <div className="card-header">
                                    <h3 className="card-title">Teaching Interests</h3>
                                </div>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                    Select courses you'd prefer to teach (from your qualified courses):
                                </p>
                                {qualifiedCourses.length === 0 ? (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No qualified courses — set qualifications in the Qualifications tab.</p>
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
                                </div>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                    Select courses you'd be interested in auditing:
                                </p>
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
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
