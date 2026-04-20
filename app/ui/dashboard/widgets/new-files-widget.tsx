"use client";

import type { CanvasFileSummary } from "@/lib/contracts";
import { EmptyState, SectionCard } from "@/app/ui/dashboard/shared";
import { FileCard } from "./file-card";

export function NewFilesWidget({
  files,
  onOpenModule,
}: {
  files: Array<CanvasFileSummary & { moduleCode: string; moduleTitle: string }>;
  onOpenModule?: (code: string) => void;
}) {
  return (
    <SectionCard title="New files" eyebrow="Updated in the last 7 days">
      {files.length === 0 ? (
        <EmptyState title="No new files this week." copy="Files synced from Canvas in the last 7 days will appear here." />
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <FileCard key={file.id} file={file} moduleCode={file.moduleCode} onOpenModule={onOpenModule} showModuleCode={true} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
