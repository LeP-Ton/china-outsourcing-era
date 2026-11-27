import { useRef, useState } from 'react';
import { DIFFICULTY_LABELS, ORIGIN_LABELS, RULES, STRATEGY_LABELS } from '../simulation/data';
import type { GameState } from '../simulation/types';
import type { useGame } from '../persistence/store';
import type { FeatureProps } from './model';
import { clientName, companyName, latestReport, monthLabel, ownContracts, ownWorkers } from './model';
import { Button, DescriptionList, Field, Grid, Modal, Notice, NumberInput, PageHeader, Section, Stats, Tag, compactMoney, money, number, percent } from './ui';

type LedgerTab = 'profit' | 'cash' | 'balance' | 'invoice';
const ledgerTabs: Record<LedgerTab, string> = { profit: '利润表', cash: '现金流量表', balance: '资产负债表', invoice: '应收账款' };

export function FinancePage({ state, run, busy }: FeatureProps) {
  const [tab, setTab] = useState<LedgerTab>('profit');
  const [transaction, transact] = useState<'finance' | 'repay' | null>(null);
  const [amount, setAmount] = useState(100000);
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const company = state.player;
  const last = latestReport(company);
  const invoices = state.invoices.filter((invoice) => invoice.companyId === company.id);
  const receivables = invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.received), 0);
  const overdue = invoices.filter((invoice) => invoice.paidAt === null && invoice.due < state.month).reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.received), 0);
  const assets = company.cash + receivables;
  const liabilities = company.payables + company.debt;
  const orderedReports = company.reports.slice().reverse();
  const issue = (kind: 'finance' | 'repay') => { transact(kind); setAmount(kind === 'finance' ? 100000 : Math.min(company.debt, company.cash, 100000)); };
  return <>
    <PageHeader title="财务管理" description="对照营业收入、实际回款、应收和流动资金，管理周转。"><Button disabled={busy || company.debt <= 0 || company.cash <= 0} onClick={() => issue('repay')}>偿还借款</Button><Button primary disabled={busy} onClick={() => issue('finance')}>申请周转资金</Button></PageHeader>
    <Stats items={[
      { label: '可用现金', value: compactMoney(company.cash) }, { label: '未收服务款', value: compactMoney(receivables), note: `其中逾期 ${compactMoney(overdue)}`, tone: overdue ? 'warn' : undefined },
      { label: '最近月经营利润', value: compactMoney(last?.profit ?? 0), tone: (last?.profit ?? 0) < 0 ? 'bad' : 'good' }, { label: '当前借款余额', value: compactMoney(company.debt) },
    ]} />
    <Section title="企业账务"><div className="feature-tabs" role="tablist" aria-label="企业账务报表">{(Object.entries(ledgerTabs) as [LedgerTab, string][]).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={id === tab} onClick={() => setTab(id)}>{label}</button>)}</div>
      {tab === 'profit' && <><DescriptionList items={[
        { label: '统计月份', value: last ? monthLabel(last.month) : '尚未月结' }, { label: '营业收入', value: money(last?.revenue ?? 0) },
        { label: '薪酬 / 福利及法定成本', value: `${money(last?.payroll ?? 0)} / ${money(last?.benefits ?? 0)}` }, { label: '招聘 / 培训', value: `${money(last?.recruitment ?? 0)} / ${money(last?.training ?? 0)}` },
        { label: '供应商 / 项目管理', value: `${money(last?.suppliers ?? 0)} / ${money(last?.management ?? 0)}` }, { label: '技术 / 固定运营费', value: `${money(last?.research ?? 0)} / ${money(last?.fixed ?? 0)}` },
        { label: '争议处置', value: money(last?.disputes ?? 0) }, { label: '经营成本合计', value: money(last?.costs ?? 0) },
      ]} /><Grid key="profit" rows={orderedReports} rowKey={(row) => String(row.month)} empty="推进月份后可查看实际利润。" columns={[
        { title: '结算期间', sort: (row) => row.month, render: (row) => monthLabel(row.month) }, { title: '营业收入', sort: (row) => row.revenue, render: (row) => money(row.revenue), align: 'right' },
        { title: '成本费用', sort: (row) => row.costs, render: (row) => money(row.costs), align: 'right' }, { title: '履约扣款（已扣收入）', render: (row) => money(row.penalty), align: 'right' },
        { title: '经营利润', sort: (row) => row.profit, render: (row) => <strong className={row.profit < 0 ? 'feature-ink--bad' : 'feature-ink--good'}>{money(row.profit)}</strong>, align: 'right' },
      ]} /></>}
      {tab === 'cash' && <Grid key="cash" rows={orderedReports} rowKey={(row) => String(row.month)} empty="推进月份后可查看实际现金流。" columns={[
        { title: '结算期间', sort: (row) => row.month, render: (row) => monthLabel(row.month) }, { title: '期初现金', render: (row) => money(row.openingCash), align: 'right' },
        { title: '实际回款', sort: (row) => row.received, render: (row) => money(row.received), align: 'right' }, { title: '实际经营支出', sort: (row) => row.paid, render: (row) => money(row.paid), align: 'right' },
        { title: '融资 / 偿还', render: (row) => `${money(row.financing)} / ${money(row.repayments)}`, align: 'right' }, { title: '期末现金', sort: (row) => row.cash, render: (row) => <strong>{money(row.cash)}</strong>, align: 'right' },
      ]} />}
      {tab === 'balance' && <DescriptionList items={[
        { label: '货币资金', value: money(company.cash) }, { label: '应收账款', value: money(receivables) }, { label: '资产合计', value: money(assets) },
        { label: '应付经营款（含工资）', value: money(company.payables) }, { label: '其中应付工资', value: money(company.wageArrears ?? 0) }, { label: '借款余额', value: money(company.debt) },
        { label: '负债合计', value: money(liabilities) }, { label: '账面净资产', value: money(assets - liabilities) },
      ]} />}
      {tab === 'invoice' && <Grid key="invoice" rows={(invoiceFilter === 'open' ? invoices.filter((invoice) => invoice.paidAt === null) : invoiceFilter === 'overdue' ? invoices.filter((invoice) => invoice.paidAt === null && invoice.due < state.month) : invoices).reverse()} rowKey={(row) => row.id} search={(row) => `${row.id} ${clientName(state, row.clientId)} ${state.contracts.find((item) => item.id === row.contractId)?.title ?? ''}`} searchLabel="搜索客户或应收单号" filter={<select aria-label="筛选应收状态" value={invoiceFilter} onChange={(event) => setInvoiceFilter(event.target.value)}><option value="">全部应收</option><option value="open">未结清</option><option value="overdue">已逾期</option></select>} columns={[
        { title: '结算付款方', render: (row) => <><strong>{row.upstreamId ? companyName(state, row.upstreamId) : clientName(state, row.clientId)}</strong><small className="feature-subtext">{row.id}</small></> }, { title: '确认 / 应收月份', render: (row) => `${monthLabel(row.issued)} / ${monthLabel(row.due)}` },
        { title: '账面确认', sort: (row) => row.amount, render: (row) => money(row.amount), align: 'right' }, { title: '累计实收', sort: (row) => row.received, render: (row) => money(row.received), align: 'right' }, { title: '状态', render: (row) => row.paidAt !== null ? <Tag tone="good">已结清</Tag> : row.due < state.month ? <Tag tone="bad">已逾期</Tag> : <Tag tone="info">待回款</Tag> },
      ]} />}
    </Section>
    {transaction && <Modal title={transaction === 'finance' ? '申请周转资金' : '偿还借款'} onClose={() => transact(null)}><form className="feature-form" onSubmit={async (event) => { event.preventDefault(); if ((await run({ type: transaction, amount })).ok) transact(null); }}>
      <Notice>{transaction === 'finance' ? `当前游戏内月利率 ${(RULES.monthlyInterest * 100).toFixed(1)}%，融资会增加现金与负债。` : `当前借款余额 ${money(company.debt)}，可用现金 ${money(company.cash)}。`}</Notice>
      <Field label="金额（元）"><NumberInput value={amount} onChange={setAmount} min={transaction === 'finance' ? 1000 : 1} max={transaction === 'repay' ? Math.min(company.debt, company.cash) : undefined} /></Field>
      <footer><Button onClick={() => transact(null)}>关闭</Button><Button type="submit" primary disabled={busy}>确认{transaction === 'finance' ? '借款' : '偿还'}</Button></footer>
    </form></Modal>}
  </>;
}

