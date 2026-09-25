// Goes to: src/routes/points.js
// Mounted at "/api" in server.js (see instructions), so its full paths are:
//   GET  /api/points/me
//   POST /api/resources/:id/complete
//   POST /api/resources/:id/unlock

const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { POINTS_PER_COMPLETION, UNLOCK_COST } = require("../config/points");

const router = express.Router();

// GET /api/points/me — current user's balance + which resources they've completed/unlocked
router.get("/points/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT points FROM users WHERE id = ?").get(req.user.id);
  const completed = db
    .prepare("SELECT resource_id FROM completions WHERE user_id = ?")
    .all(req.user.id)
    .map((r) => r.resource_id);
  const unlocked = db
    .prepare("SELECT resource_id FROM unlocks WHERE user_id = ?")
    .all(req.user.id)
    .map((r) => r.resource_id);

  res.json({ points: user.points, completed, unlocked, unlockCost: UNLOCK_COST });
});

// POST /api/resources/:id/complete — first-time completion awards 1 point
router.post("/resources/:id/complete", requireAuth, (req, res) => {
  const resource = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!resource) return res.status(404).json({ error: "Resource not found." });

  // Premium resources must be unlocked first (admins bypass this)
  if (resource.is_premium && req.user.role !== "admin") {
    const unlocked = db
      .prepare("SELECT 1 FROM unlocks WHERE user_id = ? AND resource_id = ?")
      .get(req.user.id, resource.id);
    if (!unlocked) {
      return res.status(402).json({ error: "Unlock this resource with points before completing it." });
    }
  }

  const already = db
    .prepare("SELECT 1 FROM completions WHERE user_id = ? AND resource_id = ?")
    .get(req.user.id, resource.id);

  if (already) {
    const user = db.prepare("SELECT points FROM users WHERE id = ?").get(req.user.id);
    return res.json({ alreadyCompleted: true, pointsAwarded: 0, points: user.points });
  }

  const tx = db.transaction(() => {
    db.prepare("INSERT INTO completions (user_id, resource_id) VALUES (?, ?)").run(req.user.id, resource.id);
    db.prepare("UPDATE users SET points = points + ? WHERE id = ?").run(POINTS_PER_COMPLETION, req.user.id);
  });
  tx();

  const user = db.prepare("SELECT points FROM users WHERE id = ?").get(req.user.id);
  res.json({ alreadyCompleted: false, pointsAwarded: POINTS_PER_COMPLETION, points: user.points });
});

// POST /api/resources/:id/unlock — spend points to unlock a premium resource
router.post("/resources/:id/unlock", requireAuth, (req, res) => {
  const resource = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!resource) return res.status(404).json({ error: "Resource not found." });
  if (!resource.is_premium) return res.status(400).json({ error: "This resource is not premium; no unlock needed." });

  const already = db
    .prepare("SELECT 1 FROM unlocks WHERE user_id = ? AND resource_id = ?")
    .get(req.user.id, resource.id);
  if (already) return res.json({ alreadyUnlocked: true });

  const user = db.prepare("SELECT points FROM users WHERE id = ?").get(req.user.id);
  if (user.points < UNLOCK_COST) {
    return res
      .status(402)
      .json({ error: `You need ${UNLOCK_COST} points to unlock this resource. You have ${user.points}.` });
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET points = points - ? WHERE id = ?").run(UNLOCK_COST, req.user.id);
    db.prepare("INSERT INTO unlocks (user_id, resource_id) VALUES (?, ?)").run(req.user.id, resource.id);
  });
  tx();

  const updated = db.prepare("SELECT points FROM users WHERE id = ?").get(req.user.id);
  res.json({ alreadyUnlocked: false, pointsSpent: UNLOCK_COST, points: updated.points });
});

module.exports = router;
