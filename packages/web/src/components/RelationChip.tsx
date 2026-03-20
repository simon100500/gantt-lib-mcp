import * as React from 'react';
import * as Popover from './ui/popover';
import { cn } from '@/lib/utils';

export interface RelationChipProps {
  predecessorId: string;
  successorId: string;
  relationType?: 'finish-to-start' | 'start-to-start' | 'finish-to-finish' | 'start-to-finish';
  className?: string;
}

export function RelationChip({ predecessorId, successorId, relationType = 'finish-to-start', className }: RelationChipProps) {
  return (
    <Popover.Popover>
      <Popover.PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600",
            "hover:border-slate-300 hover:bg-slate-100",
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            className
          )}
        >
          <span className="font-medium">ID: {predecessorId}</span>
        </button>
      </Popover.PopoverTrigger>
      <Popover.PopoverContent align="start" className="w-auto p-3">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-slate-900">Детали связи</div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <span className="text-slate-500">Предшественник:</span>
            <span className="font-mono text-slate-700">{predecessorId}</span>
            <span className="text-slate-500">Преемник:</span>
            <span className="font-mono text-slate-700">{successorId}</span>
            <span className="text-slate-500">Тип связи:</span>
            <span className="text-slate-700">{relationType}</span>
          </div>
        </div>
      </Popover.PopoverContent>
    </Popover.Popover>
  );
}
