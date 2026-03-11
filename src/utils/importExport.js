import { PERIOD_TIMES, M_PERIODS } from '../data/models';

/**
 * Export schedule as PCO-format CSV
 */
export function exportPCO(assignments, state) {
    const { faculty, courses } = state;
    const headers = [
        'Department', 'Course/Number', 'Session', 'Class Cap',
        'Class Section', 'Associated Class', 'Facility ID/Room',
        'Select Pattern', 'Start Time', 'M or T section',
        'Instructor (Last Name, First Name)', 'Exam Type'
    ];

    const rows = assignments.filter(a => !a.isAudit).map((a, idx) => {
        const fac = faculty.find(f => f.id === a.facultyId);
        const course = courses.find(c => c.id === a.courseId);
        const isM = M_PERIODS.includes(a.period);
        const pattern = course?.isDoublePeriod
            ? (isM ? 'M2=M-day double period' : 'T2=T-day double period')
            : (isM ? 'M1=M-day single period' : 'T1=T-day single period');

        return [
            'DFEC',
            course?.number?.replace('ECE ', '') || '',
            course?.session || 'Regular 40 Lessons',
            course?.classCap || '',
            a.section,
            idx + 1,
            a.room || '',
            pattern,
            PERIOD_TIMES[a.period] || '',
            isM ? 'M' : 'T',
            fac?.name || '',
            course?.examType || '',
        ];
    });

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PCO_${state.activeSemester}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Export full state as JSON
 */
export function exportJSON(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dfec-schedule-${state.activeSemester}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Import state from JSON file
 */
export function importJSON(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                resolve(JSON.parse(e.target.result));
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsText(file);
    });
}
