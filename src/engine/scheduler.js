import { QUAL_STATUS, AVAILABILITY, PERIODS, M_PERIODS, T_PERIODS } from '../data/models';
import { computeSectionsNeeded } from '../utils/courseUtils';

/**
 * DFEC Schedule Optimizer
 * 
 * Uses constraint-based assignment with priority scoring.
 * Courses are sorted by constraint difficulty (fewest valid assignments first).
 * Faculty are scored per slot based on preference alignment.
 */

export function generateSchedule(state) {
    const { faculty, courses, qualifications, preferences, constraints, activeSemester, rooms } = state;

    // Filter courses for active semester (only offered courses)
    const activeCourses = courses.filter(c =>
        (c.semester === activeSemester || c.semester === 'both') && c.isOffered !== false
    );

    // Build sections that need to be assigned
    const sections = [];
    for (const course of activeCourses) {
        const numSections = computeSectionsNeeded(course.enrollment, course.classCap);
        for (let i = 0; i < numSections; i++) {
            sections.push({
                courseId: course.id,
                course,
                sectionIndex: i,
                room: course.room, // manually assigned room (may be empty for auto-assign)
            });
        }
    }

    // Get valid periods for a course
    function getValidPeriods(course) {
        const constraint = constraints[course.id];
        const blocked = constraint ? constraint.blockedPeriods : [];
        return PERIODS.filter(p => !blocked.includes(p));
    }

    // Get qualified faculty for a course
    function getQualifiedFaculty(courseId) {
        return faculty.filter(f => {
            const key = `${f.id}-${courseId}`;
            const status = qualifications[key];
            return status === QUAL_STATUS.QUALIFIED || status === QUAL_STATUS.COURSE_DIRECTOR;
        });
    }

    // Check if a faculty member is auditing (not teaching) a course
    function isAuditing(facultyId, courseId) {
        const key = `${facultyId}-${courseId}`;
        return qualifications[key] === QUAL_STATUS.AUDITING;
    }

    // Check if a course should be excluded from load limits (capstone or auditing)
    function isExcludedFromLimits(facultyId, course) {
        return course.isCapstone || isAuditing(facultyId, course.id);
    }

    // Sort sections by constraint difficulty
    sections.sort((a, b) => {
        const aOptions = getValidPeriods(a.course).length * getQualifiedFaculty(a.courseId).length;
        const bOptions = getValidPeriods(b.course).length * getQualifiedFaculty(b.courseId).length;
        return aOptions - bOptions;
    });

    // Track assignments
    const assignments = [];
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

    // Score a faculty-period-course assignment
    function scoreAssignment(f, period, course) {
        let score = 0;
        const pref = preferences[f.id];

        // Availability preference scoring
        if (pref && pref.availability) {
            const avail = pref.availability[period];
            if (avail === AVAILABILITY.PREFER) score += 10;
            else if (avail === AVAILABILITY.AVAILABLE) score += 5;
            else if (avail === AVAILABILITY.UNAVAILABLE) score -= 100;
        } else {
            score += 5; // default available
        }

        // Course interest scoring
        if (pref && pref.courseInterests && pref.courseInterests.includes(course.id)) {
            score += 3;
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

        // Balance load: penalize faculty with more sections
        score -= facultySectionCount[f.id] * 2;

        return score;
    }

    // Check if assignment is valid (hard constraints)
    function isValid(f, period, course) {
        // Faculty can't teach two things at once
        if (facultyPeriodMap[f.id].has(period)) return false;

        // For double-period courses, check next period too
        if (course.isDoublePeriod) {
            const periodIdx = PERIODS.indexOf(period);
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

        return true;
    }

    // Find the best room for a given assignment
    function findRoom(course, period, facultyId) {
        // If a room is manually specified on the course, use it (check availability)
        if (course.room && course.room !== '' && course.room !== 'NONE') {
            if (!roomPeriodMap[course.room]) roomPeriodMap[course.room] = new Set();
            if (roomPeriodMap[course.room].has(period)) return null; // conflict
            if (course.isDoublePeriod) {
                const isM = M_PERIODS.includes(period);
                const periodGroup = isM ? M_PERIODS : T_PERIODS;
                const localIdx = periodGroup.indexOf(period);
                if (localIdx < periodGroup.length - 1) {
                    const nextPeriod = periodGroup[localIdx + 1];
                    if (roomPeriodMap[course.room].has(nextPeriod)) return null;
                }
            }
            return course.room;
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
    // After all teaching sections are assigned, place auditing faculty into
    // existing sections of courses they want to audit (lower priority)
    const auditAssignments = [];
    for (const f of faculty) {
        // Find courses this faculty is auditing
        for (const course of activeCourses) {
            const qualKey = `${f.id}-${course.id}`;
            if (qualifications[qualKey] !== QUAL_STATUS.AUDITING) continue;

            // Find already-scheduled sections of this course
            const courseSections = assignments.filter(a => a.courseId === course.id);
            if (courseSections.length === 0) continue;

            // Try to find a section where this faculty has a free period
            let placed = false;
            for (const section of courseSections) {
                const period = section.period;
                if (facultyPeriodMap[f.id].has(period)) continue;

                // For double-period courses, also check next period
                if (course.isDoublePeriod) {
                    const isM = M_PERIODS.includes(period);
                    const periodGroup = isM ? M_PERIODS : T_PERIODS;
                    const localIdx = periodGroup.indexOf(period);
                    if (localIdx < periodGroup.length - 1) {
                        const nextPeriod = periodGroup[localIdx + 1];
                        if (facultyPeriodMap[f.id].has(nextPeriod)) continue;
                    }
                }

                // Place audit attendance (no room needed — sitting in on existing section)
                const auditAssignment = {
                    id: `audit-${auditAssignments.length}`,
                    facultyId: f.id,
                    courseId: course.id,
                    period: period,
                    room: section.room,
                    section: `${section.section}-AUD`,
                    isAudit: true,
                };

                auditAssignments.push(auditAssignment);
                assignments.push(auditAssignment);
                facultyPeriodMap[f.id].add(period);

                // Block next period for double-period courses
                if (course.isDoublePeriod) {
                    const isM = M_PERIODS.includes(period);
                    const periodGroup = isM ? M_PERIODS : T_PERIODS;
                    const localIdx = periodGroup.indexOf(period);
                    if (localIdx < periodGroup.length - 1) {
                        facultyPeriodMap[f.id].add(periodGroup[localIdx + 1]);
                    }
                }

                placed = true;
                break;
            }
        }
    }

    return {
        assignments,
        unassigned,
        stats: {
            totalSections: sections.length,
            assignedSections: assignments.filter(a => !a.isAudit).length,
            unassignedSections: unassigned.length,
            auditPlacements: auditAssignments.length,
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
            if (qualStatus !== QUAL_STATUS.QUALIFIED && qualStatus !== QUAL_STATUS.COURSE_DIRECTOR) {
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
        if (constraint && constraint.blockedPeriods.includes(a.period)) {
            const course = courses.find(c => c.id === a.courseId);
            violations.push(`${course?.number} scheduled in blocked period ${a.period}`);
        }
    }

    // Check max sections (exclude capstone and auditing courses from counts)
    for (const f of faculty) {
        // Recount excluding capstone and auditing
        const countedSections = assignments.filter(a => {
            const course = courses.find(c => c.id === a.courseId);
            const qualKey = `${a.facultyId}-${a.courseId}`;
            const isAudit = qualifications[qualKey] === QUAL_STATUS.AUDITING;
            return a.facultyId === f.id && !course?.isCapstone && !isAudit;
        }).length;
        const countedCourses = new Set(
            assignments.filter(a => {
                const course = courses.find(c => c.id === a.courseId);
                const qualKey = `${a.facultyId}-${a.courseId}`;
                const isAudit = qualifications[qualKey] === QUAL_STATUS.AUDITING;
                return a.facultyId === f.id && !course?.isCapstone && !isAudit;
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
