import { useState } from 'react';
import { useApp } from '../data/store';
import { useSession } from '../data/session';
import { QUAL_STATUS, SEMESTERS, createFaculty } from '../data/models';
import { courseNumberSort } from '../utils/courseSort';

function getSemPref(preferences, facultyId, semester) {
    const raw = preferences?.[facultyId];
    if (!raw) return { availability: {}, courseInterests: [], auditInterests: [] };
    if (raw[semester] !== undefined) {
        return { availability: {}, courseInterests: [], auditInterests: [], ...raw[semester] };
    }
    if (raw.availability !== undefined || raw.courseInterests !== undefined) {
        return { availability: {}, courseInterests: [], auditInterests: [], ...raw };
    }
    return { availability: {}, courseInterests: [], auditInterests: [] };
}

const RANK_OPTIONS = ['', 'Dr.', 'Capt.', 'Maj.', 'Lt Col.', 'Col.'];
const BRANCH_OPTIONS = [
    { value: '', label: '— Select —' },
    { value: 'CS', label: 'Front Office (CS)' },
    { value: 'EC', label: 'Education and Curriculum (EC)' },
    { value: 'PD', label: 'People and Development (PD)' },
    { value: 'RI', label: 'Research and Innovation (RI)' },
    { value: 'RF', label: 'Resources and Facilities (RF)' },
    { value: 'SA', label: 'Student Affairs (SA)' },
];
const ACADEMIC_RANK_OPTIONS = [
    '', 'Instructor', 'Senior Instructor', 'Assistant Professor', 'Associate Professor', 'Professor'
];

const QUAL_OPTIONS = [
    { value: QUAL_STATUS.NOT_QUALIFIED, label: '—' },
    { value: QUAL_STATUS.QUALIFIED, label: '✓' },
    { value: QUAL_STATUS.COURSE_DIRECTOR, label: '★' },
    { value: QUAL_STATUS.AUDIT_WHILE_TEACH, label: '📖' },
    { value: QUAL_STATUS.GENERAL_AUDIT, label: '👁' },
];
const QUAL_LABELS = {
    [QUAL_STATUS.QUALIFIED]: '✓',
    [QUAL_STATUS.COURSE_DIRECTOR]: '★',
    [QUAL_STATUS.AUDIT_WHILE_TEACH]: '📖',
    [QUAL_STATUS.GENERAL_AUDIT]: '👁',
    [QUAL_STATUS.NOT_QUALIFIED]: '',
};

