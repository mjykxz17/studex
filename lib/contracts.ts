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

