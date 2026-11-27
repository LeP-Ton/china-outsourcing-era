import type { ModuleId } from '../app/navigation';
import { INDUSTRIES, OCCUPATIONS } from '../simulation/data';
import type { Company, GameAction, GameResult, GameState, NewsKind, Severity } from '../simulation/types';
import type { Tone } from './ui';

export interface FeatureProps {
  state: GameState;
  run: (action: GameAction) => Promise<GameResult>;
  busy: boolean;
  navigate: (module: ModuleId) => void;
}

export const NEWS_LABELS: Record<NewsKind, string> = {
  market: '宏观与市场', customer: '客户动态', labor: '劳动关系', finance: '财务动态',
  business: '业务经营', technology: '技术发展', compliance: '合规风控',
};

export const SEVERITY_LABELS: Record<Severity, string> = { info: '动态', warning: '关注', critical: '高风险' };
export const SEVERITY_TONES: Record<Severity, Tone> = { info: 'info', warning: 'warn', critical: 'bad' };
export const CONTRACT_LABELS = { unsigned: '待签署', active: '履约中', completed: '已完成', cancelled: '已终止' } as const;
export const CONTRACT_TONES = { unsigned: 'warn', active: 'good', completed: 'info', cancelled: 'neutral' } as const;

const occupationNames = new Map(OCCUPATIONS.map((item) => [item.id, item.name]));
const industryNames = new Map(INDUSTRIES.map((item) => [item.id, item.name]));

export function occupationName(id: string) {
  return occupationNames.get(id) ?? id;
}

export function industryName(id: string) {
  return industryNames.get(id) ?? id;
}

export function clientName(state: GameState, id: string) {
  return state.clients.find((client) => client.id === id)?.name ?? '未知客户';
}

export function companyName(state: GameState, id: string | null) {
  if (state.player.id === id) return state.player.name;
  return state.competitors.find((company) => company.id === id)?.name ?? state.suppliers.find((supplier) => supplier.id === id)?.name ?? '—';
}

export function monthLabel(month: number) {
  if (month < 0) return '开局前';
  return `${2026 + Math.floor(month / 12)}年${month % 12 + 1}月`;
}

export function latestReport(company: Company) {
  return company.reports.at(-1);
}

export function ownContracts(state: GameState) {
  return state.contracts.filter((contract) => contract.companyId === state.player.id);
}

export function ownWorkers(state: GameState) {
  return state.workers.filter((worker) => worker.employerId === state.player.id && worker.status === 'employed');
}
