import { useState, useMemo } from 'react';
import { useApp } from '../data/store';
import { SEMESTERS, M_PERIODS, T_PERIODS, PERIOD_TIMES, QUAL_STATUS } from '../data/models';
import { generateSchedule, validateSchedule } from '../engine/scheduler';
import { exportPCO } from '../utils/importExport';
import { courseNumberSort } from '../utils/courseSort';

export default function ScheduleView() {
    const { state, dispatch } = useApp();
    const { faculty, courses, schedule, activeSemester, qualifications } = state;
    const [lastResult, setLastResult] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [draggingId, setDraggingId] = useState(null);
    const [dragOverCell, setDragOverCell] = useState(null); // { facultyId, period }

    const activeCourses = courses.filter(c => c.semester === activeSemester || c.semester === 'both');

    // Build schedule grid data — support multiple assignments per period (double-period adjacency display)
    const scheduleGrid = useMemo(() => {
        const grid = {};
        faculty.forEach(f => {
            grid[f.id] = {};
        });
        schedule.forEach(a => {
            if (grid[a.facultyId]) {
                const course = courses.find(c => c.id === a.courseId);
                const entry = {
                    ...a,
                    courseNumber: course?.number || '?',
                    isDoublePeriod: course?.isDoublePeriod || false,
                    isAudit: a.isAudit || false,
                    isAwtAudit: a.isAwtAudit || false,
                };
                grid[a.facultyId][a.period] = entry;

                // For double-period courses, also mark the next period as occupied
                if (course?.isDoublePeriod) {
                    const isM = M_PERIODS.includes(a.period);
                    const periodGroup = isM ? M_PERIODS : T_PERIODS;
                    const localIdx = periodGroup.indexOf(a.period);
                    if (localIdx < periodGroup.length - 1) {
                        const nextPeriod = periodGroup[localIdx + 1];
                        grid[a.facultyId][nextPeriod] = {
                            ...entry,
                            isSecondHalf: true,
                        };
                    }
                }
            }
        });
        return grid;
    }, [faculty, courses, schedule]);

    function runScheduler() {
        setIsGenerating(true);
        setTimeout(() => {
            const result = generateSchedule(state);
            dispatch({ type: 'SET_SCHEDULE', payload: result.assignments });
            setLastResult(result);
            setIsGenerating(false);
        }, 100);
    }

    function clearSchedule() {
        dispatch({ type: 'SET_SCHEDULE', payload: [] });
        setLastResult(null);
    }

    const violations = useMemo(() => {
        if (schedule.length === 0) return [];
        return validateSchedule(schedule, state);
    }, [schedule, state]);

    // Generate distinct colors for courses — keyed by course number hash for consistency
    const courseColors = useMemo(() => {
        const colors = [
            { bg: 'rgba(59, 130, 246, 0.18)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' },
            { bg: 'rgba(34, 197, 94, 0.18)', text: '#4ade80', border: 'rgba(34, 197, 94, 0.3)' },
            { bg: 'rgba(245, 158, 11, 0.18)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
            { bg: 'rgba(236, 72, 153, 0.18)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.3)' },
            { bg: 'rgba(20, 184, 166, 0.18)', text: '#2dd4bf', border: 'rgba(20, 184, 166, 0.3)' },
            { bg: 'rgba(239, 68, 68, 0.18)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' },
            { bg: 'rgba(99, 102, 241, 0.18)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.3)' },
            { bg: 'rgba(251, 146, 60, 0.18)', text: '#fb923c', border: 'rgba(251, 146, 60, 0.3)' },
            { bg: 'rgba(74, 222, 128, 0.18)', text: '#86efac', border: 'rgba(74, 222, 128, 0.3)' },
            { bg: 'rgba(6, 182, 212, 0.18)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.3)' },
            { bg: 'rgba(217, 70, 239, 0.18)', text: '#e879f9', border: 'rgba(217, 70, 239, 0.3)' },
            { bg: 'rgba(234, 179, 8, 0.18)', text: '#facc15', border: 'rgba(234, 179, 8, 0.3)' },
        ];
        // Simple hash to get a stable color index from a course number string
        function hashStr(s) {
            let h = 0;
            for (let i = 0; i < s.length; i++) {
                h = ((h << 5) - h + s.charCodeAt(i)) | 0;
            }
            return Math.abs(h);
        }
        const map = {};
        // Include all known courses + any referenced in the schedule
        const allCourseIds = new Set([
            ...courses.map(c => c.id),
            ...schedule.map(a => a.courseId),
        ]);
        allCourseIds.forEach(id => {
            const course = courses.find(c => c.id === id);
            const label = course?.number || id;
            map[id] = colors[hashStr(label) % colors.length];
        });
        return map;
    }, [courses, schedule]);

    // ── Drag and Drop ──────────────────────────────────────────────────────────

    /**
     * Rebuild a section label for a new period, preserving the section letter and
     * any suffix (e.g. "-AWT", "-AUD").
     * Examples: reLabel("M3A", "T4") → "T4A"  |  reLabel("M3A-AWT", "M2") → "M2A-AWT"
     */
    function reLabel(section, newPeriod) {
        if (!section) return '';
        const dashIdx = section.indexOf('-');
        const basePart = dashIdx >= 0 ? section.slice(0, dashIdx) : section;
        const suffix   = dashIdx >= 0 ? section.slice(dashIdx) : '';
        // basePart format: "M3A" or "T4B"
        const sectionLetter = basePart.slice(-1);
        const isM = M_PERIODS.includes(newPeriod);
        const dayLetter = isM ? 'M' : 'T';
        const periodNum = (isM ? M_PERIODS : T_PERIODS).indexOf(newPeriod) + 1;
        return `${dayLetter}${periodNum}${sectionLetter}${suffix}`;
    }

    function handleDragStart(e, assignmentId) {
        setDraggingId(assignmentId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', assignmentId);
    }

    function handleDragEnd() {
        setDraggingId(null);
        setDragOverCell(null);
    }

    function handleCellDragEnter(e, facultyId, period) {
        e.preventDefault();
        setDragOverCell({ facultyId, period });
    }

    function handleCellDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function handleCellDragLeave(e) {
        // Only clear when leaving the cell entirely (not moving to a child element)
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverCell(null);
        }
    }

    function handleCellDrop(e, toFacultyId, toPeriod) {
        e.preventDefault();
        const fromId = draggingId || e.dataTransfer.getData('text/plain');
        setDraggingId(null);
        setDragOverCell(null);

        if (!fromId) return;

        const fromAssignment = schedule.find(a => a.id === fromId);
        if (!fromAssignment) return;

        // Find the assignment currently occupying the target cell (if any).
        // scheduleGrid stores the same entry for both halves of a double-period, so .id
        // always resolves to the canonical assignment record in the flat schedule array.
        const toEntry = scheduleGrid[toFacultyId]?.[toPeriod];
        const toAssignment = toEntry ? schedule.find(a => a.id === toEntry.id) : null;

        // No-op: dropped on the same slot it came from
        if (fromAssignment.facultyId === toFacultyId && fromAssignment.period === toPeriod) return;
        // No-op: double-period dragged onto its own second half
        if (toAssignment && toAssignment.id === fromAssignment.id) return;

        let updatedSchedule;
        if (toAssignment) {
            // Swap: both assignments exchange faculty + period
            updatedSchedule = schedule.map(a => {
                if (a.id === fromAssignment.id) {
                    return {
                        ...a,
                        facultyId: toFacultyId,
                        period: toPeriod,
                        section: reLabel(a.section, toPeriod),
                    };
                }
                if (a.id === toAssignment.id) {
                    return {
                        ...a,
                        facultyId: fromAssignment.facultyId,
                        period: fromAssignment.period,
                        section: reLabel(a.section, fromAssignment.period),
                    };
                }
                return a;
            });
        } else {
            // Move to empty cell
            updatedSchedule = schedule.map(a => {
                if (a.id === fromAssignment.id) {
                    return {
                        ...a,
                        facultyId: toFacultyId,
                        period: toPeriod,
                        section: reLabel(a.section, toPeriod),
                    };
                }
                return a;
            });
        }

        dispatch({ type: 'SET_SCHEDULE', payload: updatedSchedule });
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    function renderPeriodCell(f, p) {
        const entry = scheduleGrid[f.id]?.[p];
        const isDragOver = draggingId !== null &&
            dragOverCell?.facultyId === f.id &&
            dragOverCell?.period === p;

        const tdStyle = {
            background: isDragOver ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-card)',
            borderBottom: '1px solid var(--border-color)',
            outline: isDragOver ? '2px solid rgba(59, 130, 246, 0.45)' : 'none',
            outlineOffset: '-2px',
            padding: '4px',
            minWidth: 80,
            minHeight: 46,
            transition: 'background 0.1s, outline 0.1s',
        };

        const tdHandlers = {
            onDragEnter: (e) => handleCellDragEnter(e, f.id, p),
            onDragOver:  handleCellDragOver,
            onDragLeave: handleCellDragLeave,
            onDrop:      (e) => handleCellDrop(e, f.id, p),
        };

        if (!entry) {
            return <td key={p} style={tdStyle} {...tdHandlers} />;
        }

        const color = courseColors[entry.courseId] || { bg: 'var(--navy-700)', text: 'var(--silver-200)', border: 'var(--navy-500)' };
        const isDragging = draggingId === entry.id;

        // Audit While Teach: teal/cyan dashed with book icon — not draggable
        if (entry.isAudit && entry.isAwtAudit) {
            return (
                <td key={p} style={tdStyle} {...tdHandlers}>
                    <div style={{
                        background: 'rgba(6, 182, 212, 0.1)',
                        color: '#22d3ee',
                        border: '1.5px dashed rgba(6, 182, 212, 0.5)',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                    }}>
                        📖 {entry.courseNumber?.replace('ECE ', '')}
                    </div>
                </td>
            );
        }

        // General Audit: amber/yellow dashed with eye icon — not draggable
        if (entry.isAudit) {
            return (
                <td key={p} style={tdStyle} {...tdHandlers}>
                    <div style={{
                        background: 'rgba(251, 191, 36, 0.1)',
                        color: '#fbbf24',
                        border: '1.5px dashed rgba(251, 191, 36, 0.5)',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                    }}>
                        👁 {entry.courseNumber?.replace('ECE ', '')}
                    </div>
                </td>
            );
        }

        // Teaching chip — draggable
        const borderStyle = entry.isDoublePeriod
            ? '2px solid rgba(239, 68, 68, 0.7)'
            : `1px solid ${color.border}`;

        return (
            <td key={p} style={tdStyle} {...tdHandlers}>
                <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, entry.id)}
                    onDragEnd={handleDragEnd}
                    style={{
                        background: color.bg,
                        color: color.text,
                        border: borderStyle,
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        opacity: isDragging ? 0.35 : 1,
                        userSelect: 'none',
                        transition: 'opacity 0.1s',
                    }}
                >
                    {entry.courseNumber?.replace('ECE ', '')}
                    {entry.isDoublePeriod && !entry.isSecondHalf && (
                        <span style={{ fontSize: '0.6rem', opacity: 0.7 }}> (2hr)</span>
                    )}
                </div>
            </td>
        );
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Schedule</h1>
                    <p className="page-description">
                        Generate and review the optimized teaching schedule
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
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={runScheduler}
                        disabled={isGenerating || faculty.length === 0 || activeCourses.length === 0}
                    >
                        {isGenerating ? '⏳ Generating...' : '⚡ Generate Schedule'}
                    </button>
                    {schedule.length > 0 && (
                        <>
                            <button className="btn btn-secondary" onClick={() => exportPCO(schedule, state)}>
                                📥 Export PCO
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={clearSchedule}>
                                Clear
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Results summary */}
            {lastResult && (
                <div className="stats-grid mb-2">
                    <div className="stat-card">
                        <span className="stat-label">Total Sections</span>
                        <span className="stat-value">{lastResult.stats.totalSections}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Assigned</span>
                        <span className="stat-value" style={{ color: 'var(--status-qualified)' }}>
                            {lastResult.stats.assignedSections}
                        </span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Unassigned</span>
                        <span className="stat-value" style={{ color: lastResult.stats.unassignedSections > 0 ? '#ef4444' : 'var(--status-qualified)' }}>
                            {lastResult.stats.unassignedSections}
                        </span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Violations</span>
                        <span className="stat-value" style={{ color: violations.length > 0 ? '#ef4444' : 'var(--status-qualified)' }}>
                            {violations.length}
                        </span>
                    </div>
                    {lastResult.stats.awtViolationCount > 0 && (
                        <div className="stat-card">
                            <span className="stat-label">AWT Unmet</span>
                            <span className="stat-value" style={{ color: '#f87171' }}>
                                {lastResult.stats.awtViolationCount}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Violations */}
            {violations.length > 0 && (
                <div className="card mb-2">
                    <div className="card-header">
                        <h3 className="card-title" style={{ color: '#ef4444' }}>⚠ Constraint Violations</h3>
                    </div>
                    <div className="violations-list">
                        {violations.map((v, i) => (
                            <div key={i} className="violation-item">
                                <span className="violation-icon">⚠</span>
                                {v}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Unassigned sections */}
            {lastResult && lastResult.unassigned.length > 0 && (
                <div className="alert alert-warning mb-2">
                    <strong>Unassigned sections:</strong>&nbsp;
                    {lastResult.unassigned.map((s, i) => {
                        const course = courses.find(c => c.id === s.courseId);
                        return <span key={i}>{course?.number} (Section {s.sectionIndex + 1}){i < lastResult.unassigned.length - 1 ? ', ' : ''}</span>;
                    })}
                </div>
            )}

            {/* Schedule Grid */}
            {schedule.length > 0 ? (
                <div className="card" style={{ padding: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.25rem 0.5rem 0.5rem' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Drag chips to reassign period or faculty · dropping on an occupied cell swaps the two assignments
                        </span>
                    </div>
                    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 2, fontSize: '0.85rem' }}>
                            <thead>
                                <tr>
                                    <th style={{
                                        background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                                        fontWeight: 600, padding: '10px 12px', textAlign: 'left', minWidth: 160,
                                        borderRadius: '8px 0 0 0', position: 'sticky', left: 0, zIndex: 10,
                                    }}>Faculty</th>
                                    <th style={{
                                        background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                                        fontWeight: 600, padding: '10px 6px', textAlign: 'center', fontSize: '0.72rem', minWidth: 40,
                                    }}>Duty</th>
                                    {M_PERIODS.map(p => (
                                        <th key={p} style={{
                                            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                                            fontWeight: 600, padding: '8px 6px', textAlign: 'center', minWidth: 80,
                                        }}>
                                            <div style={{ fontSize: '0.8rem' }}>{p}</div>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 400 }}>{PERIOD_TIMES[p]}</div>
                                        </th>
                                    ))}
                                    {/* Separator */}
                                    <th style={{
                                        width: 12, padding: 0, background: 'transparent', border: 'none',
                                    }}></th>
                                    {T_PERIODS.map(p => (
                                        <th key={p} style={{
                                            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                                            fontWeight: 600, padding: '8px 6px', textAlign: 'center', minWidth: 80,
                                        }}>
                                            <div style={{ fontSize: '0.8rem' }}>{p}</div>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 400 }}>{PERIOD_TIMES[p]}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {faculty.map(f => (
                                    <tr key={f.id}>
                                        <td style={{
                                            background: 'var(--bg-card)', padding: '8px 12px',
                                            fontWeight: 500, whiteSpace: 'nowrap',
                                            position: 'sticky', left: 0, zIndex: 5,
                                            borderBottom: '1px solid var(--border-color)',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div className="faculty-avatar" style={{ width: 28, height: 28, fontSize: '0.7rem' }}>
                                                    {f.name.split(',')[0]?.[0] || '?'}
                                                </div>
                                                <span style={{ fontSize: '0.85rem' }}>{f.name.split(',')[0]}</span>
                                            </div>
                                        </td>
                                        <td style={{
                                            background: 'var(--bg-card)', textAlign: 'center',
                                            fontSize: '0.72rem', color: 'var(--text-muted)',
                                            borderBottom: '1px solid var(--border-color)', padding: '4px',
                                        }}>
                                            {f.duty || '—'}
                                        </td>
                                        {M_PERIODS.map(p => renderPeriodCell(f, p))}
                                        {/* Separator */}
                                        <td style={{ width: 12, padding: 0, background: 'transparent', border: 'none' }}></td>
                                        {T_PERIODS.map(p => renderPeriodCell(f, p))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">📅</div>
                        <h3 className="empty-state-title">No Schedule Generated</h3>
                        <p className="empty-state-text">
                            {faculty.length === 0 || activeCourses.length === 0
                                ? 'Add faculty and courses first, then generate a schedule.'
                                : 'Click "Generate Schedule" to create an optimized teaching schedule based on qualifications, preferences, and constraints.'}
                        </p>
                    </div>
                </div>
            )}

            {/* Detailed Assignment List */}
            {schedule.length > 0 && (
                <div className="card mt-2">
                    <div className="card-header">
                        <h3 className="card-title">Assignment Details</h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {schedule.length} section{schedule.length !== 1 ? 's' : ''} assigned
                        </span>
                    </div>
                    <div className="matrix-container">
                        <table className="matrix-table">
                            <thead>
                                <tr>
                                    <th>Course</th>
                                    <th>Section</th>
                                    <th>Period</th>
                                    <th>Time</th>
                                    <th>Faculty</th>
                                    <th>Room</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...schedule]
                                    .sort((a, b) => {
                                        const ca = courses.find(c => c.id === a.courseId);
                                        const cb = courses.find(c => c.id === b.courseId);
                                        if (!ca || !cb) return 0;
                                        return courseNumberSort(ca, cb);
                                    })
                                    .map(a => {
                                        const fac = faculty.find(f => f.id === a.facultyId);
                                        const course = courses.find(c => c.id === a.courseId);
                                        const color = courseColors[a.courseId];
                                        return (
                                            <tr key={a.id}>
                                                <td className="faculty-name" style={{ fontWeight: 600 }}>
                                                    <span style={{
                                                        display: 'inline-block', width: 8, height: 8,
                                                        borderRadius: '50%', background: color?.text || '#888',
                                                        marginRight: 8,
                                                    }}></span>
                                                    {course?.number}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>{a.section}</td>
                                                <td style={{ textAlign: 'center' }}>{a.period}</td>
                                                <td style={{ textAlign: 'center' }}>{PERIOD_TIMES[a.period]}</td>
                                                <td style={{ padding: '8px 12px' }}>{fac?.name}</td>
                                                <td style={{ textAlign: 'center' }}>{a.room || '—'}</td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
