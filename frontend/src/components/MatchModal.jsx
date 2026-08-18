import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import Avatar from './Avatar';
import Button from './Button';
import CompatibilityBadge from './CompatibilityBadge';

// "It's a Match!" — shown immediately after a mutual like completes in
// Discovery. Deliberately simple per docs/DESIGN_SYSTEM.md's direction
// ("clean, not gaudy, fast not long") — a centered Modal-style overlay, no
// confetti/animation library. See docs/DESIGN_SYSTEM.md's component list
// (Modal) for the pattern this follows.
//
// Task #15 (Smart Icebreakers + Why-You-Match, V2, user-requested): once we
// know the new match's id (see otherUser.matchId, set by Discovery.jsx),
// fetch the deterministic compatibility score/reasons and one suggested
// icebreaker so the very first thing shown after a match is a reason to
// actually start talking — not just a photo. Both are non-blocking,
// best-effort enrichments; a fetch failure here never blocks "Start a
// conversation" from working.
function MatchModal({ otherUser, onClose }) {
  const navigate = useNavigate();
  const [compatibility, setCompatibility] = useState(null);
  const [icebreaker, setIcebreaker] = useState(null);

  useEffect(() => {
    setCompatibility(null);
    setIcebreaker(null);
    if (!otherUser?.matchId) return undefined;

    let cancelled = false;
    api
      .getMatchCompatibility(otherUser.matchId)
      .then((data) => {
        if (!cancelled) setCompatibility(data.compatibility);
      })
      .catch(() => {
        // Best-effort — the modal is fully usable without this.
      });
    api
      .getMatchIcebreakers(otherUser.matchId)
      .then((data) => {
        if (!cancelled && data.icebreakers?.length > 0) setIcebreaker(data.icebreakers[0]);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [otherUser?.matchId]);

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
        <div className="mb-4 flex items-center justify-center">
          <Avatar src={photo} name={otherUser.displayName} size="xl" />
        </div>

        {compatibility?.reasons?.length > 0 && (
          <div className="mb-4 rounded-xl border border-border bg-background p-3 text-left">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Why you match
              </span>
              <CompatibilityBadge score={compatibility.score} />
            </div>
            <ul className="space-y-1">
              {compatibility.reasons.slice(0, 3).map((reason) => (
                <li key={reason} className="text-xs text-text-secondary">
                  &bull; {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {icebreaker && (
          <p className="mb-4 rounded-xl bg-primary-subtle px-3 py-2 text-left text-xs text-text-primary">
            💡 Try: &ldquo;{icebreaker}&rdquo;
          </p>
        )}

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
