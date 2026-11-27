import { useState } from 'react';
import { BUSINESS_LABELS } from '../simulation/data';
import { staffedSeats } from '../simulation/operations';
import type { GameNews, GameState, MonthReport } from '../simulation/types';
import { Icon, type IconName } from './Icon';
import { compactMoney, currency, gameMonth, integer, percent, shortMonth } from './format';
import type { ModuleId } from './navigation';

type Tone = 'blue' | 'green' | 'violet' | 'amber' | 'rose';
type Navigate = (module: ModuleId) => void;

export function ToneIcon({ name, tone = 'blue' }: { name: IconName; tone?: Tone }) {
  return <span className={`tone-icon tone-icon--${tone}`}><Icon name={name} size={16} /></span>;
}

function Delta({ current, previous }: { current: number; previous?: number }) {
  if (previous == null || previous === 0) return <span>上期暂无可比数据</span>;
  const change = (current - previous) / Math.abs(previous) * 100;
  if (Math.abs(change) < .05) return <span>与上期持平</span>;
  return <>
    <span className={`delta delta--${change > 0 ? 'up' : 'down'}`}>
      <Icon name={change > 0 ? 'arrowUp' : 'arrowDown'} size={12} />{percent(Math.abs(change), 1)}
    </span>
    <span>较上期</span>
  </>;
}

function KpiCards({ state }: { state: GameState }) {
  const reports = state.player.reports;
  const latest = reports.at(-1);
  const previous = reports.at(-2);
  const employees = state.workers.filter(worker => worker.employerId === state.player.id && worker.status === 'employed');
  const assigned = employees.filter(worker => worker.contractId).length;

  return <section className="kpi-grid" aria-label="核心经营指标">
    <article className="panel kpi-card">
      <div className="kpi-head">上期营业收入 <ToneIcon name="receipt" /></div>
      <div className="kpi-value" title={latest && currency(latest.revenue)}>{latest ? compactMoney(latest.revenue) : '—'}</div>
      <div className="kpi-foot">{latest ? <Delta current={latest.revenue} previous={previous?.revenue} /> : '待首次月结'}</div>
    </article>
    <article className="panel kpi-card">
      <div className="kpi-head">上期经营利润 <ToneIcon name="chart" tone="green" /></div>
      <div className="kpi-value" title={latest && currency(latest.profit)}>{latest ? compactMoney(latest.profit) : '—'}</div>
      <div className="kpi-foot">{latest ? <Delta current={latest.profit} previous={previous?.profit} /> : '待首次月结'}</div>
    </article>
    <article className="panel kpi-card">
      <div className="kpi-head">当前现金余额 <ToneIcon name="finance" tone="violet" /></div>
      <div className="kpi-value" title={currency(state.player.cash)}>{compactMoney(state.player.cash)}</div>
      <div className="kpi-foot">{latest ? <>上期实收 {compactMoney(latest.received)}</> : '开局可用资金'}</div>
    </article>
    <article className="panel kpi-card">
      <div className="kpi-head">在册员工 <ToneIcon name="workforce" tone="amber" /></div>
      <div className="kpi-value">{integer(employees.length)}<small>人</small></div>
      <div className="kpi-foot">{integer(assigned)} 人已配置项目 · {integer(employees.length - assigned)} 人待岗</div>
    </article>
  </section>;
}

const axisUnit = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

function axisLabel(amount: number) {
  if (!amount) return '0';
  if (Math.abs(amount) >= 1e8) return `${axisUnit.format(amount / 1e8)}亿`;
  return `${axisUnit.format(amount / 1e4)}万`;
}

function scaleFor(reports: MonthReport[]) {
  const values = reports.flatMap(report => [report.revenue, report.profit]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 10_000);
  const rawTick = (max - min) / 4;
  const order = 10 ** Math.floor(Math.log10(rawTick));
  const tick = ([1, 2, 2.5, 5, 10].find(value => value * order >= rawTick) ?? 10) * order;
  const floor = Math.floor(min / tick) * tick;
  const ceiling = Math.ceil(max / tick) * tick;
  const ticks = Array.from({ length: Math.round((ceiling - floor) / tick) + 1 }, (_, index) => ceiling - index * tick);
  return { floor, ceiling, ticks };
}

