import { useState, useEffect } from 'react';
import { AppProvider, useApp } from './data/store';
import Dashboard from './components/Dashboard';
import QualificationMatrix from './components/QualificationMatrix';
import FacultyPreferences from './components/FacultyPreferences';
import CourseManagement from './components/CourseManagement';
import RoomManagement from './components/RoomManagement';
import ScheduleView from './components/ScheduleView';
import Settings from './components/Settings';
import Login from './components/Login';
import ChangePassword from './components/ChangePassword';
import BottomNav from './components/BottomNav';
import { SessionContext } from './data/session';
import { SEMESTERS } from './data/models';

// Per-user UI preferences (semester toggle) — stored separately from the
// shared app state so each person gets their own default on login.
const USER_PREFS_KEY = 'dfec-user-prefs';

function getUserPref(userId, key) {
  try {
    const all = JSON.parse(localStorage.getItem(USER_PREFS_KEY) || '{}');
    return all[userId]?.[key] ?? null;
  } catch { return null; }
}

function setUserPref(userId, key, value) {
  try {
    const all = JSON.parse(localStorage.getItem(USER_PREFS_KEY) || '{}');
    all[userId] = { ...all[userId], [key]: value };
    localStorage.setItem(USER_PREFS_KEY, JSON.stringify(all));
  } catch { /* ignore quota errors */ }
}

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

const SYNC_STYLES = {
  loading: { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  color: '#60a5fa', label: '↓ Loading'  },
  syncing: { bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.3)',   color: '#facc15', label: '⟳ Syncing' },
  synced:  { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   color: '#4ade80', label: '● Synced'  },
  offline: { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   color: '#f87171', label: '⚠ Offline' },
};

function SyncBadge({ status }) {
  const s = SYNC_STYLES[status] ?? SYNC_STYLES.loading;
  return (
    <span
      title={status === 'offline' ? 'Cloud sync unavailable — changes saved locally' : 'Cloud sync status'}
      style={{
        fontSize: '0.72rem', fontWeight: 600,
        padding: '3px 8px', borderRadius: 6,
        background: s.bg, border: `1px solid ${s.border}`, color: s.color,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}

function AppContent({ currentUser, onLogout, showChangePassword, changePasswordForced, onPasswordChangeComplete, onRequestChangePassword }) {
  const [activeTab, setActiveTab] = useState('preferences');
  const { state, dispatch, syncStatus } = useApp();

  const currentFaculty = state.faculty.find(f => f.id === currentUser);

  // ── Per-user semester preference ────────────────────────────────────────────
  // On login: restore this user's last-used semester toggle.
  useEffect(() => {
    if (!currentUser) return;
    const saved = getUserPref(currentUser, 'activeSemester');
    if (saved === SEMESTERS.FALL || saved === SEMESTERS.SPRING) {
      dispatch({ type: 'SET_ACTIVE_SEMESTER', payload: saved });
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // On change: save this user's semester choice whenever they toggle it.
  useEffect(() => {
    if (!currentUser) return;
    setUserPref(currentUser, 'activeSemester', state.activeSemester);
  }, [currentUser, state.activeSemester]);

  const isAdmin = (currentFaculty?.role ?? 'instructor') === 'admin';

  // Filter tabs based on role
  const visibleTabs = ALL_TABS.filter(t => !t.adminOnly || isAdmin);

  // If active tab got hidden (e.g. settings for non-admin), fall back
  const safeActiveTab = visibleTabs.find(t => t.id === activeTab) ? activeTab : 'preferences';

  const sessionValue = { isAdmin, currentUserId: currentUser };

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
              <SyncBadge status={syncStatus} />
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
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={onRequestChangePassword}
                    title="Change Password"
                    style={{ fontSize: '0.82rem' }}
                  >
                    🔑 Password
                  </button>
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

        {/* Mobile bottom navigation (CSS hides on desktop) */}
        <BottomNav activeTab={safeActiveTab} onTabChange={setActiveTab} />

      </div>

      {showChangePassword && (
        <ChangePassword
          facultyId={currentUser}
          isForced={changePasswordForced}
          onComplete={onPasswordChangeComplete}
          onSkip={onPasswordChangeComplete}
        />
      )}
    </SessionContext.Provider>
  );
}

function AppShell() {
  const [currentUser, setCurrentUser] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changePasswordForced, setChangePasswordForced] = useState(false);

  if (!currentUser) {
    return (
      <Login
        onLogin={(id, usedDefault) => {
          setCurrentUser(id);
          setShowChangePassword(usedDefault);
          setChangePasswordForced(usedDefault);
        }}
      />
    );
  }

  return (
    <AppContent
      currentUser={currentUser}
      onLogout={() => { setCurrentUser(null); setShowChangePassword(false); }}
      showChangePassword={showChangePassword}
      changePasswordForced={changePasswordForced}
      onPasswordChangeComplete={() => setShowChangePassword(false)}
      onRequestChangePassword={() => { setChangePasswordForced(false); setShowChangePassword(true); }}
    />
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