export default function QualificationMatrix() {
    const { state, dispatch } = useApp();
    const { isAdmin } = useSession();
    const { faculty, courses, qualifications, preferences, activeSemester } = state;
    const [showAddFaculty, setShowAddFaculty] = useState(false);
    const [editingFaculty, setEditingFaculty] = useState(null);
    const [deletingFacultyId, setDeletingFacultyId] = useState(null);
    const [facultyForm, setFacultyForm] = useState({
        name: '', duty: '', rank: '', branch: '', academicRank: '',
        maxSections: 4, maxUniqueCourses: 2,
    });

    const activeCourses = courses.filter(c => c.semester === activeSemester || c.semester === 'both')
        .sort(courseNumberSort);

    function setQual(facultyId, courseId, newStatus) {
        const key = `${facultyId}-${courseId}`;

        // If setting to Course Director, demote any existing CD for this course
        if (newStatus === QUAL_STATUS.COURSE_DIRECTOR) {
            for (const f of faculty) {
                const existingKey = `${f.id}-${courseId}`;
                if (existingKey !== key && qualifications[existingKey] === QUAL_STATUS.COURSE_DIRECTOR) {
                    dispatch({ type: 'SET_QUALIFICATION', payload: { key: existingKey, status: QUAL_STATUS.QUALIFIED } });
                }
            }
        }

        dispatch({ type: 'SET_QUALIFICATION', payload: { key, status: newStatus } });
    }

    function openAddFaculty() {
        setFacultyForm({
            name: '', duty: '', rank: '', branch: '', academicRank: '',
            maxSections: 4, maxUniqueCourses: 2,
        });
        setEditingFaculty(null);
        setShowAddFaculty(true);
    }

    function openEditFaculty(f) {
        setFacultyForm({
            name: f.name,
            duty: f.duty || '',
            rank: f.rank || '',
            branch: f.branch || '',
            academicRank: f.academicRank || '',
            maxSections: f.maxSections,
            maxUniqueCourses: f.maxUniqueCourses,
        });
        setEditingFaculty(f.id);
        setShowAddFaculty(true);
    }

    function saveFaculty() {
        if (!facultyForm.name.trim()) return;
        if (editingFaculty) {
            dispatch({
                type: 'UPDATE_FACULTY',
                payload: {
                    id: editingFaculty,
                    name: facultyForm.name.trim(),
                    duty: facultyForm.duty.trim(),
                    rank: facultyForm.rank.trim(),
                    branch: facultyForm.branch,
                    academicRank: facultyForm.academicRank,
                    maxSections: facultyForm.maxSections,
                    maxUniqueCourses: facultyForm.maxUniqueCourses,
                }
            });
        } else {
            dispatch({
                type: 'ADD_FACULTY',
                payload: createFaculty({
                    name: facultyForm.name.trim(),
                    duty: facultyForm.duty.trim(),
                    rank: facultyForm.rank.trim(),
                    branch: facultyForm.branch,
                    academicRank: facultyForm.academicRank,
                    maxSections: facultyForm.maxSections,
                    maxUniqueCourses: facultyForm.maxUniqueCourses,
                })
            });
        }
        closeForm();
    }

    function closeForm() {
        setShowAddFaculty(false);
        setEditingFaculty(null);
        setFacultyForm({
            name: '', duty: '', rank: '', branch: '', academicRank: '',
            maxSections: 4, maxUniqueCourses: 2,
        });
    }

    function deleteFaculty(id) {
        setDeletingFacultyId(id);
    }

    function confirmDelete() {
        if (deletingFacultyId) {
            dispatch({ type: 'DELETE_FACULTY', payload: deletingFacultyId });
        }
        setDeletingFacultyId(null);
    }

    function updateFacultyField(id, field, value) {
        if (field === 'maxSections' || field === 'maxUniqueCourses') {
            const num = value === '' ? 0 : parseInt(value);
            if (!isNaN(num)) {
                dispatch({ type: 'UPDATE_FACULTY', payload: { id, [field]: Math.max(0, Math.min(12, num)) } });
            }
        } else {
            dispatch({ type: 'UPDATE_FACULTY', payload: { id, [field]: value } });
        }
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Qualification Matrix</h1>
                    <p className="page-description">
                        {isAdmin
                            ? 'Use dropdowns to set qualifications. ✓ Qualified · ★ Course Director · 📖 Audit While Teach · 👁 General Audit. Click a name to edit.'
                            : 'This is a read-only view of faculty qualifications. Contact the DO to update your qualifications.'}
                    </p>
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
                        <button className="btn btn-primary" onClick={openAddFaculty}>
                            + Add Faculty
                        </button>
                    )}
                </div>
            </div>

            {/* Legend */}
            <div className="flex gap-1 mb-2" style={{ flexWrap: 'wrap' }}>
                <span className="tag tag-green">✓ Qualified</span>
                <span className="tag" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>★ Course Director</span>
                <span className="tag" style={{ background: 'rgba(6, 182, 212, 0.12)', color: '#22d3ee' }}>📖 Audit While Teach</span>
                <span className="tag tag-yellow">👁 General Audit</span>
                <span className="tag" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>— Not Qualified</span>
            </div>

            {faculty.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">👥</div>
                        <h3 className="empty-state-title">No Faculty Added</h3>
                        <p className="empty-state-text">Add faculty members to start building the qualification matrix.</p>
                    </div>
                </div>
            ) : (
                <div className="card" style={{ padding: '0.5rem' }}>
                    <div className="matrix-container sticky-scroll">
                        <table className="matrix-table">
                            <thead>
                                <tr>
                                    <th style={{ minWidth: 200, position: 'sticky', left: 0, zIndex: 20, background: 'var(--bg-elevated)' }}>Faculty</th>
                                    <th style={{ minWidth: 50, textAlign: 'center', fontSize: '0.72rem' }}>Max Sec</th>
                                    <th style={{ minWidth: 50, textAlign: 'center', fontSize: '0.72rem' }}>Max Crs</th>
                                    {activeCourses.map(c => (
                                        <th key={c.id} className="rotate">
                                            {c.number}
                                        </th>
                                    ))}
                                    <th style={{ minWidth: 50 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...faculty].sort((a, b) => a.name.localeCompare(b.name)).map(f => (
                                    <tr key={f.id}>
                                        <td className="faculty-name">
                                            <div
                                                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isAdmin ? 'pointer' : 'default' }}
                                                onClick={() => isAdmin && openEditFaculty(f)}
                                                title={isAdmin ? 'Click to edit' : undefined}
                                            >
                                                <div className="faculty-avatar">
                                                    {f.name.split(',')[0]?.[0] || '?'}
                                                </div>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span>{f.rank ? `${f.rank} ` : ''}{f.name}</span>
                                                        {isAdmin && <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>✎</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                        {[f.academicRank, f.branch, f.duty].filter(Boolean).map((item, i, arr) => (
                                                            <span key={i}>
                                                                {i === arr.length - 1 && arr.length > 0 && item === f.duty
                                                                    ? <span style={{ color: 'var(--text-accent)' }}>{item}</span>
                                                                    : item}
                                                                {i < arr.length - 1 ? ' / ' : ''}
                                                            </span>
                                                        ))}
                                                        {!f.academicRank && !f.branch && !f.duty && <span>Faculty</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: 4 }}>
                                            {isAdmin ? (
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    className="form-input"
                                                    style={{ width: 50, padding: '4px 6px', textAlign: 'center', fontSize: '0.82rem' }}
                                                    value={f.maxSections}
                                                    onChange={e => updateFacultyField(f.id, 'maxSections', e.target.value)}
                                                />
                                            ) : (
                                                <span style={{ display: 'block', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{f.maxSections}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: 4 }}>
                                            {isAdmin ? (
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    className="form-input"
                                                    style={{ width: 50, padding: '4px 6px', textAlign: 'center', fontSize: '0.82rem' }}
                                                    value={f.maxUniqueCourses}
                                                    onChange={e => updateFacultyField(f.id, 'maxUniqueCourses', e.target.value)}
                                                />
                                            ) : (
                                                <span style={{ display: 'block', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{f.maxUniqueCourses}</span>
                                            )}
                                        </td>
                                        {activeCourses.map(c => {
                                            const key = `${f.id}-${c.id}`;
                                            const status = qualifications[key] || QUAL_STATUS.NOT_QUALIFIED;
                                            const isCd = status === QUAL_STATUS.COURSE_DIRECTOR;
                                            return (
                                                <td key={c.id}>
                                                    {isAdmin ? (
                                                        <select
                                                            className={`qual-select ${isCd ? 'course-director' : status.replaceAll('_', '-')}`}
                                                            value={status}
                                                            onChange={(e) => setQual(f.id, c.id, e.target.value)}
                                                            title={`${f.name} → ${c.number}`}
                                                        >
                                                            {QUAL_OPTIONS.map(opt => (
                                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <div
                                                            className={`qual-cell ${isCd ? 'course-director' : status.replaceAll('_', '-')}`}
                                                            title={`${f.name} → ${c.number}: ${status}`}
                                                        >
                                                            {QUAL_LABELS[status]}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td>
                                            {isAdmin && (
                                                <button className="btn btn-ghost btn-sm" onClick={() => deleteFaculty(f.id)} title="Remove">
                                                    ✕
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Audit Interest Summary ─────────────────────────────────────── */}
            {(() => {
                const auditSummary = {};
                for (const c of activeCourses) {
                    const interested = faculty.filter(f => {
                        const fp = getSemPref(preferences, f.id, activeSemester);
                        return fp.auditInterests?.includes(c.id);
                    });
                    if (interested.length > 0) {
                        auditSummary[c.id] = interested;
                    }
                }
                const auditSummaryCourses = activeCourses.filter(c => auditSummary[c.id]);
                return (
                    <div className="card mt-2">
                        <div className="card-header">
                            <h3 className="card-title">Audit Interest Summary</h3>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {activeSemester === SEMESTERS.FALL ? 'Fall' : 'Spring'} · use this to set audit qualifications above
                            </span>
                        </div>
                        {auditSummaryCourses.length === 0 ? (
                            <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                No audit interests recorded for {activeSemester === SEMESTERS.FALL ? 'Fall' : 'Spring'} semester.
                            </div>
                        ) : (
                            <div className="matrix-container">
                                <table className="matrix-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 140 }}>Course</th>
                                            <th>Faculty Interested in Auditing</th>
                                            <th style={{ width: 60, textAlign: 'center' }}>Count</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditSummaryCourses.map(c => {
                                            const interested = auditSummary[c.id];
                                            return (
                                                <tr key={c.id}>
                                                    <td style={{ fontWeight: 600 }}>{c.number}</td>
                                                    <td>
                                                        <div className="flex gap-1 flex-wrap" style={{ padding: '2px 0' }}>
                                                            {interested.map(f => (
                                                                <span key={f.id} className="tag tag-yellow">
                                                                    👁 {f.name.split(',')[0]}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                        {interested.length}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Add/Edit Faculty Modal */}
            {showAddFaculty && (
                <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) closeForm(); }}>
                    <div className="modal">
                        <h2 className="modal-title">{editingFaculty ? 'Edit Faculty Member' : 'Add Faculty Member'}</h2>
                        <div className="form-group">
                            <label className="form-label">Last Name</label>
                            <input
                                className="form-input"
                                value={facultyForm.name}
                                onChange={e => setFacultyForm({ ...facultyForm, name: e.target.value })}
                                placeholder="e.g. Smith"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && saveFaculty()}
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Rank / Title</label>
                                <select
                                    className="form-input"
                                    value={facultyForm.rank}
                                    onChange={e => setFacultyForm({ ...facultyForm, rank: e.target.value })}
                                >
                                    {RANK_OPTIONS.map(r => (
                                        <option key={r} value={r}>{r || '— Select —'}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Duty Position</label>
                                <input
                                    className="form-input"
                                    value={facultyForm.duty}
                                    onChange={e => setFacultyForm({ ...facultyForm, duty: e.target.value })}
                                    placeholder="e.g. DH, DDH, Ops, CC"
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Branch</label>
                                <select
                                    className="form-input"
                                    value={facultyForm.branch}
                                    onChange={e => setFacultyForm({ ...facultyForm, branch: e.target.value })}
                                >
                                    {BRANCH_OPTIONS.map(b => (
                                        <option key={b.value} value={b.value}>{b.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Academic Rank</label>
                                <select
                                    className="form-input"
                                    value={facultyForm.academicRank}
                                    onChange={e => setFacultyForm({ ...facultyForm, academicRank: e.target.value })}
                                >
                                    {ACADEMIC_RANK_OPTIONS.map(r => (
                                        <option key={r} value={r}>{r || '— Select —'}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Max Sections</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="form-input"
                                    value={facultyForm.maxSections}
                                    onChange={e => {
                                        const v = e.target.value;
                                        if (v === '' || /^\d+$/.test(v)) {
                                            setFacultyForm({ ...facultyForm, maxSections: v === '' ? '' : Math.min(12, parseInt(v)) });
                                        }
                                    }}
                                    onBlur={() => {
                                        if (facultyForm.maxSections === '') setFacultyForm({ ...facultyForm, maxSections: 0 });
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Max Unique Courses</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="form-input"
                                    value={facultyForm.maxUniqueCourses}
                                    onChange={e => {
                                        const v = e.target.value;
                                        if (v === '' || /^\d+$/.test(v)) {
                                            setFacultyForm({ ...facultyForm, maxUniqueCourses: v === '' ? '' : Math.min(12, parseInt(v)) });
                                        }
                                    }}
                                    onBlur={() => {
                                        if (facultyForm.maxUniqueCourses === '') setFacultyForm({ ...facultyForm, maxUniqueCourses: 0 });
                                    }}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveFaculty}>
                                {editingFaculty ? 'Save Changes' : 'Add Faculty'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingFacultyId && (
                <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setDeletingFacultyId(null); }}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <h2 className="modal-title">Remove Faculty Member</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            Are you sure you want to remove <strong style={{ color: 'var(--text-primary)' }}>{faculty.find(f => f.id === deletingFacultyId)?.name}</strong>? This will also remove their qualifications and preferences.
                        </p>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDeletingFacultyId(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={confirmDelete}>Remove</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
