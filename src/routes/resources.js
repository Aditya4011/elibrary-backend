const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

 const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads")
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const TYPES = ["Book", "Notes", "Previous-Year Paper", "Study Material", "Reference"];
const DEPT_CODES = {
  "Computer Science": "CS",
  "Electronics & Communication": "EC",
  "Mechanical Engineering": "ME",
  "Civil Engineering": "CE",
  Mathematics: "MA",
  "General / All Departments": "GEN",
};
const TYPE_CODES = {
  Book: "B",
  Notes: "N",
  "Previous-Year Paper": "PYQ",
  "Study Material": "S",
  Reference: "R",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const random = crypto.randomBytes(16).toString("hex");
    cb(null, `${random}.pdf`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1000 * 1024 * 1024 }, // 1000 MB
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === "application/pdf" || path.extname(file.originalname).toLowerCase() === ".pdf";
    if (!isPdf) return cb(new Error("Only PDF files are accepted."));
    cb(null, true);
  },
});

function callNumberFor(department, type) {
  const dc = DEPT_CODES[department] || "GEN";
  const tc = TYPE_CODES[type] || "X";
  const n = Math.floor(100 + Math.random() * 800);
  return `${dc}-${n}.${tc}`;
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
    description: r.description,
    callNumber: r.call_number,
    hasFile: !!r.stored_filename,
    originalFilename: r.original_filename,
    fileSize: r.file_size,
    createdAt: r.created_at,
  };
}

// GET /api/resources — list + filter + search, public read access requires auth (any signed-in user)
router.get("/", requireAuth, (req, res) => {
  const { type, department, year, q, sort } = req.query;
  let sql = "SELECT * FROM resources WHERE 1=1";
  const params = [];

  if (type && TYPES.includes(type)) {
    sql += " AND type = ?";
    params.push(type);
  }
  if (department) {
    sql += " AND department = ?";
    params.push(department);
  }
  if (year) {
    sql += " AND year = ?";
    params.push(year);
  }
  if (q) {
    sql += " AND (title LIKE ? OR subject LIKE ? OR author LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  if (sort === "title") sql += " ORDER BY title ASC";
  else if (sort === "subject") sql += " ORDER BY subject ASC";
  else sql += " ORDER BY created_at DESC";

  const rows = db.prepare(sql).all(...params);
  res.json({ resources: rows.map(toPublic) });
});

// GET /api/resources/facets — counts for building filter sidebar
router.get("/facets", requireAuth, (req, res) => {
  const byType = db.prepare("SELECT type, COUNT(*) as count FROM resources GROUP BY type").all();
  const byDept = db.prepare("SELECT department, COUNT(*) as count FROM resources GROUP BY department").all();
  const byYear = db.prepare("SELECT year, COUNT(*) as count FROM resources GROUP BY year").all();
  res.json({ byType, byDept, byYear });
});

// GET /api/resources/:id
router.get("/:id", requireAuth, (req, res) => {
  const r = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "Resource not found." });
  res.json({ resource: toPublic(r) });
});

// GET /api/resources/:id/file?mode=view|download
router.get("/:id/file", requireAuth, (req, res) => {
  const r = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "Resource not found." });
  if (!r.stored_filename) return res.status(404).json({ error: "No file was uploaded for this resource." });

  const filePath = path.join(UPLOAD_DIR, r.stored_filename);
  if (!fs.existsSync(filePath)) return res.status(410).json({ error: "The file for this resource is missing from storage." });

  db.prepare("INSERT INTO download_log (resource_id, user_id) VALUES (?, ?)").run(r.id, req.user.id);

  const mode = req.query.mode === "view" ? "inline" : "attachment";
  const downloadName = (r.original_filename || `${r.title}.pdf`).replace(/[\\/]/g, "_");
  res.setHeader("Content-Disposition", `${mode}; filename="${downloadName}"`);
  res.setHeader("Content-Type", "application/pdf");
  fs.createReadStream(filePath).pipe(res);
});

// POST /api/resources — admin only, multipart/form-data with optional "file"
router.post("/", requireAuth, requireAdmin, upload.single("file"), (req, res) => {
  const { title, type, subject, department, year, author, description } = req.body || {};

  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
  if (!subject || !String(subject).trim()) return res.status(400).json({ error: "Subject is required." });
  if (!TYPES.includes(type)) return res.status(400).json({ error: "Choose a valid resource type." });
  if (!DEPT_CODES[department]) return res.status(400).json({ error: "Choose a valid department." });
  if (!year) return res.status(400).json({ error: "Choose an academic year." });

  const callNumber = callNumberFor(department, type);
  const insert = db.prepare(`
    INSERT INTO resources
      (title, type, subject, department, year, author, description, call_number, stored_filename, original_filename, file_size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = insert.run(
    title.trim(),
    type,
    subject.trim(),
    department,
    year,
    (author || "").trim(),
    (description || "").trim(),
    callNumber,
    req.file ? req.file.filename : null,
    req.file ? req.file.originalname : null,
    req.file ? req.file.size : null,
    req.user.id
  );

  const r = db.prepare("SELECT * FROM resources WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ resource: toPublic(r) });
});

// PUT /api/resources/:id — admin only, optional replacement file
router.put("/:id", requireAuth, requireAdmin, upload.single("file"), (req, res) => {
  const existing = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Resource not found." });

  const { title, type, subject, department, year, author, description } = req.body || {};

  const newValues = {
    title: title && title.trim() ? title.trim() : existing.title,
    type: TYPES.includes(type) ? type : existing.type,
    subject: subject && subject.trim() ? subject.trim() : existing.subject,
    department: DEPT_CODES[department] ? department : existing.department,
    year: year || existing.year,
    author: author !== undefined ? author.trim() : existing.author,
    description: description !== undefined ? description.trim() : existing.description,
  };

  let storedFilename = existing.stored_filename;
  let originalFilename = existing.original_filename;
  let fileSize = existing.file_size;

  if (req.file) {
    // Replace the old file on disk, if any
    if (existing.stored_filename) {
      const oldPath = path.join(UPLOAD_DIR, existing.stored_filename);
      fs.unlink(oldPath, () => {});
    }
    storedFilename = req.file.filename;
    originalFilename = req.file.originalname;
    fileSize = req.file.size;
  }

  db.prepare(`
    UPDATE resources SET
      title = ?, type = ?, subject = ?, department = ?, year = ?, author = ?, description = ?,
      stored_filename = ?, original_filename = ?, file_size = ?
    WHERE id = ?
  `).run(
    newValues.title, newValues.type, newValues.subject, newValues.department, newValues.year,
    newValues.author, newValues.description, storedFilename, originalFilename, fileSize,
    req.params.id
  );

  const r = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  res.json({ resource: toPublic(r) });
});

// DELETE /api/resources/:id — admin only
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Resource not found." });

  if (existing.stored_filename) {
    const filePath = path.join(UPLOAD_DIR, existing.stored_filename);
    fs.unlink(filePath, () => {});
  }
  db.prepare("DELETE FROM resources WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
