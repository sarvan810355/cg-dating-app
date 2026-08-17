# Bug Tracker — CG-Dating-App

This file tracks known bugs (open and fixed) so fixes can be turned into regression
tests and so we never re-introduce the same issue silently. Add a new entry using the
template below whenever a bug is found; update its `Status` as it moves through the
pipeline instead of deleting it.

## Severity Legend

- **P0 — Critical:** App/feature is unusable, data loss, security vulnerability, or
  production outage. Fix immediately.
- **P1 — High:** Major feature broken or badly degraded for many users, no reasonable
  workaround. Fix before next release.
- **P2 — Medium:** Feature partially broken or broken in an edge case; workaround
  exists. Fix in a normal work cycle.
- **P3 — Low:** Cosmetic, minor UX annoyance, or very low-impact edge case. Fix when
  convenient.

## Entry Template

```
### BUG-XXX: <short title>
- Severity: P0 | P1 | P2 | P3
- Steps to reproduce:
  1.
  2.
- Expected behavior:
- Actual behavior:
- Status: Open | In Progress | Fixed | Won't Fix | Duplicate
- Fix: <link to commit/PR once fixed>
- Regression test: <link to the test added to prevent recurrence>
```

## Open / Known Bugs

No open bugs recorded yet.
