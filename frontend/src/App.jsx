import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProfileBuilder from './pages/ProfileBuilder';
import Discovery from './pages/Discovery';
import Matches from './pages/Matches';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import DiscoveryPreferences from './pages/DiscoveryPreferences';
import Verification from './pages/Verification';
import BlockedUsers from './pages/BlockedUsers';
import SafetyCenter from './pages/SafetyCenter';
import Subscription from './pages/Subscription';
import Referrals from './pages/Referrals';
import SafeDates from './pages/SafeDates';
import PlanSafeDate from './pages/PlanSafeDate';
import DateIdeas from './pages/DateIdeas';
import AdminDashboard from './pages/AdminDashboard';
import AdminReports from './pages/AdminReports';
import AdminVerifications from './pages/AdminVerifications';
import AdminUsers from './pages/AdminUsers';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/edit"
        element={
          <ProtectedRoute>
            <ProfileBuilder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/discover"
        element={
          <ProtectedRoute>
            <Discovery />
          </ProtectedRoute>
        }
      />
      <Route
        path="/matches"
        element={
          <ProtectedRoute>
            <Matches />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat/:matchId"
        element={
          <ProtectedRoute>
            <Chat />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/verification"
        element={
          <ProtectedRoute>
            <Verification />
          </ProtectedRoute>
        }
      />
      {/* Task #14 — Discovery Preferences (V2, user-requested: location/age
          match preferences + incognito browsing, see docs/ROADMAP.md's V2
          section). */}
      <Route
        path="/settings/discovery-preferences"
        element={
          <ProtectedRoute>
            <DiscoveryPreferences />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/blocked-users"
        element={
          <ProtectedRoute>
            <BlockedUsers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/safety-center"
        element={
          <ProtectedRoute>
            <SafetyCenter />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subscription"
        element={
          <ProtectedRoute>
            <Subscription />
          </ProtectedRoute>
        }
      />
      <Route
        path="/referrals"
        element={
          <ProtectedRoute>
            <Referrals />
          </ProtectedRoute>
        }
      />
      {/* Task #18 — Safe Date mode + Date Planner (V2, see docs/ROADMAP.md's Phase
          12). /safe-dates/new optionally takes a ?matchId= query param — see
          frontend/src/pages/Chat.jsx's "Plan a Safe Date" header link and
          frontend/src/pages/PlanSafeDate.jsx. */}
      <Route
        path="/safe-dates"
        element={
          <ProtectedRoute>
            <SafeDates />
          </ProtectedRoute>
        }
      />
      <Route
        path="/safe-dates/new"
        element={
          <ProtectedRoute>
            <PlanSafeDate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/date-ideas"
        element={
          <ProtectedRoute>
            <DateIdeas />
          </ProtectedRoute>
        }
      />
      {/* Task #11 — Admin panel (see docs/ROADMAP.md's Phase 9). Role-gated
          via AdminRoute (not just ProtectedRoute) — see frontend/src/
          components/AdminRoute.jsx. Deliberately outside the app's normal
          bottom-nav flow (docs/DESIGN_SYSTEM.md) and never linked from
          anywhere in the UI for a non-admin user — see Dashboard.jsx /
          Settings.jsx's role-conditional link. */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <AdminRoute>
            <AdminReports />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/verifications"
        element={
          <AdminRoute>
            <AdminVerifications />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <AdminUsers />
          </AdminRoute>
        }
      />
    </Routes>
  );
}

export default App;
