import { PAGE_LABELS } from '../simulation/data';
import type { PageId } from '../simulation/types';

export const navigation = [
  { name: '工作台', modules: ['dashboard', 'market', 'rankings'] },
  { name: '业务经营', modules: ['customers', 'bidding', 'contracts', 'staffing', 'suppliers'] },
  { name: '人才与组织', modules: ['recruitment', 'workforce', 'payroll', 'training', 'labor'] },
  { name: '企业管理', modules: ['finance', 'research', 'compliance', 'opinion'] },
] as const satisfies ReadonlyArray<{ name: string; modules: ReadonlyArray<PageId> }>;

export type ModuleId = PageId;

export function moduleName(module: ModuleId) {
  return PAGE_LABELS[module];
}

export function moduleFromHash(hash: string): ModuleId {
  const key = hash.replace(/^#\/?/, '') as ModuleId;
  return Object.hasOwn(PAGE_LABELS, key) ? key : 'dashboard';
}
