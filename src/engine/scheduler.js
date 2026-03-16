import { QUAL_STATUS, AVAILABILITY, PERIODS, M_PERIODS, T_PERIODS, DEFAULT_SCHEDULER_SETTINGS } from '../data/models';
import { computeSectionsNeeded } from '../utils/courseUtils';

/**
 * DFEC Schedule Optimizer
 * 
 * Uses constraint-based assignment with priority scoring.
 * Courses are sorted by constraint difficulty (fewest valid assignments first).
 * Faculty are scored per slot based on preference alignment.
 */

/**
 * Read semester-specific preference data with backward compatibility.
 * Old format: preferences[id] = { availability, courseInterests, auditInterests }
 * New format: preferences[id] = { fall: {...}, spring: {...} }
 */
function getSemPref(preferences, facultyId, semester) {
    const raw = preferences?.[facultyId];
    if (!raw) return { availability: {}, courseInterests: [], auditInterests: [] };
    if (raw[semester] !== undefined) {
        return { availability: {}, courseInterests: [], auditInterests: [], ...raw[semester] };
    }
    // Old flat format — treat as shared across semesters
    if (raw.availability !== undefined || raw.courseInterests !== undefined) {
        return { availability: {}, courseInterests: [], auditInterests: [], ...raw };
    }
    return { availability: {}, courseInterests: [], auditInterests: [] };
}

