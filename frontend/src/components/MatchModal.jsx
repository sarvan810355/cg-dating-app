import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import Button from './Button';

// "It's a Match!" — shown immediately after a mutual like completes in
// Discovery. Deliberately simple per docs/DESIGN_SYSTEM.md's direction
// ("clean, not gaudy, fast not long") — a centered Modal-style overlay, no
// confetti/animation library. See docs/DESIGN_SYSTEM.md's component list
// (Modal) for the pattern this follows.
function MatchModal({ otherUser, onClose }) {
  const navigate = useNavigate();
  if (!otherUser) return null;

  const photo = otherUser.photos?.find((p) => p.isPrimary)?.url || otherUser.photos?.[0]?.url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 text-center shadow-lg">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-primary">
          It&rsquo;s a match!
        </p>
        <h2 className="mb-5 text-2xl font-bold text-text-primary">
          You and {otherUser.displayName || 'this person'} liked each other
        </h2>
        <div className="mb-6 flex items-center justify-center">
          <Avatar src={photo} name={otherUser.displayName} size="xl" />
        </div>
        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={() => {
              onClose();
              // Task #5: go straight into the real chat screen for this
              // match when we know its id; fall back to the matches list
              // for any caller that doesn't have it yet.
              navigate(otherUser.matchId ? `/chat/${otherUser.matchId}` : '/matches');
            }}
          >
            Start a conversation
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Keep browsing
          </Button>
        </div>
      </div>
    </div>
  );
}

export default MatchModal;
