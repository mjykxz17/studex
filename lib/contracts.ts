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
  canvasFileId: string | null;  // used by module-tree to map module-item content_ref → local file
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
  sourceRefId: string | null;  // Canvas assignment id; module tree uses to dispatch Assignment items
  hasDescription: boolean;     // UI uses this to decide whether to show the "details" button
};

export type AnnouncementSummary = {
  id: string;
  title: string;
  moduleCode: string;
  summary: string;
  bodyHtml: string;            // sanitized body for in-app rendering
  postedLabel: string;
  postedAt: string | null;
  importance: "high" | "normal" | "low";
};

export type CanvasPageSummary = {
  id: string;
  pageUrl: string;
  title: string;
  updatedAt: string | null;
  updatedLabel: string;
};

export type CourseModuleItemSummary = {
  id: string;
  title: string;
  itemType: string;        // 'Page' | 'File' | 'Assignment' | 'ExternalUrl' | 'SubHeader' | 'Discussion' | ...
  position: number | null;
  contentRef: string | null;   // canvas_file_id, page_url, or assignment_id depending on itemType
  externalUrl: string | null;
  indent: number | null;
};

export type CourseModuleSummary = {
  id: string;
  name: string;
  position: number | null;
  state: string | null;
  itemsCount: number | null;
  items: CourseModuleItemSummary[];
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
  pages: CanvasPageSummary[];          // ADDED
  courseModules: CourseModuleSummary[]; // ADDED
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
