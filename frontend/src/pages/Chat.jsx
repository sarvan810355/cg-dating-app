import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api';
import { getSocket, disconnectSocket } from '../socket';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import ChatBubble from '../components/ChatBubble';

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

  // --- Socket.IO: connect, join room, listen for live events ---------------
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
      disconnectSocket();
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
          <p className="truncate font-medium text-text-primary">
            {otherUser?.displayName || 'CG Dating user'}
          </p>
          <p className="h-4 truncate text-xs text-text-secondary">
            {otherTyping ? 'Typing…' : ''}
          </p>
        </div>
        <Link to="/matches" className="text-sm text-primary hover:underline">
          Matches
        </Link>
      </header>

      {connectionError && (
        <p className="bg-warning/10 px-4 py-1.5 text-center text-xs text-warning">
          {connectionError} — messages will still send, but live delivery may be delayed.
        </p>
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
