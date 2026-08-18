import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  // Task #17 — Referral program: a shared referral "link" is just
  // `/signup?ref=<CODE>` (no real deep-link infrastructure — see
  // MOCK_FEATURES.md) — prefill the field below from it so following a
  // shared link is one less thing to type, without requiring it.
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(searchParams.get('ref') || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signup(email, password, referralCode.trim() || undefined);
      // A brand-new account never has a profile yet, straight to the builder.
      navigate('/profile/edit');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-rose-600 mb-1 text-center">CG Dating</h1>
        <p className="text-gray-500 text-center mb-6">Create your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="referralCode" className="block text-sm font-medium text-gray-700 mb-1">
              Referral code <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="referralCode"
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400 uppercase tracking-wider"
              placeholder="e.g. AB3D9FQ"
              maxLength={7}
            />
            <p className="mt-1 text-xs text-gray-400">
              Got invited by a friend? Enter their code and you&rsquo;ll both get a reward.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 transition disabled:opacity-60"
          >
            {submitting ? 'Signing up…' : 'Sign up'}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-rose-600 font-medium hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Signup;