function Trend({ state }: { state: GameState }) {
  const [range, setRange] = useState<6 | 12>(6);
  const [activeMonth, setActiveMonth] = useState<number | null>(null);
  const reports = state.player.reports.slice(-range);
  const last = reports.at(-1);
  const active = reports.find(report => report.month === activeMonth);
  const { floor, ceiling, ticks } = scaleFor(reports);
  const left = 51;
  const right = 604;
  const top = 16;
  const bottom = 145;
  const x = (index: number) => reports.length < 2 ? (left + right) / 2 : left + (right - left) * index / (reports.length - 1);
  const y = (value: number) => top + (ceiling - value) / (ceiling - floor) * (bottom - top);
  const points = (key: 'revenue' | 'profit') => reports.map((report, index) => `${x(index)},${y(report[key])}`).join(' ');
  const area = reports.length > 1 ? `${x(0)},${y(0)} ${points('revenue')} ${x(reports.length - 1)},${y(0)}` : '';
  const pending = state.invoices.filter(invoice => invoice.companyId === state.player.id)
    .reduce((sum, invoice) => sum + invoice.amount - invoice.received, 0);

  return <section className="panel overview-panel chart-panel" aria-labelledby="trend-title">
    <div className="panel-heading">
      <div><h2 id="trend-title">经营趋势</h2><p>按已结算月份统计</p></div>
      <div className="segment" aria-label="统计范围">
        <button type="button" aria-pressed={range === 6} onClick={() => setRange(6)}>近 6 月</button>
        <button type="button" aria-pressed={range === 12} onClick={() => setRange(12)}>近 12 月</button>
      </div>
    </div>
    <div className="chart-legend"><span><i />营业收入</span><span><i />经营利润</span></div>
    <div className="chart-area">
      {reports.length ? <div className="trend-plot" onMouseLeave={() => setActiveMonth(null)}>
        <svg viewBox="0 0 624 172" role="img" aria-label="营业收入与经营利润月度折线图">
          {ticks.map(tick => <g key={tick}>
            <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="chart-gridline" />
            <text x={left - 8} y={y(tick) + 3.5} textAnchor="end" className="chart-text">{axisLabel(tick)}</text>
          </g>)}
          {area && <polygon points={area} fill="var(--chart-line)" opacity=".07" />}
          <polyline points={points('revenue')} fill="none" stroke="var(--chart-line)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <polyline points={points('profit')} fill="none" stroke="var(--chart-secondary)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {reports.map((report, index) => <g key={report.month}>
            <text x={x(index)} y="164" textAnchor="middle" className="chart-text">{shortMonth(report.month)}</text>
            {activeMonth === report.month && <line x1={x(index)} x2={x(index)} y1={top} y2={bottom} stroke="var(--faint)" strokeDasharray="3 4" />}
            <circle cx={x(index)} cy={y(report.revenue)} r="3.4" fill="var(--surface)" strokeWidth="1.8" stroke="var(--chart-line)" />
            <circle cx={x(index)} cy={y(report.profit)} r="3" fill="var(--surface)" strokeWidth="1.5" stroke="var(--chart-secondary)" />
            <rect
              aria-label={`${gameMonth(report.month)}，营业收入${currency(report.revenue)}，经营利润${currency(report.profit)}`}
              role="graphics-symbol"
              tabIndex={0}
              onMouseEnter={() => setActiveMonth(report.month)}
              onFocus={() => setActiveMonth(report.month)}
              onBlur={() => setActiveMonth(null)}
              x={x(index) - 19} width={38} y={top} height={bottom - top} fill="transparent"
            />
          </g>)}
        </svg>
        {active && <div className="chart-tooltip" role="status"><strong>{gameMonth(active.month)}</strong> <span>营收 {compactMoney(active.revenue)}</span> <span>利润 {compactMoney(active.profit)}</span></div>}
      </div> : <div className="chart-empty"><Icon name="chart" size={28} /><p>首次月结后将显示经营趋势</p></div>}
    </div>
    <div className="chart-totals">
      <div className="chart-total">上期经营成本<strong>{last ? compactMoney(last.costs) : '—'}</strong></div>
      <div className="chart-total">上期收到款项<strong>{last ? compactMoney(last.received) : '—'}</strong></div>
      <div className="chart-total">期内待收款项<strong>{compactMoney(pending)}</strong></div>
    </div>
  </section>;
}

interface Todo {
  title: string;
  detail: string;
  tone: Tone;
  icon: IconName;
  module: ModuleId;
}

