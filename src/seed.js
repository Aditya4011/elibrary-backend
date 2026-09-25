require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./db");

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@stackroom.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin123";

function ensureAdmin() {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL);
  if (existing) {
    console.log(`Admin account already exists: ${ADMIN_EMAIL}`);
    return;
  }
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.prepare(
    "INSERT INTO users (name, email, password_hash, role, department) VALUES (?, ?, ?, 'admin', 'General / All Departments')"
  ).run("Head Librarian", ADMIN_EMAIL, hash);
  console.log(`Created admin account -> email: ${ADMIN_EMAIL}  password: ${ADMIN_PASSWORD}`);
}

function ensureSampleResources() {
  const count = db.prepare("SELECT COUNT(*) as c FROM resources").get().c;
  if (count > 0) {
    console.log(`Resources table already has ${count} row(s) — skipping sample data.`);
    return;
  }
  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL);
  const samples = [
    {
      title: "Data Structures & Algorithms — Core Concepts",
      type: "Book",
      subject: "Data Structures",
      department: "Computer Science",
      year: "2nd Year",
      author: "Dept. of CS",
      description: "Arrays, linked lists, stacks, queues, trees and graphs, with time-complexity analysis and worked problems.",
      call_number: "CS-101.B",
    },
    {
      title: "Operating Systems — Unit 3: Process Scheduling",
      type: "Notes",
      subject: "Operating Systems",
      department: "Computer Science",
      year: "3rd Year",
      author: "Prof. R. Iyer",
      description: "FCFS, SJF, Round Robin and priority scheduling, with two solved numericals.",
      call_number: "CS-204.N",
    },
    {
      title: "Database Management Systems — End Semester 2022",
      type: "Previous-Year Paper",
      subject: "DBMS",
      department: "Computer Science",
      year: "3rd Year",
      author: "University Examinations",
      description: "ER modelling, normalisation, SQL queries, transactions and concurrency control.",
      call_number: "CS-PYQ.22",
    },
    {
      title: "Signals and Systems — Fourier Transform Primer",
      type: "Study Material",
      subject: "Signals & Systems",
      department: "Electronics & Communication",
      year: "2nd Year",
      author: "Dept. of ECE",
      description: "Fourier series and transform with worked examples for common signals.",
      call_number: "EC-110.S",
    },
    {
      title: "Engineering Mathematics I — Calculus & Linear Algebra",
      type: "Book",
      subject: "Engineering Mathematics",
      department: "Mathematics",
      year: "1st Year",
      author: "Dept. of Mathematics",
      description: "Limits, differentiation, integration, matrices and vector spaces for first-year engineering students.",
      call_number: "MA-101.B",
    },
  ];

  const insert = db.prepare(`
    INSERT INTO resources (title, type, subject, department, year, author, description, call_number, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  samples.forEach((s) => {
    insert.run(s.title, s.type, s.subject, s.department, s.year, s.author, s.description, s.call_number, admin ? admin.id : null);
  });
  console.log(`Inserted ${samples.length} sample resources (no PDF files attached — upload real files via the admin panel).`);
}

ensureAdmin();
ensureSampleResources();
console.log("Seed complete.");
