import { useState } from 'react';
import type { ModuleId } from '../app/navigation';
import type { useGame } from '../persistence/store';
import type { GameAction } from '../simulation/types';
import { FinancePage, RankingsPage, SettingsPage } from './Administration';
import type { FeatureProps } from './model';
import { CompliancePage, MarketPage, OpinionPage, ResearchPage, SuppliersPage } from './Operations';
import { LaborPage, PayrollPage, RecruitmentPage, StaffingPage, TrainingPage, WorkforcePage } from './People';
import { BiddingPage, ContractsPage, CustomersPage } from './Procurement';
import { Notice } from './ui';
import './features.css';

const pages = {
  market: MarketPage, customers: CustomersPage, bidding: BiddingPage, contracts: ContractsPage,
  recruitment: RecruitmentPage, workforce: WorkforcePage, staffing: StaffingPage, suppliers: SuppliersPage,
  payroll: PayrollPage, training: TrainingPage, research: ResearchPage, labor: LaborPage,
  compliance: CompliancePage, opinion: OpinionPage, finance: FinancePage, rankings: RankingsPage,
} as const;

type ModuleProps = {
  module: Exclude<ModuleId, 'dashboard'>;
  game: ReturnType<typeof useGame>;
  navigate: (module: ModuleId) => void;
  openCompanySetup: () => void;
};

export function ModulePage(props: ModuleProps) {
  return <ModuleContent key={props.module} {...props} />;
}

function ModuleContent({ module, game, navigate, openCompanySetup }: ModuleProps) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  async function run(action: GameAction) {
    const result = await game.dispatch(action);
    setMessage({ text: result.message, ok: result.ok });
    return result;
  }
  const shared: FeatureProps = { state: game.state, busy: game.busy || !game.ready, navigate, run };
  const Page = module === 'settings' ? null : pages[module];
  return <div className="feature-page">
    {Page ? <Page {...shared} /> : <SettingsPage {...shared} game={game} openCompanySetup={openCompanySetup} />}
    {message && <aside className="feature-toast"><Notice tone={message.ok ? 'good' : 'bad'}>{message.text}</Notice><button className="feature-close" type="button" aria-label="关闭操作反馈" onClick={() => setMessage(null)}>×</button></aside>}
  </div>;
}