function TodoPanel({ state, navigate }: { state: GameState; navigate: Navigate }) {
  const playerId = state.player.id;
  const assigned = new Map<string, number>();
  for (const worker of state.workers) {
    if (worker.employerId === playerId && worker.status === 'employed' && worker.contractId) {
      assigned.set(worker.contractId, (assigned.get(worker.contractId) ?? 0) + 1);
    }
  }
  const unsigned = state.contracts.filter(contract => contract.companyId === playerId && contract.status === 'unsigned');
  const submitted = new Set(state.bids.filter(bid => bid.companyId === playerId).map(bid => bid.tenderId));
  const open = state.tenders.filter(tender => tender.status === 'open' && tender.deadline >= state.month && !submitted.has(tender.id));
  const short = state.contracts.filter(contract => contract.companyId === playerId && contract.status === 'active' &&
    (assigned.get(contract.id) ?? 0) < staffedSeats(contract.plan));
  const due = state.invoices.filter(invoice => invoice.companyId === playerId && invoice.received < invoice.amount && invoice.due <= state.month);
  const cases = state.laborCases.filter(laborCase => laborCase.status === 'open');
  const todos: Todo[] = [];
  if (unsigned.length) todos.push({ title: `${integer(unsigned.length)} 份中标合同待签署`, detail: '签署后可配置交付人员', icon: 'contracts', tone: 'blue', module: 'contracts' });
  if (short.length) todos.push({ title: `${integer(short.length)} 个项目自营席位有空缺`, detail: '招聘或调配人员有助于满足到岗要求', icon: 'workforce', tone: 'amber', module: 'staffing' });
  if (open.length) todos.push({ title: `${integer(open.length)} 项招标可参与`, detail: `${integer(open.filter(tender => tender.deadline === state.month).length)} 项将在本期截止`, icon: 'bidding', tone: 'blue', module: 'bidding' });
  if (due.length) todos.push({ title: `${integer(due.length)} 笔应收款已到期`, detail: `待收回 ${compactMoney(due.reduce((sum, invoice) => sum + invoice.amount - invoice.received, 0))}`, icon: 'finance', tone: 'violet', module: 'finance' });
  if (cases.length) todos.push({ title: `${integer(cases.length)} 项劳动事项待处理`, detail: '查看申诉明细和预计处理成本', icon: 'labor', tone: 'rose', module: 'labor' });

  return <section className="panel overview-panel todo-panel" aria-labelledby="todo-title">
    <div className="panel-heading">
      <div className="panel-heading-title"><h2 id="todo-title">待办事项</h2><span className="count-badge">{todos.length}</span></div>
      <ToneIcon name="checklist" />
    </div>
    {todos.length ? <ul className="todo-list">{todos.map(todo => <li key={todo.module}>
      <button type="button" className="todo-item" onClick={() => navigate(todo.module)}>
        <ToneIcon name={todo.icon} tone={todo.tone} />
        <span className="todo-content"><strong>{todo.title}</strong><small>{todo.detail}</small></span>
        <Icon name="chevronRight" size={14} />
      </button>
    </li>)}</ul> : <p className="empty-note">本期没有待处理事项</p>}
    <div className="todo-foot"><Icon name="clock" size={13} />本期业务在推进月份时结算</div>
  </section>;
}

function ProjectPanel({ state, navigate }: { state: GameState; navigate: Navigate }) {
  const contracts = state.contracts.filter(contract => contract.companyId === state.player.id && (contract.status === 'active' || contract.status === 'unsigned'))
    .sort((first, second) => Number(second.status === 'active') - Number(first.status === 'active') || (second.signedAt ?? 0) - (first.signedAt ?? 0));

  return <section className="panel overview-panel project-panel" aria-labelledby="project-title">
    <div className="panel-heading">
      <div className="panel-heading-title"><h2 id="project-title">项目履约</h2><span className="count-badge">{contracts.length}</span></div>
      <button type="button" className="button button--text" onClick={() => navigate('contracts')}>全部合同 <Icon name="arrowRight" size={13} /></button>
    </div>
    {contracts.length ? <div className="overview-table-scroll"><table className="overview-table">
      <thead><tr><th>项目名称</th><th>业务类型</th><th>到岗率</th><th>上期结算</th><th>状态</th></tr></thead>
      <tbody>{contracts.slice(0, 5).map(contract => {
        const settled = contract.signedAt != null && contract.signedAt < state.month;
        return <tr key={contract.id}>
          <td><button type="button" className="overview-table-link" title={contract.title} onClick={() => navigate('contracts')}>{contract.title}</button></td>
          <td>{BUSINESS_LABELS[contract.business]}</td>
          <td className="table-date">{settled ? percent(contract.attendance * 100) : '—'}</td>
          <td className="table-date">{settled ? compactMoney(contract.revenue) : '—'}</td>
          <td><span className={`status-pill${contract.status === 'unsigned' ? ' status-pill--amber' : ''}`}><i />{contract.status === 'unsigned' ? '待签署' : '履约中'}</span></td>
        </tr>;
      })}</tbody>
    </table></div> : <div className="empty-note">暂无履约项目。 <button type="button" className="button button--text" onClick={() => navigate('bidding')}>查看招标</button></div>}
  </section>;
}

