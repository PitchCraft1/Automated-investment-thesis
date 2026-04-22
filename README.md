# Automated Investment Thesis Generator

A full-stack application that analyzes startup pitch decks and generates investor-style investment thesis reports. Users can sign in, upload a `.ppt` or `.pptx` deck, trigger backend analysis, and download a structured PDF report with scoring, strengths, weaknesses, recommendations, and category-wise feedback.

## Features

- User authentication with email/password and optional Google and LinkedIn OAuth
- Pitch deck upload with file type and size validation
- Python-based `.pptx` text extraction
- LLM-assisted investment analysis across 9 weighted categories
- Overall score, recommendation, confidence score, strengths, weaknesses, and recommendations
- PDF report generation and download
- Report history for each user
- Optional S3 storage and email delivery hooks

## Tech Stack

- Frontend: React, Vite, Axios
- Backend: Node.js, Express, PostgreSQL, JWT, Passport, Multer, PDFKit
- Worker: Python 3
- Optional integrations: Groq-compatible LLM API, AWS S3, SMTP, Google OAuth, LinkedIn OAuth

## Evaluation Categories

The report evaluates a startup deck across these 9 categories:

1. Problem Statement
2. Solution/Product
3. Market Opportunity
4. Business Model
5. Competitive Landscape
6. Team
7. Traction/Milestones
8. Financial Projections
9. Clarity and Presentation

## Project Structure

```text
.
|-- backend
|   |-- src
|   |-- .env.example
|   `-- package.json
|-- frontend
|   |-- public
|   |-- src
|   |-- .env.example
|   `-- package.json
|-- python-worker
|   |-- extract_pitch_deck.py
|   `-- requirements.txt
|-- package.json
`-- README.md
```

## How It Works

1. A user signs in to the application.
2. The frontend uploads a pitch deck to the backend.
3. The backend validates the file and stores it.
4. The Python worker extracts slide text from the deck.
5. The analysis service sends extracted content to the configured LLM.
6. The backend validates the returned analysis and computes the weighted overall score.
7. A PDF report is generated and made available for download.

## Requirements

- Node.js 20 or newer
- npm
- Python 3
- PostgreSQL running locally or remotely

### Backend environment

Copy `backend/.env.example` to `backend/.env` and fill in the values you actually use.

Important variables:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: secret used for JWT signing
- `SESSION_SECRET`: secret used for session middleware
- `GROQ_API_KEY`: required only if `REQUIRE_LLM_ANALYSIS=true`
- `EMAIL_ENABLED`: set to `true` only if SMTP is configured
- `GOOGLE_OAUTH_ENABLED`: set to `true` only if Google OAuth keys are configured
- `LINKEDIN_OAUTH_ENABLED`: set to `true` only if LinkedIn OAuth keys are configured

### Frontend environment

Copy `frontend/.env.example` to `frontend/.env`.

- `VITE_API_BASE_URL`: defaults to `http://localhost:4000/api`

## Installation

Install root and workspace dependencies:

```bash
npm install
npm --workspace backend install
npm --workspace frontend install
```

Install Python dependencies:

```bash
pip install -r python-worker/requirements.txt
```

## Running the Project

### 1. Start PostgreSQL

Make sure the database from `DATABASE_URL` exists and is reachable.

If you use Docker for local infrastructure:

```bash
docker compose up -d
```

### 2. Start the app

From the repository root:

```bash
npm run dev
```

This starts:

- backend on `http://localhost:4000`
- frontend on `http://localhost:5173`

## Useful Scripts

From the repository root:

```bash
npm run dev
npm run build
npm run start
```

Backend-only setup check:

```bash
npm --workspace backend run check:setup
```

## API Overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login a user |
| `GET` | `/api/auth/me` | Get the current authenticated user |
| `GET` | `/api/auth/google` | Start Google OAuth |
| `GET` | `/api/auth/linkedin` | Start LinkedIn OAuth |
| `GET` | `/api/reports` | List reports for the logged-in user |
| `GET` | `/api/reports/:reportId` | Get one report |
| `GET` | `/api/reports/:reportId/download` | Download the generated PDF |
| `POST` | `/api/reports/upload` | Upload a deck and start analysis |

## Future Improvements

- Better handling for legacy `.ppt` files
- Stronger response validation and retry strategies for the LLM output
- Background job queue for long-running report generation
- Improved test coverage
- Cloud deployment and persistent object storage

