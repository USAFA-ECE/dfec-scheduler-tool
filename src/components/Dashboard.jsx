import { useState } from 'react';
import { useApp } from '../data/store';
import { SEMESTERS, QUAL_STATUS } from '../data/models';
import { loadPreviousDataset, saveCurrentDataset } from '../data/sampleData';
import { courseNumberSort } from '../utils/courseSort';
import { computeSectionsNeeded } from '../utils/courseUtils';

export default function Dashboard() {
    const { state, dispatch } = useApp();
    const { faculty, courses, qualifications, schedule, activeSemester, constraints } = state;
    const [saveMsg, setSaveMsg] = useState(null);

    const activeCourses = courses.filter(c => c.semester === activeSemester || c.semester === 'both')
        .sort(courseNumberSort);
    const totalSections = activeCourses.reduce((sum, c) => sum + computeSectionsNeeded(c.enrollment, c.classCap), 0);
    const qualifiedPairs = Object.values(qualifications).filter(q => q === QUAL_STATUS.QUALIFIED).length;
    const constraintCount = Object.keys(constraints).length;

    const assignedSections = schedule.length;
    const unassignedSections = totalSections - assignedSections;

    // Faculty load summary (exclude capstone and auditing from counted load)
    const facultyLoad = {};
    schedule.forEach(a => {
        if (!facultyLoad[a.facultyId]) facultyLoad[a.facultyId] = { sections: 0, courses: new Set(), totalSections: 0 };
        facultyLoad[a.facultyId].totalSections++;
        const course = courses.find(c => c.id === a.courseId);
        const isCapstone = course?.isCapstone;
        if (!isCapstone && !a.isAudit) {
            facultyLoad[a.facultyId].sections++;
            facultyLoad[a.facultyId].courses.add(a.courseId);
        }
    });

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-description">
                        {activeSemester === SEMESTERS.FALL ? 'Fall' : 'Spring'} Semester Overview
                    </p>
                </div>
                <div className="flex gap-1">
                    <div className="semester-toggle">
                        <button
                            className={`semester-btn ${activeSemester === SEMESTERS.FALL ? 'active' : ''}`}
                            onClick={() => dispatch({ type: 'SET_ACTIVE_SEMESTER', payload: SEMESTERS.FALL })}
                        >
                            Fall
                        </button>
                        <button
                            className={`semester-btn ${activeSemester === SEMESTERS.SPRING ? 'active' : ''}`}
                            onClick={() => dispatch({ type: 'SET_ACTIVE_SEMESTER', payload: SEMESTERS.SPRING })}
                        >
                            Spring
                        </button>
                    </div>
                    {faculty.length > 0 && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                const ok = saveCurrentDataset(state);
                                setSaveMsg(ok ? '✓ Saved' : '✗ Failed');
                                setTimeout(() => setSaveMsg(null), 2000);
                            }}
                        >
                            {saveMsg || '💾 Save Dataset'}
                        </button>
                    )}
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <span className="stat-label">Faculty</span>
                    <span className="stat-value">{faculty.length}</span>
                    <span className="stat-detail">instructors available</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Active Courses</span>
                    <span className="stat-value">{activeCourses.length}</span>
                    <span className="stat-detail">{activeSemester} semester</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Sections Needed</span>
                    <span className="stat-value">{totalSections}</span>
                    <span className="stat-detail">{assignedSections} assigned, {unassignedSections > 0 ? unassignedSections : 0} remaining</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Qualifications</span>
                    <span className="stat-value">{qualifiedPairs}</span>
                    <span className="stat-detail">faculty-course pairs</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Constraints</span>
                    <span className="stat-value">{constraintCount}</span>
                    <span className="stat-detail">course restrictions</span>
                </div>
            </div>

            {faculty.length === 0 && (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">🚀</div>
                        <h3 className="empty-state-title">Get Started</h3>
                        <p className="empty-state-text">
                            Load a previously saved dataset or start fresh by adding faculty and courses.
                        </p>
                        <div className="flex gap-1 mt-2">
                            <button className="btn btn-primary btn-lg" onClick={() => loadPreviousDataset(dispatch)}>
                                Load Previous Dataset
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {faculty.length > 0 && schedule.length > 0 && (
                <div className="card mt-2">
                    <div className="card-header">
                        <h3 className="card-title">Faculty Load Summary</h3>
                    </div>
                    <div className="matrix-container">
                        <table className="matrix-table">
                            <thead>
                                <tr>
                                    <th>Faculty</th>
                                    <th>Duty</th>
                                    <th>Sections</th>
                                    <th>Max Sections</th>
                                    <th>Unique Courses</th>
                                    <th>Max Courses</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...faculty].sort((a, b) => a.name.localeCompare(b.name)).map(f => {
                                    const load = facultyLoad[f.id] || { sections: 0, courses: new Set() };
                                    const overSections = load.sections > f.maxSections;
                                    const overCourses = load.courses.size > f.maxUniqueCourses;
                                    return (
                                        <tr key={f.id}>
                                            <td className="faculty-name">{f.name}</td>
                                            <td style={{ textAlign: 'center' }}>{f.duty || '—'}</td>
                                            <td style={{ textAlign: 'center', color: overSections ? '#ef4444' : 'inherit' }}>
                                                {load.sections}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>{f.maxSections}</td>
                                            <td style={{ textAlign: 'center', color: overCourses ? '#ef4444' : 'inherit' }}>
                                                {load.courses.size}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>{f.maxUniqueCourses}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                {overSections || overCourses ? (
                                                    <span className="tag tag-red">⚠ Over limit</span>
                                                ) : (
                                                    <span className="tag tag-green">✓ OK</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {faculty.length > 0 && (
                <div className="card mt-2">
                    <div className="card-header">
                        <h3 className="card-title">Course Sections Summary</h3>
                    </div>
                    <div className="matrix-container">
                        <table className="matrix-table">
                            <thead>
                                <tr>
                                    <th>Course</th>
                                    <th>Enrollment</th>
                                    <th>Cap</th>
                                    <th>Sections Needed</th>
                                    <th>Assigned</th>
                                    <th>Remaining</th>
                                    <th>Room</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeCourses.map(c => {
                                    const assigned = schedule.filter(a => a.courseId === c.id).length;
                                    const sectionsNeeded = computeSectionsNeeded(c.enrollment, c.classCap);
                                    const remaining = sectionsNeeded - assigned;
                                    return (
                                        <tr key={c.id}>
                                            <td className="faculty-name">{c.number}</td>
                                            <td style={{ textAlign: 'center' }}>{c.enrollment}</td>
                                            <td style={{ textAlign: 'center' }}>{c.classCap}</td>
                                            <td style={{ textAlign: 'center' }}>{sectionsNeeded}</td>
                                            <td style={{ textAlign: 'center' }}>{assigned}</td>
                                            <td style={{
                                                textAlign: 'center',
                                                color: remaining > 0 ? '#f59e0b' : remaining < 0 ? '#ef4444' : '#22c55e'
                                            }}>
                                                {remaining > 0 ? remaining : remaining === 0 ? '✓' : `+${Math.abs(remaining)}`}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>{c.room || '—'}</td>
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
