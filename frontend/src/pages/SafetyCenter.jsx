import { Link } from 'react-router-dom';
import Button from '../components/Button';

// Static safety/scam-awareness content (Task #10, see docs/ROADMAP.md's
// Phase 8) — no backend call needed, this page is entirely local copy.
// Reachable from Settings.jsx.
const SAFETY_TIPS = [
  {
    title: 'Protect your personal information',
    body: 'Never share your OTP, banking details, passwords, or government ID numbers with anyone you meet here — no genuine match, and no one from our team, will ever ask you for these.',
  },
  {
    title: 'Be careful before sending money',
    body: "Be extremely cautious before sending money, gifts, or investing on someone else's advice — especially if you haven't met them in person yet. Requests for money are one of the clearest signs of a scam.",
  },
  {
    title: 'Keep the conversation on the app at first',
    body: "Get to know someone here before moving to phone, WhatsApp, or other apps. It also means you can Report or Block them without losing the conversation as evidence.",
  },
  {
    title: 'Video call before meeting',
    body: 'A quick video call helps confirm the person behind the profile actually looks like their photos before you agree to meet in person.',
  },
  {
    title: 'Meet in public, tell someone',
    body: "For a first meeting, choose a public place, arrange your own transport, and let a friend or family member know where you'll be and who you're meeting.",
  },
  {
    title: 'Trust your instincts',
    body: "If something feels off — pressure to move fast, inconsistent stories, refusal to video call or meet — it's okay to slow down, ask questions, or stop talking to them altogether.",
  },
];

const SCAM_SIGNS = [
  "Professes strong feelings very quickly, before you've properly gotten to know them",
  'Always has a reason they can’t video call or meet in person',
  'Asks for money, gift cards, or your banking / OTP details',
  'Claims to be stranded abroad, in a medical emergency, or facing a sudden crisis',
  'Pushes you toward a crypto or trading "opportunity"',
  'Profile photos look too polished, or turn up elsewhere online in a reverse-image search',
];

function SafetyCenter() {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Safety Center</h1>
          <Link to="/settings" className="text-sm text-text-secondary hover:underline">
            Settings
          </Link>
        </div>

        <p className="mb-6 text-sm text-text-secondary">
          CG Dating is built to help you meet real people, safely. Here&rsquo;s what to know before
          you start chatting — and what to do if something doesn&rsquo;t feel right.
        </p>

        <section className="mb-6 rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-lg font-semibold text-text-primary">Staying safe</h2>
          <ul className="space-y-4">
            {SAFETY_TIPS.map((tip) => (
              <li key={tip.title}>
                <p className="text-sm font-medium text-text-primary">{tip.title}</p>
                <p className="text-sm text-text-secondary">{tip.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-6 rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-lg font-semibold text-text-primary">Recognizing a scam</h2>
          <p className="mb-3 text-xs text-text-secondary">
            Romance scams often follow a pattern. Be extra cautious if someone you&rsquo;ve matched
            with:
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-text-secondary">
            {SCAM_SIGNS.map((sign) => (
              <li key={sign}>{sign}</li>
            ))}
          </ul>
        </section>

        <section className="mb-6 rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-2 text-lg font-semibold text-text-primary">Report &amp; Block</h2>
          <p className="mb-2 text-sm text-text-secondary">
            If someone makes you uncomfortable, breaks our guidelines, or you suspect a scam, you
            can report them from their profile card in Discovery or from your chat with them —
            choose a reason, optionally add details, and submit. Reports are confidential; the
            person you report is never notified.
          </p>
          <p className="text-sm text-text-secondary">
            Blocking someone immediately stops them from seeing your profile, matching with you, or
            messaging you — and removes any match between you. Blocking is also confidential, and
            can be undone any time from your Blocked Users list.
          </p>
          <Link to="/settings/blocked-users">
            <Button variant="secondary" className="mt-4 w-full">
              Manage blocked users
            </Button>
          </Link>
        </section>

        <section className="mb-6 rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-2 text-lg font-semibold text-text-primary">Community guidelines</h2>
          <p className="text-sm text-text-secondary">
            Be respectful, be honest about who you are, and treat every match the way you&rsquo;d
            want to be treated. Harassment, hate speech, threats, sexual content involving minors,
            impersonation, and scams of any kind are never allowed and will get an account
            permanently removed.
          </p>
        </section>

        <Link to="/settings">
          <Button variant="ghost" className="w-full">
            Back to Settings
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default SafetyCenter;
