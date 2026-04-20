"use client";

import { useMemo, useState } from "react";

import type { DashboardData } from "@/lib/contracts";
import { EmptyState } from "@/app/ui/dashboard/shared";
import { CourseListWidget } from "./widgets/course-list-widget";
import { CourseProgressWidget } from "./widgets/course-progress-widget";
import { DueThisWeekWidget } from "./widgets/due-this-week-widget";
import { NewFilesWidget } from "./widgets/new-files-widget";
import { RecentAnnouncementsWidget } from "./widgets/recent-announcements-widget";
import { RecentGradesWidget } from "./widgets/recent-grades-widget";
import { ScheduleBoard } from "./widgets/schedule-board";
import { StatsHeader } from "./widgets/stats-header";

export function HomeView({
  data,
  onOpenModule,
  seenAnnouncements,
  onMarkAnnouncementSeen,
}: {
  data: DashboardData;
  onOpenModule: (code: string) => void;
  seenAnnouncements: Record<string, boolean>;
  onMarkAnnouncementSeen: (id: string) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);

  const activeModules = useMemo(() => data.modules.filter((module) => module.sync_enabled), [data.modules]);
  const activeModuleCodes = useMemo(() => new Set(activeModules.map((module) => module.code)), [activeModules]);

  const filteredTasks = useMemo(
    () => data.tasks.filter((task) => activeModuleCodes.has(task.moduleCode)),
    [activeModuleCodes, data.tasks],
  );
  const filteredAnnouncements = useMemo(
    () => data.announcements.filter((announcement) => activeModuleCodes.has(announcement.moduleCode)).slice(0, 10),
    [activeModuleCodes, data.announcements],
  );
  const filteredRecentFiles = useMemo(
    () => data.recentFiles.filter((file) => activeModuleCodes.has(file.moduleCode)).slice(0, 8),
    [activeModuleCodes, data.recentFiles],
  );
  const filteredCourseProgress = useMemo(
    () => data.courseProgress.filter((course) => activeModuleCodes.has(course.moduleCode)),
    [activeModuleCodes, data.courseProgress],
  );
  const filteredRecentGrades = useMemo(
    () => data.recentGrades.filter((grade) => activeModuleCodes.has(grade.moduleCode)),
    [activeModuleCodes, data.recentGrades],
  );
  const dueThisWeek = useMemo(() => {
    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return [...filteredTasks]
      .filter((task) => {
        if (!task.dueDate) return false;
        const time = new Date(task.dueDate).getTime();
        return Number.isFinite(time) && time <= horizon;
      })
      .sort((left, right) => new Date(left.dueDate!).getTime() - new Date(right.dueDate!).getTime())
      .slice(0, 6);
  }, [filteredTasks]);

  const unreadAnnouncementCount = filteredAnnouncements.filter(
    (announcement) => !seenAnnouncements[announcement.id],
  ).length;
  const dueSoonCount = filteredTasks.filter((task) => task.status === "due-soon").length;

  return (
    <div className="space-y-4">
      <StatsHeader
        dueSoonCount={dueSoonCount}
        openTaskCount={filteredTasks.length}
        unreadAnnouncementCount={unreadAnnouncementCount}
      />

      {activeModules.length === 0 ? (
        <EmptyState
          title="No modules synced yet"
          copy="Use Sync Canvas to discover modules from Canvas, then enable the ones that should power your command board."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="space-y-4">
            <ScheduleBoard modules={activeModules} tasks={filteredTasks} weekOffset={weekOffset} onWeekOffsetChange={setWeekOffset} />
            <DueThisWeekWidget tasks={dueThisWeek} />
            <RecentAnnouncementsWidget
              announcements={filteredAnnouncements}
              seenAnnouncements={seenAnnouncements}
              onMarkAnnouncementSeen={onMarkAnnouncementSeen}
            />
            <NewFilesWidget files={filteredRecentFiles} onOpenModule={onOpenModule} />
          </div>

          <div className="space-y-4">
            <CourseProgressWidget courses={filteredCourseProgress} onOpenModule={onOpenModule} />
            <RecentGradesWidget grades={filteredRecentGrades} />
            <CourseListWidget modules={activeModules} onOpenModule={onOpenModule} />
          </div>
        </div>
      )}
    </div>
  );
}
