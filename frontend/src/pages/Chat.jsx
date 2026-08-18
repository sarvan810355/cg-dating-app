import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api';
import { getSocket } from '../socket';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import ChatBubble from '../components/ChatBubble';
import CompatibilityBadge from '../components/CompatibilityBadge';
import SafetyMenu from '../components/SafetyMenu';

const TYPING_STOP_DELAY_MS = 1500;

// Real-time chat screen for a single match (Task #5), replacing the earlier
// ChatComingSoon placeholder. REST loads history and sends messages;
// Socket.IO delivers new messages / typing / read-receipts live — see
// docs/API_DOCUMENTATION.md's Messaging section for the full contract.
function Chat() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]); // ascending by createdAt (oldest first)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  // Task #15 — Smart Icebreakers + Why-You-Match (V2, user-requested).
  // Both deterministic/heuristic, NOT real AI — see
  // backend/utils/compatibilityUtils.js / icebreakerUtils.js and
  // MOCK_FEATURES.md. `icebreakers` is the full pool returned by the
  // backend; "Generate another" just cycles `icebreakerIndex` through it
  // locally (the pool is already deterministic for this pair, so there's
  // nothing new a re-fetch would return — see the route's own comment).
  const [compatibility, setCompatibility] = useState(null);
  const [icebreakers, setIcebreakers] = useState([]);
  const [icebreakerIndex, setIcebreakerIndex] = useState(0);

  const messagesEndRef = useRef(null);
  const messageIdsRef = useRef(new Set());
  const typingStopTimerRef = useRef(null);
  const isTypingRef = useRef(false);

  const addMessages = useCallback((incoming, { prepend = false } = {}) => {
    const list = Array.isArray(incoming) ? incoming : [incoming];
    const fresh = list.filter((m) => !messageIdsRef.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => messageIdsRef.current.add(m.id));
    setMessages((prev) => {
      const merged = prepend ? [...fresh, ...prev] : [...prev, ...fresh];
      return merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    });
  }, []);

  const updateReadStatus = useCallback((readAt) => {
    setMessages((prev) =>
      prev.map((m) => (m.senderId === user?.id && !m.readAt ? { ...m, readAt } : m))
    );
  }, [user?.id]);

  // --- Initial load: match's other-user info (for the header) + history ---
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    messageIdsRef.current = new Set();
    setMessages([]);

    async function load() {
      try {
        // No dedicated "get one match" endpoint exists yet — reuse the
        // matches list (capped at the API's max page size) to find this
        // match's other-participant info for the header. Simplification
        // for this pass; a GET /api/matches/:id endpoint would be cleaner
        // if chat headers need more than this later.
        const [matchesData, messagesData] = await Promise.all([
          api.getMatches({ limit: 50 }),
          api.getMessages(matchId, { limit: 30 }),
        ]);

        if (cancelled) return;

        const match = matchesData.matches?.find((m) => m.id === matchId);
        setOtherUser(match?.otherUser || null);

        // API returns newest-first; display oldest-first.
        const ascending = [...messagesData.messages].reverse();
        addMessages(ascending);
        setHasMoreOlder(!!messagesData.hasMore);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load this conversation');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // --- Why-You-Match + Smart Icebreakers (Task #15) -------------------------
  // Independent, best-effort fetches — a failure here never blocks the chat
  // itself from loading/working (same "enrichment, not requirement"
  // reasoning as MatchModal.jsx).
  useEffect(() => {
    let cancelled = false;
    setCompatibility(null);
    setIcebreakers([]);
    setIcebreakerIndex(0);

    api
      .getMatchCompatibility(matchId)
      .then((data) => {
        if (!cancelled) setCompatibility(data.compatibility);
      })
      .catch(() => {});
    api
      .getMatchIcebreakers(matchId)
      .then((data) => {
        if (!cancelled) setIcebreakers(data.icebreakers || []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  // --- Socket.IO: connect, join room, listen for live events ---------------
  // Task #6 note: the shared connection (frontend/src/socket.js) is no
  // longer torn down when this screen unmounts — NotificationContext now
  // owns connecting it for the whole authenticated session (so live
  // notification delivery keeps working after leaving a chat), and
  // AuthContext.logout() is what actually disconnects it. This effect still
  // connects it if it isn't already (e.g. a chat opened via a deep link
  // before NotificationContext's own effect has run) and always joins/leaves
  // its own match room on mount/unmount.
  useEffect(() => {
    const socket = getSocket();
    setConnectionError('');

    function handleConnectError(err) {
      setConnectionError(err.message || 'Could not connect for live updates');
    }

    function handleMessageNew(msg) {
      if (msg.matchId !== matchId) return;
      addMessages(msg);
    }

    function handleTyping(payload) {
      if (payload.matchId !== matchId) return;
      if (payload.userId === user?.id) return; // never show our own typing back to us
      setOtherTyping(!!payload.isTyping);
    }

    function handleMessageRead(payload) {
      if (payload.matchId !== matchId) return;
      updateReadStatus(payload.readAt);
    }

    function joinRoom() {
      socket.emit('match:join', { matchId }, (ack) => {
        if (!ack?.ok) {
          setConnectionError(ack?.message || 'Could not join this conversation');
        }
      });
    }

    socket.on('connect', joinRoom);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleMessageNew);
    socket.on('typing', handleTyping);
    socket.on('message:read', handleMessageRead);

    if (socket.connected) {
      joinRoom();
    } else {
      socket.connect();
    }

    return () => {
      socket.emit('match:leave', { matchId });
      socket.off('connect', joinRoom);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleMessageNew);
      socket.off('typing', handleTyping);
      socket.off('message:read', handleMessageRead);
      // Deliberately NOT disconnecting the shared socket here anymore — see
      // the effect comment above.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // --- Auto-scroll to latest on new messages --------------------------------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // --- Mark incoming messages as read once they're on screen ---------------
  useEffect(() => {
    const hasUnreadFromOther = messages.some((m) => m.senderId !== user?.id && !m.readAt);
    if (!hasUnreadFromOther) return;
    api.markMessagesRead(matchId).catch(() => {
      // Non-critical — read receipts are a nice-to-have; swallow errors so
      // a failed PATCH doesn't surface as a chat-breaking error banner.
    });
  }, [messages, matchId, user?.id]);

  async function handleLoadOlder() {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const data = await api.getMessages(matchId, { before: oldest.id, limit: 30 });
      addMessages([...data.messages].reverse(), { prepend: true });
      setHasMoreOlder(!!data.hasMore);
    } catch (err) {
      setError(err.message || 'Could not load older messages');
    } finally {
      setLoadingOlder(false);
    }
  }

  function stopTyping() {
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    getSocket().emit('typing:stop', { matchId });
  }

  function handleTextChange(e) {
    setText(e.target.value);
    const socket = getSocket();
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing:start', { matchId });
    }
    clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(stopTyping, TYPING_STOP_DELAY_MS);
  }

  // Task #15 — Smart Icebreakers: "Generate another" just advances through
  // the already-fetched pool (wrapping around) — deterministic for this
  // pair, so there's no server round-trip needed to see the next one.
  function handleNextIcebreaker() {
    if (icebreakers.length === 0) return;
    setIcebreakerIndex((i) => (i + 1) % icebreakers.length);
  }

  // Prefills the message box with the current icebreaker — never
  // auto-sends, the user still reviews/edits and hits Send themselves.
  function handleUseIcebreaker() {
    const suggestion = icebreakers[icebreakerIndex];
    if (!suggestion) return;
    setText(suggestion);
  }

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    clearTimeout(typingStopTimerRef.current);
    stopTyping();
    setSending(true);
    setError('');
    try {
      const data = await api.sendMessage(matchId, trimmed);
      addMessages(data.message);
      setText('');
    } catch (err) {
      setError(err.message || 'Could not send that message — try again');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/matches')}
          className="text-text-secondary hover:text-text-primary"
          aria-label="Back to matches"
        >
          ←
        </button>
        <Avatar src={otherUser?.photo} name={otherUser?.displayName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-medium text-text-primary">
              {otherUser?.displayName || 'CG Dating user'}
            </p>
            {/* Task #15 — Smart Icebreakers + Why-You-Match (V2,
                user-requested): deterministic, heuristic-based score — see
                MOCK_FEATURES.md. Only shown once there's a genuine (>0)
                score to report. */}
            {compatibility?.score > 0 && <CompatibilityBadge score={compatibility.score} />}
          </div>
          <p className="h-4 truncate text-xs text-text-secondary">
            {otherTyping ? 'Typing…' : ''}
          </p>
        </div>
        <Link to="/matches" className="text-sm text-primary hover:underline">
          Matches
        </Link>
        {/* Task #18 — Safe Date mode (V2, see docs/ROADMAP.md's Phase 12).
            Carries matchId through so the created plan links back to this
            match — see frontend/src/pages/PlanSafeDate.jsx. */}
        <Link
          to={`/safe-dates/new?matchId=${matchId}`}
          className="text-sm text-text-secondary hover:text-primary hover:underline"
        >
          Safe Date
        </Link>
        {/* Task #10 (Safety — Report/Block): report or block the other
            person in this match. Blocking navigates away since this
            conversation will 403 on the very next request/join. */}
        {otherUser && (
          <SafetyMenu
            userId={otherUser.userId}
            userName={otherUser.displayName}
            onBlocked={() => navigate('/matches')}
          />
        )}
      </header>

      {connectionError && (
        <p className="bg-warning/10 px-4 py-1.5 text-center text-xs text-warning">
          {connectionError} — messages will still send, but live delivery may be delayed.
        </p>
      )}

      {/* Task #15 — Smart Icebreakers + Why-You-Match (V2, user-requested):
          deterministic, heuristic profile-comparison reasons — NOT a real
          AI/LLM explanation, see MOCK_FEATURES.md. Only shown once there's
          something genuine to say. */}
      {compatibility?.reasons?.length > 0 && (
        <div className="border-b border-border bg-primary-subtle/40 px-4 py-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Why you match
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {compatibility.reasons.map((reason) => (
              <li
                key={reason}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-text-secondary"
              >
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <main className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {loading && <p className="py-16 text-center text-text-secondary">Loading conversation…</p>}

        {!loading && error && messages.length === 0 && (
          <p className="rounded-lg bg-error-subtle px-3 py-2 text-center text-sm text-error">
            {error}
          </p>
        )}

        {!loading && messages.length === 0 && !error && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="mb-1 font-medium text-text-primary">Say hello 👋</p>
            <p className="text-sm text-text-secondary">
              You matched with {otherUser?.displayName || 'each other'} — start the conversation.
            </p>
          </div>
        )}

        {!loading && messages.length > 0 && (
          <>
            {hasMoreOlder && (
              <div className="flex justify-center pb-2">
                <Button variant="ghost" onClick={handleLoadOlder} loading={loadingOlder}>
                  Load older messages
                </Button>
              </div>
            )}
            {messages.map((m) => (
              <ChatBubble
                key={m.id}
                text={m.text}
                isOwn={m.senderId === user?.id}
                timestamp={m.createdAt}
                isRead={!!m.readAt}
              />
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </main>

      {error && messages.length > 0 && (
        <p className="px-4 pb-1 text-center text-xs text-error">{error}</p>
      )}

      {/* Task #15 — Smart Icebreakers (V2, user-requested): a deterministic,
          template-based conversation-starter suggestion, NOT a real AI/LLM
          call — see MOCK_FEATURES.md. "Use" prefills the message box below
          (never auto-sends); "Generate another" cycles to the next
          suggestion in the already-fetched pool. */}
      {icebreakers.length > 0 && (
        <div className="flex items-center gap-2 border-t border-border bg-surface px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-xs text-text-secondary">
            💡 {icebreakers[icebreakerIndex]}
          </p>
          <Button
            type="button"
            variant="ghost"
            className="shrink-0 whitespace-nowrap text-xs"
            onClick={handleUseIcebreaker}
          >
            Use
          </Button>
          {icebreakers.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 whitespace-nowrap text-xs"
              onClick={handleNextIcebreaker}
            >
              Generate another
            </Button>
          )}
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border bg-surface px-4 py-3">
        <input
          type="text"
          value={text}
          onChange={handleTextChange}
          placeholder="Type a message…"
          maxLength={2000}
          disabled={sending}
          className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <Button type="submit" loading={sending} disabled={!text.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

export default Chat;
