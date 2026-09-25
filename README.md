# Stackroom — The E-Library (backend edition)

A real backend for a digital library: student/admin accounts with hashed
passwords and login tokens, a SQLite database, real PDF uploads stored on
disk, search and filtering by department/subject/year/type, and an admin
panel for managing resources. The frontend is plain HTML/CSS/JS served by
the same server — no build step.

## What's real here (and what isn't)

- **Real:** password hashing (bcrypt), signed login sessions (JWT), a proper
  relational schema (SQLite via `better-sqlite3`), actual PDF files stored on
  disk and streamed back on view/download, role-based permissions (only
  admins can add/edit/delete resources), file-type and file-size validation.
- **Not included (intentionally, to keep this runnable anywhere):** email
  verification, password reset, HTTPS termination (a host like Render does
  this for you), and a production-grade object store for files (see
  "Deploying" below for why that matters).

## Project structure

```
elibrary-backend/
├── server.js              Express app entry point
├── src/
│   ├── db.js               SQLite connection + schema (auto-created on first run)
│   ├── seed.js              Creates a default admin account + sample resources
│   ├── middleware/auth.js   JWT verification, admin-only guard
│   └── routes/
│       ├── auth.js          /api/auth/register, /login, /me
│       └── resources.js     /api/resources  (list, get, create, update, delete, file)
├── public/                 Frontend (served as static files)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── uploads/                 Uploaded PDFs are stored here (not web-accessible directly —
│                            files are only served through the authenticated /file route)
├── data/                    SQLite database file lives here
├── .env.example
└── package.json
```

## Running it locally

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
cd elibrary-backend
npm install
cp .env.example .env        # then edit .env if you want to change the JWT secret
npm run seed                # creates the admin account + 5 sample resources (no files)
npm start
```

Open **http://localhost:4000**. Sign in with:

- **Admin:** `admin@stackroom.local` / `admin123`
- Or click **Create account** to register as a student (or another admin).

Change `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env` before running
`npm run seed` if you don't want the default admin credentials.

### Day-to-day use

- **Students** sign in, browse the shelf, filter by type/department/year,
  search, and **View** (opens the PDF in a new tab) or **Download** any
  resource that has a file attached.
- **Admins** get an extra "Admin panel" tab: add a resource with its PDF,
  edit metadata or swap the file, or remove a resource (this also deletes
  its file from disk).
- Resources added without a file still show up on the shelf (useful for
  cataloguing something before the PDF is ready) — students will see a
  "No file uploaded" tag and the View/Download buttons will be disabled.

## API overview

All `/api/resources/*` routes require an `Authorization: Bearer <token>`
header, obtained from `/api/auth/login` or `/api/auth/register`.

| Method | Path                        | Who        | Purpose                              |
|--------|-----------------------------|------------|---------------------------------------|
| POST   | /api/auth/register          | anyone     | Create an account, returns a token    |
| POST   | /api/auth/login             | anyone     | Log in, returns a token               |
| GET    | /api/auth/me                | signed in  | Verify current token                  |
| GET    | /api/resources              | signed in  | List/search/filter resources          |
| GET    | /api/resources/facets       | signed in  | Counts for the filter sidebar         |
| GET    | /api/resources/:id          | signed in  | One resource's metadata               |
| GET    | /api/resources/:id/file     | signed in  | Stream the PDF (`?mode=view\|download`) |
| POST   | /api/resources              | admin only | Create a resource (`multipart/form-data`, field `file`) |
| PUT    | /api/resources/:id          | admin only | Edit a resource / replace its file    |
| DELETE | /api/resources/:id          | admin only | Delete a resource and its file        |

## Deploying (Render, Railway, Fly.io, etc.)

This will run on any Node host, with one important caveat: **most free-tier
hosts wipe the local filesystem on every redeploy or restart.** Since this
app stores the SQLite database (`data/elibrary.sqlite`) and uploaded PDFs
(`uploads/`) on local disk, that means:

- On Render/Railway free tiers, attach a **persistent disk/volume** mounted
  at the project root (or point `DB_PATH` and the uploads folder at it) —
  otherwise your data resets on every deploy.
- For a course/college submission where you just need it running for a demo,
  the default local-disk setup is fine as-is.
- If you outgrow this later, the natural next steps are swapping SQLite for
  hosted Postgres and uploads for S3-compatible object storage — the route
  handlers are written so only `src/db.js` and the file-storage lines in
  `src/routes/resources.js` would need to change, not the API shape.

Steps for Render (as an example):

1. Push this folder to a GitHub repo.
2. Create a new **Web Service** on Render, connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables from `.env.example` (set a real `JWT_SECRET`).
5. Add a persistent disk mounted at `/data` (or similar), and set
   `DB_PATH=/data/elibrary.sqlite` — you'll also want to update
   `UPLOAD_DIR` in `src/routes/resources.js` to a path under that same disk
   if you want uploaded PDFs to survive redeploys too.
6. After the first deploy, run `npm run seed` once (Render's shell tab, or
   a one-off job) to create the admin account.

## Security notes for a real deployment

- Set a long, random `JWT_SECRET` in production — never use the example value.
- Consider shortening the token lifetime (`expiresIn` in `src/routes/auth.js`)
  or adding refresh tokens if this will be used beyond a class project.
- The upload limit is 20 MB per file and PDF-only; adjust in
  `src/routes/resources.js` if you need different limits.
