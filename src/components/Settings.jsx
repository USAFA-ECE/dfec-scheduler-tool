import { useState } from 'react';
import { useApp } from '../data/store';
import { FACULTY_ROLE, DEFAULT_SCHEDULER_SETTINGS } from '../data/models';
import { importJSON } from '../utils/importExport';
import PeopleSoftSync from './PeopleSoftSync';

// ── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
    return (
        <div
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: checked ? '#3b82f6' : 'var(--bg-elevated)',
                border: `1px solid ${checked ? '#3b82f6' : 'var(--border-color)'}`,
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s, border-color 0.2s',
                flexShrink: 0,
            }}
        >
            <div style={{
                position: 'absolute',
                top: 2,
                left: checked ? 20 : 2,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                transition: 'left 0.2s',
            }} />
        </div>
    );
}

// ── Rule definitions ─────────────────────────────────────────────────────────

const CONSTRAINT_RULES = [
    {
        key: 'avoidBackToBack',
        label: 'Avoid Back-to-Back Same-Course Sections',
        description: 'Prevents placing two sections of the same 2-section course at M3 + M4 or T3 + T4 — the only back-to-back slot considered problematic. Other consecutive pairings (M1–M2, M2–M3, etc.) are allowed. Courses with 3+ sections are exempt.',
    },
    {
        key: 'blockEarlyMorning',
        label: 'Auto-Block Early Morning for Single Sections',
        description: 'Automatically prevents M1 and T1 placement for courses that have only one section, reserving the early slots for multi-section courses.',
    },
    {
        key: 'honorUnavailability',
        label: 'Honor Faculty Unavailability',
        description: 'Treats faculty-marked UNAVAILABLE periods as a near-hard constraint (large negative score). When off, the optimizer ignores unavailability markings entirely.',
    },
];

