# Studex: AI-Powered Academic Dashboard for NUS

Studex is a modern, high-performance academic command center designed specifically for National University of Singapore (NUS) students. It autonomously synchronizes with **NUS Canvas**, processes course materials using **local AI models**, and provides a unified "Semester Cockpit" for managing deadlines, announcements, and course content.

![Studex Dashboard](public/screenshot.png) *(Placeholder for screenshot)*

## 🚀 Key Features

- **Autonomous LMS Sync:** Deep integration with `canvas.nus.edu.sg` via REST API. Automatically pulls modules, assignments, files, and announcements.
- **AI Triage:** Uses **Claude 4.5 Haiku** to summarize verbose course announcements into high-signal updates, highlighting hidden deadlines or format changes.
- **Privacy-First RAG (Retrieval-Augmented Generation):**
  - **Local Embeddings:** Runs `all-MiniLM-L6-v2` locally using **Transformers.js** (ONNX/WASM) directly on the client/server. No student data or course materials are sent to third-party embedding providers.
  - **Context-Aware Chat:** Ask questions about specific modules or your entire semester. The system retrieves relevant chunks from your synced PDFs and announcements to provide cited answers.
- **Intelligent Planner:** Visualizes your entire academic journey at NUS, including historical grades (GPA calculation) and AI-recommended future modules based on your specialization and prerequisites.
- **NUSMods Integration:** Synchronizes your weekly timetable and exam schedule for a complete "today" view.

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router) with Turbopack.
- **Language:** TypeScript.
- **Styling:** Tailwind CSS v4 & Glassmorphism.
- **Database:** Supabase (PostgreSQL) with `pgvector` for semantic search.
- **AI Models:** 
  - **Reasoning:** Anthropic Claude 4.5 Haiku.
  - **Embeddings:** Local Transformers.js (`Xenova/all-MiniLM-L6-v2`).
- **Parsing:** Custom robust PDF parsing engine with Unicode sanitization and fault-tolerant ingestion.

## 📦 Getting Started

### 1. Prerequisites
- Node.js 20+
- A Supabase project with `pgvector` enabled.
- An Anthropic API Key.
- An NUS Canvas API Token (generated in Canvas Settings).

### 2. Environment Setup
Create a `.env.local` file:
```bash
CANVAS_TOKEN=your_canvas_token
CANVAS_BASE_URL=https://canvas.nus.edu.sg

ANTHROPIC_API_KEY=your_anthropic_key
AI_MODEL=claude-haiku-4-5

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
```

### 3. Database Setup
Run the SQL script located in `supabase/schema_v7.sql` in your Supabase SQL Editor to create the necessary tables and vector functions.

### 4. Run Locally
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and click **"Sync now"** to begin your first ingestion.

---
*Built by Aiden Ma. Targeted at the "Senior AI Engineer" portfolio track.*
