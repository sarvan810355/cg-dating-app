import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
        <h1 className="text-3xl font-bold text-rose-600 mb-2">CG Dating</h1>
        <p className="text-gray-600 mb-1">You're logged in as</p>
        <p className="text-lg font-medium text-gray-800 mb-6">{user?.email}</p>
        <p className="text-sm text-gray-400 mb-6">
          Profile, matching, and chat are coming in a future update.
        </p>
        <button
          onClick={handleLogout}
          className="w-full py-2 rounded-lg bg-white text-rose-600 border border-rose-300 font-medium hover:bg-rose-50 transition"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

export default Dashboard;
