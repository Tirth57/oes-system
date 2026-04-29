# 📚 Online Examination System (OES)

A complete, production-ready Online Examination System with role-based access for Students, Examiners, and Administrators.

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 18.x — [Download](https://nodejs.org)
- **PostgreSQL** ≥ 14 — [Download](https://postgresql.org/download)
- **Redis** (optional, app degrades gracefully without it)

---

### 1. Setup PostgreSQL Database

```sql
-- In psql or pgAdmin
CREATE DATABASE oes_db;
```

---

### 2. Configure Environment

```bash
cd backend
copy .env.example .env
# Edit .env with your DB credentials
```

Key settings in `backend/.env`:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=oes_db
DB_USER=postgres
DB_PASSWORD=yourpassword
PORT=5000
```

---

### 3. Install Dependencies & Run Migrations

```bash
cd backend
npm install
node migrations/run.js
```

This creates all tables and inserts demo data with these credentials:

| Role          | Email                  | Password       |
|---------------|------------------------|----------------|
| Administrator | admin@oes.edu          | Admin@1234     |
| Examiner      | examiner@oes.edu       | Examiner@1234  |
| Student       | alice@student.edu      | Student@1234   |

---

### 4. Start the Server

```bash
cd backend
npm run dev        # Development (auto-restart)
# OR
npm start          # Production
```

Open: **http://localhost:5000**

---

## 📁 Project Structure

```
oes-project/
├── backend/
│   ├── src/
│   │   ├── app.js                  # Express entry point
│   │   ├── config/
│   │   │   ├── database.js         # PostgreSQL pool
│   │   │   ├── redis.js            # Redis client
│   │   │   └── email.js            # SMTP/email templates
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT authentication
│   │   │   ├── validate.js         # Input validation + XSS
│   │   │   └── rateLimiter.js      # Rate limiting
│   │   ├── modules/
│   │   │   ├── auth/               # R.1 - Authentication
│   │   │   ├── questions/          # R.2 - Question Bank
│   │   │   ├── exams/              # R.3 - Exam Scheduling
│   │   │   ├── conduction/         # R.4 - Exam Conduction
│   │   │   ├── evaluation/         # R.5 - Grading
│   │   │   ├── results/            # R.6 - Results & Reports
│   │   │   └── notifications/      # R.7 - Notifications
│   │   └── utils/
│   │       ├── logger.js           # Winston logging
│   │       ├── crypto.js           # AES-256 encryption
│   │       ├── audit.js            # Audit trail
│   │       ├── cron.js             # Background jobs
│   │       └── response.js         # API response helpers
│   ├── migrations/
│   │   ├── 001_schema.sql          # Complete DB schema
│   │   ├── 002_seed.sql            # Demo data
│   │   └── run.js                  # Migration runner
│   ├── swagger.js                  # OpenAPI spec
│   └── package.json
├── frontend/
│   ├── index.html                  # Login page
│   ├── css/main.css                # Design system
│   ├── js/app.js                   # Shared utilities
│   ├── student/
│   │   ├── dashboard.html
│   │   ├── exams.html
│   │   ├── exam.html               # Live exam interface
│   │   └── results.html
│   ├── examiner/
│   │   ├── dashboard.html
│   │   ├── questions.html
│   │   ├── exams.html
│   │   └── evaluation.html
│   └── admin/
│       └── dashboard.html
├── vercel.json                     # Vercel deployment
├── package.json                    # Root package
└── README.md
```

---

## 🌐 API Documentation

Swagger UI available at: `http://localhost:5000/api/docs`

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Student registration |
| POST | `/api/auth/login` | Login → JWT token |
| GET | `/api/exams` | List exams |
| POST | `/api/conduct/exams/:id/start` | Start exam |
| PUT | `/api/conduct/submissions/:id/answers/:qId` | Save answer |
| POST | `/api/conduct/submissions/:id/submit` | Submit exam |
| GET | `/api/results/my` | Student results |
| GET | `/api/evaluation/pending` | Pending reviews |
| PUT | `/api/evaluation/answers/:id/grade` | Grade answer |
| GET | `/api/results/exams/:id/pdf` | PDF report |
| GET | `/api/results/exams/:id/excel` | Excel report |

---

## ☁️ Deploying to Vercel

> **Note:** Vercel works best for the frontend. For full-stack deployment, use **Railway** or **Render** for the backend + database.

### Option A: Vercel (Frontend) + Railway (Backend)

1. **Backend on Railway:**
   - Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
   - Add PostgreSQL plugin → copy connection string to `DATABASE_URL`
   - Set all environment variables from `.env`
   - Railway auto-detects Node.js and runs `npm start`

2. **Frontend on Vercel:**
   - Update `frontend/js/app.js` → change `API_BASE` to your Railway URL
   - Push to GitHub → Import to [vercel.com](https://vercel.com)
   - Set `Root Directory` to `frontend`

### Option B: Full Stack on Railway (Recommended)

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial OES commit"
git remote add origin https://github.com/YOUR_USERNAME/oes-project.git
git push -u origin main

# 2. Go to railway.app
# New Project → Deploy from GitHub → Select repo
# Add PostgreSQL → copy DATABASE_URL
# Add environment variables
# Railway automatically runs: npm start
```

### Option C: Vercel Serverless (Full Stack)

```bash
npm install -g vercel
cd oes-project
vercel --prod
# Set env vars in Vercel dashboard → Settings → Environment Variables
```

---

## 🔧 Environment Variables for Production

Set these in your hosting platform:

```
NODE_ENV=production
PORT=5000
DB_HOST=<your-db-host>
DB_PORT=5432
DB_NAME=oes_db
DB_USER=<db-user>
DB_PASSWORD=<db-password>
JWT_SECRET=<strong-random-64-char-string>
JWT_REFRESH_SECRET=<another-strong-random-string>
FRONTEND_URL=https://your-app-domain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
ENCRYPTION_KEY=<32-char-random-string>
```

---

## ✨ Features

### R.1 Authentication
- Email + password registration with email verification
- JWT authentication with 24h expiry + refresh tokens
- bcrypt (cost 12) password hashing
- Account lockout after 5 failed attempts (15 min)
- Role-based: Student / Examiner / Administrator

### R.2 Question Bank
- MCQ, True/False, Short Answer question types
- Difficulty levels: Easy / Medium / Hard
- Subject & topic organization
- Prevent deletion if used in active exam

### R.3 Exam Scheduling
- Manual or random question selection
- Configurable: duration, marks, pass marks, grade scale
- Publish with student notification
- Question/option shuffling, negative marking

### R.4 Exam Conduction
- Real-time countdown timer
- Auto-save every 5 seconds
- Question navigation panel (answered / flagged / unanswered)
- Tab switch detection → 3 switches = auto-submit
- Auto-submit on timer expiry

### R.5 Evaluation
- MCQ/T-F auto-graded on submission
- Short answers queued for manual examiner review
- Grade 0 to max marks with feedback notes
- Result finalized when all reviewed

### R.6 Results & Reports
- Student: all results with grade, percentage, pass/fail
- PDF + Excel downloadable reports
- Analytics: score trends, difficulty performance, grade distribution

### R.7 Notifications
- In-app notification center
- Email notifications via SMTP
- 1-hour exam reminders (cron)
- Admin broadcast to all / specific batch / role

---

## 🔒 Security Features

- Helmet.js security headers
- CORS configured
- JWT blacklist on logout
- XSS sanitization on all inputs
- Rate limiting (100 req/15min general, 20 req/15min auth)
- SQL parameterized queries (no injection risk)
- AES-256 encryption for sensitive data

---

## 📊 Health Check

```
GET http://localhost:5000/health
```

Returns DB status, uptime, version.

---

## 🧪 Running Tests

```bash
cd backend
npm test
```

---

## 📄 License

MIT License — Free to use and modify.
