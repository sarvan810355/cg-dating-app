import { useState } from 'react';
import * as api from '../api';
import ReportModal from './ReportModal';

// Report/Block entry point (Task #10, see docs/ROADMAP.md's Phase 8),
// reused from both Discovery.jsx's profile card and Chat.jsx's header so the
// two "reach the other person in this interaction" surfaces the task spec
// calls for don't duplicate this logic. A small "⋯" trigger opens a
// two-item menu; Report opens the shared ReportModal, Block confirms first
// (it's consequential and hard to reverse the *effect* of even though it's
// technically undoable — see docs/DESIGN_SYSTEM.md's Dialog component,
// "Unmatch this person?" pattern reference) via a plain window.confirm per
// the task spec ("doesn't need to be fancy"), then calls POST /api/blocks
// and reports success up via `onBlocked` so the caller can reflect it
// immediately (Discovery removes the card from the queue; Chat navigates
// away since the match now 403s).
const TRIGGER_VARIANTS = {
  // For placement over a photo (Discovery card) — needs contrast against an
  // arbitrary image, not the surface token.
  overlay:
    'bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 focus:ring-white/60',
  // For placement on an ordinary surface (Chat header) — a plain icon
  // button using the design system's text/hover tokens.
  plain: 'text-text-secondary hover:bg-primary-subtle hover:text-text-primary focus:ring-primary/40',
};

function SafetyMenu({ userId, userName, onBlocked, variant = 'plain', className = '' }) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState('');

  async function handleBlock() {
    setOpen(false);
    const confirmed = window.confirm(
      `Block ${userName || 'this person'}? They won't be able to see your profile, match with you, or message you — and you won't see them either. You can undo this later from Settings > Blocked Users.`
    );
    if (!confirmed) return;

    setBlocking(true);
    setError('');
    try {
      await api.blockUser(userId);
      onBlocked?.(userId);
    } catch (err) {
      setError(err.message || 'Could not block this user — try again');
    } finally {
      setBlocking(false);
    }
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-label="Safety options"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={blocking}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition focus:outline-none focus:ring-2 disabled:opacity-60 ${TRIGGER_VARIANTS[variant]}`}
      >
        ⋯
      </button>

      {open && (
        <>
          {/* Click-outside-to-close backdrop — sits below the menu itself. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setReportOpen(true);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-primary-subtle"
            >
              Report
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleBlock}
              className="block w-full px-4 py-2 text-left text-sm text-error hover:bg-error-subtle"
            >
              Block
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="absolute right-0 top-9 z-20 w-48 rounded-lg bg-error-subtle px-3 py-2 text-xs text-error shadow-lg">
          {error}
        </p>
      )}

      <ReportModal
        open={reportOpen}
        userId={userId}
        userName={userName}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}

export default SafetyMenu;
