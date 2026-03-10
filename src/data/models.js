// Teaching periods at USAFA
export const PERIODS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
export const M_PERIODS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
export const T_PERIODS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

export const PERIOD_TIMES = {
  M1: '0730', M2: '0830', M3: '0930', M4: '1030', M5: '1330', M6: '1430',
  T1: '0730', T2: '0830', T3: '0930', T4: '1030', T5: '1330', T6: '1430',
};

// Qualification statuses
export const QUAL_STATUS = {
  QUALIFIED: 'qualified',
  COURSE_DIRECTOR: 'course_director',
  // Audit While Teach: faculty IS scheduled to teach AND must audit one section
  // before each of their teaching sections (audit period must precede teach period)
  AUDIT_WHILE_TEACH: 'audit_while_teach',
  // General Audit: faculty sits in to learn; timing does not matter
  GENERAL_AUDIT: 'auditing',
  NOT_QUALIFIED: 'not_qualified',
};

// Availability preferences
export const AVAILABILITY = {
  PREFER: 'prefer',
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
};

// Semester types
export const SEMESTERS = {
  FALL: 'fall',
  SPRING: 'spring',
};

export function createFaculty(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: '',
    rank: '',
    duty: '',
    branch: '',
    academicRank: '',
    maxSections: 4,
    maxUniqueCourses: 2,
    ...overrides,
  };
}

export function createCourse(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    number: '',
    name: '',
    semester: 'both', // fall, spring, both
    enrollment: 0,
    classCap: 0,
    sectionsNeeded: 0,
    room: '',
    examType: '',
    isDoublePeriod: false,
    isCapstone: false,
    isOffered: true,
    session: 'Regular 40 Lessons',
    ...overrides,
  };
}

export function createCourseConstraint(courseId, overrides = {}) {
  return {
    courseId,
    blockedPeriods: [],
    notes: '',
    ...overrides,
  };
}

export function createScheduleAssignment(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    facultyId: '',
    courseId: '',
    period: '',
    room: '',
    section: '',
    ...overrides,
  };
}