export function RankingsPage({ state }: FeatureProps) {
  const [metric, setMetric] = useState<'revenue' | 'profit' | 'headcount'>('revenue');
  const companies = [state.player, ...state.competitors];
  const headcounts = new Map<string, number>();
  for (const worker of state.workers) if (worker.status === 'employed' && worker.employerId) headcounts.set(worker.employerId, (headcounts.get(worker.employerId) ?? 0) + 1);
  const rows = companies.map((company) => ({ company, revenue: latestReport(company)?.revenue ?? 0, profit: latestReport(company)?.profit ?? 0, headcount: headcounts.get(company.id) ?? 0 })).sort((left, right) => right[metric] - left[metric]);
  const assigned = ownWorkers(state);
  const latest = latestReport(state.player);
  const reports = state.player.reports.slice(-12);
  const departures = reports.reduce((sum, report) => sum + report.departures, 0);
  const meanHeadcount = reports.length ? reports.reduce((sum, report) => sum + report.headcount, 0) / reports.length : 0;
  const active = ownContracts(state).filter((contract) => contract.status === 'active');
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const customerTrust = [...new Set(active.map((item) => item.clientId))].map((id) => state.clients.find((item) => item.id === id)?.trust[state.player.id] ?? 48);
  const avgTenure = assigned.length ? assigned.reduce((sum, worker) => sum + Math.max(0, state.month - (worker.hiredAt ?? state.month)), 0) / assigned.length : 0;
  const conversions = state.player.totalHires > 0 ? percent(state.player.totalConversions / state.player.totalHires * 100) : '—';
  return <>
    <PageHeader title="行业排名" description="比较竞争者的经营规模与市场表现，查看本企业对劳动者的实际影响。" />
    <Stats items={[
      { label: '本期排名', value: `第 ${rows.findIndex((row) => row.company.id === state.player.id) + 1} 位`, tone: 'info' },
      { label: '本期营收份额', value: totalRevenue > 0 ? `${((latest?.revenue ?? 0) / totalRevenue * 100).toFixed(1)}%` : '—' },
      { label: '履约客户数量', value: `${customerTrust.length} 家` }, { label: '履约客户平均信任', value: customerTrust.length ? `${Math.round(customerTrust.reduce((sum, value) => sum + value, 0) / customerTrust.length)} 分` : '—' },
    ]} />
    <Section title="人力资源服务企业榜"><Grid rows={rows} rowKey={(row) => row.company.id} search={(row) => `${row.company.name} ${row.company.city}`} searchLabel="搜索企业或地区" filter={<select aria-label="排名指标" value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)}><option value="revenue">按最近月营收</option><option value="profit">按最近月利润</option><option value="headcount">按在册规模</option></select>} columns={[
      { title: '排名', render: (row) => rows.indexOf(row) + 1 },
      { title: '企业', sort: (row) => row.company.name, render: (row) => <><strong>{row.company.name}</strong>{row.company.id === state.player.id ? <span className="feature-subtext"><Tag tone="info">本公司</Tag></span> : <small className="feature-subtext">{row.company.city} · {STRATEGY_LABELS[row.company.strategy]}</small>}</> },
      { title: '最近月营收', sort: (row) => row.revenue, render: (row) => money(row.revenue), align: 'right' }, { title: '最近月利润', sort: (row) => row.profit, render: (row) => money(row.profit), align: 'right' }, { title: '在册规模', sort: (row) => row.headcount, render: (row) => `${number(row.headcount)} 人`, align: 'right' },
      { title: '经营状态', render: (row) => <Tag tone={row.company.status === 'bankrupt' ? 'bad' : 'good'}>{row.company.status === 'bankrupt' ? '退出市场' : '运营中'}</Tag> },
    ]} /></Section>
    <Section title="本企业劳动者影响"><DescriptionList items={[
      { label: '最近月平均实际收入', value: latest?.headcount ? money(latest.averageIncome) : '—' }, { label: '最近月平均工时', value: latest?.headcount ? `${Math.round(latest.averageHours)} 小时` : '—' },
      { label: '最近月平均满意度', value: latest?.headcount ? `${Math.round(latest.satisfaction)} 分` : '—' }, { label: `近 ${reports.length || '—'} 个结算月离职率`, value: meanHeadcount > 0 ? percent(departures / meanHeadcount * 100) : '—' },
      { label: '当前在册员工平均任职时长', value: assigned.length ? `${avgTenure.toFixed(1)} 个月` : '—' }, { label: '最近月平均技能', value: latest?.headcount ? `${Math.round(latest.skill)} 分` : '—' },
      { label: '累计客户转正率', value: `${conversions} · ${state.player.totalConversions} / ${state.player.totalHires} 人` }, { label: '累计劳动争议', value: `${state.laborCases.length} 件` },
    ]} /></Section>
  </>;
}

