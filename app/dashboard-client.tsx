"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { SyncButton } from "@/app/ui/sync-button";
import type { DashboardData, WeeklyTask, AnnouncementSummary, ModuleSummary } from "@/lib/dashboard";

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
function colorForModule(code: string) {
  const colors: Record<string, string> = {
    CS3235: "#E8480C",
    IS4233: "#D97706",
    IS4231: "#059669",
    TRA3203: "#7C3AED",
    GEX1015: "#0891B2",
  };
  return colors[code] || "#6366F1";
}

function getDaysLeft(dueDate?: string | null) {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function renderMsg(text: string) {
  return text.split(/\*\*(.*?)\*\*/g).map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p);
}

// --- STATIC FALLBACK DATA (from v8.1) ---
const STATIC_MODULE_DETAILS: Record<string, any> = {
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

const MODULE_FILES: Record<string, any[]> = {
  CS3235: [
    { name: "Lecture 9 – Format String Attacks.pdf", type: "pdf", category: "Lecture", week: 9, size: "3.2 MB", uploaded: "Today", summary: "Covers %n format string primitive for arbitrary writes, positional argument syntax, printf stack layout, and GOT entry overwrite." },
    { name: "HW3 – Buffer Overflow Lab.pdf", type: "pdf", category: "Assignment", week: 9, size: "512 KB", uploaded: "3 days ago", summary: "Exploit a format string vulnerability to overwrite a GOT entry and redirect to win(). Submit exploit.py via Canvas." },
  ],
  IS4233: [
    { name: "Week 9 – Data Protection Frameworks.pdf", type: "pdf", category: "Lecture", week: 9, size: "2.6 MB", uploaded: "Yesterday", summary: "Comparative analysis of GDPR Article 6, Singapore PDPA, and China PIPL." },
  ]
};

const QUIZ_BANK: Record<string, any[]> = {
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

const ALL_TREE_MODS = ACADEMIC_TREE.flatMap(y => y.semesters.flatMap(s => s.modules.map(m => ({ ...m, year: y.year, sem: s.sem }))));
const GRADE_POINTS: Record<string, number> = { "A+": 5.0, "A": 5.0, "A-": 4.5, "B+": 4.0, "B": 3.5, "B-": 3.0, "C+": 2.5, "C": 2.0 };
const GPA = "4.25";

// --- THEMES ---
const LIGHT = {
  bg: "#F7F6F3", surface: "#FFFFFF", border: "#E8E5E0", borderLight: "#F0EDE8",
  text: "#1C1917", textMuted: "#78716C", textFaint: "#A8A29E",
  navBg: "#FFFFFF", inputBg: "#FFFFFF", inputBorder: "#D6D3CD",
  hoverBg: "#F0EDE8", activeBg: "#EFEDE8",
  termBg: "#FAFAF9", termUserBg: "#1C1917", termUserText: "#FFFFFF",
  termAiBg: "#EEEDEA", termAiText: "#1C1917", bottomNav: "#FFFFFF",
  todayBg: "#EFF6FF", calGrid: "#F4F3F0",
};
const DARK = {
  bg: "#0F0F0F", surface: "#1A1A1A", border: "#2A2A2A", borderLight: "#222222",
  text: "#EFEFEF", textMuted: "#888880", textFaint: "#555550",
  navBg: "#141414", inputBg: "#1A1A1A", inputBorder: "#333",
  hoverBg: "#242424", activeBg: "#2A2A2A",
  termBg: "#111111", termUserBg: "#EFEFEF", termUserText: "#111111",
  termAiBg: "#222222", termAiText: "#EFEFEF", bottomNav: "#141414",
  todayBg: "#0D1829", calGrid: "#141414",
};

// --- SHARED UI COMPONENTS ---
function Badge({ color, children }: { color: string, children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color, background: color + "18", border: "1px solid " + color + "28", borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>
      {children}
    </span>
  );
}

function BottomNav({ T, view, setView }: { T: any, view: string, setView: (v: string) => void }) {
  const tabs = [
    { key: "home", icon: "⌂", label: "Home" },
    { key: "nusmods", icon: "📅", label: "NUSMods" },
    { key: "planner", icon: "◉", label: "Planner" },
    { key: "manage", icon: "⚙", label: "Manage" }
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 60, background: T.bottomNav, borderTop: "1px solid " + T.border, display: "flex", zIndex: 400 }}>
      {tabs.map(t => {
        const isActive = view === t.key;
        return (
          <div key={t.key} onClick={() => setView(t.key)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 2 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 400, color: isActive ? "#3B82F6" : T.textFaint }}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function DayBadge({ daysLeft }: { daysLeft: number }) {
  if (daysLeft < 0) return null;
  const c = daysLeft <= 2 ? "#DC2626" : daysLeft <= 7 ? "#D97706" : "#6B7280";
  const hasBg = daysLeft <= 7;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: c, background: hasBg ? c + "15" : "transparent", borderRadius: 3, padding: hasBg ? "1px 6px" : 0, flexShrink: 0 }}>
      {daysLeft <= 2 ? daysLeft + "d left" : daysLeft + "d"}
    </span>
  );
}

function Chk({ done, color, onToggle, size = 16 }: { done: boolean, color: string, onToggle: () => void, size?: number }) {
  return (
    <div onClick={e => { e.stopPropagation(); onToggle(); }} style={{ width: size, height: size, borderRadius: "50%", border: "1.5px solid " + (done ? color : "#D6D3CD"), background: done ? color : "transparent", flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
      {done && <svg width="8" height="6" viewBox="0 0 8 6" fill="none" style={{ margin: "auto" }}><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  );
}

function Card({ T, title, children, badge, badgeColor, maxH }: { T: any, title: string, children: React.ReactNode, badge?: string, badgeColor?: string, maxH?: number | string }) {
  return (
    <div style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid " + T.borderLight, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</span>
        {badge && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: badgeColor, background: badgeColor + "18", borderRadius: 10, padding: "1px 8px" }}>{badge}</span>}
      </div>
      <div style={{ overflowY: maxH ? "auto" : "visible", maxHeight: maxH || "none" }}>
        {children}
      </div>
    </div>
  );
}

function Empty({ T, text }: { T: any, text: string }) {
  return <div style={{ padding: "20px 16px", fontSize: 13, color: T.textFaint, textAlign: "center" }}>{text}</div>;
}

function AISidebar({ T, dark, isMobile, userId }: { T: any, dark: boolean, isMobile: boolean, userId: string | null }) {
  const [msgs, setMsgs] = useState([{ role: "ai", text: "What's on your plate? Ask me about deadlines, exams, or any module." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading || !userId) return;
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
      setMsgs(m => [...m, { role: "ai", text: payload.answer || "No answer returned." }]);
    } catch (err) {
      setMsgs(m => [...m, { role: "ai", text: "Sorry, I encountered an error." }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = ["What's due this week?", "Exam schedule", "HW3 details", "Weightings"];

  return (
    <div style={{ display: "flex", flexDirection: "column", background: T.surface, border: "1px solid " + T.border, borderRadius: 10, overflow: "hidden", flexShrink: 0, width: isMobile ? "100%" : 270 }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid " + T.borderLight, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Ask Studex</div>
          <div style={{ fontSize: 11, color: T.textFaint, marginTop: 1 }}>AI assistant</div>
        </div>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✦</div>
      </div>
      <div style={{ overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, background: T.termBg }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "90%", padding: "7px 11px", borderRadius: m.role === "user" ? "11px 11px 3px 11px" : "11px 11px 11px 3px", background: m.role === "user" ? T.termUserBg : T.termAiBg, color: m.role === "user" ? T.termUserText : T.termAiText, fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {renderMsg(m.text)}
            </div>
          </div>
        ))}
        {loading && <div style={{ display: "flex" }}><div style={{ padding: "7px 11px", borderRadius: "11px 11px 11px 3px", background: T.termAiBg, color: T.textFaint, letterSpacing: 3 }}>···</div></div>}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "6px 10px", display: "flex", gap: 5, overflowX: "auto", borderBottom: "1px solid " + T.borderLight }}>
        {suggestions.map(s => (
          <button key={s} onClick={() => setInput(s)} style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 10, border: "1px solid " + T.border, background: "transparent", color: T.textMuted, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
            {s}
          </button>
        ))}
      </div>
      <div style={{ padding: "8px 10px", display: "flex", gap: 7 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask anything…" style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: "1px solid " + T.inputBorder, background: T.inputBg, color: T.text, fontSize: 12.5 }} />
        <button onClick={send} style={{ padding: "7px 12px", borderRadius: 7, border: "none", background: dark ? "#EFEFEF" : "#1C1917", color: dark ? "#111" : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>→</button>
      </div>
    </div>
  );
}

// --- HOME VIEW ---
function HomeView({ T, data, taskStatus, seenChanges, onToggleTask, onMarkSeen, dark, isMobile, isTablet }: { T: any, data: DashboardData, taskStatus: any, seenChanges: any, onToggleTask: any, onMarkSeen: any, dark: boolean, isMobile: boolean, isTablet: boolean }) {
  const upcomingTasks = data.tasks.filter(t => !taskStatus[t.id]);
  const unseenChanges = data.announcements.filter(c => !seenChanges[c.id]);
  const enabledModules = data.modules.filter(m => m.sync_enabled);

  return (
    <div style={{ padding: isMobile ? "14px" : "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 12, flexDirection: isMobile ? "column" : "row" }}>
        <div>
          <h1 style={{ fontFamily: "'Lora',serif", fontWeight: 400, fontSize: 22, color: T.text, letterSpacing: "-0.2px" }}>Good afternoon, Aiden.</h1>
          <p style={{ fontSize: 12, color: T.textFaint, marginTop: 2 }}>Tuesday, 10 March 2026 · Week 9 · AY2025/26 Sem 2</p>
        </div>
      </div>

      {data.modules.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", background: T.surface, border: "1px solid " + T.border, borderRadius: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>🚀</div>
          <h2 style={{ fontFamily: "'Lora',serif", fontSize: 24, marginBottom: 10 }}>Ready to start your semester?</h2>
          <p style={{ color: T.textMuted, marginBottom: 30, maxWidth: 500, margin: "0 auto 30px" }}>Click the <strong>Sync Canvas</strong> button to pull your enrolled modules from Canvas. You can then choose which ones to sync.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 240px" : "1fr 270px", gap: 16, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card T={T} title="Syncing Modules" badge={enabledModules.length + " enabled"} badgeColor="#3B82F6">
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 10, padding: 14 }}>
                {enabledModules.length === 0 && <div style={{ gridColumn: "1/-1", color: T.textMuted, fontSize: 13, padding: 10 }}>No modules enabled for sync. Go to Manage to enable them.</div>}
                {enabledModules.map(m => (
                  <div key={m.id} style={{ padding: "12px 14px", background: T.surface, border: "1px solid " + T.border, borderRadius: 8, borderLeft: "4px solid " + colorForModule(m.code) }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: colorForModule(m.code) }}>{m.code}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.text, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Badge color={T.textMuted}>{m.taskCount} tasks</Badge>
                      <Badge color={T.textMuted}>{m.announcementCount} updates</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card T={T} title="Recent Announcements">
              {unseenChanges.length === 0 && <Empty T={T} text="No new updates." />}
              {unseenChanges.map((c, i) => (
                <div key={c.id} onClick={() => onMarkSeen(c.id)} style={{ padding: "12px 14px", borderBottom: i < unseenChanges.length - 1 ? "1px solid " + T.borderLight : "none", cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: colorForModule(c.moduleCode) }}>{c.moduleCode}</span>
                    <span style={{ fontSize: 9, color: T.textFaint }}>{c.postedLabel}</span>
                    {c.importance === "high" && <Badge color="#DC2626">High</Badge>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{c.summary}</div>
                </div>
              ))}
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <AISidebar T={T} dark={dark} isMobile={isMobile} userId={data.userId} />            <Card T={T} title="Upcoming Tasks" maxH={400}>
              {upcomingTasks.length === 0 && <Empty T={T} text="All clear!" />}
              {upcomingTasks.map((t, i) => (
                <div key={t.id} style={{ padding: "9px 14px", borderBottom: i < upcomingTasks.length - 1 ? "1px solid " + T.borderLight : "none", display: "flex", alignItems: "center", gap: 9 }}>
                  <Chk done={false} color={colorForModule(t.moduleCode)} onToggle={() => onToggleTask(t.id)} size={14} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                    <div style={{ fontSize: 10.5, color: colorForModule(t.moduleCode), fontWeight: 600, marginTop: 1 }}>{t.moduleCode} · {t.dueLabel}</div>
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
function ManageView({ T, modules, onToggleSync, isMobile }: { T: any, modules: ModuleSummary[], onToggleSync: (moduleId: string, enabled: boolean) => void, isMobile: boolean }) {
  return (
    <div style={{ padding: isMobile ? "16px 14px" : "24px 32px", maxWidth: 800, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: 24, color: T.text, marginBottom: 8 }}>Module Management</h2>
      <p style={{ color: T.textMuted, fontSize: 14, marginBottom: 24 }}>Choose which modules should be synchronized with Canvas. Disabling old modules saves time and AI tokens.</p>
      
      <div style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
        {modules.length === 0 && <Empty T={T} text="No modules discovered. Click 'Sync Canvas' in the top right." />}
        {modules.map((m, i) => (
          <div key={m.id} style={{ padding: "16px 20px", borderBottom: i < modules.length - 1 ? "1px solid " + T.borderLight : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: colorForModule(m.code) }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{m.code}</span>
              </div>
              <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>{m.title}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: m.sync_enabled ? "#059669" : T.textFaint }}>
                {m.sync_enabled ? "Sync ON" : "Sync OFF"}
              </span>
              <div 
                onClick={() => onToggleSync(m.id, !m.sync_enabled)}
                style={{ width: 44, height: 22, borderRadius: 11, background: m.sync_enabled ? "#3B82F6" : T.border, position: "relative", cursor: "pointer", transition: "background 0.2s" }}
              >
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: m.sync_enabled ? 25 : 3, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- NUSMODS VIEW ---
function NUSModsView({ T, isMobile, modules }: { T: any, isMobile: boolean, modules: ModuleSummary[] }) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const slots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

  const allLessons = modules.flatMap(m => {
    const lessons = m.nusmods?.lessons || STATIC_MODULE_DETAILS[m.code]?.nusmods?.lessons || [];
    return lessons.map((l: any) => ({ ...l, mod: { ...m, color: colorForModule(m.code) } }));
  });

  const getLesson = (day: string, time: string) => allLessons.find(l => l.day === day && l.time.startsWith(time));

  return (
    <div style={{ padding: isMobile ? "16px 14px" : "24px 32px", maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: isMobile ? 20 : 22, color: T.text }}>NUSMods</h2>
        <p style={{ fontSize: 12, color: T.textFaint, marginTop: 2 }}>AY2025/26 Semester 2</p>
      </div>
      <div style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 8, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid " + T.borderLight }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Weekly Timetable</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 500 : 640 }}>
            <thead>
              <tr>
                <th style={{ padding: "8px 10px", fontSize: 9, fontWeight: 700, color: T.textFaint, textAlign: "left", width: 48, borderBottom: "1px solid " + T.borderLight }}>Time</th>
                {days.map(d => (
                  <th key={d} style={{ padding: "8px 8px", fontSize: isMobile ? 10 : 11, fontWeight: 700, color: T.text, textAlign: "left", borderBottom: "1px solid " + T.borderLight, borderLeft: "1px solid " + T.borderLight }}>
                    {isMobile ? d.slice(0, 3) : d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot, si) => (
                <tr key={slot}>
                  <td style={{ padding: "5px 10px", fontSize: 9, color: T.textFaint, verticalAlign: "top", borderBottom: si < slots.length - 1 ? "1px solid " + T.borderLight : "none", whiteSpace: "nowrap" }}>{slot}</td>
                  {days.map(d => {
                    const lesson = getLesson(d, slot);
                    return (
                      <td key={d} style={{ padding: "3px 4px", borderBottom: si < slots.length - 1 ? "1px solid " + T.borderLight : "none", borderLeft: "1px solid " + T.borderLight, verticalAlign: "top", minWidth: isMobile ? 78 : 110 }}>
                        {lesson && (
                          <div style={{ background: lesson.mod.color + "18", borderLeft: "3px solid " + lesson.mod.color, borderRadius: "0 4px 4px 0", padding: "4px 6px" }}>
                            <div style={{ fontSize: isMobile ? 9 : 11, fontWeight: 700, color: lesson.mod.color }}>{lesson.mod.code}</div>
                            <div style={{ fontSize: 9, color: T.textMuted }}>{lesson.type}</div>
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
      <div style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid " + T.borderLight }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Exam Schedule</span>
        </div>
        {modules.map((m, i) => {
          const exam = m.nusmods?.exam || STATIC_MODULE_DETAILS[m.code]?.nusmods?.exam;
          if (!exam) return null;
          return (
            <div key={m.code} style={{ padding: isMobile ? "12px 14px" : "12px 16px", borderBottom: i < modules.length - 1 ? "1px solid " + T.borderLight : "none", display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: colorForModule(m.code), flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: colorForModule(m.code), width: isMobile ? "auto" : 72 }}>{m.code}</span>
                {isMobile && <span style={{ fontSize: 12, color: T.textMuted }}>{m.title}</span>}
              </div>
              {!isMobile && <div style={{ flex: 1, fontSize: 13, color: T.text }}>{m.title}</div>}
              <div style={{ textAlign: isMobile ? "left" : "right" }}>
                {exam.date === "No Exam" ? (
                  <span style={{ fontSize: 12, color: T.textFaint }}>No exam · {exam.venue}</span>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{exam.date}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{exam.time} · {exam.venue} · {exam.duration}</div>
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
function PlannerDetail({ T, mod, dark, isMobile, onClose }: { T: any, mod: any, dark: boolean, isMobile?: boolean, onClose: () => void }) {
  const sc = mod.status === "done" ? "#059669" : mod.status === "current" ? mod.color : "#6366F1";
  const sl = mod.status === "done" ? "Completed" : mod.status === "current" ? "In progress" : "AI Recommended";
  return (
    <div style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 10, overflow: "hidden", width: isMobile ? "100%" : 270, flexShrink: 0, position: isMobile ? "relative" : "sticky", top: isMobile ? "auto" : 16 }}>
      <div style={{ height: 4, background: sc }} />
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: sc }}>{mod.code}</div>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 15, fontWeight: 600, color: T.text, marginTop: 2, lineHeight: 1.3 }}>{mod.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.textFaint, fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: sc + "18", color: sc, border: "1px solid " + sc + "30" }}>{sl}</span>
          <span style={{ fontSize: 10, color: T.textFaint, padding: "2px 8px", background: T.borderLight, borderRadius: 10 }}>{mod.mc} MCs · Y{mod.year} S{mod.sem}</span>
        </div>
      </div>
      {mod.aiReason && (
        <div style={{ margin: "0 16px 14px", padding: "12px", background: dark ? "#16163A" : "#EEF2FF", borderRadius: 7, border: "1px solid #6366F125" }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#6366F1", marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>Why Studex recommends this</div>
          <p style={{ fontSize: 12.5, color: T.text, lineHeight: 1.7 }}>{mod.aiReason}</p>
        </div>
      )}
    </div>
  );
}

function PlannerView({ T, dark, isMobile }: { T: any, dark: boolean, isMobile: boolean }) {
  const [selected, setSelected] = useState<any>(null);
  const getCardStyle = (status: string, color: string) => {
    if (status === "done") return { bg: color + "15", borderColor: color + "50", textCol: color, dashed: false };
    if (status === "current") return { bg: color + "22", borderColor: color, textCol: color, dashed: false, glow: true };
    if (status === "recommended") return { bg: dark ? "#16163A" : "#EEF2FF", borderColor: "#6366F160", textCol: "#6366F1", dashed: true };
    return { bg: "transparent", borderColor: "#ccc", textCol: "#aaa" };
  };

  return (
    <div style={{ padding: isMobile ? "14px" : "24px 28px" }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: isMobile ? 20 : 22, color: T.text }}>Academic Planner</h2>
        <p style={{ fontSize: 12, color: T.textFaint, marginTop: 3 }}>Y1–Y3 completed · Y4 AI-recommended</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
        {[{ label: "Completed MCs", value: 48, color: "#059669" }, { label: "In Progress", value: "20 MCs", color: "#E8480C" }, { label: "Current GPA", value: "4.25", color: "#3B82F6" }, { label: "Recommended", value: "16 MCs", color: "#6366F1" }].map(s => (
          <div key={s.label} style={{ background: T.surface, border: "1px solid " + T.border, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 700, color: s.color, fontFamily: "'Lora',serif", lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <div style={{ flex: 1, overflowX: "auto", paddingBottom: 12 }}>
          <div style={{ display: "flex", gap: 20 }}>
            {ACADEMIC_TREE.map(yr => (
              <div key={yr.year}>
                <div style={{ textAlign: "center", padding: "5px 8px", borderRadius: 6, background: T.surface, border: "1px solid " + T.border, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>{yr.label}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {yr.semesters.map(sem => (
                    <div key={sem.sem} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {sem.modules.map(mod => {
                        const s = getCardStyle(mod.status, mod.color);
                        return (
                          <div key={mod.code} onClick={() => setSelected(mod)} style={{ background: s.bg, border: "1.5px " + (s.dashed ? "dashed" : "solid") + " " + s.borderColor, borderRadius: 8, padding: "8px 10px", cursor: "pointer", minWidth: 140 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: s.textCol }}>{mod.code}</div>
                            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{mod.name}</div>
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
          <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setSelected(null)}>
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
function ModuleView({ T, mod, tasks, taskStatus, onToggleTask, dark, isMobile, isTablet, onBack }: { T: any, mod: ModuleSummary, tasks: WeeklyTask[], taskStatus: any, onToggleTask: any, dark: boolean, isMobile: boolean, isTablet: boolean, onBack: () => void }) {
  const [tab, setTab] = useState("overview");
  const staticDetails = STATIC_MODULE_DETAILS[mod.code] || { lecturer: "Unknown", week_topic: "TBA", week_summary: "No summary available.", weights: [], nusmods: { mc: 4, lessons: [], exam: { date: "TBA", time: "", venue: "", duration: "" } } };
  const details = { ...staticDetails, nusmods: mod.nusmods || staticDetails.nusmods };

  return (
    <div style={{ padding: isMobile ? "14px" : "24px 32px", maxWidth: 900, margin: "0 auto" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: T.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>‹ Back</button>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: colorForModule(mod.code) }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: colorForModule(mod.code) }}>{mod.code}</span>
            </div>
            <h2 style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: isMobile ? 18 : 20, color: T.text }}>{mod.title}</h2>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{details.lecturer} · {details.week_topic}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid " + T.border, marginBottom: 20, overflowX: "auto" }}>
        {["overview", "files", "quiz"].map(key => (
          <div key={key} onClick={() => setTab(key)} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 500, color: tab === key ? T.text : T.textMuted, borderBottom: tab === key ? "2px solid " + colorForModule(mod.code) : "2px solid transparent", marginBottom: -1, cursor: "pointer", textTransform: "capitalize", whiteSpace: "nowrap" }}>{key}</div>
        ))}
      </div>
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.2fr", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card T={T} title="This Week">
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colorForModule(mod.code), marginBottom: 8 }}>{details.week_topic}</div>
                <p style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>{details.week_summary}</p>
              </div>
            </Card>
            <Card T={T} title="Module Info">
              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
                  <span style={{ color: T.textMuted }}>Faculty</span>
                  <span style={{ fontWeight: 500, color: T.text }}>{details.nusmods.faculty}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: T.textMuted }}>Credits</span>
                  <span style={{ fontWeight: 500, color: T.text }}>{details.nusmods.mc} MCs</span>
                </div>
              </div>
            </Card>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card T={T} title="Assessment & Exam">
              <div style={{ padding: 14 }}>
                {details.weights.map((w: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                    <span>{w.component}</span>
                    <span style={{ fontWeight: 700 }}>{w.weight}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + T.borderLight }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, marginBottom: 8, textTransform: "uppercase" }}>Final Exam</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: T.textMuted }}>Date</span>
                    <span style={{ fontWeight: 600, color: T.text }}>{details.nusmods.exam.date}</span>
                  </div>
                  {details.nusmods.exam.time !== "—" && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: T.textMuted }}>Time</span>
                      <span style={{ color: T.text }}>{details.nusmods.exam.time} ({details.nusmods.exam.duration})</span>
                    </div>
                  )}
                  {details.nusmods.exam.venue !== "—" && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
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
      {tab === "files" && <FilesTab T={T} mod={mod} dark={dark} isMobile={isMobile} />}
      {tab === "quiz" && <QuizTab T={T} mod={mod} isMobile={isMobile} />}
    </div>
  );
}

function FilesTab({ T, mod, dark, isMobile }: { T: any, mod: ModuleSummary, dark: boolean, isMobile: boolean }) {
  const files = mod.files || [];
  const fileColor = (type: string) => ({ pdf: "#DC2626", zip: "#D97706", xlsx: "#059669" })[type] || "#6B7280";
  return (
    <Card T={T} title="Module Files">
      {files.length === 0 && <Empty T={T} text="No files available." />}
      {files.map((f, i) => (
        <div key={f.name} style={{ padding: "10px 14px", borderBottom: i < files.length - 1 ? "1px solid " + T.borderLight : "none", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, background: fileColor(f.type) + "15", border: "1px solid " + fileColor(f.type) + "25", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 8, fontWeight: 800, color: fileColor(f.type) }}>{f.type.toUpperCase()}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
            <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 2 }}>{f.category} · {f.sizeLabel}</div>
          </div>
          <span style={{ fontSize: 16, color: T.textFaint }}>↗</span>
        </div>
      ))}
    </Card>
  );
}

function QuizTab({ T, mod, isMobile }: { T: any, mod: any, isMobile: boolean }) {
  const questions = QUIZ_BANK[mod.code] || [];
  return (
    <Card T={T} title="Quick Quiz">
      {questions.length === 0 && <Empty T={T} text="No quiz questions available for this module." />}
      {questions.map((q, i) => (
        <div key={i} style={{ padding: 14, borderBottom: i < questions.length - 1 ? "1px solid " + T.borderLight : "none" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 10 }}>{q.q}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {q.options.map((opt: string, j: number) => (
              <div key={j} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid " + T.border, fontSize: 12, cursor: "pointer" }}>{opt}</div>
            ))}
          </div>
        </div>
      ))}
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
    } catch (err) {
      setData(prev => ({ ...prev, modules: prevModules }));
    }
  };

  const activeMod = data.modules.find(m => m.code === view);
  const showRail = !isMobile && (view === "home" || !!activeMod || view === "nusmods" || view === "planner" || view === "manage");

  return (
    <div style={{ fontFamily: "'Outfit','Helvetica Neue',sans-serif", background: T.bg, minHeight: "100vh", color: T.text, transition: "background 0.2s,color 0.2s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#88888840; border-radius:3px; }
      `}</style>

      {/* TOP NAV */}
      <div style={{ height: isMobile ? 48 : 50, background: T.navBg, borderBottom: "1px solid " + T.border, display: "flex", alignItems: "center", padding: isMobile ? "0 14px" : "0 20px", gap: 4, position: "sticky", top: 0, zIndex: 300 }}>
        <div onClick={() => setView("home")} style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: isMobile ? 15 : 16, color: T.text, cursor: "pointer", marginRight: isMobile ? 0 : 8, userSelect: "none" }}>Studex</div>
        {!isMobile && (
          <>
            <div style={{ width: 1, height: 16, background: T.border, margin: "0 4px" }} />
            {["home", "nusmods", "planner", "manage"].map(key => (
              <button key={key} onClick={() => setView(key)} style={{ padding: "4px 12px", borderRadius: 5, border: "none", fontSize: 12.5, fontWeight: 500, cursor: "pointer", background: view === key ? T.activeBg : "transparent", color: view === key ? T.text : T.textMuted, fontFamily: "inherit", textTransform: "capitalize" }}>
                {key}
              </button>
            ))}
          </>
        )}
        <div style={{ flex: 1 }} />
        <SyncButton initialLastSyncedAt={data.lastSyncedAt} />
        <div onClick={() => setDark(d => !d)} style={{ width: 32, height: 18, borderRadius: 9, background: dark ? "#3B82F6" : T.border, position: "relative", flexShrink: 0, cursor: "pointer", margin: "0 8px" }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: dark ? 17 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
        </div>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#3B82F6,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700, flexShrink: 0 }}><span style={{ margin: "auto" }}>A</span></div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - " + (isMobile ? 48 : 50) + "px)" }}>
        {showRail && (
          <div style={{ width: isTablet ? 170 : 210, background: T.navBg, borderRight: "1px solid " + T.border, flexShrink: 0, overflowY: "auto", padding: "12px 0" }}>
            <div style={{ padding: "0 12px 6px", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textFaint }}>Modules</div>
            {data.modules.filter(m => m.sync_enabled).map(m => {
              const isActive = view === m.code;
              return (
                <div key={m.id} onClick={() => setView(m.code)} style={{ padding: "8px 12px", margin: "1px 6px", borderRadius: 6, cursor: "pointer", background: isActive ? colorForModule(m.code) + "15" : "transparent", borderLeft: "3px solid " + (isActive ? colorForModule(m.code) : "transparent") }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? colorForModule(m.code) : T.textMuted }}>{m.code}</div>
                  {!isTablet && <div style={{ fontSize: 10, color: T.textFaint, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>}
                </div>
              );
            })}
            <div onClick={() => setView("manage")} style={{ padding: "8px 12px", margin: "12px 6px", borderRadius: 6, cursor: "pointer", border: "1px dashed " + T.border, textAlign: "center", fontSize: 11, color: T.textMuted }}>
              + Manage Modules
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: isMobile ? 60 : 0 }}>
          {view === "home" && <HomeView T={T} data={data} taskStatus={taskStatus} seenChanges={seenChanges} onToggleTask={toggleTask} onMarkSeen={markSeen} dark={dark} isMobile={isMobile} isTablet={isTablet} />}
          {view === "nusmods" && <NUSModsView T={T} isMobile={isMobile} modules={data.modules} />}
          {view === "planner" && <PlannerView T={T} dark={dark} isMobile={isMobile} />}
          {view === "manage" && <ManageView T={T} modules={data.modules} onToggleSync={toggleSync} isMobile={isMobile} />}
          {activeMod && <ModuleView T={T} mod={activeMod} tasks={data.tasks.filter(t => t.moduleCode === activeMod.code)} taskStatus={taskStatus} onToggleTask={toggleTask} dark={dark} isMobile={isMobile} isTablet={isTablet} onBack={() => setView("home")} />}
        </div>
      </div>
      {isMobile && <BottomNav T={T} view={view} setView={setView} />}
    </div>
  );
}
