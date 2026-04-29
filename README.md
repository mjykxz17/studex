# Studex: A Faster Window Into NUS Canvas

Studex is a fast, unified dashboard that mirrors your NUS Canvas workspace — modules, files, announcements, assignments, learning-path modules, pages, and grades — so you can see everything across every course in one place without waiting on Canvas itself.

![Studex Dashboard](public/screenshot.png) *(Placeholder for screenshot)*

## 🚀 Key Features

- **Autonomous LMS Sync:** Deep integration with `canvas.nus.edu.sg` via REST API. Automatically pulls courses, files, announcements, and assignments.
- **Cached + Fresh:** Supabase holds the last-synced snapshot so page loads are instant; a background sync keeps the cache current.
- **Unified Dashboard:** One page shows deadlines, recent announcements, and new files across every course.

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router) with Turbopack.
- **Language:** TypeScript.
- **Styling:** Tailwind CSS v4.
- **Database:** Supabase (PostgreSQL).

## 📦 Getting Started

### 1. Prerequisites
- Node.js 20+
- A Supabase project.
- An NUS Canvas API Token (generated in Canvas Settings).

### 2. Environment Setup
Create a `.env.local` file:
```bash
CANVAS_TOKEN=your_canvas_token
CANVAS_BASE_URL=https://canvas.nus.edu.sg

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
ANTHROPIC_API_KEY=your_anthropic_key   # Bring-your-own; powers cheatsheet generation
TAVILY_API_KEY=your_tavily_key         # App-paid; powers gap-fill web search
```

### 3. Database Setup
Run the SQL script located in `supabase/schema.sql` in your Supabase SQL Editor to create the necessary tables.

### 4. Run Locally
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and click **"Sync now"** to begin your first ingestion.

---
*Built by Aiden Ma.*