type SettingsProps = FeatureProps & { game: ReturnType<typeof useGame>; openCompanySetup: () => void };

export function SettingsPage({ game, state, run, busy, navigate, openCompanySetup }: SettingsProps) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmation, setConfirmation] = useState<'load' | 'demo' | 'import' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function perform(operation: () => Promise<void>, success: string) {
    try {
      await operation();
      setMessage({ ok: true, text: success });
      setConfirmation(null);
      setFile(null);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : '操作失败，请稍后重试。' });
    }
  }

  return <>
    <PageHeader title="系统设置" description="管理存档、显示主题和全公司自动化规则。"><Button primary onClick={openCompanySetup}>创建新企业</Button></PageHeader>
    {message && <Notice tone={message.ok ? 'good' : 'bad'}>{message.text}</Notice>}
    {game.storageError && <Notice tone="warn">{game.storageError}</Notice>}
    <div className="feature-split">
      <Section title="当前经营档案"><DescriptionList items={[
        { label: '企业名称', value: state.player.name }, { label: '经营地区', value: state.setup.city }, { label: '开局背景', value: ORIGIN_LABELS[state.setup.origin] }, { label: '难度', value: DIFFICULTY_LABELS[state.setup.difficulty] },
        { label: '当前模拟月份', value: monthLabel(state.month) }, { label: '世界种子', value: state.setup.seed }, { label: '经营模式', value: state.setup.challenge ? `${state.setup.challenge} 年挑战` : '开放经营沙盒' }, { label: '累计结算', value: `${state.player.reports.length} 个月` },
      ]} /></Section>
      <Section title="经营自动化"><div className="feature-form">
        <label className="feature-field-inline"><input type="checkbox" checked={state.policies.autoHire} disabled={busy} onChange={(event) => { void run({ type: 'policies', values: { autoHire: event.target.checked } }); }} />项目缺编时自动招聘</label>
        <label className="feature-field-inline"><input type="checkbox" checked={state.policies.autoRenew} disabled={busy} onChange={(event) => { void run({ type: 'policies', values: { autoRenew: event.target.checked } }); }} />符合客户条件时自动续约</label>
        <label className="feature-field-inline"><input type="checkbox" checked={state.policies.autoPayroll} disabled={busy} onChange={(event) => { void run({ type: 'policies', values: { autoPayroll: event.target.checked } }); }} />月结自动发放工资</label>
        <footer><Button onClick={() => navigate('payroll')}>管理薪酬规则</Button></footer>
      </div></Section>
    </div>
    <Section title="本地存档" description="经营操作会写入浏览器自动存档。手动存档可以保留一个独立的恢复点。"><div className="feature-form">
      <div className="feature-inline-actions">
        <Button primary disabled={busy} onClick={() => { void perform(game.save, '已保存手动存档。'); }}>保存进度</Button>
        <Button disabled={busy} onClick={() => setConfirmation('load')}>读取存档</Button>
        <Button disabled={busy} onClick={() => { void perform(game.exportSave, '存档文件已导出。'); }}>导出存档</Button>
        <Button disabled={busy} onClick={() => fileInput.current?.click()}>导入存档</Button>
        <Button disabled={busy} onClick={() => setConfirmation('demo')}>恢复演示企业</Button>
        <input hidden type="file" accept=".json,application/json" ref={fileInput} onChange={(event) => { const item = event.target.files?.[0]; if (item) { setFile(item); setConfirmation('import'); } event.target.value = ''; }} />
      </div>
    </div></Section>
    <Section title="显示偏好"><div className="feature-form"><Field label="界面主题"><select value={game.theme} onChange={(event) => game.setTheme(event.target.value === 'dark' ? 'dark' : 'light')}><option value="light">浅色主题</option><option value="dark">深色主题</option></select></Field></div></Section>
    {confirmation && <Modal title={confirmation === 'load' ? '读取存档' : confirmation === 'demo' ? '恢复演示企业' : '导入存档'} onClose={() => { setConfirmation(null); setFile(null); }}><div className="feature-form">
      <Notice tone="warn">{confirmation === 'import' ? `将读入 ${file?.name ?? '所选文件'} 并替换当前经营进度。` : confirmation === 'load' ? '读取后将回到已保存的进度。优先读取手动存档。' : '将重新载入预设演示企业并替换当前经营进度。'}</Notice>
      {message && !message.ok && <Notice tone="bad">{message.text}</Notice>}
      <footer>
        <Button onClick={() => { setConfirmation(null); setFile(null); }}>关闭</Button><Button primary disabled={busy} onClick={() => {
          if (confirmation === 'load') void perform(async () => { if (!await game.load()) throw new Error('暂时没有可读取的存档。'); }, '已读取存档。');
          if (confirmation === 'demo') void perform(game.loadDemo, '已恢复演示企业。');
          if (confirmation === 'import' && file) void perform(() => game.importSave(file), '已导入经营存档。');
        }}>确认{confirmation === 'load' ? '读取' : confirmation === 'demo' ? '恢复' : '导入'}</Button>
      </footer>
    </div></Modal>}
  </>;
}
