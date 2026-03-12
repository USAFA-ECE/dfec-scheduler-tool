import { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../data/store';
import { useSession } from '../data/session';
import { SEMESTERS, M_PERIODS, T_PERIODS, PERIOD_TIMES, QUAL_STATUS } from '../data/models';
import { generateSchedule, validateSchedule } from '../engine/scheduler';
import { exportPCO } from '../utils/importExport';
import { courseNumberSort } from '../utils/courseSort';

const PERIOD_ORDER = [...M_PERIODS, ...T_PERIODS]; // M1…M6 then T1…T6

export default function ScheduleView() {
    const { state, dispatch } = useApp();
    const { isAdmin } = useSession();
    const { faculty, courses, schedule, activeSemester, qualifications } = state;
    const [lastResult, setLastResult] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [draggingId, setDraggingId] = useState(null);
    const [dragOverCell, setDragOverCell] = useState(null); // { facultyId, period }
    const [addingCell, setAddingCell] = useState(null);     // { facultyId, period, x, y }
    const [hoveredChipId, setHoveredChipId] = useState(null);
    const [hoveredCell, setHoveredCell] = useState(null);   // { facultyId, period }
    const pickerRef = useRef(null);

    // Close the course picker on outside click or Escape
    useEffect(() => {
        if (!addingCell) return;
        function onMouseDown(e) {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                setAddingCell(null);
            }
        }
        function onKeyDown(e) {
            if (e.key === 'Escape') setAddingCell(null);
        }
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [addingCell]);

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

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /** True if period p1 comes strictly before p2 in the teaching day order. */
    function isPeriodBefore(p1, p2) {
        return PERIOD_ORDER.indexOf(p1) < PERIOD_ORDER.indexOf(p2);
    }

    /**
     * For a given faculty + period, return courses available to place.
     * Returns { teach, awt, audit } arrays of course objects.
     */
    function getAddableOptions(facultyId, period) {
        const teach = activeCourses.filter(c => {
            const qs = qualifications[`${facultyId}-${c.id}`];
            return qs === QUAL_STATUS.QUALIFIED ||
                   qs === QUAL_STATUS.COURSE_DIRECTOR ||
                   qs === QUAL_STATUS.AUDIT_WHILE_TEACH;
        });
        // AWT audit: faculty must have AWT status AND already have a teach assignment at a later period
        const awt = activeCourses.filter(c => {
            if (qualifications[`${facultyId}-${c.id}`] !== QUAL_STATUS.AUDIT_WHILE_TEACH) return false;
            return schedule.some(a =>
                a.facultyId === facultyId && a.courseId === c.id &&
                !a.isAudit && isPeriodBefore(period, a.period)
            );
        });
        const audit = activeCourses.filter(c =>
            qualifications[`${facultyId}-${c.id}`] === QUAL_STATUS.GENERAL_AUDIT
        );
        return { teach, awt, audit };
    }

    /** Create and dispatch a new schedule assignment for the given cell. */
    function handleAddAssignment(facultyId, period, courseId, isAudit = false, isAwtAudit = false) {
        const course = activeCourses.find(c => c.id === courseId);
        // Section letter: next available letter based on existing non-audit sections
        const existingSections = schedule.filter(a => a.courseId === courseId && !a.isAudit);
        const sectionLetter = String.fromCharCode(65 + existingSections.length);
        const isM = M_PERIODS.includes(period);
        const dayLetter = isM ? 'M' : 'T';
        const periodNum = (isM ? M_PERIODS : T_PERIODS).indexOf(period) + 1;
        const suffix = isAwtAudit ? '-AWT' : isAudit ? '-AUD' : '';
        const section = `${dayLetter}${periodNum}${sectionLetter}${suffix}`;

        const newAssignment = {
            id: crypto.randomUUID(),
            facultyId,
            courseId,
            period,
            room: course?.room || '',
            section,
            ...(isAudit ? { isAudit: true, isAwtAudit: !!isAwtAudit } : {}),
        };
        dispatch({ type: 'SET_SCHEDULE', payload: [...schedule, newAssignment] });
        setAddingCell(null);
    }

    /** Remove a single assignment from the schedule. */
    function handleDeleteAssignment(assignmentId) {
        dispatch({ type: 'SET_SCHEDULE', payload: schedule.filter(a => a.id !== assignmentId) });
    }

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

    // dragOver fires continuously while the cursor is over a cell — use it as the
    // authoritative source for dragOverCell instead of the noisy dragEnter/dragLeave
    // pair.  A functional update avoids re-renders when the hovered cell is unchanged.
    function handleCellDragOver(e, facultyId, period) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverCell(prev =>
            prev?.facultyId === facultyId && prev?.period === period
                ? prev
                : { facultyId, period }
        );
    }

    function handleCellDragLeave(e) {
        // Best-effort cleanup when the cursor leaves the cell entirely.
        // dragOver on the next cell will self-correct if this fires spuriously.
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
        // No-op: cannot drop ON any audit chip
        if (toAssignment?.isAudit) return;

        // ── AWT chip move ─────────────────────────────────────────────────────
        if (fromAssignment.isAwtAudit) {
            // AWT chips may only move to empty cells (no swapping with teach chips)
            if (toAssignment) return;
            // Target faculty must be AWT-qualified for the course
            const qs = qualifications[`${toFacultyId}-${fromAssignment.courseId}`];
            if (qs !== QUAL_STATUS.AUDIT_WHILE_TEACH) return;
            // Target faculty must have a teaching assignment for this course at a later period
            const hasLaterTeach = schedule.some(a =>
                a.facultyId === toFacultyId && a.courseId === fromAssignment.courseId &&
                !a.isAudit && isPeriodBefore(toPeriod, a.period)
            );
            if (!hasLaterTeach) return;

            dispatch({
                type: 'SET_SCHEDULE',
                payload: schedule.map(a =>
                    a.id === fromAssignment.id
                        ? { ...a, facultyId: toFacultyId, period: toPeriod, section: reLabel(a.section, toPeriod) }
                        : a
                ),
            });
            return;
        }

        // ── Regular teaching chip swap / move ─────────────────────────────────
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

        // Determine whether the pending drop would violate a constraint so we can
        // colour the cell red (warning) vs blue (valid).
        let dropInvalid = false;
        if (isDragOver) {
            const fromAssignment = schedule.find(a => a.id === draggingId);
            if (fromAssignment) {
                const isOwnCell = fromAssignment.facultyId === f.id && fromAssignment.period === p;
                const isOwnSecondHalf = entry?.id === draggingId;
                if (!isOwnCell && !isOwnSecondHalf) {
                    if (fromAssignment.isAwtAudit) {
                        // AWT chip: target must be empty, faculty must be AWT-qualified, must have later teach
                        if (entry) {
                            dropInvalid = true;
                        } else {
                            const qs = qualifications[`${f.id}-${fromAssignment.courseId}`];
                            if (qs !== QUAL_STATUS.AUDIT_WHILE_TEACH) {
                                dropInvalid = true;
                            } else {
                                const hasLaterTeach = schedule.some(a =>
                                    a.facultyId === f.id && a.courseId === fromAssignment.courseId &&
                                    !a.isAudit && isPeriodBefore(p, a.period)
                                );
                                if (!hasLaterTeach) dropInvalid = true;
                            }
                        }
                    } else {
                        // Regular chip: existing constraint rules
                        if (entry?.isAudit) {
                            dropInvalid = true;
                        }
                        if (!dropInvalid) {
                            const qs = qualifications[`${f.id}-${fromAssignment.courseId}`];
                            const qualOk = qs === QUAL_STATUS.QUALIFIED ||
                                           qs === QUAL_STATUS.COURSE_DIRECTOR ||
                                           qs === QUAL_STATUS.AUDIT_WHILE_TEACH;
                            if (!qualOk) dropInvalid = true;
                        }
                        if (!dropInvalid && entry && !entry.isAudit) {
                            const sqs = qualifications[`${fromAssignment.facultyId}-${entry.courseId}`];
                            const swapOk = sqs === QUAL_STATUS.QUALIFIED ||
                                           sqs === QUAL_STATUS.COURSE_DIRECTOR ||
                                           sqs === QUAL_STATUS.AUDIT_WHILE_TEACH;
                            if (!swapOk) dropInvalid = true;
                        }
                    }
                }
            }
        }

        const dropBg     = dropInvalid ? 'rgba(239, 68, 68, 0.22)'               : 'rgba(59, 130, 246, 0.28)';
        const dropShadow = dropInvalid ? 'inset 0 0 0 2px rgba(239, 68, 68, 0.85)' : 'inset 0 0 0 2px rgba(59, 130, 246, 0.85)';
        const isHovered  = !entry && hoveredCell?.facultyId === f.id && hoveredCell?.period === p;

        const tdStyle = {
            background: isDragOver ? dropBg : 'var(--bg-card)',
            borderBottom: '1px solid var(--border-color)',
            boxShadow: isDragOver ? dropShadow : 'none',
            padding: '4px',
            minWidth: 80,
            minHeight: 46,
            transition: 'background 0.08s, box-shadow 0.08s',
        };

        const tdHandlers = isAdmin ? {
            onDragEnter:  (e) => e.preventDefault(),
            onDragOver:   (e) => handleCellDragOver(e, f.id, p),
            onDragLeave:  handleCellDragLeave,
            onDrop:       (e) => handleCellDrop(e, f.id, p),
            onMouseEnter: () => setHoveredCell({ facultyId: f.id, period: p }),
            onMouseLeave: () => setHoveredCell(null),
        } : {};

        // Empty cell — show "+" add button on hover (admin only)
        if (!entry) {
            return (
                <td key={p} style={tdStyle} {...tdHandlers}>
                    {isAdmin && isHovered && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setAddingCell({ facultyId: f.id, period: p, x: rect.left, y: rect.bottom + 4 });
                            }}
                            style={{
                                width: '100%', height: '100%', minHeight: 38,
                                background: 'transparent',
                                border: '1.5px dashed rgba(148, 163, 184, 0.4)',
                                borderRadius: 6,
                                color: 'rgba(148, 163, 184, 0.6)',
                                cursor: 'pointer',
                                fontSize: '1rem', fontWeight: 300,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >+</button>
                    )}
                </td>
            );
        }

        const color = courseColors[entry.courseId] || { bg: 'var(--navy-700)', text: 'var(--silver-200)', border: 'var(--navy-500)' };
        const isDragging = draggingId === entry.id;
        const showDelete = isAdmin && hoveredChipId === entry.id && !entry.isSecondHalf;

        const deleteBtn = showDelete ? (
            <button
                onMouseDown={(e) => { e.stopPropagation(); handleDeleteAssignment(entry.id); }}
                style={{
                    position: 'absolute', top: -5, right: -5,
                    width: 16, height: 16, borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.9)', color: '#fff',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6rem', fontWeight: 700, lineHeight: 1, zIndex: 10,
                }}
            >×</button>
        ) : null;

        // Audit While Teach chip — draggable (admin only), deletable
        if (entry.isAudit && entry.isAwtAudit) {
            return (
                <td key={p} style={tdStyle} {...tdHandlers}>
                    <div
                        draggable={isAdmin}
                        onDragStart={isAdmin ? (e) => handleDragStart(e, entry.id) : undefined}
                        onDragEnd={isAdmin ? handleDragEnd : undefined}
                        onMouseEnter={() => setHoveredChipId(entry.id)}
                        onMouseLeave={() => setHoveredChipId(null)}
                        style={{
                            position: 'relative',
                            background: 'rgba(6, 182, 212, 0.1)',
                            color: '#22d3ee',
                            border: '1.5px dashed rgba(6, 182, 212, 0.5)',
                            borderRadius: 6,
                            padding: '4px 8px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            cursor: !isAdmin ? 'default' : isDragging ? 'grabbing' : 'grab',
                            opacity: isDragging ? 0.35 : 1,
                            userSelect: 'none',
                            transition: 'opacity 0.1s',
                        }}
                    >
                        📖 {entry.courseNumber?.replace('ECE ', '')}
                        {deleteBtn}
                    </div>
                </td>
            );
        }

        // General Audit chip — not draggable, but deletable
        if (entry.isAudit) {
            return (
                <td key={p} style={tdStyle} {...tdHandlers}>
                    <div
                        onMouseEnter={() => setHoveredChipId(entry.id)}
                        onMouseLeave={() => setHoveredChipId(null)}
                        style={{
                            position: 'relative',
                            background: 'rgba(251, 191, 36, 0.1)',
                            color: '#fbbf24',
                            border: '1.5px dashed rgba(251, 191, 36, 0.5)',
                            borderRadius: 6,
                            padding: '4px 8px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        👁 {entry.courseNumber?.replace('ECE ', '')}
                        {deleteBtn}
                    </div>
                </td>
            );
        }

        // Teaching chip — draggable (admin only), deletable
        const borderStyle = entry.isDoublePeriod
            ? '2px solid rgba(239, 68, 68, 0.7)'
            : `1px solid ${color.border}`;

        return (
            <td key={p} style={tdStyle} {...tdHandlers}>
                <div
                    draggable={isAdmin}
                    onDragStart={isAdmin ? (e) => handleDragStart(e, entry.id) : undefined}
                    onDragEnd={isAdmin ? handleDragEnd : undefined}
                    onMouseEnter={() => setHoveredChipId(entry.id)}
                    onMouseLeave={() => setHoveredChipId(null)}
                    style={{
                        position: 'relative',
                        background: color.bg,
                        color: color.text,
                        border: borderStyle,
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        cursor: !isAdmin ? 'default' : isDragging ? 'grabbing' : 'grab',
                        opacity: isDragging ? 0.35 : 1,
                        userSelect: 'none',
                        transition: 'opacity 0.1s',
                    }}
                >
                    {entry.courseNumber?.replace('ECE ', '')}
                    {entry.isDoublePeriod && !entry.isSecondHalf && (
                        <span style={{ fontSize: '0.6rem', opacity: 0.7 }}> (2hr)</span>
                    )}
                    {deleteBtn}
                </div>
            </td>
        );
    }

    // ── Add-chip picker ─────────────────────────────────────────────────────────

    function renderPicker() {
        if (!isAdmin || !addingCell) return null;
        const { teach, awt, audit } = getAddableOptions(addingCell.facultyId, addingCell.period);
        const hasOptions = teach.length > 0 || awt.length > 0 || audit.length > 0;

        const pickerLeft = Math.min(addingCell.x, window.innerWidth - 220);
        const pickerTop  = Math.min(addingCell.y, window.innerHeight - 320);

        const btnStyle = {
            display: 'block', width: '100%', padding: '6px 14px',
            background: 'none', border: 'none', textAlign: 'left',
            cursor: 'pointer', color: 'var(--text-primary)',
            fontSize: '0.82rem',
        };
        const hoverIn  = e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; };
        const hoverOut = e => { e.currentTarget.style.background = 'none'; };

        return (
            <div
                ref={pickerRef}
                style={{
                    position: 'fixed',
                    left: pickerLeft,
                    top: pickerTop,
                    zIndex: 1000,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 10,
                    boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
                    minWidth: 200,
                    maxHeight: 340,
                    overflowY: 'auto',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border-color)',
                }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                        Add · {addingCell.period}
                    </span>
                    <button
                        onClick={() => setAddingCell(null)}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1, padding: 0,
                        }}
                    >×</button>
                </div>

                {!hasOptions && (
                    <div style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        No courses available
                    </div>
                )}

                {/* Teach options */}
                {teach.length > 0 && (
                    <div>
                        <div style={{
                            padding: '6px 14px 2px',
                            fontSize: '0.68rem', color: 'var(--text-muted)',
                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>Teach</div>
                        {teach.map(c => (
                            <button
                                key={c.id}
                                style={btnStyle}
                                onMouseEnter={hoverIn}
                                onMouseLeave={hoverOut}
                                onClick={() => handleAddAssignment(addingCell.facultyId, addingCell.period, c.id)}
                            >{c.number}</button>
                        ))}
                    </div>
                )}

                {/* AWT audit options */}
                {awt.length > 0 && (
                    <div>
                        <div style={{
                            padding: '6px 14px 2px',
                            fontSize: '0.68rem', color: '#22d3ee',
                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>📖 AWT Audit</div>
                        {awt.map(c => (
                            <button
                                key={c.id}
                                style={btnStyle}
                                onMouseEnter={hoverIn}
                                onMouseLeave={hoverOut}
                                onClick={() => handleAddAssignment(addingCell.facultyId, addingCell.period, c.id, true, true)}
                            >{c.number}</button>
                        ))}
                    </div>
                )}

                {/* General audit options */}
                {audit.length > 0 && (
                    <div>
                        <div style={{
                            padding: '6px 14px 2px',
                            fontSize: '0.68rem', color: '#fbbf24',
                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>👁 General Audit</div>
                        {audit.map(c => (
                            <button
                                key={c.id}
                                style={btnStyle}
                                onMouseEnter={hoverIn}
                                onMouseLeave={hoverOut}
                                onClick={() => handleAddAssignment(addingCell.facultyId, addingCell.period, c.id, true, false)}
                            >{c.number}</button>
                        ))}
                    </div>
                )}
            </div>
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
                    {isAdmin && (
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={runScheduler}
                            disabled={isGenerating || faculty.length === 0 || activeCourses.length === 0}
                        >
                            {isGenerating ? '⏳ Generating...' : '⚡ Generate Schedule'}
                        </button>
                    )}
                    {schedule.length > 0 && (
                        <>
                            <button className="btn btn-secondary" onClick={() => exportPCO(schedule, state)}>
                                📥 Export PCO
                            </button>
                            {isAdmin && (
                                <button className="btn btn-danger btn-sm" onClick={clearSchedule}>
                                    Clear
                                </button>
                            )}
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
                            {isAdmin
                                ? 'Drag to move/swap · hover chip for × delete · hover empty cell for + add'
                                : 'Schedule view'}
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
                                {[...faculty].sort((a, b) => a.name.localeCompare(b.name)).map(f => (
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

            {/* Add-chip picker — fixed-position popover */}
            {renderPicker()}
        </div>
    );
}
