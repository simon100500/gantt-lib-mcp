import { useEffect, useMemo, useState } from 'react';
import { Search, ToyBrick } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TemplateItem } from '../lib/apiTypes.ts';

interface InsertTemplateModalProps {
  templates: TemplateItem[];
  anchorTaskName: string;
  loading?: boolean;
  onInsert: (input: { templateId: string; placement: 'after' | 'inside' }) => Promise<void> | void;
  onClose: () => void;
}

export function InsertTemplateModal({
  templates,
  anchorTaskName,
  loading = false,
  onInsert,
  onClose,
}: InsertTemplateModalProps) {
  const [query, setQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? '');
  const [placement, setPlacement] = useState<'after' | 'inside'>('after');

  useEffect(() => {
    setSelectedTemplateId(templates[0]?.id ?? '');
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return templates;
    }
    return templates.filter((template) => template.name.toLowerCase().includes(normalizedQuery));
  }, [query, templates]);

  useEffect(() => {
    if (!filteredTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(filteredTemplates[0]?.id ?? '');
    }
  }, [filteredTemplates, selectedTemplateId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <Card className="relative w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl border-0 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 text-slate-400 transition-colors hover:text-slate-600"
          aria-label="Закрыть"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <ToyBrick className="h-5 w-5" />
            Вставить шаблон
          </CardTitle>
          <CardDescription>
            Выберите шаблон и способ вставки относительно задачи «{anchorTaskName}».
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти шаблон"
              className="pl-9"
              disabled={loading}
            />
          </div>

          <div className="grid gap-2">
            {filteredTemplates.length > 0 ? filteredTemplates.map((template) => (
              <label
                key={template.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                  selectedTemplateId === template.id ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="template"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={selectedTemplateId === template.id}
                  onChange={() => setSelectedTemplateId(template.id)}
                  disabled={loading}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{template.name}</div>
                  <div className="text-xs text-slate-500">{template.taskCount} задач</div>
                </div>
              </label>
            )) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Ничего не найдено.
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPlacement('after')}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${placement === 'after' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
            >
              <div className="text-sm font-medium">После задачи</div>
              <div className="text-xs text-slate-500">Вставить как соседний блок после выбранной строки.</div>
            </button>
            <button
              type="button"
              onClick={() => setPlacement('inside')}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${placement === 'inside' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
            >
              <div className="text-sm font-medium">Внутрь задачи</div>
              <div className="text-xs text-slate-500">Вставить как дочерний блок выбранной задачи.</div>
            </button>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="flex-1">
            Отмена
          </Button>
          <Button
            type="button"
            disabled={loading || !selectedTemplateId}
            onClick={() => { void onInsert({ templateId: selectedTemplateId, placement }); }}
            className="flex-1"
          >
            {loading ? 'Вставляем...' : 'Вставить'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