export function generateSchedule(state) {
    const { faculty, courses, qualifications, preferences, constraints, activeSemester, rooms } = state;
    // Merge saved settings with defaults so missing keys always have a safe value
    const settings = { ...DEFAULT_SCHEDULER_SETTINGS, ...(state.schedulerSettings || {}) };

    // ── Locked assignments: treat as immovable constraints ────────────────────
    const lockedAssignments = (state.schedule || []).filter(a => a.locked);

    // Filter courses for active semester (only offered courses)
    const activeCourses = courses.filter(c =>
        (c.semester === activeSemester || c.semester === 'both') && c.isOffered !== false
    );

    // Pre-compute sections needed per course and identify single-section courses
    const courseSectionCounts = {};
    for (const course of activeCourses) {
        courseSectionCounts[course.id] = computeSectionsNeeded(course.enrollment, course.classCap);
    }

    // Count how many non-audit locked assignments exist per course so we can
    // subtract them from the sections that still need to be placed.
    const lockedTeachCounts = {};
    for (const la of lockedAssignments) {
        if (!la.isAudit) {
            lockedTeachCounts[la.courseId] = (lockedTeachCounts[la.courseId] || 0) + 1;
        }
    }

    // Build sections that need to be assigned (minus already-locked ones)
    const sections = [];
    for (const course of activeCourses) {
        const numSections = courseSectionCounts[course.id];
        const alreadyLocked = lockedTeachCounts[course.id] || 0;
        const remaining = Math.max(0, numSections - alreadyLocked);
        for (let i = 0; i < remaining; i++) {
            sections.push({
                courseId: course.id,
                course,
                sectionIndex: alreadyLocked + i,
                room: course.room, // manually assigned room (may be empty for auto-assign)
            });
        }
    }

    // Get valid periods for a course
    function getValidPeriods(course) {
        const constraint = constraints[course.id];
        const blocked = constraint ? [...constraint.blockedPeriods] : [];

        // Intercollegiate athlete constraints: block configured periods for single-section courses
        const ac = settings.athleteConstraints || { enabled: false, blockedPeriods: [] };
        if (ac.enabled && courseSectionCounts[course.id] === 1) {
            for (const bp of ac.blockedPeriods) {
                if (!blocked.includes(bp)) blocked.push(bp);
            }
        }

        let valid = PERIODS.filter(p => !blocked.includes(p));

        // For double-period courses, a start period is only valid if its next
        // period in the same day-group is also unblocked, AND it must not start
        // at M4 or T4 (which would split the course across lunch: M4→M5 or T4→T5).
        if (course.isDoublePeriod) {
            valid = valid.filter(p => {
                if (p === 'M4' || p === 'T4') return false; // would split across lunch
                const isM = M_PERIODS.includes(p);
                const periodGroup = isM ? M_PERIODS : T_PERIODS;
                const localIdx = periodGroup.indexOf(p);
                if (localIdx >= periodGroup.length - 1) return false; // can't start double at last period
                const nextPeriod = periodGroup[localIdx + 1];
                return !blocked.includes(nextPeriod);
            });
        }

        return valid;
    }

    // Get qualified faculty for a course (includes Audit While Teach — they also teach)
    function getQualifiedFaculty(courseId) {
        return faculty.filter(f => {
            const key = `${f.id}-${courseId}`;
            const status = qualifications[key];
            return status === QUAL_STATUS.QUALIFIED ||
                   status === QUAL_STATUS.COURSE_DIRECTOR ||
                   status === QUAL_STATUS.AUDIT_WHILE_TEACH;
        });
    }

    // Check if a faculty member is a general auditor (not teaching) for a course
    function isGeneralAudit(facultyId, courseId) {
        const key = `${facultyId}-${courseId}`;
        return qualifications[key] === QUAL_STATUS.GENERAL_AUDIT;
    }

    // Check if a course should be excluded from load limits (capstone or general audit)
    function isExcludedFromLimits(facultyId, course) {
        return course.isCapstone || isGeneralAudit(facultyId, course.id);
    }

    // Sort sections: capstones first (must always be scheduled), then high-enrollment
    // courses (registrar rule: one section per period), then by constraint difficulty.
    sections.sort((a, b) => {
        // Capstones are highest priority — schedule before anything else
        if (a.course.isCapstone !== b.course.isCapstone) {
            return a.course.isCapstone ? -1 : 1;
        }
        // High-enrollment courses must fill every period — treat as next priority
        const aHighEnroll = (a.course.enrollment || 0) > 300;
        const bHighEnroll = (b.course.enrollment || 0) > 300;
        if (aHighEnroll !== bHighEnroll) {
            return aHighEnroll ? -1 : 1;
        }
        // Finally, sort by constraint difficulty (fewest valid options first)
        const aOptions = getValidPeriods(a.course).length * getQualifiedFaculty(a.courseId).length;
        const bOptions = getValidPeriods(b.course).length * getQualifiedFaculty(b.courseId).length;
        return aOptions - bOptions;
    });

    // Track assignments — seed with locked assignments
    const assignments = [...lockedAssignments];
    const facultyPeriodMap = {}; // facultyId -> Set of assigned periods
    const facultySectionCount = {}; // facultyId -> total sections count
    const facultyCourseSet = {}; // facultyId -> Set of unique course IDs
    const roomPeriodMap = {}; // room -> Set of assigned periods
    const facultyRoomMap = {}; // facultyId -> { period -> roomName } for back-to-back tracking

    // Sort rooms by seats ascending for smallest-fit assignment
    const sortedRooms = [...(rooms || [])].sort((a, b) => a.seats - b.seats);

    faculty.forEach(f => {
        facultyPeriodMap[f.id] = new Set();
        facultySectionCount[f.id] = 0;
        facultyCourseSet[f.id] = new Set();
        facultyRoomMap[f.id] = {};
    });

    // Pre-populate tracking maps from locked assignments
    for (const la of lockedAssignments) {
        if (!facultyPeriodMap[la.facultyId]) {
            facultyPeriodMap[la.facultyId] = new Set();
            facultySectionCount[la.facultyId] = 0;
            facultyCourseSet[la.facultyId] = new Set();
            facultyRoomMap[la.facultyId] = {};
        }
        facultyPeriodMap[la.facultyId].add(la.period);

        const laCourse = courses.find(c => c.id === la.courseId);
        if (laCourse?.isDoublePeriod) {
            const isM = M_PERIODS.includes(la.period);
            const periodGroup = isM ? M_PERIODS : T_PERIODS;
            const localIdx = periodGroup.indexOf(la.period);
            if (localIdx < periodGroup.length - 1) {
                facultyPeriodMap[la.facultyId].add(periodGroup[localIdx + 1]);
            }
        }

        if (!la.isAudit && !laCourse?.isCapstone) {
            facultySectionCount[la.facultyId]++;
            facultyCourseSet[la.facultyId].add(la.courseId);
        }

        if (la.room) {
            if (!roomPeriodMap[la.room]) roomPeriodMap[la.room] = new Set();
            roomPeriodMap[la.room].add(la.period);
            facultyRoomMap[la.facultyId][la.period] = la.room;
            if (laCourse?.isDoublePeriod) {
                const isM = M_PERIODS.includes(la.period);
                const periodGroup = isM ? M_PERIODS : T_PERIODS;
                const localIdx = periodGroup.indexOf(la.period);
                if (localIdx < periodGroup.length - 1) {
                    const nextPeriod = periodGroup[localIdx + 1];
                    roomPeriodMap[la.room].add(nextPeriod);
                    facultyRoomMap[la.facultyId][nextPeriod] = la.room;
                }
            }
        }
    }

    // Score a faculty-period-course assignment
    function scoreAssignment(f, period, course) {
        let score = 0;
        const pref = getSemPref(preferences, f.id, activeSemester);

        // Availability preference scoring
        if (pref.availability) {
            const avail = pref.availability[period];
            if (avail === AVAILABILITY.PREFER) score += 10;
            else if (avail === AVAILABILITY.AVAILABLE) score += 5;
            else if (avail === AVAILABILITY.UNAVAILABLE && settings.honorUnavailability) score -= 100;
        } else {
            score += 5; // default available
        }

        // Teaching interest scoring (semester-specific):
        // +3 if course is in their interests list;
        // -3 if they have ANY interests set but this course is NOT among them
        // (signals they prefer other courses this semester, but can still teach this one)
        if (settings.useTeachingInterests) {
            const interests = pref.courseInterests || [];
            if (interests.includes(course.id)) {
                score += 3;
            } else if (interests.length > 0) {
                score -= 3;
            }
        }

        // Penalize teaching the same course they're already teaching at a different time
        // (prefer same faculty teaches consecutive sections of same course)
        if (facultyCourseSet[f.id].has(course.id)) {
            score += 2; // Bonus: already teaching this course
        }

        // Penalize adding a new unique course
        if (!facultyCourseSet[f.id].has(course.id)) {
            score -= 1;
        }

        // Balance load: penalize based on utilization ratio so the optimizer
        // actively spreads sections across available faculty rather than
        // piling onto whoever happens to score highest on other factors.
        // Range: 0 (empty) → -16 (at max), which exceeds the availability bonus
        // (+10 preferred, +5 available) so overloaded faculty are reliably skipped.
        const utilization = f.maxSections > 0 ? facultySectionCount[f.id] / f.maxSections : 0;
        score -= utilization * 16;

        // --- Day-grouping preference ---
        // Prefer keeping an instructor on mostly M-day or T-day, not split across both.
        // Capstone courses (ECE 463, ECE 464) are excluded: they are locked to T3/T4
        // and would incorrectly pull all capstone mentors toward T-day assignments.
        // Scores are intentionally low (+3/−2) so this rule acts as a soft tiebreaker
        // and NEVER overrides faculty availability preferences (PREFER +10, AVAILABLE +5).
        const isExcludedFromDayType = course.isCapstone ||
            course.number === 'ECE 463' || course.number === 'ECE 464';
        if (settings.preferSameDayType && !isExcludedFromDayType) {
            // Only count non-excluded periods when deciding which day-type faculty favors.
            const excludedPeriods = new Set(
                assignments
                    .filter(a => a.facultyId === f.id && !a.isAudit && (() => {
                        const ac = courses.find(c => c.id === a.courseId);
                        return ac?.isCapstone || ac?.number === 'ECE 463' || ac?.number === 'ECE 464';
                    })())
                    .map(a => a.period)
            );
            const nonExcludedPeriods = [...facultyPeriodMap[f.id]].filter(p => !excludedPeriods.has(p));

            if (nonExcludedPeriods.length > 0) {
                const hasMDay = nonExcludedPeriods.some(p => M_PERIODS.includes(p));
                const hasTDay = nonExcludedPeriods.some(p => T_PERIODS.includes(p));
                const periodIsM = M_PERIODS.includes(period);

                if (hasMDay && !hasTDay) {
                    // Faculty currently only on M-day
                    score += periodIsM ? 3 : -2;
                } else if (hasTDay && !hasMDay) {
                    // Faculty currently only on T-day
                    score += periodIsM ? -2 : 3;
                }
                // If already on both days, no bonus/penalty
            }
        }

        // --- M1/T1 early-morning avoidance ---
        // Lightly penalize early-morning slots since they are less preferred
        if (settings.penalizeEarlyMorning && (period === 'M1' || period === 'T1')) {
            score -= 4;
        }

        // --- AWT early-slot bias ---
        // If this faculty has Audit While Teach for this course, they need a section
        // taught by a FULLY QUALIFIED instructor at an EARLIER period to audit before
        // teaching.  Other AWT instructors are also "in training" and should not count
        // as valid targets.  Penalize heavily when no such earlier section exists yet —
        // this pushes non-AWT faculty to claim the early slots first so the AWT auditor
        // always has a qualified instructor to watch.
        const awtQualKey = `${f.id}-${course.id}`;
        if (qualifications[awtQualKey] === QUAL_STATUS.AUDIT_WHILE_TEACH) {
            const periodIdx = PERIODS.indexOf(period);
            const hasEarlierQualifiedSection = assignments.some(
                a => a.courseId === course.id &&
                     !a.isAudit &&
                     a.facultyId !== f.id &&
                     qualifications[`${a.facultyId}-${course.id}`] !== QUAL_STATUS.AUDIT_WHILE_TEACH &&
                     PERIODS.indexOf(a.period) < periodIdx
            );
            if (!hasEarlierQualifiedSection) {
                score -= 25; // strong push: let non-AWT faculty take the earlier slot first
            }
        }

        // --- Substitute coverage ---
        // Prefer assignments where at least one OTHER qualified instructor is free at the
        // same period (i.e., not already teaching something else). Max-sections limits are
        // intentionally ignored — a one-off sub can go over their normal load.
        // The penalty is intentionally moderate (-8) so it can be overridden by strong
        // availability or day-type signals when a coverage-friendly slot truly isn't possible.
        if (settings.ensureSubstituteCoverage) {
            const otherQualified = getQualifiedFaculty(course.id).filter(other => other.id !== f.id);
            const hasFreeSubstitute = otherQualified.some(other => !facultyPeriodMap[other.id].has(period));
            if (!hasFreeSubstitute) {
                score -= 8;
            }
        }

        return score;
    }

    // Check if assignment is valid (hard constraints)
    function isValid(f, period, course) {
        // Faculty can't teach two things at once
        if (facultyPeriodMap[f.id].has(period)) return false;

        // For double-period courses, check next period too and disallow lunch-split slots
        if (course.isDoublePeriod) {
            if (period === 'M4' || period === 'T4') return false; // would split across lunch
            const isM = M_PERIODS.includes(period);
            const periodGroup = isM ? M_PERIODS : T_PERIODS;
            const localIdx = periodGroup.indexOf(period);
            if (localIdx >= periodGroup.length - 1) return false; // Can't fit double at last period
            const nextPeriod = periodGroup[localIdx + 1];
            if (facultyPeriodMap[f.id].has(nextPeriod)) return false;
        }

        // Max sections constraint (skip for capstone and auditing courses)
        if (!isExcludedFromLimits(f.id, course) && facultySectionCount[f.id] >= f.maxSections) return false;

        // Max unique courses constraint (skip for capstone and auditing courses)
        if (!isExcludedFromLimits(f.id, course) && !facultyCourseSet[f.id].has(course.id) && facultyCourseSet[f.id].size >= f.maxUniqueCourses) return false;

        // Registrar hard rule: courses with >300 enrollment must ensure at least one
        // section per period (M1–M6 and T1–T6).  While there are still uncovered periods,
        // block doubling up so every period gets filled first.  Once all 12 periods have
        // at least one section, relax the constraint so surplus sections (e.g. a 14th for
        // a 14-section course) can be placed in any period with a willing faculty member.
        if ((course.enrollment || 0) > 300) {
            const coveredPeriods = new Set(
                assignments.filter(a => a.courseId === course.id && !a.isAudit).map(a => a.period)
            );
            const hasUncoveredPeriods = PERIODS.some(p => !coveredPeriods.has(p));
            if (hasUncoveredPeriods && coveredPeriods.has(period)) return false;
        }

        // Avoid placing two sections of the same 2-section course at the M3+M4 or T3+T4
        // boundary — the only back-to-back slot considered problematic at USAFA.
        // Other consecutive pairs (M1-M2, M2-M3, M4-M5, etc.) are acceptable.
        // Courses with 3+ sections are exempt (handled by the outer condition).
        if (settings.avoidBackToBack && courseSectionCounts[course.id] === 2) {
            for (const a of assignments) {
                if (a.courseId !== course.id || a.isAudit) continue;
                // Check both orderings of the M3↔M4 and T3↔T4 forbidden pairs
                if ((period === 'M3' && a.period === 'M4') ||
                    (period === 'M4' && a.period === 'M3') ||
                    (period === 'T3' && a.period === 'T4') ||
                    (period === 'T4' && a.period === 'T3')) return false;
            }
        }

        return true;
    }

    // Find the best room for a given assignment
    function findRoom(course, period, facultyId) {
        // If a room is manually specified on the course, prefer it — but if it's
        // already occupied (e.g. a simultaneous section of the same course), fall
        // through to auto-assignment so both sections can run concurrently in
        // different rooms.
        if (course.room && course.room !== '' && course.room !== 'NONE') {
            if (!roomPeriodMap[course.room]) roomPeriodMap[course.room] = new Set();
            const primaryFree = !roomPeriodMap[course.room].has(period) &&
                (!course.isDoublePeriod || (() => {
                    const isM = M_PERIODS.includes(period);
                    const periodGroup = isM ? M_PERIODS : T_PERIODS;
                    const localIdx = periodGroup.indexOf(period);
                    return localIdx >= periodGroup.length - 1 ||
                        !roomPeriodMap[course.room].has(periodGroup[localIdx + 1]);
                })());
            if (primaryFree) return course.room;
            // Primary room occupied — fall through to auto-assign a different room
        }

        // Auto-assign: smallest room that fits
        const needed = course.classCap || course.enrollment || 1;

        // Determine if faculty is in a specific room in adjacent period (for back-to-back preference)
        const isM = M_PERIODS.includes(period);
        const periodGroup = isM ? M_PERIODS : T_PERIODS;
        const localIdx = periodGroup.indexOf(period);
        let prevRoom = null;
        if (localIdx > 0) {
            const prevPeriod = periodGroup[localIdx - 1];
            prevRoom = facultyRoomMap[facultyId]?.[prevPeriod] || null;
        }

        let bestRoom = null;
        let prevRoomCandidate = null;

        for (const r of sortedRooms) {
            if (r.seats < needed) continue; // room too small
            if (!roomPeriodMap[r.name]) roomPeriodMap[r.name] = new Set();
            if (roomPeriodMap[r.name].has(period)) continue; // room booked

            // For double-period, also check next period
            if (course.isDoublePeriod) {
                if (localIdx < periodGroup.length - 1) {
                    const nextPeriod = periodGroup[localIdx + 1];
                    if (roomPeriodMap[r.name].has(nextPeriod)) continue;
                }
            }

            // Prefer the same room as previous period (minimize room swaps)
            if (prevRoom && r.name === prevRoom) {
                prevRoomCandidate = r.name;
            }

            if (!bestRoom) bestRoom = r.name;
        }

        // Use previous room if available, else smallest fit
        return prevRoomCandidate || bestRoom || null;
    }

    // Assign sections
    const unassigned = [];
    for (const section of sections) {
        const validPeriods = getValidPeriods(section.course);
        const qualifiedFac = getQualifiedFaculty(section.courseId);

        // Build all valid options with scores
        const options = [];
        for (const f of qualifiedFac) {
            for (const p of validPeriods) {
                if (isValid(f, p, section.course)) {
                    const room = findRoom(section.course, p, f.id);
                    if (room !== null) {
                        options.push({
                            faculty: f,
                            period: p,
                            room,
                            score: scoreAssignment(f, p, section.course),
                        });
                    }
                }
            }
        }

        // Sort by score (highest first)
        options.sort((a, b) => b.score - a.score);

        if (options.length > 0) {
            const best = options[0];
            const periodIdx = PERIODS.indexOf(best.period);
            const dayLetter = M_PERIODS.includes(best.period) ? 'M' : 'T';
            const periodNum = M_PERIODS.includes(best.period)
                ? M_PERIODS.indexOf(best.period) + 1
                : T_PERIODS.indexOf(best.period) + 1;

            // Generate section letter (A, B, C, ...)
            const existingSections = assignments.filter(a => a.courseId === section.courseId && a.period === best.period);
            const sectionLetter = String.fromCharCode(65 + existingSections.length);
            const sectionLabel = `${dayLetter}${periodNum}${sectionLetter}`;

            const assignment = {
                id: `assign-${assignments.length}`,
                facultyId: best.faculty.id,
                courseId: section.courseId,
                period: best.period,
                room: best.room,
                section: sectionLabel,
            };

            assignments.push(assignment);
            facultyPeriodMap[best.faculty.id].add(best.period);
            // Don't count capstone or auditing courses toward limits
            if (!isExcludedFromLimits(best.faculty.id, section.course)) {
                facultySectionCount[best.faculty.id]++;
                facultyCourseSet[best.faculty.id].add(section.courseId);
            }

            // Track faculty room for back-to-back preference
            facultyRoomMap[best.faculty.id][best.period] = best.room;

            // For double-period, block next period too
            if (section.course.isDoublePeriod) {
                const isM = M_PERIODS.includes(best.period);
                const periodGroup = isM ? M_PERIODS : T_PERIODS;
                const localIdx = periodGroup.indexOf(best.period);
                if (localIdx < periodGroup.length - 1) {
                    const nextPeriod = periodGroup[localIdx + 1];
                    facultyPeriodMap[best.faculty.id].add(nextPeriod);
                    facultyRoomMap[best.faculty.id][nextPeriod] = best.room;
                }
            }

            // Block room
            if (!roomPeriodMap[best.room]) roomPeriodMap[best.room] = new Set();
            roomPeriodMap[best.room].add(best.period);
            if (section.course.isDoublePeriod) {
                const isM = M_PERIODS.includes(best.period);
                const periodGroup = isM ? M_PERIODS : T_PERIODS;
                const localIdx = periodGroup.indexOf(best.period);
                if (localIdx < periodGroup.length - 1) {
                    roomPeriodMap[best.room].add(periodGroup[localIdx + 1]);
                }
            }
        } else {
            unassigned.push(section);
        }
    }

    // ==================== PHASE 2: Audit Attendance ====================
    const auditAssignments = [];

    // Helper: place a faculty into an existing section as an audit, blocking their period.
    // Returns true if placed successfully.
    function placeAudit(f, section, course, idPrefix, isAwtAudit) {
        const period = section.period;
        if (facultyPeriodMap[f.id].has(period)) return false;

        if (course.isDoublePeriod) {
            const isM = M_PERIODS.includes(period);
            const periodGroup = isM ? M_PERIODS : T_PERIODS;
            const localIdx = periodGroup.indexOf(period);
            if (localIdx < periodGroup.length - 1) {
                const nextPeriod = periodGroup[localIdx + 1];
                if (facultyPeriodMap[f.id].has(nextPeriod)) return false;
            }
        }

        const suffix = isAwtAudit ? '-AWT' : '-AUD';
        const auditAssignment = {
            id: `${idPrefix}-${auditAssignments.length}`,
            facultyId: f.id,
            courseId: course.id,
            period,
            room: section.room,
            section: `${section.section}${suffix}`,
            isAudit: true,
            isAwtAudit: !!isAwtAudit,
        };

        auditAssignments.push(auditAssignment);
        assignments.push(auditAssignment);
        facultyPeriodMap[f.id].add(period);

        if (course.isDoublePeriod) {
            const isM = M_PERIODS.includes(period);
            const periodGroup = isM ? M_PERIODS : T_PERIODS;
            const localIdx = periodGroup.indexOf(period);
            if (localIdx < periodGroup.length - 1) {
                facultyPeriodMap[f.id].add(periodGroup[localIdx + 1]);
            }
        }
        return true;
    }

    // Phase 2a: General Audit — timing does not matter, place in any free section
    for (const f of faculty) {
        for (const course of activeCourses) {
            const qualKey = `${f.id}-${course.id}`;
            if (qualifications[qualKey] !== QUAL_STATUS.GENERAL_AUDIT) continue;

            const courseSections = assignments.filter(a => a.courseId === course.id && !a.isAudit);
            for (const section of courseSections) {
                if (placeAudit(f, section, course, 'audit')) break;
            }
        }
    }

    // Phase 2b: Audit While Teach — for each teaching assignment, place an audit
    // at a section whose period comes BEFORE the teaching period in the weekly cycle.
    // Period ordering (PERIODS array index): M1…M6 (0–5) then T1…T6 (6–11),
    // i.e. all MWF periods precede TR periods — matches "watch M4 before teaching T5".
    const awtViolations = [];
    for (const f of faculty) {
        for (const course of activeCourses) {
            const qualKey = `${f.id}-${course.id}`;
            if (qualifications[qualKey] !== QUAL_STATUS.AUDIT_WHILE_TEACH) continue;

            // Teaching assignments for this faculty+course (placed in Phase 1)
            const teachingAssns = assignments.filter(
                a => a.facultyId === f.id && a.courseId === course.id && !a.isAudit
            );

            // If this faculty was never assigned to teach the course (e.g. over max
            // sections), there is nothing to precede — skip to avoid Math.min([])
            // returning Infinity and causing a spurious late-period audit placement.
            if (teachingAssns.length === 0) continue;

            // One audit per M-T cycle is sufficient — find the earliest teaching period
            // and place a single audit before it.
            const earliestTeachIdx = Math.min(...teachingAssns.map(ta => PERIODS.indexOf(ta.period)));

            // Only consider sections taught by FULLY QUALIFIED instructors (not other
            // AWT "in-training" faculty).  Two AWT auditors may watch the same qualified
            // instructor's section — that is fine.
            const earlierSections = assignments.filter(
                a => a.courseId === course.id &&
                     !a.isAudit &&
                     a.facultyId !== f.id &&
                     qualifications[`${a.facultyId}-${course.id}`] !== QUAL_STATUS.AUDIT_WHILE_TEACH &&
                     PERIODS.indexOf(a.period) < earliestTeachIdx
            );

            // Prefer the latest earlier section (closest to first teach time)
            const sorted = [...earlierSections].sort(
                (a, b) => PERIODS.indexOf(b.period) - PERIODS.indexOf(a.period)
            );

            const placed = sorted.some(section => placeAudit(f, section, course, 'awt-audit', true));
            if (!placed) {
                awtViolations.push({ facultyId: f.id, courseId: course.id, teachPeriod: PERIODS[earliestTeachIdx] });
            }
        }
    }

    return {
        assignments,
        unassigned,
        awtViolations,
        stats: {
            totalSections: sections.length,
            assignedSections: assignments.filter(a => !a.isAudit).length,
            unassignedSections: unassigned.length,
            auditPlacements: auditAssignments.length,
            awtViolationCount: awtViolations.length,
            facultyUtilization: faculty.map(f => ({
                name: f.name,
                sections: facultySectionCount[f.id],
                maxSections: f.maxSections,
                uniqueCourses: facultyCourseSet[f.id].size,
                maxUniqueCourses: f.maxUniqueCourses,
            })),
        },
    };
}

