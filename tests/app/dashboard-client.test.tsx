import { fireEvent, render, screen, within } from "@testing-library/react";

import DashboardClient from "@/app/dashboard-client";
import type { DashboardData } from "@/lib/contracts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

const baseOverview = {
  syncedModuleCount: 0,
  openTaskCount: 0,
  recentChangeCount: 0,
  fileCount: 0,
  dueSoonCount: 0,
  lastSyncedLabel: "Awaiting sync",
};

const beforeSync: DashboardData = {
  overview: baseOverview,
  modules: [],
  tasks: [],
  announcements: [],
  recentFiles: [],
  latestChanges: [],
  recentGrades: [],
  courseProgress: [],
  source: "fallback",
  status: "needs-setup",
  setupMessage: "Run sync first.",
  userId: "user-1",
  lastSyncedAt: null,
};

const previewFile = {
  id: "file-1",
  name: "lecture-01.pdf",
  type: "lecture",
  category: "lecture",
  uploadedLabel: "Today",
  uploadedAt: "2026-03-13T13:30:00.000Z",
  summary: "- Week 1 notes",
  canvasUrl: "https://canvas.example/files/1",
  canvasFileId: null,
  extractedText: "Week 1 notes",
  previewKind: "pdf" as const,
  contentType: "application/pdf",
};

const afterSync: DashboardData = {
  overview: {
    syncedModuleCount: 1,
    openTaskCount: 2,
    recentChangeCount: 2,
    fileCount: 1,
    dueSoonCount: 1,
    lastSyncedLabel: "Synced just now",
  },
  modules: [
    {
      id: "module-1",
      code: "CS3235",
      title: "Computer Security",
      taskCount: 2,
      announcementCount: 1,
      lastSyncLabel: "today",
      sync_enabled: true,
      files: [previewFile],
      nextTask: {
        id: "task-1",
        title: "Security worksheet",
        moduleCode: "CS3235",
        dueLabel: "Due tomorrow",
        dueDate: "2026-03-14T09:00:00.000Z",
        status: "due-soon",
        source: "Canvas assignment",
        sourceRefId: null,
        hasDescription: false,
      },
      latestAnnouncement: {
        id: "announcement-1",
        title: "Lecture venue update",
        moduleCode: "CS3235",
        summary: "- LT19 this week",
        bodyHtml: "",
        postedLabel: "2h ago",
        postedAt: "2026-03-13T11:00:00.000Z",
        importance: "high",
      },
      recentFile: previewFile,
      examSummary: {
        date: "1 May 2026",
        duration: "2 hrs",
        time: "09:00",
        venue: "MPSH 1",
      },
      nusmods: null,
      pages: [],
      courseModules: [],
    },
  ],
  tasks: [
    {
      id: "task-1",
      title: "Security worksheet",
      moduleCode: "CS3235",
      dueLabel: "Due tomorrow",
      dueDate: "2026-03-14T09:00:00.000Z",
      status: "due-soon",
      source: "Canvas assignment",
      sourceRefId: null,
      hasDescription: false,
    },
  ],
  announcements: [
    {
      id: "announcement-1",
      title: "Lecture venue update",
      moduleCode: "CS3235",
      summary: "- LT19 this week",
      bodyHtml: "",
      postedLabel: "2h ago",
      postedAt: "2026-03-13T11:00:00.000Z",
      importance: "high",
    },
  ],
  recentFiles: [{ ...previewFile, moduleCode: "CS3235", moduleTitle: "Computer Security" }],
  latestChanges: [
    {
      id: "announcement-1",
      kind: "announcement",
      moduleCode: "CS3235",
      title: "Lecture venue update",
      summary: "- LT19 this week",
      happenedAt: "2026-03-13T11:00:00.000Z",
      happenedLabel: "2h ago",
      importance: "high",
      file: null,
    },
    {
      id: "file-1",
      kind: "file",
      moduleCode: "CS3235",
      title: "lecture-01.pdf",
      summary: "- Week 1 notes",
      happenedAt: "2026-03-13T13:30:00.000Z",
      happenedLabel: "Today",
      importance: "normal",
      file: previewFile,
    },
  ],
  recentGrades: [],
  courseProgress: [],
  source: "live",
  status: "ready",
  setupMessage: "Studex is rendering live Canvas-backed data from Supabase.",
  userId: "user-1",
  lastSyncedAt: "2026-03-13T14:00:00.000Z",
};

