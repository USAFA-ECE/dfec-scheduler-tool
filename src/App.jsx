import { useState } from 'react';
import { AppProvider, useApp } from './data/store';
import Dashboard from './components/Dashboard';
import QualificationMatrix from './components/QualificationMatrix';
import FacultyPreferences from './components/FacultyPreferences';
import CourseManagement from './components/CourseManagement';
import RoomManagement from './components/RoomManagement';
import ScheduleView from './components/ScheduleView';
import Settings from './components/Settings';
import Login from './components/Login';
import { importJSON } from './utils/importExport';
import { SessionContext } from './data/session';

const ALL_TABS = [
  { id: 'dashboard',      label: 'Dashboard',          icon: '📊' },
  { id: 'qualifications', label: 'Qualifications',     icon: '🎯' },
  { id: 'preferences',    label: 'Faculty Preferences', icon: '📋' },
  { id: 'courses',        label: 'Course Management',  icon: '📚' },
  { id: 'rooms',          label: 'Room Management',    icon: '🏫' },
  { id: 'schedule',       label: 'Schedule',           icon: '📅' },
  { id: 'settings',       label: 'Settings',           icon: '⚙️', adminOnly: true },
];

const LOGO_SRC = `${import.meta.env.BASE_URL}dfec_logo.png`;

function AppContent({ currentUser, onLogout }) {
  const [activeTab, setActiveTab] = useState('preferences');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const { state, dispatch, exportState } = useApp();

  const currentFaculty = state.faculty.find(f => f.id === currentUser);
  const isAdmin = (currentFaculty?.role ?? 'instructor') === 'admin';

  // Filter tabs based on role
  const visibleTabs = ALL_TABS.filter(t => !t.adminOnly || isAdmin);

  // If active tab got hidden (e.g. settings for non-admin), fall back
  const safeActiveTab = visibleTabs.find(t => t.id === activeTab) ? activeTab : 'preferences';

  const sessionValue = { isAdmin, currentUserId: currentUser };

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

  function confirmReset() {
    dispatch({ type: 'RESET_STATE' });
    setShowResetConfirm(false);
  }

  return (
    <SessionContext.Provider value={sessionValue}>
      <div className="app-container">
        {/* Header */}
        <header className="app-header">
          <div className="header-content">
            <div className="header-brand">
              <img
                src={LOGO_SRC}
                alt="DFEC"
                style={{ height: 42, width: 'auto', objectFit: 'contain', marginRight: 4 }}
                onError={e => { e.target.style.display = 'none'; }}
              />
              <div>
                <div className="header-title">DFEC Scheduler</div>
                <div className="header-subtitle">Faculty Teaching Schedule Optimizer</div>
              </div>
            </div>
            <div className="header-actions">
              {isAdmin && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={handleImport} title="Import JSON">
                    📂 Import
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={exportState} title="Export JSON">
                    💾 Export
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowResetConfirm(true)} title="Reset Data">
                    🔄 Reset
                  </button>
                </>
              )}
              {currentFaculty && (
                <>
                  <div style={{
                    width: 1, height: 24,
                    background: 'rgba(138,141,143,0.25)',
                    margin: '0 4px',
                  }} />
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 10px',
                    background: isAdmin ? 'rgba(168,85,247,0.12)' : 'rgba(26,86,196,0.12)',
                    border: `1px solid ${isAdmin ? 'rgba(168,85,247,0.25)' : 'rgba(26,86,196,0.25)'}`,
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                  }}>
                    <span style={{ fontSize: '1rem' }}>{isAdmin ? '🛡️' : '👤'}</span>
                    <span>{currentFaculty.rank} {currentFaculty.name}</span>
                    {isAdmin && (
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em',
                        padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(168,85,247,0.2)', color: '#c084fc',
                      }}>ADMIN</span>
                    )}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={onLogout} title="Sign Out">
                    🔓 Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="nav-tabs">
          <div className="nav-tabs-inner">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                className={`nav-tab ${safeActiveTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon} {tab.label}
                {tab.id === 'qualifications' && state.faculty.length > 0 && (
                  <span className="tab-badge">{state.faculty.length}</span>
                )}
                {tab.id === 'courses' && state.courses.length > 0 && (
                  <span className="tab-badge">{state.courses.length}</span>
                )}
                {tab.id === 'schedule' && state.schedule.length > 0 && (
                  <span className="tab-badge">{state.schedule.length}</span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        <main className="main-content">
          {safeActiveTab === 'dashboard'      && <Dashboard />}
          {safeActiveTab === 'qualifications' && <QualificationMatrix />}
          {safeActiveTab === 'preferences'    && <FacultyPreferences initialFacultyId={currentUser} />}
          {safeActiveTab === 'courses'        && <CourseManagement />}
          {safeActiveTab === 'rooms'          && <RoomManagement />}
          {safeActiveTab === 'schedule'       && <ScheduleView />}
          {safeActiveTab === 'settings'       && <Settings />}
        </main>

        {/* Reset Confirmation Modal */}
        {showResetConfirm && (
          <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setShowResetConfirm(false); }}>
            <div className="modal" style={{ maxWidth: 420 }}>
              <h2 className="modal-title">Reset All Data?</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                This will clear all current data and reload the default sample data. This action cannot be undone.
              </p>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowResetConfirm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmReset} style={{ background: '#ef4444' }}>
                  Reset Data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SessionContext.Provider>
  );
}

function AppShell() {
  const [currentUser, setCurrentUser] = useState(null);

  if (!currentUser) {
    return <Login onLogin={id => setCurrentUser(id)} />;
  }

  return <AppContent currentUser={currentUser} onLogout={() => setCurrentUser(null)} />;
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
