const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

const DEPARTMENTS = [
  "Computer Science",
  "Electronics & Communication",
  "Mechanical Engineering",
  "Civil Engineering",
  "Mathematics",
  "General / All Departments",
];

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department };
}

// POST /api/auth/register
router.post("/register", (req, res) => {
  const { name, email, password, role, department } = req.body || {};

  if (!name || !String(name).trim()) return res.status(400).json({ error: "Enter your name." });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

  const finalRole = role === "admin" ? "admin" : "student";
  const finalDept = DEPARTMENTS.includes(department) ? department : "General / All Departments";

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: "An account with that email already exists." });

  const hash = bcrypt.hashSync(password, 10);
  const insert = db.prepare(
    "INSERT INTO users (name, email, password_hash, role, department) VALUES (?, ?, ?, ?, ?)"
  );
  const info = insert.run(name.trim(), email.toLowerCase().trim(), hash, finalRole, finalDept);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Enter your email and password." });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase().trim());
  if (!user) return res.status(401).json({ error: "No account found with that email." });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Incorrect password." });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

// GET /api/auth/me — verify a stored token and return the current user
router.get("/me", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ user: payload });
  } catch (err) {
    res.status(401).json({ error: "Session expired." });
  }
});

module.exports = router;
