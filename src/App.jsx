import { useState } from 'react';
import { AppProvider, useApp } from './data/store';
import Dashboard from './components/Dashboard';
import QualificationMatrix from './components/QualificationMatrix';
import FacultyPreferences from './components/FacultyPreferences';
import CourseManagement from './components/CourseManagement';
import RoomManagement from './components/RoomManagement';
import ScheduleView from './components/ScheduleView';
import { importJSON } from './utils/importExport';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'qualifications', label: 'Qualifications', icon: '🎯' },
  { id: 'preferences', label: 'Faculty Preferences', icon: '📋' },
  { id: 'courses', label: 'Course Management', icon: '📚' },
  { id: 'rooms', label: 'Room Management', icon: '🏫' },
  { id: 'schedule', label: 'Schedule', icon: '📅' },
];

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const { state, dispatch, exportState } = useApp();

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

  function handleReset() {
    setShowResetConfirm(true);
  }

  function confirmReset() {
    dispatch({ type: 'RESET_STATE' });
    setShowResetConfirm(false);
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-brand">
            <div className="header-logo">DF</div>
            <div>
              <div className="header-title">DFEC Scheduler</div>
              <div className="header-subtitle">Faculty Teaching Schedule Optimizer</div>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-ghost btn-sm" onClick={handleImport} title="Import JSON">
              📂 Import
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportState} title="Export JSON">
              💾 Export
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleReset} title="Reset Data">
              🔄 Reset
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="nav-tabs">
        <div className="nav-tabs-inner">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
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
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'qualifications' && <QualificationMatrix />}
        {activeTab === 'preferences' && <FacultyPreferences />}
        {activeTab === 'courses' && <CourseManagement />}
        {activeTab === 'rooms' && <RoomManagement />}
        {activeTab === 'schedule' && <ScheduleView />}
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
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
