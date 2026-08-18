import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import Button from '../components/Button';
import TextField from '../components/TextField';
import { DATE_IDEA_BUDGETS, DATE_IDEA_ACTIVITY_TYPES } from '../constants/dateIdeaOptions';

// Date Planner (Task #18 — V2, see docs/ROADMAP.md's Phase 12). A small curated,
// heuristic suggestion generator — explicitly NOT real AI (no ANTHROPIC_API_KEY
// configured, same constraint already documented for Task #15's Icebreakers/
// Why-You-Match). Reachable standalone (Settings/Dashboard) or from the "Plan a Safe
// Date" form's "need ideas?" link (frontend/src/pages/PlanSafeDate.jsx), which also
// passes `matchId` through so the "Use this plan" link below can carry it forward.
function DateIdeas() {
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId') || '';

  const [budget, setBudget] = useState('');
  const [activityType, setActivityType] = useState('');
  const [city, setCity] = useState('');
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load(params) {
    setLoading(true);
    setError('');
    api
      .getDateIdeas(params)
      .then((data) => setIdeas(data.ideas || []))
      .catch((err) => setError(err.message || 'Could not load date ideas — try again'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load({});
    // Load the default (unfiltered) suggestion set on first render only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    load({ budget, activityType, city: city.trim() || undefined });
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Date Ideas</h1>
          <Link to="/dashboard" className="text-sm text-text-secondary hover:underline">
            Home
          </Link>
        </div>

        <p className="mb-5 text-sm text-text-secondary">
          A few practical, public-place ideas — pick a budget and activity type to narrow it
          down.
        </p>

        <form onSubmit={handleSubmit} className="mb-6 space-y-3">
          <TextField
            as="select"
            id="budget"
            label="Budget"
            options={DATE_IDEA_BUDGETS}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <TextField
            as="select"
            id="activityType"
            label="Activity type"
            options={DATE_IDEA_ACTIVITY_TYPES}
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
          />
          <TextField
            id="city"
            label="City (optional)"
            placeholder="e.g. Bilaspur"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <Button type="submit" loading={loading} className="w-full">
            Get ideas
          </Button>
        </form>

        {error && (
          <p className="mb-4 rounded-lg bg-error-subtle px-3 py-2 text-sm text-error">{error}</p>
        )}

        {!loading && ideas.length > 0 && (
          <ul className="space-y-3">
            {ideas.map((idea) => (
              <li key={idea.id} className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-medium text-text-primary">{idea.title}</p>
                <p className="mt-1 text-sm text-text-secondary">{idea.description}</p>
              </li>
            ))}
          </ul>
        )}

        <Link to={`/safe-dates/new${matchId ? `?matchId=${matchId}` : ''}`}>
          <Button variant="ghost" className="mt-6 w-full">
            Plan a Safe Date with one of these
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default DateIdeas;
