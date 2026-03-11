"use client";

import { useState, useRef, useEffect } from "react";
import { SyncButton } from "@/app/ui/sync-button";
import type { DashboardData, WeeklyTask, ModuleSummary } from "@/lib/dashboard";

// --- BREAKPOINT HOOK ---
function useBreakpoint() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return { w, isMobile: w < 640, isTablet: w >= 640 && w < 1024, isDesktop: w >= 1024 };
}

// --- UTILS & FORMATTING ---
const MODULE_COLORS: Record<string, string> = {
  CS3235: "#E8480C",
  IS4233: "#D97706",
  IS4231: "#059669",
  TRA3203: "#7C3AED",
  GEX1015: "#0891B2",
};
const COLOR_PALETTE = ["#6366F1", "#2563EB", "#0891B2", "#059669", "#7C3AED", "#DB2777", "#D97706", "#E8480C"];

function colorForModule(code: string) {
  if (MODULE_COLORS[code]) return MODULE_COLORS[code];
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) & 0xffff;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatTodayLabel(): string {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function getDaysLeft(dueDate?: string | null) {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function renderMsg(text: string) {
  return text.split('\n').flatMap((line, lineIndex) => {
    const parts = line.split(/\*\*(.*?)\*\*/g).map((p, j) =>
      j % 2 === 1 ? <strong key={`${lineIndex}-${j}`}>{p}</strong> : p
    );
    return lineIndex === 0 ? parts : [<br key={`br-${lineIndex}`} />, ...parts];
  });
}

// --- STATIC FALLBACK DATA ---
type StaticModuleDetail = {
  lecturer: string;
  week_topic: string;
  week_summary: string;
  weights: { component: string; weight: string; deadline: string }[];
  nusmods: {
    mc: number;
    faculty?: string;
    lessons: { type: string; day: string; time: string; venue: string }[];
    exam: { date: string; time: string; venue: string; duration: string };
  };
};
const STATIC_MODULE_DETAILS: Record<string, StaticModuleDetail> = {
  CS3235: {
    lecturer: "Dr. Liang Zhenkai",
    weights: [{ component: "Assignments (×4)", weight: "20%", deadline: "Ongoing" }, { component: "Midterm Exam", weight: "25%", deadline: "22 Mar 2026" }, { component: "Labs (×3)", weight: "15%", deadline: "Ongoing" }, { component: "Final Exam", weight: "40%", deadline: "Apr 2026" }],
    week_topic: "Week 9 — Format String Attacks",
    week_summary: "This week focuses on format string vulnerabilities — how %n writes enable arbitrary memory writes. Key concepts: positional arguments (%k$n), stack layout during printf, and write-what-where primitives.",
    nusmods: { mc: 4, faculty: "School of Computing", lessons: [{ type: "Lecture", day: "Tuesday", time: "10:00–12:00", venue: "i3 Auditorium" }, { type: "Lab", day: "Thursday", time: "14:00–16:00", venue: "COM1-0117" }], exam: { date: "28 Apr 2026", time: "09:00", venue: "MPSH 1A", duration: "2 hrs" } }
  },
  IS4233: {
    lecturer: "Prof. Ang Peng Hwa",
    weights: [{ component: "Group Project", weight: "40%", deadline: "5 Apr 2026" }, { component: "Class Participation", weight: "10%", deadline: "Ongoing" }, { component: "Final Exam", weight: "50%", deadline: "Apr 2026" }],
    week_topic: "Week 9 — Data Protection Across Jurisdictions",
    week_summary: "Lecture covered GDPR Article 6 lawful bases vs Singapore PDPA and China PIPL. For the group project, focus Huang v Tencent analysis on Beijing Internet Court's interpretation of informed consent.",
    nusmods: { mc: 4, faculty: "School of Computing", lessons: [{ type: "Lecture", day: "Monday", time: "14:00–16:00", venue: "COM1-0201" }], exam: { date: "30 Apr 2026", time: "13:00", venue: "MPSH 2B", duration: "2 hrs" } }
  },
  IS4231: {
    lecturer: "Dr. Tan Wee Kek",
    weights: [{ component: "Case Study Report", weight: "30%", deadline: "18 Mar 2026" }, { component: "Group Audit Project", weight: "30%", deadline: "Apr 2026" }, { component: "Final Exam", weight: "40%", deadline: "Apr 2026" }],
    week_topic: "Week 9 — ISO 27001 Audit Procedures",
    week_summary: "Audit fieldwork: evidence collection, sampling for control testing, documenting non-conformities.",
    nusmods: { mc: 4, faculty: "School of Computing", lessons: [{ type: "Lecture", day: "Wednesday", time: "12:00–14:00", venue: "COM2-0204" }], exam: { date: "2 May 2026", time: "09:00", venue: "MPSH 1A", duration: "2 hrs" } }
  },
  TRA3203: {
    lecturer: "Dr. Chen Li",
    weights: [{ component: "Exercises (×5)", weight: "30%", deadline: "Ongoing" }, { component: "Critical Essay", weight: "30%", deadline: "Apr 2026" }, { component: "Final Portfolio", weight: "40%", deadline: "Apr 2026" }],
    week_topic: "Week 9 — Equivalence Theory",
    week_summary: "Nida's formal vs dynamic equivalence and Newmark's semantic vs communicative translation.",
    nusmods: { mc: 4, faculty: "Faculty of Arts and Social Sciences", lessons: [{ type: "Seminar", day: "Friday", time: "10:00–12:00", venue: "AS5-0501" }], exam: { date: "No Exam", time: "—", venue: "Portfolio submission", duration: "—" } }
  },
  GEX1015: {
    lecturer: "Prof. Lee Siew Peng",
    weights: [{ component: "Reflections (×10)", weight: "20%", deadline: "Ongoing" }, { component: "Group Presentation", weight: "30%", deadline: "Apr 2026" }, { component: "Final Essay", weight: "50%", deadline: "Apr 2026" }],
    week_topic: "Week 9 — Ethics of AI",
    week_summary: "AI ethics through three frameworks: consequentialism (Bostrom on existential risk), deontology (duties and rights), virtue ethics (Vallor on technomoral virtues).",
    nusmods: { mc: 4, faculty: "University Scholars Programme", lessons: [{ type: "Lecture", day: "Thursday", time: "16:00–18:00", venue: "UTSS-SR3" }], exam: { date: "No Exam", time: "—", venue: "Essay submission", duration: "—" } }
  },
};

const QUIZ_BANK: Record<string, { q: string; options: string[]; answer: number; explanation: string }[]> = {
  CS3235: [
    { q: "What does the %n format specifier do in printf?", options: ["Prints a newline", "Writes bytes-printed-so-far to a pointer", "Prints a null-terminated string", "Reads from stdin"], answer: 1, explanation: "%n writes the count of characters printed so far into the memory address of the matching argument." },
    { q: "In x86-64, which register holds the 6th argument?", options: ["%rdi", "%rsi", "%r9", "Stack"], answer: 2, explanation: "System V AMD64 ABI passes first 6 args in rdi, rsi, rdx, rcx, r8, r9." },
  ],
};

const ACADEMIC_TREE = [
  { year: 1, label: "Year 1", semesters: [{ sem: 1, label: "Sem 1", modules: [{ code: "CS1101S", name: "Programming Methodology", mc: 4, grade: "A", status: "done", color: "#3B82F6", tags: ["programming"] }, { code: "IS1103", name: "IS and Society", mc: 4, grade: "B+", status: "done", color: "#8B5CF6", tags: ["IS", "ethics"] }] }, { sem: 2, label: "Sem 2", modules: [{ code: "CS1231S", name: "Discrete Structures", mc: 4, grade: "A-", status: "done", color: "#3B82F6", tags: ["math", "logic"] }] }] },
  { year: 3, label: "Year 3", semesters: [{ sem: 2, label: "Sem 2  Now", modules: [{ code: "CS3235", name: "Computer Security", mc: 4, grade: null, status: "current", color: "#E8480C", tags: ["security"] }, { code: "IS4233", name: "IT Law", mc: 4, grade: null, status: "current", color: "#D97706", tags: ["law"] }] }] },
  { year: 4, label: "Year 4", semesters: [{ sem: 1, label: "Sem 1 — AI Pick", modules: [{ code: "CS4236", name: "Cryptography Theory", mc: 4, grade: null, status: "recommended", color: "#6366F1", tags: ["cryptography"], prereqs: ["CS3235"], aiReason: "Direct extension of CS3235. Goes deeper into provable security." }] }] }
];

// --- DESIGN TOKENS (Apple-inspired) ---
const LIGHT = {
  bg: "#F5F5F7",
  surface: "#FFFFFF",
  border: "rgba(0,0,0,0.07)",
  borderLight: "rgba(0,0,0,0.04)",
  text: "#1D1D1F",
  textMuted: "#6E6E73",
  textFaint: "#98989D",
  navBg: "rgba(255,255,255,0.85)",
  inputBg: "#FFFFFF",
  inputBorder: "rgba(0,0,0,0.13)",
  hoverBg: "rgba(0,0,0,0.03)",
  activeBg: "rgba(0,0,0,0.06)",
  termBg: "#F5F5F7",
  termUserBg: "#1D1D1F",
  termUserText: "#FFFFFF",
  termAiBg: "#E8E8ED",
  termAiText: "#1D1D1F",
  bottomNav: "rgba(255,255,255,0.92)",
  todayBg: "#EFF6FF",
  calGrid: "#F5F5F7",
  cardShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
};
const DARK = {
  bg: "#111111",
  surface: "#1C1C1E",
  border: "rgba(255,255,255,0.08)",
  borderLight: "rgba(255,255,255,0.05)",
  text: "#F5F5F7",
  textMuted: "#98989D",
  textFaint: "#636366",
  navBg: "rgba(28,28,30,0.88)",
  inputBg: "#2C2C2E",
  inputBorder: "rgba(255,255,255,0.13)",
  hoverBg: "rgba(255,255,255,0.05)",
  activeBg: "rgba(255,255,255,0.09)",
  termBg: "#111111",
  termUserBg: "#F5F5F7",
  termUserText: "#1C1C1E",
  termAiBg: "#2C2C2E",
  termAiText: "#F5F5F7",
  bottomNav: "rgba(28,28,30,0.95)",
  todayBg: "#0D1829",
  calGrid: "#1C1C1E",
  cardShadow: "0 1px 4px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.15)",
};

// --- NAV ITEM LABELS ---
const NAV_ITEMS = [
  { key: "home",    label: "Home"    },
  { key: "nusmods", label: "NUSMods" },
  { key: "planner", label: "Planner" },
  { key: "manage",  label: "Manage"  },
] as const;

// --- COMPREHENSIVE CSS INJECTION ---
const INJECTED_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.22); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.4); }
  *:focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; border-radius: 4px; }

  .sdx-nav-btn {
    display: inline-flex; align-items: center;
    padding: 5px 13px; border-radius: 8px;
    font-size: 13px; font-weight: 500; letter-spacing: -0.01em;
    border: none; cursor: pointer; background: transparent;
    transition: background 0.12s, color 0.12s; font-family: inherit;
    -webkit-tap-highlight-color: transparent;
  }
  .sdx-nav-btn:hover { background: var(--s-hover); }
  .sdx-nav-btn.active { background: var(--s-active); }

  .sdx-logo-btn {
    background: transparent; border: none; cursor: pointer;
    display: flex; align-items: center; gap: 7px;
    padding: 4px 8px 4px 4px; border-radius: 8px;
    transition: opacity 0.12s; -webkit-tap-highlight-color: transparent;
  }
  .sdx-logo-btn:hover { opacity: 0.75; }

  .sdx-rail-item { transition: background 0.1s; border-radius: 8px; cursor: pointer; }
  .sdx-rail-item:hover { background: var(--s-hover); }

  .sdx-row { transition: background 0.1s; cursor: pointer; }
  .sdx-row:hover { background: var(--s-hover); }

  .sdx-mod-card {
    transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s;
    cursor: pointer;
  }
  .sdx-mod-card:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0,0,0,0.10) !important; }

  .sdx-plan-card {
    transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s;
    cursor: pointer;
  }
  .sdx-plan-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.12) !important; }

  .sdx-chip {
    transition: background 0.12s, border-color 0.12s, transform 0.12s;
    cursor: pointer;
  }
  .sdx-chip:hover { background: var(--s-hover) !important; transform: translateY(-1px); }

  .sdx-btn { transition: opacity 0.15s, transform 0.1s; cursor: pointer; }
  .sdx-btn:hover:not(:disabled) { opacity: 0.80; }
  .sdx-btn:active:not(:disabled) { transform: scale(0.96); }

  .sdx-send-btn {
    transition: background 0.15s, transform 0.1s;
  }
  .sdx-send-btn:hover:not(:disabled) { background: #1d4ed8 !important; }
  .sdx-send-btn:active:not(:disabled) { transform: scale(0.92); }

  .sdx-bottom-tab {
    transition: color 0.15s, opacity 0.15s;
    cursor: pointer; background: transparent; border: none;
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 3px;
    -webkit-tap-highlight-color: transparent;
  }
  .sdx-bottom-tab:active { opacity: 0.5; }

  .sdx-toggle { cursor: pointer; transition: background 0.2s; }
  .sdx-toggle-thumb { transition: left 0.2s; }

  .sdx-back { transition: opacity 0.12s; cursor: pointer; background: transparent; border: none; font-family: inherit; }
  .sdx-back:hover { opacity: 0.6; }

  .sdx-tab { transition: color 0.15s, border-color 0.15s; cursor: pointer; white-space: nowrap; }

  .sdx-file-row { transition: background 0.1s; cursor: pointer; }
  .sdx-file-row:hover { background: var(--s-hover); }

  .sdx-quiz-btn { transition: background 0.12s, border-color 0.12s, transform 0.1s; }
  .sdx-quiz-btn:hover:not(:disabled) { transform: translateX(2px); }

  .sdx-manage-row { transition: background 0.1s; }
  .sdx-manage-row:hover { background: var(--s-hover); }

  @keyframes sdx-appear {
    from { opacity: 0; transform: translateY(5px); }
    to   { opacity: 1; transform: none; }
  }
  .sdx-appear { animation: sdx-appear 0.22s ease forwards; }

  @keyframes sdx-dot-pulse {
    0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
    30%            { opacity: 1;   transform: scale(1.2); }
  }
  .sdx-typing-dot {
    display: inline-block; width: 6px; height: 6px;
    border-radius: 50%; background: currentColor;
    animation: sdx-dot-pulse 1.4s ease-in-out infinite;
  }
  .sdx-typing-dot:nth-child(2) { animation-delay: 0.18s; }
  .sdx-typing-dot:nth-child(3) { animation-delay: 0.36s; }

  @keyframes sdx-fade-in { from { opacity: 0; } to { opacity: 1; } }
  .sdx-fade-in { animation: sdx-fade-in 0.25s ease; }
`;

// --- SHARED UI COMPONENTS ---
function Badge({ color, children }: { color: string, children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, color, background: color + "15", border: "1px solid " + color + "25", borderRadius: 20, padding: "1px 7px", flexShrink: 0, lineHeight: 1.6 }}>
      {children}
    </span>
  );
}

function BottomNav({ T, view, setView }: { T: typeof LIGHT, view: string, setView: (v: string) => void }) {
  const tabs: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: "home",    label: "Home",
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" /><polyline points="9 21 9 12 15 12 15 21" /></svg>,
    },
    { key: "nusmods", label: "NUSMods",
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    },
    { key: "planner", label: "Planner",
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
    },
    { key: "manage",  label: "Manage",
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>,
    },
  ];
  const mainKeys = ["home", "nusmods", "planner", "manage"];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: T.bottomNav, borderTop: "1px solid " + T.border, display: "flex", zIndex: 400, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", paddingBottom: "env(safe-area-inset-bottom,0px)" }} role="navigation" aria-label="Main navigation">
      {tabs.map(t => {
        const isActive = t.key === "home"
          ? (view === "home" || !mainKeys.includes(view))
          : view === t.key;
        return (
          <button key={t.key} className="sdx-bottom-tab" onClick={() => setView(t.key)} style={{ color: isActive ? "#2563EB" : T.textFaint, paddingBottom: 8, paddingTop: 8 }} aria-current={isActive ? "page" : undefined}>
            {t.icon}
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 400, letterSpacing: "-0.01em" }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DayBadge({ daysLeft }: { daysLeft: number }) {
  if (daysLeft < 0) return null;
  const c = daysLeft <= 2 ? "#DC2626" : daysLeft <= 7 ? "#D97706" : "#6B7280";
  const hasBg = daysLeft <= 7;
  const label = daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : daysLeft <= 2 ? daysLeft + "d left" : daysLeft + "d";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: c, background: hasBg ? c + "14" : "transparent", borderRadius: 20, padding: hasBg ? "2px 7px" : 0, flexShrink: 0, lineHeight: 1.5 }}>
      {label}
    </span>
  );
}

function Chk({ done, color, onToggle, size = 16 }: { done: boolean, color: string, onToggle: () => void, size?: number }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      onClick={e => { e.stopPropagation(); onToggle(); }}
      style={{ width: size, height: size, borderRadius: "50%", border: "1.5px solid " + (done ? color : "rgba(0,0,0,0.18)"), background: done ? color : "transparent", flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", padding: 0 }}
    >
      {done && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </button>
  );
}

function Card({ T, title, children, badge, badgeColor, maxH, action }: { T: typeof LIGHT, title: string, children: React.ReactNode, badge?: string, badgeColor?: string, maxH?: number | string, action?: React.ReactNode }) {
  return (
    <div style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: T.cardShadow }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.borderLight, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.05em", textTransform: "uppercase" }}>{title}</span>
        {badge && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: badgeColor, background: badgeColor + "15", borderRadius: 20, padding: "1px 8px", lineHeight: 1.6 }}>{badge}</span>}
        {action && <div style={{ marginLeft: badge ? 0 : "auto" }}>{action}</div>}
      </div>
      <div style={{ overflowY: maxH ? "auto" : "visible", maxHeight: maxH || "none" }}>
        {children}
      </div>
    </div>
  );
}

function Empty({ T, text }: { T: typeof LIGHT, text: string }) {
  return (
    <div style={{ padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
      </svg>
      <span style={{ fontSize: 13, color: T.textFaint, textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

// --- AI SIDEBAR ---
function AISidebar({ T, dark: _dark, isMobile, userId }: { T: typeof LIGHT, dark: boolean, isMobile: boolean, userId: string | null }) {
  const [msgs, setMsgs] = useState([{ role: "ai", text: "What's on your plate? Ask me about deadlines, exams, or any module." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [msgs]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    if (!userId) {
      setMsgs(m => [...m, { role: "user", text: q }, { role: "ai", text: "Please run a sync first so I have a user account and course data to work with." }]);
      setInput("");
      return;
    }
    setInput("");
    setMsgs(m => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, userId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMsgs(m => [...m, { role: "ai", text: payload.error || "Something went wrong. Please try again." }]);
      } else {
        setMsgs(m => [...m, { role: "ai", text: payload.answer || "No answer returned." }]);
      }
    } catch (err) {
      console.error("[AISidebar] chat error:", err);
      setMsgs(m => [...m, { role: "ai", text: "Network error. Check your connection and try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = ["What's due this week?", "Exam schedule", "HW3 details", "Weightings"];

  return (
    <div style={{ display: "flex", flexDirection: "column", background: T.surface, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden", flexShrink: 0, width: isMobile ? "100%" : 300, boxShadow: T.cardShadow }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid " + T.borderLight, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(99,102,241,0.35)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: "-0.01em" }}>Ask Studex</div>
          <div style={{ fontSize: 11, color: T.textFaint, marginTop: 1 }}>AI study assistant</div>
        </div>
      </div>
      <div ref={containerRef} style={{ overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, background: T.termBg }}>
        {msgs.map((m, i) => (
          <div key={i} className="sdx-appear" style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "88%", padding: "9px 12px", borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: m.role === "user" ? T.termUserBg : T.termAiBg, color: m.role === "user" ? T.termUserText : T.termAiText, fontSize: 13, lineHeight: 1.55 }}>
              {renderMsg(m.text)}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex" }}>
            <div style={{ padding: "10px 14px", borderRadius: "14px 14px 14px 4px", background: T.termAiBg, color: T.textMuted, display: "flex", alignItems: "center", gap: 5 }}>
              <span className="sdx-typing-dot" /><span className="sdx-typing-dot" /><span className="sdx-typing-dot" />
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: "6px 10px", display: "flex", gap: 5, overflowX: "auto", borderBottom: "1px solid " + T.borderLight, scrollbarWidth: "none" }}>
        {suggestions.map(s => (
          <button key={s} className="sdx-chip" onClick={() => setInput(s)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid " + T.border, background: T.surface, color: T.textMuted, fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
            {s}
          </button>
        ))}
      </div>
      <div style={{ padding: "8px 10px", display: "flex", gap: 6, alignItems: "center" }}>
        <input
          aria-label="Chat message"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void send(); }}
          placeholder={userId ? "Ask anything…" : "Sync first to enable chat…"}
          style={{ flex: 1, padding: "8px 13px", borderRadius: 20, border: "1px solid " + T.inputBorder, background: T.inputBg, color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none" }}
        />
        <button
          aria-label="Send message"
          className="sdx-send-btn"
          onClick={() => void send()}
          disabled={loading}
          style={{ width: 34, height: 34, borderRadius: "50%", background: "#2563EB", color: "#fff", fontSize: 16, cursor: loading ? "not-allowed" : "pointer", flexShrink: 0, opacity: loading ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", border: "none" }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

// --- HOME VIEW ---
function HomeView({ T, data, taskStatus, seenChanges, onToggleTask, onMarkSeen, onViewModule, dark, isMobile, isTablet }: { T: typeof LIGHT, data: DashboardData, taskStatus: Record<string, boolean>, seenChanges: Record<string, boolean>, onToggleTask: (id: string) => void, onMarkSeen: (id: string) => void, onViewModule: (code: string) => void, dark: boolean, isMobile: boolean, isTablet: boolean }) {
  const upcomingTasks = data.tasks.filter(t => !taskStatus[t.id]);
  const unseenChanges = data.announcements.filter(c => !seenChanges[c.id]);
  const enabledModules = data.modules.filter(m => m.sync_enabled);
  const dueSoonCount = upcomingTasks.filter(t => { const d = getDaysLeft(t.dueDate); return d >= 0 && d <= 3; }).length;

  return (
    <div style={{ padding: isMobile ? "16px 14px" : "24px 28px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Lora',serif", fontWeight: 400, fontSize: isMobile ? 22 : 26, color: T.text, letterSpacing: "-0.3px", lineHeight: 1.2 }}>{getGreeting()}, Aiden.</h1>
        <p style={{ fontSize: 13, color: T.textFaint, marginTop: 4, letterSpacing: "-0.01em" }}>{formatTodayLabel()}</p>
        {(dueSoonCount > 0 || unseenChanges.length > 0) && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {dueSoonCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#DC2626", background: "#DC262612", borderRadius: 20, padding: "4px 10px", border: "1px solid #DC262618" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                {dueSoonCount} due soon
              </span>
            )}
            {unseenChanges.length > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#2563EB", background: "#2563EB12", borderRadius: 20, padding: "4px 10px", border: "1px solid #2563EB18" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
                {unseenChanges.length} new {unseenChanges.length === 1 ? "announcement" : "announcements"}
              </span>
            )}
          </div>
        )}
      </div>

      {data.modules.length === 0 ? (
        <div style={{ padding: isMobile ? "40px 24px" : "60px 40px", textAlign: "center", background: T.surface, border: "1px solid " + T.border, borderRadius: 16, boxShadow: T.cardShadow }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg," + T.hoverBg + "," + T.hoverBg + ")", border: "1px solid " + T.border, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <h2 style={{ fontFamily: "'Lora',serif", fontSize: isMobile ? 20 : 23, fontWeight: 600, marginBottom: 10, color: T.text, letterSpacing: "-0.3px" }}>Ready to sync your semester?</h2>
          <p style={{ color: T.textMuted, fontSize: 14, lineHeight: 1.7, maxWidth: 460, margin: "0 auto" }}>Click <strong>Sync Canvas</strong> above to pull your enrolled modules. You can then choose which ones to track and enable AI study chat.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 240px" : "1fr 300px", gap: 18, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Card T={T} title="Modules" badge={enabledModules.length + " synced"} badgeColor="#2563EB">
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 10, padding: "14px" }}>
                {enabledModules.length === 0 && <div style={{ gridColumn: "1/-1" }}><Empty T={T} text="No modules enabled. Go to Manage to enable sync." /></div>}
                {enabledModules.map(m => {
                  const color = colorForModule(m.code);
                  const staticDetail = STATIC_MODULE_DETAILS[m.code];
                  return (
                    <div key={m.id} className="sdx-mod-card" onClick={() => onViewModule(m.code)} style={{ padding: "13px 15px", background: T.surface, border: "1px solid " + T.border, borderRadius: 10, borderLeft: "3px solid " + color, boxShadow: T.cardShadow }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 3, letterSpacing: "0.02em" }}>{m.code}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: T.text, marginBottom: staticDetail?.lecturer ? 2 : 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{m.title}</div>
                      {staticDetail?.lecturer && <div style={{ fontSize: 11.5, color: T.textFaint, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staticDetail.lecturer}</div>}
                      <div style={{ display: "flex", gap: 6 }}>
                        <Badge color={T.textMuted}>{m.taskCount} tasks</Badge>
                        <Badge color={T.textMuted}>{m.announcementCount} updates</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card T={T} title="Announcements" badge={unseenChanges.length > 0 ? unseenChanges.length + " new" : undefined} badgeColor="#2563EB"
              action={unseenChanges.length > 0 ? (
                <button onClick={() => unseenChanges.forEach(c => onMarkSeen(c.id))} aria-label={`Mark all ${unseenChanges.length} announcements as read`} className="sdx-btn" style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 0" }}>
                  Mark all read
                </button>
              ) : undefined}
            >
              {unseenChanges.length === 0 && <Empty T={T} text="All caught up — no new announcements." />}
              {unseenChanges.map((c, i) => (
                <div key={c.id} className="sdx-row" onClick={() => onMarkSeen(c.id)} style={{ padding: "13px 16px", borderBottom: i < unseenChanges.length - 1 ? "1px solid " + T.borderLight : "none" }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: colorForModule(c.moduleCode), letterSpacing: "0.02em" }}>{c.moduleCode}</span>
                    <span style={{ fontSize: 11, color: T.textFaint }}>{c.postedLabel}</span>
                    {c.importance === "high" && <Badge color="#DC2626">Urgent</Badge>}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, marginBottom: 4, letterSpacing: "-0.01em" }}>{c.title}</div>
                  <div style={{ fontSize: 12.5, color: T.textMuted, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>{c.summary}</div>
                </div>
              ))}
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <AISidebar T={T} dark={false} isMobile={isMobile} userId={data.userId} />
            <Card T={T} title="Upcoming Tasks" maxH={400}>
              {upcomingTasks.length === 0 && <Empty T={T} text="Nothing due — you're all caught up." />}
              {upcomingTasks.map((t, i) => (
                <div key={t.id} className="sdx-row" style={{ padding: "10px 16px", borderBottom: i < upcomingTasks.length - 1 ? "1px solid " + T.borderLight : "none", display: "flex", alignItems: "center", gap: 10 }}>
                  <Chk done={false} color={colorForModule(t.moduleCode)} onToggle={() => onToggleTask(t.id)} size={14} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: colorForModule(t.moduleCode), fontWeight: 600, marginTop: 2 }}>{t.moduleCode} · {t.dueLabel}</div>
                  </div>
                  <DayBadge daysLeft={getDaysLeft(t.dueDate)} />
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// --- MANAGE VIEW ---
function ManageView({ T, modules, onToggleSync, isMobile }: { T: typeof LIGHT, modules: ModuleSummary[], onToggleSync: (moduleId: string, enabled: boolean) => void, isMobile: boolean }) {
  return (
    <div style={{ padding: isMobile ? "16px 14px" : "28px 32px", maxWidth: 800, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: isMobile ? 20 : 24, color: T.text, marginBottom: 6, letterSpacing: "-0.3px" }}>Module Management</h2>
      <p style={{ color: T.textMuted, fontSize: 13.5, marginBottom: 24, lineHeight: 1.6 }}>Choose which modules synchronise with Canvas. Disabling past modules saves sync time and AI tokens.</p>
      <div style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden", boxShadow: T.cardShadow }}>
        {modules.length === 0 && <Empty T={T} text="No modules discovered yet. Click 'Sync Canvas' in the top bar." />}
        {modules.map((m, i) => (
          <div key={m.id} className="sdx-manage-row" style={{ padding: isMobile ? "14px 16px" : "16px 22px", borderBottom: i < modules.length - 1 ? "1px solid " + T.borderLight : "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: colorForModule(m.code), flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text, letterSpacing: "0.01em" }}>{m.code}</span>
              </div>
              <div style={{ fontSize: 12.5, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: m.sync_enabled ? "#059669" : T.textFaint }}>{m.sync_enabled ? "On" : "Off"}</span>
              <div className="sdx-toggle" role="switch" aria-checked={m.sync_enabled} onClick={() => onToggleSync(m.id, !m.sync_enabled)} style={{ width: 42, height: 22, borderRadius: 11, background: m.sync_enabled ? "#2563EB" : T.border, position: "relative" }}>
                <div className="sdx-toggle-thumb" style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: m.sync_enabled ? 23 : 3, boxShadow: "0 1px 3px rgba(0,0,0,0.22)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// --- NUSMODS VIEW ---
function NUSModsView({ T, isMobile, modules }: { T: typeof LIGHT, isMobile: boolean, modules: ModuleSummary[] }) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const slots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

  const allLessons = modules.flatMap(m => {
    const lessons = (m.nusmods?.lessons ?? STATIC_MODULE_DETAILS[m.code]?.nusmods?.lessons ?? []) as { day: string; time: string; type: string; venue: string }[];
    return lessons.map(l => ({ ...l, mod: { ...m, color: colorForModule(m.code) } }));
  });

  const getLesson = (day: string, time: string) => allLessons.find(l => l.day === day && l.time.startsWith(time));

  return (
    <div style={{ padding: isMobile ? "16px 14px" : "28px 32px", maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: isMobile ? 20 : 24, color: T.text, letterSpacing: "-0.3px" }}>NUSMods</h2>
        <p style={{ fontSize: 13, color: T.textFaint, marginTop: 3 }}>AY2025/26 Semester 2</p>
      </div>
      {/* Timetable */}
      <div style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden", marginBottom: 18, boxShadow: T.cardShadow }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.borderLight }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.05em", textTransform: "uppercase" }}>Weekly Timetable</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 500 : 640 }}>
            <thead>
              <tr style={{ background: T.bg }}>
                <th style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: T.textFaint, textAlign: "left", width: 52, borderBottom: "1px solid " + T.borderLight }}>Time</th>
                {days.map(d => (
                  <th key={d} style={{ padding: "8px 10px", fontSize: isMobile ? 10 : 11.5, fontWeight: 700, color: T.textMuted, textAlign: "left", borderBottom: "1px solid " + T.borderLight, borderLeft: "1px solid " + T.borderLight }}>
                    {isMobile ? d.slice(0, 3) : d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot, si) => (
                <tr key={slot}>
                  <td style={{ padding: "5px 12px", fontSize: 10, color: T.textFaint, verticalAlign: "top", borderBottom: si < slots.length - 1 ? "1px solid " + T.borderLight : "none", whiteSpace: "nowrap", fontWeight: 500 }}>{slot}</td>
                  {days.map(d => {
                    const lesson = getLesson(d, slot);
                    return (
                      <td key={d} style={{ padding: "3px 5px", borderBottom: si < slots.length - 1 ? "1px solid " + T.borderLight : "none", borderLeft: "1px solid " + T.borderLight, verticalAlign: "top", minWidth: isMobile ? 80 : 115 }}>
                        {lesson && (
                          <div style={{ background: lesson.mod.color + "15", borderLeft: "3px solid " + lesson.mod.color, borderRadius: "0 5px 5px 0", padding: "5px 7px" }}>
                            <div style={{ fontSize: isMobile ? 9.5 : 11, fontWeight: 700, color: lesson.mod.color }}>{lesson.mod.code}</div>
                            <div style={{ fontSize: 9.5, color: T.textMuted, marginTop: 1 }}>{lesson.type}</div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Exam Schedule */}
      <div style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden", boxShadow: T.cardShadow }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.borderLight }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.05em", textTransform: "uppercase" }}>Exam Schedule</span>
        </div>
        {modules.map((m, i) => {
          const exam = m.nusmods?.exam || STATIC_MODULE_DETAILS[m.code]?.nusmods?.exam;
          if (!exam) return null;
          return (
            <div key={m.code} style={{ padding: isMobile ? "14px 16px" : "14px 20px", borderBottom: i < modules.length - 1 ? "1px solid " + T.borderLight : "none", display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: colorForModule(m.code), flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: colorForModule(m.code), width: isMobile ? "auto" : 76, letterSpacing: "0.01em" }}>{m.code}</span>
                {isMobile && <span style={{ fontSize: 12.5, color: T.textMuted }}>{m.title}</span>}
              </div>
              {!isMobile && <div style={{ flex: 1, fontSize: 13.5, color: T.text, letterSpacing: "-0.01em" }}>{m.title}</div>}
              <div style={{ textAlign: isMobile ? "left" : "right" }}>
                {exam.date === "No Exam" ? (
                  <span style={{ fontSize: 12.5, color: T.textFaint }}>No exam · {exam.venue}</span>
                ) : (
                  <>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, letterSpacing: "-0.01em" }}>{exam.date}</div>
                    <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 2 }}>{exam.time} · {exam.venue} · {exam.duration}</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- PLANNER VIEW ---
type PlannerMod = {
  code: string;
  name: string;
  mc: number;
  grade: string | null;
  status: string;
  color: string;
  tags: string[];
  prereqs?: string[];
  aiReason?: string;
  year: number;
  sem: number;
};

function PlannerDetail({ T, mod, dark, isMobile, onClose }: { T: typeof LIGHT, mod: PlannerMod, dark: boolean, isMobile?: boolean, onClose: () => void }) {
  const sc = mod.status === "done" ? "#059669" : mod.status === "current" ? mod.color : "#6366F1";
  const sl = mod.status === "done" ? "Completed" : mod.status === "current" ? "In progress" : "AI Recommended";
  return (
    <div style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden", width: isMobile ? "100%" : 276, flexShrink: 0, position: isMobile ? "relative" : "sticky", top: isMobile ? "auto" : 16, boxShadow: T.cardShadow }}>
      <div style={{ height: 3, background: sc }} />
      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: sc, letterSpacing: "0.02em" }}>{mod.code}</div>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 15.5, fontWeight: 600, color: T.text, marginTop: 3, lineHeight: 1.3, letterSpacing: "-0.2px" }}>{mod.name}</div>
          </div>
          <button onClick={onClose} className="sdx-btn" style={{ background: "transparent", border: "none", color: T.textFaint, fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 0 0 8px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: sc + "15", color: sc, border: "1px solid " + sc + "28" }}>{sl}</span>
          <span style={{ fontSize: 11, color: T.textFaint, padding: "3px 9px", background: T.hoverBg, borderRadius: 20, border: "1px solid " + T.border }}>{mod.mc} MCs · Y{mod.year} S{mod.sem}</span>
        </div>
      </div>
      {mod.aiReason && (
        <div style={{ margin: "0 16px 16px", padding: "12px 14px", background: dark ? "#16163A" : "#EEF2FF", borderRadius: 8, border: "1px solid #6366F120" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>Why Studex recommends this</div>
          <p style={{ fontSize: 13, color: T.text, lineHeight: 1.65 }}>{mod.aiReason}</p>
        </div>
      )}
    </div>
  );
}

function PlannerView({ T, dark, isMobile }: { T: typeof LIGHT, dark: boolean, isMobile: boolean }) {
  const [selected, setSelected] = useState<PlannerMod | null>(null);
  const getCardStyle = (status: string, color: string) => {
    if (status === "done") return { bg: color + "12", borderColor: color + "40", textCol: color, dashed: false };
    if (status === "current") return { bg: color + "18", borderColor: color, textCol: color, dashed: false };
    if (status === "recommended") return { bg: dark ? "#16163A" : "#EEF2FF", borderColor: "#6366F150", textCol: "#6366F1", dashed: true };
    return { bg: "transparent", borderColor: T.border, textCol: T.textFaint };
  };

  return (
    <div style={{ padding: isMobile ? "16px 14px" : "28px 28px" }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: isMobile ? 20 : 24, color: T.text, letterSpacing: "-0.3px" }}>Academic Planner</h2>
        <p style={{ fontSize: 13, color: T.textFaint, marginTop: 3 }}>Y1–Y3 completed · Y4 AI-recommended</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 22 }}>
        {[{ label: "Completed MCs", value: 48, color: "#059669" }, { label: "In Progress", value: "20 MCs", color: "#E8480C" }, { label: "Current GPA", value: "4.25", color: "#3B82F6" }, { label: "Recommended", value: "16 MCs", color: "#6366F1" }].map(s => (
          <div key={s.label} style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 12, padding: "14px 16px", textAlign: "center", boxShadow: T.cardShadow }}>
            <div style={{ fontSize: isMobile ? 22 : 24, fontWeight: 700, color: s.color, fontFamily: "'Lora',serif", lineHeight: 1, letterSpacing: "-0.5px" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.textFaint, marginTop: 5, letterSpacing: "-0.01em" }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <div style={{ flex: 1, overflowX: "auto", paddingBottom: 12 }}>
          <div style={{ display: "flex", gap: 20 }}>
            {ACADEMIC_TREE.map(yr => (
              <div key={yr.year}>
                <div style={{ textAlign: "center", padding: "5px 10px", borderRadius: 7, background: T.surface, border: "1px solid " + T.border, marginBottom: 10, boxShadow: T.cardShadow }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.textMuted }}>{yr.label}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {yr.semesters.map(sem => (
                    <div key={sem.sem} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {sem.modules.map(mod => {
                        const s = getCardStyle(mod.status, mod.color);
                        const plannerMod: PlannerMod = { ...mod, year: yr.year, sem: sem.sem };
                        return (
                          <div key={mod.code} className="sdx-plan-card" onClick={() => setSelected(plannerMod)} style={{ background: s.bg, border: "1.5px " + (s.dashed ? "dashed" : "solid") + " " + s.borderColor, borderRadius: 9, padding: "10px 12px", minWidth: 148 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: s.textCol, letterSpacing: "0.01em" }}>{mod.code}</div>
                            <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 3, lineHeight: 1.3 }}>{mod.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        {!isMobile && selected && <PlannerDetail T={T} mod={selected} dark={dark} onClose={() => setSelected(null)} />}
        {isMobile && selected && (
          <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }} onClick={() => setSelected(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 320 }}>
              <PlannerDetail T={T} mod={selected} dark={dark} isMobile={true} onClose={() => setSelected(null)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- MODULE VIEW ---
function ModuleView({ T, mod, tasks, taskStatus, onToggleTask, dark, isMobile, onBack }: { T: typeof LIGHT, mod: ModuleSummary, tasks: WeeklyTask[], taskStatus: Record<string, boolean>, onToggleTask: (id: string) => void, dark: boolean, isMobile: boolean, onBack: () => void }) {
  const [tab, setTab] = useState("overview");
  const staticDetails = STATIC_MODULE_DETAILS[mod.code] || { lecturer: "Unknown", week_topic: "TBA", week_summary: "No summary available.", weights: [], nusmods: { mc: 4, lessons: [], exam: { date: "TBA", time: "", venue: "", duration: "" } } };
  const details = { ...staticDetails, nusmods: mod.nusmods || staticDetails.nusmods };
  const pendingTasks = tasks.filter(t => !taskStatus[t.id]);
  const color = colorForModule(mod.code);

  const tabLabels: Record<string, string> = { overview: "Overview", files: "Files", quiz: "Quiz" };

  return (
    <div style={{ padding: isMobile ? "16px 14px" : "28px 32px", maxWidth: 940, margin: "0 auto" }}>
      {/* Back button */}
      <button className="sdx-back" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, color: T.textMuted, fontSize: 13, fontFamily: "inherit", marginBottom: 16, letterSpacing: "-0.01em" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Home
      </button>
      {/* Module header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: "0.02em" }}>{mod.code}</span>
        </div>
        <h2 style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: isMobile ? 20 : 23, color: T.text, letterSpacing: "-0.3px" }}>{mod.title}</h2>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4, letterSpacing: "-0.01em" }}>{details.lecturer} · {details.week_topic}</div>
      </div>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid " + T.border, marginBottom: 22, overflowX: "auto", gap: 2 }}>
        {["overview", "files", "quiz"].map(key => (
          <button key={key} className="sdx-tab" onClick={() => setTab(key)} style={{ padding: "9px 18px", fontSize: 13.5, fontWeight: tab === key ? 600 : 400, color: tab === key ? color : T.textMuted, borderBottom: tab === key ? "2px solid " + color : "2px solid transparent", marginBottom: -1, background: "transparent", border: "none", fontFamily: "inherit", letterSpacing: "-0.01em" }}>
            {tabLabels[key]}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.15fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card T={T} title="This Week">
              <div style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 8, letterSpacing: "-0.01em" }}>{details.week_topic}</div>
                <p style={{ fontSize: 13.5, color: T.text, lineHeight: 1.65 }}>{details.week_summary}</p>
              </div>
            </Card>
            <Card T={T} title="Module Info">
              <div style={{ padding: "14px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
                  <span style={{ color: T.textMuted }}>Faculty</span>
                  <span style={{ fontWeight: 500, color: T.text }}>{details.nusmods.faculty}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: T.textMuted }}>Credits</span>
                  <span style={{ fontWeight: 500, color: T.text }}>{details.nusmods.mc} MCs</span>
                </div>
              </div>
            </Card>
            {pendingTasks.length > 0 && (
              <Card T={T} title="Open Tasks" badge={String(pendingTasks.length)} badgeColor={color}>
                {pendingTasks.map((t, i) => (
                  <div key={t.id} className="sdx-row" style={{ padding: "10px 16px", borderBottom: i < pendingTasks.length - 1 ? "1px solid " + T.borderLight : "none", display: "flex", alignItems: "center", gap: 10 }}>
                    <Chk done={taskStatus[t.id] ?? false} color={color} onToggle={() => onToggleTask(t.id)} size={14} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{t.dueLabel}</div>
                    </div>
                    <DayBadge daysLeft={getDaysLeft(t.dueDate)} />
                  </div>
                ))}
              </Card>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card T={T} title="Assessment & Exam">
              <div style={{ padding: "14px 18px" }}>
                {(details.weights as { component: string; weight: string }[]).map((w, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8, paddingBottom: 8, borderBottom: i < (details.weights as { component: string; weight: string }[]).length - 1 ? "1px solid " + T.borderLight : "none" }}>
                    <span style={{ color: T.text }}>{w.component}</span>
                    <span style={{ fontWeight: 700, color: color }}>{w.weight}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + T.border }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Final Exam</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: T.textMuted }}>Date</span>
                    <span style={{ fontWeight: 600, color: T.text }}>{details.nusmods.exam.date}</span>
                  </div>
                  {details.nusmods.exam.time !== "—" && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: T.textMuted }}>Time</span>
                      <span style={{ color: T.text }}>{details.nusmods.exam.time} ({details.nusmods.exam.duration})</span>
                    </div>
                  )}
                  {details.nusmods.exam.venue !== "—" && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: T.textMuted }}>Venue</span>
                      <span style={{ color: T.text }}>{details.nusmods.exam.venue}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
      {tab === "files" && <FilesTab T={T} mod={mod} />}
      {tab === "quiz" && <QuizTab T={T} mod={mod} dark={dark} />}
    </div>
  );
}

function FilesTab({ T, mod }: { T: typeof LIGHT, mod: ModuleSummary }) {
  const files = mod.files || [];
  const fileColor = (type: string): string => ({ pdf: "#DC2626", zip: "#D97706", xlsx: "#059669", docx: "#2563EB" } as Record<string, string>)[type] ?? "#6B7280";
  return (
    <Card T={T} title="Module Files">
      {files.length === 0 && <Empty T={T} text="No files synced yet. Run a sync to pull Canvas files." />}
      {files.map((f, i) => (
        <div key={f.name} className="sdx-file-row" style={{ padding: "11px 16px", borderBottom: i < files.length - 1 ? "1px solid " + T.borderLight : "none", display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: fileColor(f.type) + "14", border: "1px solid " + fileColor(f.type) + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: fileColor(f.type), letterSpacing: "0.02em" }}>{f.type.toUpperCase()}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{f.name}</div>
            <div style={{ fontSize: 11.5, color: T.textFaint, marginTop: 2 }}>{f.category} · {f.sizeLabel}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>
      ))}
    </Card>
  );
}

function QuizTab({ T, mod, dark }: { T: typeof LIGHT, mod: ModuleSummary, dark: boolean }) {
  const questions = QUIZ_BANK[mod.code] ?? [];
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const answeredCount = Object.keys(answers).length;

  return (
    <Card T={T} title="Quick Quiz" badge={questions.length > 0 ? `${answeredCount}/${questions.length}` : undefined} badgeColor={T.textMuted}>
      {questions.length === 0 && <Empty T={T} text="No quiz questions available for this module." />}
      {questions.map((q, i) => {
        const selected = answers[i];
        const answered = selected !== undefined;
        return (
          <div key={i} style={{ padding: "16px 18px", borderBottom: i < questions.length - 1 ? "1px solid " + T.borderLight : "none" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, marginBottom: 12, lineHeight: 1.5, letterSpacing: "-0.01em" }}>{i + 1}. {q.q}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {q.options.map((opt, j) => {
                const isCorrect = j === q.answer;
                const isSelected = selected === j;
                const bg = answered && isCorrect ? (dark ? "#064E3B" : "#D1FAE5") : answered && isSelected && !isCorrect ? (dark ? "#450A0A" : "#FEE2E2") : T.bg;
                const border = answered && isCorrect ? "#059669" : answered && isSelected && !isCorrect ? "#DC2626" : T.border;
                const textColor = answered && isCorrect ? "#059669" : answered && isSelected && !isCorrect ? "#DC2626" : T.text;
                return (
                  <button
                    key={j}
                    type="button"
                    className="sdx-quiz-btn"
                    disabled={answered}
                    aria-pressed={isSelected}
                    onClick={() => { if (!answered) setAnswers(a => ({ ...a, [i]: j })); }}
                    style={{ padding: "9px 13px", borderRadius: 8, border: "1px solid " + border, background: bg, color: textColor, fontSize: 13, cursor: answered ? "default" : "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left", width: "100%", fontFamily: "inherit", letterSpacing: "-0.01em" }}
                  >
                    <span style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid " + border, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, fontWeight: 700, background: answered && isCorrect ? "#059669" : answered && isSelected && !isCorrect ? "#DC2626" : "transparent", color: (answered && (isCorrect || (isSelected && !isCorrect))) ? "#fff" : border }}>
                      {answered && isCorrect ? "✓" : answered && isSelected && !isCorrect ? "✗" : String.fromCharCode(65 + j)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {answered && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: dark ? "#0D1829" : "#EFF6FF", borderRadius: 8, fontSize: 13, color: dark ? "#93C5FD" : "#1D4ED8", lineHeight: 1.6 }}>
                <strong>Explanation:</strong> {q.explanation}
              </div>
            )}
          </div>
        );
      })}
      {questions.length > 0 && answeredCount > 0 && (
        <div style={{ padding: "10px 18px", borderTop: "1px solid " + T.borderLight, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setAnswers({})} aria-label={`Reset all ${questions.length} quiz questions`} className="sdx-btn" style={{ background: "transparent", border: "none", color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
            Reset quiz
          </button>
        </div>
      )}
    </Card>
  );
}

// --- MAIN DASHBOARD CLIENT ---
export default function DashboardClient({ data: initialData }: { data: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [dark, setDark] = useState(false);
  const [view, setView] = useState("home");
  const [taskStatus, setTaskStatus] = useState<Record<string, boolean>>({});
  const [seenChanges, setSeenChanges] = useState<Record<string, boolean>>({});
  const { isMobile, isTablet } = useBreakpoint();
  const T = dark ? DARK : LIGHT;

  const toggleTask = (id: string) => setTaskStatus(s => ({ ...s, [id]: !s[id] }));
  const markSeen = (id: string) => setSeenChanges(s => ({ ...s, [id]: true }));

  const toggleSync = async (moduleId: string, enabled: boolean) => {
    const prevModules = data.modules;
    setData(prev => ({
      ...prev,
      modules: prev.modules.map(m => m.id === moduleId ? { ...m, sync_enabled: enabled } : m)
    }));
    try {
      const response = await fetch("/api/modules/toggle-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, sync_enabled: enabled }),
      });
      if (!response.ok) throw new Error("Failed to update sync setting");
    } catch {
      setData(prev => ({ ...prev, modules: prevModules }));
    }
  };

  const activeMod = data.modules.find(m => m.code === view);
  const showRail = !isMobile && (view === "home" || !!activeMod || view === "nusmods" || view === "planner" || view === "manage");
  const navH = isMobile ? 52 : 56;

  return (
    <div
      style={{ fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif", background: T.bg, minHeight: "100vh", color: T.text, transition: "background 0.2s,color 0.2s" } as React.CSSProperties}
      {...{ "data-theme": dark ? "dark" : "light" }}
    >
      <style>{INJECTED_CSS}</style>
      {/* CSS custom properties for hover state classes */}
      <style>{`:root,[data-theme]{--s-hover:${T.hoverBg};--s-active:${T.activeBg};}`}</style>

      {/* TOP NAV */}
      <header style={{ height: navH, background: T.navBg, borderBottom: "1px solid " + T.border, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: isMobile ? "0 16px" : "0 20px", gap: 4, position: "sticky", top: 0, zIndex: 300, boxShadow: "0 1px 0 " + T.border }}>
        {/* Logo */}
        <button className="sdx-logo-btn" onClick={() => setView("home")} aria-label="Go to home">
          <div style={{ width: 24, height: 24, borderRadius: 7, background: "linear-gradient(135deg,#2563EB,#7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 6px rgba(37,99,235,0.3)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <span style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: isMobile ? 16 : 17, color: T.text, letterSpacing: "-0.2px", userSelect: "none" }}>Studex</span>
        </button>

        {!isMobile && (
          <>
            <div style={{ width: 1, height: 18, background: T.border, margin: "0 6px" }} />
            {NAV_ITEMS.map(({ key, label }) => {
              const isActive = view === key || (key === "home" && !!activeMod);
              return (
                <button key={key} className={`sdx-nav-btn${isActive ? " active" : ""}`} onClick={() => setView(key)} style={{ color: isActive ? T.text : T.textMuted }}>
                  {label}
                </button>
              );
            })}
          </>
        )}

        <div style={{ flex: 1 }} />
        <SyncButton initialLastSyncedAt={data.lastSyncedAt} />

        {/* Dark mode toggle */}
        <button
          onClick={() => setDark(d => !d)}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          style={{ width: 36, height: 20, borderRadius: 10, background: dark ? "#2563EB" : T.border, position: "relative", flexShrink: 0, cursor: "pointer", margin: "0 8px", border: "none", padding: 0, transition: "background 0.2s" }}
        >
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: dark ? 19 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.28)" }} />
        </button>

        {/* Avatar */}
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#2563EB,#7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 700, flexShrink: 0, boxShadow: "0 1px 4px rgba(37,99,235,0.3)" }}>A</div>
      </header>

      <div style={{ display: "flex", height: "calc(100vh - " + navH + "px)" }}>
        {/* Left rail sidebar */}
        {showRail && (
          <nav style={{ width: isTablet ? 178 : 220, background: T.navBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRight: "1px solid " + T.border, flexShrink: 0, overflowY: "auto", padding: "14px 8px" }}>
            <div style={{ padding: "0 10px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textFaint }}>Modules</div>
            {data.modules.filter(m => m.sync_enabled).map(m => {
              const isActive = view === m.code;
              const mc = colorForModule(m.code);
              return (
                <div key={m.id} className="sdx-rail-item" onClick={() => setView(m.code)} style={{ padding: "9px 10px", background: isActive ? mc + "12" : "transparent", borderLeft: isActive ? "2.5px solid " + mc : "2.5px solid transparent", marginLeft: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? mc : T.textMuted, letterSpacing: "0.01em" }}>{m.code}</div>
                  {!isTablet && <div style={{ fontSize: 11, color: T.textFaint, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>}
                </div>
              );
            })}
            <button className="sdx-rail-item" onClick={() => setView("manage")} style={{ width: "100%", marginTop: 8, padding: "9px 10px", background: "transparent", border: "1px dashed " + T.border, textAlign: "center", fontSize: 12, color: T.textFaint, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Manage modules
            </button>
          </nav>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: isMobile ? 70 : 0 }}>
          {view === "home" && <HomeView T={T} data={data} taskStatus={taskStatus} seenChanges={seenChanges} onToggleTask={toggleTask} onMarkSeen={markSeen} onViewModule={setView} dark={dark} isMobile={isMobile} isTablet={isTablet} />}
          {view === "nusmods" && <NUSModsView T={T} isMobile={isMobile} modules={data.modules} />}
          {view === "planner" && <PlannerView T={T} dark={dark} isMobile={isMobile} />}
          {view === "manage" && <ManageView T={T} modules={data.modules} onToggleSync={toggleSync} isMobile={isMobile} />}
          {activeMod && <ModuleView T={T} mod={activeMod} tasks={data.tasks.filter(t => t.moduleCode === activeMod.code)} taskStatus={taskStatus} onToggleTask={toggleTask} dark={dark} isMobile={isMobile} onBack={() => setView("home")} />}
        </div>
      </div>

      {isMobile && <BottomNav T={T} view={view} setView={setView} />}
    </div>
  );
}
