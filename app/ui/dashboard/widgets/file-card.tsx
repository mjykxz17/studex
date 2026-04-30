import { FilePreviewDialog } from "@/app/ui/file-preview-dialog";
import type { CanvasFileSummary } from "@/lib/contracts";

import { Pill } from "../shared";

export function FileCard({
  file,
  moduleCode,
  onOpenModule,
  showModuleCode = false,
}: {
  file: CanvasFileSummary;
  moduleCode: string;
  onOpenModule?: ((moduleCode: string) => void) | null;
  showModuleCode?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-4 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {showModuleCode ? <Pill tone="blue">{moduleCode}</Pill> : null}
            <Pill>{file.category}</Pill>
            <Pill>{file.uploadedLabel}</Pill>
          </div>
          <p className="mt-3 text-[13px] font-medium text-stone-900">{file.name}</p>
          <p className="mt-2 whitespace-pre-line text-[12px] leading-6 text-stone-600">{file.summary}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onOpenModule ? (
            <button
              type="button"
              onClick={() => onOpenModule(moduleCode)}
              className="rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700"
            >
              Open module
            </button>
          ) : null}
          {file.canvasUrl ? (
            <a
              href={file.canvasUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-medium text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline"
            >
              Source
            </a>
          ) : null}
          <FilePreviewDialog file={file} moduleCode={moduleCode} />
        </div>
      </div>
    </div>
  );
}
