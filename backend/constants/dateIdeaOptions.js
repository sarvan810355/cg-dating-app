// Shared enums for the Date Planner's stateless suggestion generator (Task #18 — V2,
// see docs/ROADMAP.md's Phase 12). See backend/utils/datePlanUtils.js for the actual
// curated idea list and filtering logic.

const DATE_IDEA_BUDGETS = ['low', 'medium', 'high'];

const DATE_IDEA_ACTIVITY_TYPES = ['coffee', 'food', 'outdoor', 'movie', 'walk', 'other'];

module.exports = { DATE_IDEA_BUDGETS, DATE_IDEA_ACTIVITY_TYPES };
