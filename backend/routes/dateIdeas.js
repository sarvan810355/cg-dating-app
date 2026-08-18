const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { getDateIdeaSuggestions } = require('../utils/datePlanUtils');
const { DATE_IDEA_BUDGETS, DATE_IDEA_ACTIVITY_TYPES } = require('../constants/dateIdeaOptions');

const router = express.Router();

const CITY_MAX_LENGTH = 100;

// GET /api/date-ideas?budget=&activityType=&city= (protected). Stateless suggestion
// generator — see backend/utils/datePlanUtils.js for the curated list + filtering
// logic and its safety rule (public places only). No persistence: nothing is saved,
// this is purely "given these filters, suggest something" — same "no dedicated
// collection needed" reasoning already applied elsewhere in this codebase (e.g.
// backend/constants/profileOptions.js's in-code prompt bank).
router.get('/', requireAuth, (req, res) => {
  try {
    const { budget, activityType, city } = req.query;

    if (budget !== undefined && !DATE_IDEA_BUDGETS.includes(budget)) {
      return res
        .status(400)
        .json({ message: `budget must be one of: ${DATE_IDEA_BUDGETS.join(', ')}` });
    }
    if (activityType !== undefined && !DATE_IDEA_ACTIVITY_TYPES.includes(activityType)) {
      return res
        .status(400)
        .json({ message: `activityType must be one of: ${DATE_IDEA_ACTIVITY_TYPES.join(', ')}` });
    }

    let trimmedCity;
    if (city !== undefined && city !== '') {
      trimmedCity = String(city).trim().slice(0, CITY_MAX_LENGTH);
    }

    const ideas = getDateIdeaSuggestions({ budget, activityType, city: trimmedCity });

    return res.json({
      ideas,
      budget: budget || null,
      activityType: activityType || null,
      city: trimmedCity || null,
    });
  } catch (err) {
    console.error('Date ideas error:', err);
    return res.status(500).json({ message: 'Something went wrong, please try again' });
  }
});

module.exports = router;
