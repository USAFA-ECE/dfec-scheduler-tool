import { useSession } from '../data/session';

const TABS = [
  { id: 'dashboard',      label: 'Dashboard',  icon: '📊' },
  { id: 'schedule',       label: 'Schedule',   icon: '📅' },
  { id: 'qualifications', label: 'Quals',      icon: '🎯' },
  { id: 'preferences',    label: 'Prefs',      icon: '📋' },
  { id: 'courses',        label: 'Courses',    icon: '📚' },
];

const ADMIN_TAB = { id: 'settings', label: 'Settings', icon: '⚙️' };

/**
 * Fixed bottom navigation bar, visible only on mobile (CSS controls display).
 */
export default function BottomNav({ activeTab, onTabChange }) {
  const { isAdmin } = useSession();

  const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`bottom-nav-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          <span className="bottom-nav-icon" aria-hidden="true">{tab.icon}</span>
          <span className="bottom-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