const SCORING_RULES = [
    {
        key: 'preferSameDayType',
        label: 'Prefer Same Day-Type per Faculty',
        description: 'Applies a scoring bonus (+8) to keep a faculty member\'s assignments on all-M or all-T days, and a penalty (−5) for crossing to the opposite day type.',
    },
    {
        key: 'penalizeEarlyMorning',
        label: 'Penalize Early Morning Slots',
        description: 'Applies a small scoring penalty (−4) to M1 and T1 for all assignments, nudging the optimizer toward later periods when other factors are equal.',
    },
    {
        key: 'useTeachingInterests',
        label: 'Teaching Interest Scoring',
        description: 'Uses faculty semester-specific course preferences to boost (+3) preferred courses or apply a soft penalty (−3) for non-preferred ones when interests are configured.',
    },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function Settings() {
    const { state, dispatch, exportState, importState } = useApp();
    const { faculty, schedulerSettings } = state;

    async function handleImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (file) {
                try {
                    const data = await importJSON(file);
                    dispatch({ type: 'LOAD_STATE', payload: data });
                } catch (err) {
                    alert('Failed to import file: ' + err.message);
                }
            }
        };
        input.click();
    }

    // Merge with defaults for backward compat with saves that predate this feature
    const settings = { ...DEFAULT_SCHEDULER_SETTINGS, ...(schedulerSettings || {}) };

    function toggleRule(key) {
        dispatch({ type: 'SET_SCHEDULER_SETTINGS', payload: { [key]: !settings[key] } });
    }

    function setRole(facultyId, role) {
        dispatch({ type: 'UPDATE_FACULTY', payload: { id: facultyId, role } });
    }

    // ── Credentials state ─────────────────────────────────────────────────────
    const [editingUsername, setEditingUsername] = useState({}); // { [id]: draftValue }
    const [usernameError, setUsernameError] = useState({});     // { [id]: errorMsg }
    const [resetConfirm, setResetConfirm] = useState(null);     // facultyId pending reset

    function startEditUsername(f) {
        setEditingUsername(prev => ({ ...prev, [f.id]: f.username ?? '' }));
        setUsernameError(prev => ({ ...prev, [f.id]: null }));
    }

    function cancelEditUsername(id) {
        setEditingUsername(prev => { const n = { ...prev }; delete n[id]; return n; });
        setUsernameError(prev => { const n = { ...prev }; delete n[id]; return n; });
    }

    function saveUsername(id) {
        const draft = (editingUsername[id] ?? '').trim().toLowerCase();
        if (!draft) {
            setUsernameError(prev => ({ ...prev, [id]: 'Username cannot be empty.' }));
            return;
        }
        // Uniqueness check
        const conflict = faculty.find(f => f.id !== id && f.username?.toLowerCase() === draft);
        if (conflict) {
            setUsernameError(prev => ({ ...prev, [id]: `Already used by ${conflict.name}.` }));
            return;
        }
        dispatch({ type: 'UPDATE_FACULTY', payload: { id, username: draft } });
        cancelEditUsername(id);
    }

    function resetPassword(id) {
        dispatch({ type: 'UPDATE_FACULTY', payload: { id, passwordHash: undefined } });
        setResetConfirm(null);
    }

    function RuleRow({ rule }) {
        const on = settings[rule.key];
        return (
            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                padding: '14px 0',
                borderBottom: '1px solid var(--border-color)',
            }}>
                <Toggle checked={on} onChange={() => toggleRule(rule.key)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: on ? 'var(--text-primary)' : 'var(--text-muted)',
                        marginBottom: 3,
                        transition: 'color 0.2s',
                    }}>
                        {rule.label}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {rule.description}
                    </div>
                </div>
                <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: on ? 'rgba(34, 197, 94, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                    color: on ? '#4ade80' : 'var(--text-muted)',
                    flexShrink: 0,
                    alignSelf: 'center',
                }}>
                    {on ? 'ON' : 'OFF'}
                </span>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-description">
                        Manage faculty roles and configure the scheduling optimizer rules
                    </p>
                </div>
            </div>

            {/* ── Data Management ───────────────────────────────────────── */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header">
                    <h3 className="card-title">Data Management</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Backup or restore the shared dataset
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0' }}>
                    <button className="btn btn-secondary" onClick={exportState}>
                        💾 Export JSON snapshot
                    </button>
                    <button className="btn btn-secondary" onClick={handleImport}>
                        📂 Import JSON snapshot
                    </button>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Export saves the current state as a dated JSON file. Import replaces the shared cloud state for all users — use with care.
                </p>
            </div>

            {/* ── PeopleSoft Sync ────────────────────────────────────────── */}
            <PeopleSoftSync />

            {/* ── Faculty Roles ──────────────────────────────────────────── */}
            <div className="card mb-2">
                <div className="card-header">
                    <h3 className="card-title">Faculty Roles</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {faculty.filter(f => (f.role || FACULTY_ROLE.INSTRUCTOR) === FACULTY_ROLE.ADMIN).length} admin
                        {' · '}
                        {faculty.filter(f => (f.role || FACULTY_ROLE.INSTRUCTOR) === FACULTY_ROLE.INSTRUCTOR).length} instructor
                    </span>
                </div>

                {faculty.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        No faculty loaded yet. Add faculty on the Qualifications page first.
                    </div>
                ) : (
                    <div className="matrix-container">
                        <table className="matrix-table" style={{ tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: 220 }} />
                                <col style={{ width: 90 }} />
                                <col style={{ width: 160 }} />
                                <col style={{ width: 170 }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', paddingLeft: 12 }}>Name</th>
                                    <th style={{ textAlign: 'center' }}>Rank</th>
                                    <th style={{ textAlign: 'center' }}>Duty</th>
                                    <th style={{ textAlign: 'center' }}>Role</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...faculty].sort((a, b) => a.name.localeCompare(b.name)).map(f => {
                                    const role = f.role || FACULTY_ROLE.INSTRUCTOR;
                                    const isAdmin = role === FACULTY_ROLE.ADMIN;
                                    return (
                                        <tr key={f.id}>
                                            <td style={{ textAlign: 'left', padding: '8px 12px', overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div className="faculty-avatar" style={{ width: 26, height: 26, fontSize: '0.65rem', flexShrink: 0 }}>
                                                        {f.name.split(',')[0]?.[0] || '?'}
                                                    </div>
                                                    <span style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                {f.rank || '—'}
                                            </td>
                                            <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                {f.duty || '—'}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                                    <button
                                                        onClick={() => setRole(f.id, FACULTY_ROLE.INSTRUCTOR)}
                                                        style={{
                                                            padding: '4px 14px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            border: 'none',
                                                            background: !isAdmin ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                                                            color: !isAdmin ? '#60a5fa' : 'var(--text-muted)',
                                                            transition: 'background 0.15s, color 0.15s',
                                                        }}
                                                    >
                                                        Instructor
                                                    </button>
                                                    <button
                                                        onClick={() => setRole(f.id, FACULTY_ROLE.ADMIN)}
                                                        style={{
                                                            padding: '4px 14px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            border: 'none',
                                                            borderLeft: '1px solid var(--border-color)',
                                                            background: isAdmin ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                                                            color: isAdmin ? '#c084fc' : 'var(--text-muted)',
                                                            transition: 'background 0.15s, color 0.15s',
                                                        }}
                                                    >
                                                        Admin
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Credentials ────────────────────────────────────────────── */}
            <div className="card mb-2">
                <div className="card-header">
                    <h3 className="card-title">Credentials</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Usernames and password status for each faculty member
                    </span>
                </div>

                {faculty.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        No faculty loaded yet.
                    </div>
                ) : (
                    <div className="matrix-container">
                        <table className="matrix-table" style={{ tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: 180 }} />
                                <col style={{ width: 260 }} />
                                <col style={{ width: 120 }} />
                                <col style={{ width: 140 }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', paddingLeft: 12 }}>Name</th>
                                    <th style={{ textAlign: 'left', paddingLeft: 8 }}>Username</th>
                                    <th style={{ textAlign: 'center' }}>Password</th>
                                    <th style={{ textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...faculty].sort((a, b) => a.name.localeCompare(b.name)).map(f => {
                                    const isEditing = editingUsername.hasOwnProperty(f.id);
                                    const draft = editingUsername[f.id] ?? '';
                                    const err = usernameError[f.id];
                                    const hasCustomPw = !!f.passwordHash;

                                    return (
                                        <tr key={f.id}>
                                            {/* Name */}
                                            <td style={{ padding: '8px 12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div className="faculty-avatar" style={{ width: 26, height: 26, fontSize: '0.65rem', flexShrink: 0 }}>
                                                        {f.name[0] || '?'}
                                                    </div>
                                                    <span style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {f.rank} {f.name}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Username */}
                                            <td style={{ padding: '6px 8px' }}>
                                                {isEditing ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <div style={{ display: 'flex', gap: 6 }}>
                                                            <input
                                                                type="text"
                                                                value={draft}
                                                                autoFocus
                                                                onChange={e => {
                                                                    setEditingUsername(prev => ({ ...prev, [f.id]: e.target.value }));
                                                                    setUsernameError(prev => ({ ...prev, [f.id]: null }));
                                                                }}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') saveUsername(f.id);
                                                                    if (e.key === 'Escape') cancelEditUsername(f.id);
                                                                }}
                                                                style={{
                                                                    flex: 1, minWidth: 0,
                                                                    padding: '4px 8px',
                                                                    background: 'var(--bg-input, #0d1424)',
                                                                    border: `1px solid ${err ? 'rgba(239,68,68,0.6)' : 'rgba(138,141,143,0.35)'}`,
                                                                    borderRadius: 6,
                                                                    color: 'var(--text-primary)',
                                                                    fontSize: '0.8rem',
                                                                    outline: 'none',
                                                                    fontFamily: 'inherit',
                                                                }}
                                                            />
                                                            <button
                                                                onClick={() => saveUsername(f.id)}
                                                                style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600, borderRadius: 5, border: 'none', cursor: 'pointer', background: 'rgba(34,197,94,0.2)', color: '#4ade80' }}
                                                            >✓</button>
                                                            <button
                                                                onClick={() => cancelEditUsername(f.id)}
                                                                style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600, borderRadius: 5, border: 'none', cursor: 'pointer', background: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)' }}
                                                            >✕</button>
                                                        </div>
                                                        {err && <span style={{ fontSize: '0.72rem', color: '#fca5a5' }}>{err}</span>}
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => startEditUsername(f)}
                                                        title="Click to edit username"
                                                        style={{
                                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                                            padding: '3px 6px', borderRadius: 5,
                                                            color: f.username ? 'var(--text-secondary)' : 'var(--text-muted)',
                                                            fontSize: '0.8rem', fontFamily: 'monospace',
                                                            textAlign: 'left',
                                                        }}
                                                    >
                                                        {f.username ?? <span style={{ fontStyle: 'italic', opacity: 0.5 }}>not set</span>}
                                                        <span style={{ marginLeft: 6, opacity: 0.4, fontSize: '0.7rem' }}>✎</span>
                                                    </button>
                                                )}
                                            </td>

                                            {/* Password status */}
                                            <td style={{ textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.72rem', fontWeight: 700,
                                                    padding: '2px 8px', borderRadius: 4,
                                                    background: hasCustomPw ? 'rgba(168,85,247,0.15)' : 'rgba(100,116,139,0.12)',
                                                    color: hasCustomPw ? '#c084fc' : 'var(--text-muted)',
                                                }}>
                                                    {hasCustomPw ? 'Custom' : 'Default'}
                                                </span>
                                            </td>

                                            {/* Reset password */}
                                            <td style={{ textAlign: 'center' }}>
                                                {hasCustomPw && (
                                                    resetConfirm === f.id ? (
                                                        <div style={{ display: 'inline-flex', gap: 6 }}>
                                                            <button
                                                                onClick={() => resetPassword(f.id)}
                                                                style={{ padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600, borderRadius: 5, border: 'none', cursor: 'pointer', background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}
                                                            >Confirm</button>
                                                            <button
                                                                onClick={() => setResetConfirm(null)}
                                                                style={{ padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600, borderRadius: 5, border: 'none', cursor: 'pointer', background: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)' }}
                                                            >Cancel</button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setResetConfirm(f.id)}
                                                            title="Reset to default password"
                                                            style={{ padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600, borderRadius: 5, border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer', background: 'transparent', color: '#f87171' }}
                                                        >Reset</button>
                                                    )
                                                )}
                                                {!hasCustomPw && (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.4 }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                    Instructors with "Default" password use <code style={{ fontSize: '0.75rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(100,116,139,0.15)' }}>dfec3141</code>.
                    Admins with "Default" use <code style={{ fontSize: '0.75rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(100,116,139,0.15)' }}>dfec3141admin</code>.
                    "Reset" clears a custom password, reverting to the default.
                </p>
            </div>

            {/* ── Constraint Rules ───────────────────────────────────────── */}
            <div className="card mb-2">
                <div className="card-header">
                    <h3 className="card-title">Constraint Rules</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Hard limits applied during candidate generation
                    </span>
                </div>
                <div style={{ padding: '0 1.25rem' }}>
                    {CONSTRAINT_RULES.map(rule => (
                        <RuleRow key={rule.key} rule={rule} />
                    ))}
                </div>
            </div>

            {/* ── Scoring Rules ──────────────────────────────────────────── */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Scoring & Preference Rules</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Soft preferences applied when ranking candidate assignments
                    </span>
                </div>
                <div style={{ padding: '0 1.25rem' }}>
                    {SCORING_RULES.map(rule => (
                        <RuleRow key={rule.key} rule={rule} />
                    ))}
                </div>
            </div>
        </div>
    );
}
