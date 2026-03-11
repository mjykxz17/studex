"use client";

import { useState, useEffect } from "react";

type ModuleSelection = {
  id: string;
  code: string;
  title: string;
  selected: boolean;
};

export type SyncConfig = {
  selectedModuleIds: string[];
  syncFiles: boolean;
};

export function SyncModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: (config: SyncConfig) => void;
}) {
  const [modules, setModules] = useState<ModuleSelection[]>([]);
  const [syncFiles, setSyncFiles] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchModules();
    }
  }, [isOpen]);

  async function fetchModules() {
    setLoading(true);
    try {
      // First, trigger discovery to ensure we have the latest list in DB
      await fetch("/api/sync?mode=discovery");
      
      // Then fetch the list from our DB
      const response = await fetch("/api/modules/list");
      const data = await response.json();
      setModules(data.modules.map((m: any) => ({
        id: m.id,
        code: m.code,
        title: m.title,
        selected: m.sync_enabled ?? true
      })));
    } catch (e) {
      console.error("Failed to fetch modules for sync", e);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-[28px] border border-white/20 bg-white p-6 shadow-2xl">
        <h3 className="font-serif text-2xl font-semibold text-slate-900">Sync Configuration</h3>
        <p className="mt-2 text-sm text-slate-500">Choose modules to synchronize and extraction depth.</p>

        <div className="mt-6 max-h-[50vh] overflow-y-auto space-y-2 pr-2">
          {loading ? (
            <div className="py-10 text-center text-slate-400">Scanning Canvas modules...</div>
          ) : (
            modules.map(m => (
              <div 
                key={m.id} 
                onClick={() => setModules(prev => prev.map(mod => mod.id === m.id ? { ...mod, selected: !mod.selected } : mod))}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${m.selected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50 opacity-60'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${m.selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                    {m.selected && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-blue-700">{m.code}</div>
                    <div className="text-sm font-medium text-slate-700 truncate max-w-[240px]">{m.title}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-900">Extract File Content</div>
            <div className="text-xs text-slate-500">Parses PDFs for deep AI search (slowest)</div>
          </div>
          <div 
            onClick={() => setSyncFiles(!syncFiles)}
            className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${syncFiles ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${syncFiles ? 'left-7' : 'left-1'}`} />
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            disabled={loading || modules.filter(m => m.selected).length === 0}
            onClick={() => onConfirm({ 
              selectedModuleIds: modules.filter(m => m.selected).map(m => m.id),
              syncFiles 
            })}
            className="flex-[2] px-4 py-3 rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            Start Sync
          </button>
        </div>
      </div>
    </div>
  );
}
