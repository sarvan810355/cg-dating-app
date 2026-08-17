import { Link, useLocation } from 'react-router-dom';

// Small shared tab strip for the /admin/* pages (Task #11 — Admin panel, see
// docs/ROADMAP.md's Phase 9). Deliberately not the app's main bottom nav
// (docs/DESIGN_SYSTEM.md's "Home | Discover | Likes | Matches | Profile" —
// the admin section lives outside that nav entirely, reached only via the
// role-gated link on Dashboard/Settings — see frontend/src/pages/
// Dashboard.jsx / Settings.jsx) — just a way to move between the four admin
// screens once you're already in the section.
const TABS = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/verifications', label: 'Verifications' },
  { to: '/admin/users', label: 'Users' },
];

function AdminNav() {
  const { pathname } = useLocation();

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
      {TABS.map((tab) => {
        const active = pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:bg-primary-subtle hover:text-primary'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default AdminNav;
