import type { NUSModsData, NUSModsExam } from "@/lib/nusmods";

// Sync pipeline contracts (unchanged from Phase B)
export type SyncStage = "discovery" | "module" | "announcement" | "task" | "file" | "finalizing";
export type SyncStatus = "started" | "progress" | "complete" | "error";

export type SyncCounts = {
  modules: number;
  announcements: number;
  tasks: number;
  files: number;
};

export type SyncEvent = {
  status: SyncStatus;
  stage: SyncStage;
  message: string;
  counts?: Partial<SyncCounts>;
  moduleCode?: string;
};

// Dashboard data contracts (absorbed from lib/dashboard.ts)
export type FilePreviewKind = "pdf" | "image" | "text" | "office" | "binary";

export type CanvasFileSummary = {
  id: string;
  name: string;
  type: string;
  category: string;
  uploadedLabel: string;
  uploadedAt: string | null;
  summary: string;
  canvasUrl: string | null;
  extractedText: string | null;
  previewKind: FilePreviewKind;
  contentType: string | null;
};

export type WeeklyTask = {
  id: string;
  title: string;
  moduleCode: string;
  dueLabel: string;
  dueDate?: string | null;
  status: "due-soon" | "upcoming" | "no-date";
  source: string;
};

export type AnnouncementSummary = {
  id: string;
  title: string;
  moduleCode: string;
  summary: string;
  postedLabel: string;
  postedAt: string | null;
  importance: "high" | "normal" | "low";
};

export type DashboardChange = {
  id: string;
  kind: "announcement" | "file";
  moduleCode: string;
  title: string;
  summary: string;
  happenedAt: string | null;
  happenedLabel: string;
  importance: "high" | "normal" | "low";
  file: CanvasFileSummary | null;
};

export type DashboardOverview = {
  syncedModuleCount: number;
  openTaskCount: number;
  recentChangeCount: number;
  fileCount: number;
  dueSoonCount: number;
  lastSyncedLabel: string;
};

export type ModuleSummary = {
  id: string;
  code: string;
  title: string;
  taskCount: number;
  announcementCount: number;
  lastSyncLabel: string;
  sync_enabled: boolean;
  files: CanvasFileSummary[];
  nextTask: WeeklyTask | null;
  latestAnnouncement: AnnouncementSummary | null;
  recentFile: CanvasFileSummary | null;
  examSummary: NUSModsExam | null;
  nusmods?: NUSModsData | null;
};

export type GradeSummary = {
  id: string;
  moduleCode: string;
  assignmentTitle: string;
  score: number | null;
  gradeText: string | null;
  pointsPossible: number | null;
  state: "submitted" | "graded" | "missing" | "unsubmitted" | null;
  gradedAt: string | null;
  gradedLabel: string;
  canvasUrl: string | null;
};

export type CourseProgressSummary = {
  courseId: string;
  moduleCode: string;
  courseTitle: string;
  totalModules: number;
  currentModulePosition: number | null;
  currentModuleName: string | null;
  nextItemTitle: string | null;
};

export type DashboardData = {
  overview: DashboardOverview;
  modules: ModuleSummary[];
  tasks: WeeklyTask[];
  announcements: AnnouncementSummary[];
  recentFiles: Array<CanvasFileSummary & { moduleCode: string; moduleTitle: string }>;
  latestChanges: DashboardChange[];
  recentGrades: GradeSummary[];
  courseProgress: CourseProgressSummary[];
  source: "live" | "fallback";
  status: "ready" | "needs-setup" | "error";
  setupMessage: string;
  userId: string | null;
  lastSyncedAt: string | null;
};
