import { DEFAULT_MUTATION_DURATIONS } from './domain-defaults.js';
import type { StructuredFragmentPlan } from './types.js';

type PlanStructuredFragmentInput = {
  intentType: 'add_repeated_fragment' | 'expand_wbs';
  userMessage: string;
  anchorTaskId: string;
  hint: string;
};

function titleCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Новый фрагмент';
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function transliterate(value: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: '',
  };

  return value.toLowerCase().split('').map((char) => map[char] ?? char).join('');
}

function slugify(value: string): string {
  return transliterate(value)
    .replace(/[^a-z0-9а-яё]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function lookupDuration(hint: string): number {
  const normalized = hint.toLowerCase();
  const entry = Object.entries(DEFAULT_MUTATION_DURATIONS).find(([key]) => normalized.includes(key));
  return entry?.[1] ?? 2;
}

function resolveCanonicalNodeKey(hint: string): string {
  const normalized = hint.toLowerCase().trim();
  if (normalized.includes('покраска обоев')) {
    return 'paint-wallpaper';
  }
  if (normalized.includes('инженерные системы')) {
    return 'engineering-systems';
  }

  return slugify(hint) || 'fragment-node';
}

export async function planStructuredFragment(
  input: PlanStructuredFragmentInput,
): Promise<StructuredFragmentPlan> {
  const baseTitle = titleCase(input.hint || input.userMessage);
  const baseKey = resolveCanonicalNodeKey(input.hint);

  if (input.intentType === 'add_repeated_fragment') {
    return {
      title: baseTitle,
      nodes: [{
        nodeKey: baseKey,
        title: baseTitle,
        durationDays: lookupDuration(input.hint),
        dependsOnNodeKeys: [],
      }],
      why: `Повторяемый фрагмент для "${baseTitle}" сформирован в ограниченном server-side контракте.`,
    };
  }

  return {
    title: baseTitle,
    nodes: [
      {
        nodeKey: `${baseKey}-preparation`,
        title: `Подготовка: ${baseTitle}`,
        durationDays: 2,
        dependsOnNodeKeys: [],
      },
      {
        nodeKey: `${baseKey}-core-work`,
        title: `Основные работы: ${baseTitle}`,
        durationDays: Math.max(3, lookupDuration(input.hint)),
        dependsOnNodeKeys: [`${baseKey}-preparation`],
      },
      {
        nodeKey: `${baseKey}-handover`,
        title: `Сдача: ${baseTitle}`,
        durationDays: 1,
        dependsOnNodeKeys: [`${baseKey}-core-work`],
      },
    ],
    why: `Ветка "${baseTitle}" расширена в структурированный WBS-план без свободной генерации task payload.`,
  };
}
