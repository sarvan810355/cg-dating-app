// Reusable ChatBubble — see docs/DESIGN_SYSTEM.md Reusable Component
// Library ("ChatBubble — sent/received variants, timestamp, read-receipt
// indicator"). Built for Task #5 (Chat).
function formatTime(dateLike) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Simple checkmark read-receipt indicator (single = sent, double = read) —
// per docs/DESIGN_SYSTEM.md direction ("simple checkmark is fine" for MVP).
function ReadReceipt({ isRead }) {
  return (
    <span
      className={`ml-1 inline-flex items-center text-[11px] leading-none ${
        isRead ? 'opacity-100' : 'opacity-70'
      }`}
      title={isRead ? 'Read' : 'Sent'}
      aria-label={isRead ? 'Read' : 'Sent'}
    >
      {isRead ? '✓✓' : '✓'}
    </span>
  );
}

function ChatBubble({ text, isOwn, timestamp, isRead }) {
  return (
    <div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
          isOwn
            ? 'rounded-br-sm bg-primary text-white'
            : 'rounded-bl-sm border border-border bg-surface text-text-primary'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{text}</p>
        <div
          className={`mt-1 flex items-center justify-end gap-0.5 text-[11px] ${
            isOwn ? 'text-white/80' : 'text-text-secondary'
          }`}
        >
          <span>{formatTime(timestamp)}</span>
          {isOwn && <ReadReceipt isRead={isRead} />}
        </div>
      </div>
    </div>
  );
}

export default ChatBubble;
