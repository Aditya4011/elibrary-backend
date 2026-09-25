require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const authRoutes = require("./src/routes/auth");
const resourceRoutes = require("./src/routes/resources");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/resources", resourceRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Serve the frontend
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Central error handler (also catches Multer errors: bad file type, size limit, etc.)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "That PDF is larger than the 20 MB limit." });
    return res.status(400).json({ error: err.message });
  }
  if (err && err.message === "Only PDF files are accepted.") {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`Stackroom E-Library backend running at http://localhost:${PORT}`);
});


const pointsRoutes = require("./src/routes/points");
const recommendationRoutes = require("./src/routes/recommendations");
// ...
app.use("/api", pointsRoutes);
app.use("/api/recommendations", recommendationRoutes);
