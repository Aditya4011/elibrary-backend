// Goes to: src/routes/recommendations.js
// Mounted at "/api/recommendations" in server.js, so:
//   GET /api/recommendations/similar/:id   — "more like this" for one resource
//   GET /api/recommendations/for-me        — personalized, based on completion history

const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function parseTags(tagString) {
  return (tagString || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function scoreAgainst(base, candidate) {
  let score = 0;
  const baseTags = new Set(parseTags(base.tags));
  parseTags(candidate.tags).forEach((t) => {
    if (baseTags.has(t)) score += 3;
  });
  if (candidate.subject === base.subject) score += 2;
  if (candidate.department === base.department) score += 1;
  if (candidate.type === base.type) score += 1;
  return score;
}

function toPublic(r) {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    subject: r.subject,
    department: r.department,
    year: r.year,
    author: r.author,
    callNumber: r.call_number,
    isPremium: !!r.is_premium,
    tags: parseTags(r.tags),
  };
}

// GET /api/recommendations/similar/:id
router.get("/similar/:id", requireAuth, (req, res) => {
  const base = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!base) return res.status(404).json({ error: "Resource not found." });

  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  const candidates = db.prepare("SELECT * FROM resources WHERE id != ?").all(base.id);

  const scored = candidates
    .map((c) => ({ resource: c, score: scoreAgainst(base, c) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  res.json({ recommendations: scored.map((s) => ({ ...toPublic(s.resource), score: s.score })) });
});

// GET /api/recommendations/for-me
router.get("/for-me", requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 8, 20);

  const completedRows = db
    .prepare(`SELECT r.* FROM completions c JOIN resources r ON r.id = c.resource_id WHERE c.user_id = ?`)
    .all(req.user.id);

  // No history yet: fall back to most-downloaded resources
  if (completedRows.length === 0) {
    const popular = db
      .prepare(
        `SELECT r.*, COUNT(d.id) as downloads FROM resources r
         LEFT JOIN download_log d ON d.resource_id = r.id
         GROUP BY r.id ORDER BY downloads DESC LIMIT ?`
      )
      .all(limit);
    return res.json({ recommendations: popular.map(toPublic), basis: "popular" });
  }

  const completedIds = new Set(completedRows.map((r) => r.id));
  const tagWeights = {};
  const deptWeights = {};
  completedRows.forEach((r) => {
    parseTags(r.tags).forEach((t) => {
      tagWeights[t] = (tagWeights[t] || 0) + 1;
    });
    deptWeights[r.department] = (deptWeights[r.department] || 0) + 1;
  });

  const candidates = db.prepare("SELECT * FROM resources").all().filter((r) => !completedIds.has(r.id));

  const scored = candidates
    .map((c) => {
      let score = 0;
      parseTags(c.tags).forEach((t) => {
        if (tagWeights[t]) score += tagWeights[t] * 3;
      });
      if (deptWeights[c.department]) score += deptWeights[c.department];
      return { resource: c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  res.json({ recommendations: scored.map((s) => ({ ...toPublic(s.resource), score: s.score })), basis: "personalized" });
});

module.exports = router;
