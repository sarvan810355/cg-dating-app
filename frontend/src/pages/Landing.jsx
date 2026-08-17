import { Link } from 'react-router-dom';

function Landing() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100">
      <div className="text-center px-6">
        <h1 className="text-5xl font-bold text-rose-600 mb-4">CG Dating</h1>
        <p className="text-lg text-gray-600 mb-8">
          Find your match. Coming soon.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            to="/login"
            className="px-6 py-2 rounded-full bg-white text-rose-600 border border-rose-300 font-medium hover:bg-rose-50 transition"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="px-6 py-2 rounded-full bg-rose-600 text-white font-medium hover:bg-rose-700 transition"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Landing;
