import { Cuboid, Hammer, Package, Users } from 'lucide-react';

import type { ProjectResource } from '../../lib/apiTypes.ts';
import { cn } from '../../lib/utils.ts';

const RESOURCE_TYPE_ICON_CLASS_NAMES: Record<ProjectResource['type'], string> = {
  human: 'text-[#0052cc]',
  equipment: 'text-[#172b4d]',
  material: 'text-[#de350b]',
  other: 'text-[#6b778c]',
};

export function getResourceTypeIconClassName(type: ProjectResource['type']): string {
  return RESOURCE_TYPE_ICON_CLASS_NAMES[type];
}

export function ResourceTypeIcon({ type, className }: { type: ProjectResource['type']; className?: string }) {
  const iconClassName = cn(getResourceTypeIconClassName(type), className);

  if (type === 'human') {
    return <Users className={iconClassName} />;
  }
  if (type === 'equipment') {
    return <Hammer className={iconClassName} />;
  }
  if (type === 'material') {
    return <Cuboid className={iconClassName} />;
  }
  return <Package className={iconClassName} />;
}
