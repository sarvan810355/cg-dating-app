import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '../components/Button';

// Placeholder landing spot for a match's conversation until real chat
// (Task #5 — Socket.IO messaging, conversations/messages) ships. Linked to
// from Matches.jsx instead of leaving matches as a dead end.
function ChatComingSoon() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center">
        <h1 className="mb-2 text-xl font-bold text-text-primary">Chat coming soon</h1>
        <p className="mb-1 text-sm text-text-secondary">
          Real-time messaging for this match isn&rsquo;t built yet — it&rsquo;s next up on the
          roadmap.
        </p>
        {matchId && (
          <p className="mb-6 text-xs text-text-secondary">Match #{matchId.slice(-6)}</p>
        )}
        <div className="space-y-2">
          <Button className="w-full" onClick={() => navigate('/matches')}>
            Back to matches
          </Button>
          <Link to="/discover" className="block text-sm text-primary hover:underline">
            Keep discovering
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ChatComingSoon;