/**
 * Validate a schedule against constraints
 */
export function validateSchedule(assignments, state) {
    const violations = [];
    const { faculty, courses, qualifications, constraints } = state;

    const facultyPeriods = {};
    const facultySections = {};
    const facultyCourses = {};

    for (const a of assignments) {
        // Check qualification (skip for audit assignments — auditing is a valid status for those)
        if (!a.isAudit) {
            const key = `${a.facultyId}-${a.courseId}`;
            const qualStatus = qualifications[key];
            if (qualStatus !== QUAL_STATUS.QUALIFIED &&
                qualStatus !== QUAL_STATUS.COURSE_DIRECTOR &&
                qualStatus !== QUAL_STATUS.AUDIT_WHILE_TEACH) {
                const fac = faculty.find(f => f.id === a.facultyId);
                const course = courses.find(c => c.id === a.courseId);
                violations.push(`${fac?.name} is not qualified to teach ${course?.number}`);
            }
        }

        // Track period conflicts
        if (!facultyPeriods[a.facultyId]) facultyPeriods[a.facultyId] = {};
        if (facultyPeriods[a.facultyId][a.period]) {
            const fac = faculty.find(f => f.id === a.facultyId);
            violations.push(`${fac?.name} has a conflict at ${a.period}`);
        }
        facultyPeriods[a.facultyId][a.period] = true;

        // Track section counts
        facultySections[a.facultyId] = (facultySections[a.facultyId] || 0) + 1;

        // Track unique courses
        if (!facultyCourses[a.facultyId]) facultyCourses[a.facultyId] = new Set();
        facultyCourses[a.facultyId].add(a.courseId);

        // Check course constraints
        const constraint = constraints[a.courseId];
        const course = courses.find(c => c.id === a.courseId);
        if (constraint && constraint.blockedPeriods.includes(a.period)) {
            violations.push(`${course?.number} scheduled in blocked period ${a.period}`);
        }
        // For double-period courses, also check if the next period is blocked
        // and that the course doesn't start at M4/T4 (would split across lunch)
        if (course?.isDoublePeriod) {
            if (a.period === 'M4' || a.period === 'T4') {
                violations.push(`${course?.number} double-period starts at ${a.period}, splitting it across lunch`);
            }
            if (constraint) {
                const isM = M_PERIODS.includes(a.period);
                const periodGroup = isM ? M_PERIODS : T_PERIODS;
                const localIdx = periodGroup.indexOf(a.period);
                if (localIdx < periodGroup.length - 1) {
                    const nextPeriod = periodGroup[localIdx + 1];
                    if (constraint.blockedPeriods.includes(nextPeriod)) {
                        violations.push(`${course?.number} double-period extends into blocked period ${nextPeriod}`);
                    }
                }
            }
        }
    }

    // Check high-enrollment coverage: every period must have at least one section
    for (const course of courses) {
        if ((course.enrollment || 0) <= 300) continue;
        const coursePeriods = new Set(
            assignments.filter(a => a.courseId === course.id && !a.isAudit).map(a => a.period)
        );
        const missingPeriods = PERIODS.filter(p => !coursePeriods.has(p));
        if (missingPeriods.length > 0) {
            violations.push(
                `${course.number} (enrollment ${course.enrollment}) is missing sections in: ${missingPeriods.join(', ')}`
            );
        }
    }

    // Check AWT timing constraint: each AWT faculty+course needs exactly one audit
    // placed before their earliest teaching period (one per M-T cycle is sufficient).
    const awtChecked = new Set();
    for (const a of assignments) {
        if (a.isAudit) continue;
        const qualKey = `${a.facultyId}-${a.courseId}`;
        if (qualifications[qualKey] !== QUAL_STATUS.AUDIT_WHILE_TEACH) continue;
        if (awtChecked.has(qualKey)) continue; // already checked this faculty+course pair
        awtChecked.add(qualKey);

        // Earliest teaching period for this faculty+course
        const teachingPeriods = assignments
            .filter(t => t.facultyId === a.facultyId && t.courseId === a.courseId && !t.isAudit)
            .map(t => PERIODS.indexOf(t.period));
        const earliestTeachIdx = Math.min(...teachingPeriods);

        const hasEarlierAudit = assignments.some(
            au => au.isAwtAudit &&
                  au.facultyId === a.facultyId &&
                  au.courseId === a.courseId &&
                  PERIODS.indexOf(au.period) < earliestTeachIdx
        );
        if (!hasEarlierAudit) {
            const fac = faculty.find(f => f.id === a.facultyId);
            const course = courses.find(c => c.id === a.courseId);
            violations.push(`${fac?.name} has no earlier audit for ${course?.number} before first teach at ${PERIODS[earliestTeachIdx]}`);
        }
    }

    // Check max sections (exclude capstone and audit assignments from counts)
    for (const f of faculty) {
        // Recount excluding capstone courses and all audit assignments (isAudit flag)
        const countedSections = assignments.filter(a => {
            const course = courses.find(c => c.id === a.courseId);
            return a.facultyId === f.id && !course?.isCapstone && !a.isAudit;
        }).length;
        const countedCourses = new Set(
            assignments.filter(a => {
                const course = courses.find(c => c.id === a.courseId);
                return a.facultyId === f.id && !course?.isCapstone && !a.isAudit;
            }).map(a => a.courseId)
        );
        if (countedSections > f.maxSections) {
            violations.push(`${f.name} exceeds max sections (${countedSections}/${f.maxSections})`);
        }
        if (countedCourses.size > f.maxUniqueCourses) {
            violations.push(`${f.name} exceeds max unique courses (${countedCourses.size}/${f.maxUniqueCourses})`);
        }
    }

    return violations;
}