const withMutedModuleContent: DashboardData = {
  ...afterSync,
  modules: [
    ...afterSync.modules,
    {
      id: "module-2",
      code: "IS4231",
      title: "Information Security Management",
      taskCount: 1,
      announcementCount: 1,
      lastSyncLabel: "yesterday",
      sync_enabled: false,
      files: [
        {
          ...previewFile,
          id: "file-muted",
          name: "muted-module-notes.pdf",
        },
      ],
      nextTask: {
        id: "task-muted",
        title: "Muted task",
        moduleCode: "IS4231",
        dueLabel: "Due next week",
        dueDate: "2026-03-20T09:00:00.000Z",
        status: "upcoming",
        source: "Canvas assignment",
        sourceRefId: null,
        hasDescription: false,
      },
      latestAnnouncement: {
        id: "announcement-muted",
        title: "Muted announcement",
        moduleCode: "IS4231",
        summary: "- Should stay hidden on Home",
        bodyHtml: "",
        postedLabel: "1d ago",
        postedAt: "2026-03-12T11:00:00.000Z",
        importance: "normal",
      },
      recentFile: {
        ...previewFile,
        id: "file-muted",
        name: "muted-module-notes.pdf",
      },
      examSummary: null,
      nusmods: null,
      pages: [],
      courseModules: [],
    },
  ],
  tasks: [
    ...afterSync.tasks,
    {
      id: "task-muted",
      title: "Muted task",
      moduleCode: "IS4231",
      dueLabel: "Due next week",
      dueDate: "2026-03-20T09:00:00.000Z",
      status: "upcoming",
      source: "Canvas assignment",
      sourceRefId: null,
      hasDescription: false,
    },
  ],
  announcements: [
    ...afterSync.announcements,
    {
      id: "announcement-muted",
      title: "Muted announcement",
      moduleCode: "IS4231",
      summary: "- Should stay hidden on Home",
      bodyHtml: "",
      postedLabel: "1d ago",
      postedAt: "2026-03-12T11:00:00.000Z",
      importance: "normal",
    },
  ],
  recentFiles: [
    ...afterSync.recentFiles,
    {
      ...previewFile,
      id: "file-muted",
      name: "muted-module-notes.pdf",
      moduleCode: "IS4231",
      moduleTitle: "Information Security Management",
    },
  ],
  latestChanges: [
    ...afterSync.latestChanges,
    {
      id: "announcement-muted",
      kind: "announcement",
      moduleCode: "IS4231",
      title: "Muted announcement",
      summary: "- Should stay hidden on Home",
      happenedAt: "2026-03-12T11:00:00.000Z",
      happenedLabel: "1d ago",
      importance: "normal",
      file: null,
    },
  ],
};

const afterModuleRemoval: DashboardData = {
  ...afterSync,
  overview: {
    syncedModuleCount: 0,
    openTaskCount: 0,
    recentChangeCount: 0,
    fileCount: 0,
    dueSoonCount: 0,
    lastSyncedLabel: "today",
  },
  modules: [],
  tasks: [],
  announcements: [],
  recentFiles: [],
  latestChanges: [],
};

const withEmptyRecentFilesFeed: DashboardData = {
  ...afterSync,
  recentFiles: [],
};

describe("DashboardClient", () => {
  it("adopts refreshed server data after rerender", async () => {
    const { rerender } = render(<DashboardClient data={beforeSync} />);

    expect(screen.getByText("Run sync first.")).toBeInTheDocument();

    rerender(<DashboardClient data={afterSync} />);

    expect(await screen.findByText("Computer Security")).toBeInTheDocument();
    expect(screen.getByText("Due this week")).toBeInTheDocument();
    expect(screen.queryByText("Run sync first.")).not.toBeInTheDocument();
  });

  it("switches root views from the redesigned navigation shell", async () => {
    render(<DashboardClient data={afterSync} />);

    const desktopNav = screen.getByRole("navigation", { name: "Desktop navigation" });
    fireEvent.click(within(desktopNav).getByRole("button", { name: /Modules/i }));

    expect(await screen.findByText("Course workspaces built from synced reality.")).toBeInTheDocument();
    expect(screen.getByText("Security worksheet")).toBeInTheDocument();
  });

  it("keeps muted module content out of the home board", () => {
    render(<DashboardClient data={withMutedModuleContent} />);

    expect(screen.queryByText("Muted task")).not.toBeInTheDocument();
    expect(screen.queryByText("Muted announcement")).not.toBeInTheDocument();
    expect(screen.queryByText("muted-module-notes.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Security worksheet")).toBeInTheDocument();
    expect(screen.getByText("open tasks").parentElement).toHaveTextContent("1");
    expect(screen.getByText("synced modules").parentElement).toHaveTextContent("1");
  });

  it("clears an open module when refreshed data removes it", async () => {
    const { rerender } = render(<DashboardClient data={afterSync} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Computer Security/i })[0]);

    expect(await screen.findByText("Synced Canvas work, file intelligence, and NUSMods context for this module.")).toBeInTheDocument();

    rerender(<DashboardClient data={afterModuleRemoval} />);

    expect(await screen.findByText("No modules synced yet")).toBeInTheDocument();
    expect(screen.queryByText("Module workspace")).not.toBeInTheDocument();
  });

  it("shows empty state in new files widget when the recent files feed is empty", () => {
    render(<DashboardClient data={withEmptyRecentFilesFeed} />);

    expect(screen.getByText(/No new files this week/i)).toBeInTheDocument();
  });
});
