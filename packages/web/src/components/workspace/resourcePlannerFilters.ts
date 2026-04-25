import type { ProjectResource, ResourceType } from '../../lib/apiTypes.ts';
import { getPlannerItemMetadata, type ResourcePlannerTimelineResource } from './resourcePlannerAdapter.ts';

export interface ResourcePlannerFilters {
  query: string;
  resourceTypes: ResourceType[];
  conflictOnly: boolean;
  includeInactive: boolean;
}

export interface ResourcePlannerFilterOptions {
  preserveResourceIds?: Iterable<string>;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function includesSearchText(value: string | null | undefined, query: string): boolean {
  return typeof value === 'string' && value.toLocaleLowerCase().includes(query);
}

function resourceMatchesQuery(resource: ResourcePlannerTimelineResource, query: string): boolean {
  if (!query) {
    return true;
  }

  return includesSearchText(resource.name, query);
}

function itemMatchesQuery(item: ResourcePlannerTimelineResource['items'][number], query: string): boolean {
  if (!query) {
    return true;
  }

  const metadata = getPlannerItemMetadata(item);

  return includesSearchText(item.title, query)
    || includesSearchText(item.subtitle, query)
    || includesSearchText(metadata?.projectName, query)
    || includesSearchText(metadata?.resourceName, query);
}

function itemHasConflict(item: ResourcePlannerTimelineResource['items'][number]): boolean {
  return getPlannerItemMetadata(item)?.hasConflict === true;
}

export function filterResourceTimelineResources(
  resources: ResourcePlannerTimelineResource[],
  catalogResources: ProjectResource[],
  filters: ResourcePlannerFilters,
  options: ResourcePlannerFilterOptions = {},
): ResourcePlannerTimelineResource[] {
  const catalogById = new Map(catalogResources.map((resource) => [resource.id, resource]));
  const selectedTypes = new Set(filters.resourceTypes);
  const query = normalizeSearchText(filters.query);
  const preserveResourceIds = new Set(options.preserveResourceIds ?? []);

  return resources.flatMap((resource) => {
    const catalogResource = catalogById.get(resource.id);
    const shouldPreserveResource = preserveResourceIds.has(resource.id);

    if (!filters.includeInactive && catalogResource?.isActive === false && !shouldPreserveResource) {
      return [];
    }

    if (selectedTypes.size > 0 && (!catalogResource || !selectedTypes.has(catalogResource.type)) && !shouldPreserveResource) {
      return [];
    }

    const resourceQueryMatch = resourceMatchesQuery(resource, query);
    const matchingItems = resource.items.filter((item) => {
      if (filters.conflictOnly && !itemHasConflict(item)) {
        return false;
      }

      return resourceQueryMatch || itemMatchesQuery(item, query);
    });

    if (filters.conflictOnly && matchingItems.length === 0 && !shouldPreserveResource) {
      return [];
    }

    if (query && !resourceQueryMatch && matchingItems.length === 0 && !shouldPreserveResource) {
      return [];
    }

    if (resource.items.length === 0 && !resourceQueryMatch && !shouldPreserveResource) {
      return [];
    }

    return [{ ...resource, items: matchingItems }];
  });
}