const newsLabels: Record<GameNews['kind'], string> = {
  market: '市场行情', customer: '客户动态', labor: '劳动关系', finance: '财经动态', business: '行业动态', technology: '技术进展', compliance: '合规提醒',
};

export function NewsItems({ news, limit, onSelect }: { news: GameNews[]; limit: number; onSelect: () => void }) {
  if (!news.length) return <p className="empty-note">暂无行业消息</p>;
  return <ul className="news-list">{news.slice(0, limit).map(item => <li key={item.id}>
    <button type="button" onClick={onSelect}>
      <i className={`news-dot-${item.severity}`} />
      <span><strong>{item.title}</strong><small>{newsLabels[item.kind]} · {gameMonth(item.month)}</small></span>
    </button>
  </li>)}</ul>;
}

function NewsPanel({ state, navigate }: { state: GameState; navigate: Navigate }) {
  return <section className="panel overview-panel news-panel" aria-labelledby="news-title">
    <div className="panel-heading">
      <h2 id="news-title">行业动态</h2>
      <button type="button" className="button button--text" onClick={() => navigate('opinion')}>舆情中心 <Icon name="arrowRight" size={13} /></button>
    </div>
    <NewsItems news={state.news} limit={3} onSelect={() => navigate('opinion')} />
  </section>;
}

function ChallengeStatus({ state }: { state: GameState }) {
  const years = state.setup.challenge;
  if (!years) return null;
  const target = years * 12;
  const report = state.player.reports.find(item => item.month === target - 1);
  const complete = state.month >= target;
  const profit = complete ? state.player.reports.filter(item => item.month < target).reduce((sum, item) => sum + item.profit, 0) : 0;

  return <section className="panel challenge-panel" aria-labelledby="challenge-title">
    <div className="challenge-heading">
      <ToneIcon name="rankings" tone={complete ? 'green' : 'violet'} />
      <div><h2 id="challenge-title">{years} 年经营挑战</h2>
        <p>{complete ? `已在 ${gameMonth(target - 1)}完成挑战结算，可继续沙盒经营。` : `距 ${gameMonth(target - 1)}结算还有 ${integer(target - state.month)} 个月`}</p></div>
    </div>
    {complete && report ? <div className="challenge-metrics">
      <div>挑战累计利润<strong>{compactMoney(profit)}</strong></div>
      <div>到期月末现金<strong>{compactMoney(report.cash)}</strong></div>
      <div>到期在册人数<strong>{integer(report.headcount)} 人</strong></div>
      <div>到期员工满意度<strong>{integer(report.satisfaction)} / 100</strong></div>
    </div> : <div className="challenge-progress">
      <progress value={Math.min(state.month, target)} max={target} aria-label="挑战已结算月份" />
      <span>{Math.min(state.month, target)} / {target} 月</span>
    </div>}
  </section>;
}

export function Dashboard({ state, busy, navigate, advance, openCompanySetup }: {
  state: GameState;
  busy: boolean;
  navigate: Navigate;
  advance: () => void;
  openCompanySetup: () => void;
}) {
  const bankrupt = state.player.status === 'bankrupt';
  return <div className="overview">
    <section className="overview-intro">
      <div><h1>经营总览</h1><p>{state.player.name} · {gameMonth(state.month)}经营周期</p></div>
      <div className="overview-actions">
        <button type="button" className="button button--outline" disabled={busy} onClick={openCompanySetup}><Icon name="plus" size={15} />创建企业</button>
        <button type="button" className="button button--primary" disabled={busy || bankrupt} onClick={advance}>
          <Icon name="spark" size={15} />{busy ? '正在处理' : '推进下月'}<Icon name="arrowRight" size={14} />
        </button>
      </div>
    </section>
    {bankrupt && <div className="overview-alert" role="alert"><Icon name="alert" size={16} />企业已破产。可在系统设置中读取存档，或创建新企业。</div>}
    <ChallengeStatus state={state} />
    <KpiCards state={state} />
    <div className="overview-columns"><Trend state={state} /><TodoPanel state={state} navigate={navigate} /></div>
    <div className="overview-columns"><ProjectPanel state={state} navigate={navigate} /><NewsPanel state={state} navigate={navigate} /></div>
  </div>;
}
