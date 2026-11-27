import { useState } from 'react';
import { BUSINESS_LABELS, INDUSTRIES, RULES } from '../simulation/data';
import { defaultBidPlan, estimateBid } from '../simulation/engine';
import { bidPreparation, bidPreparationCost, contractSkillTarget, marketWage, supplierChain } from '../simulation/operations';
import type { BidPlan, Business, Client, Contract, GameState, Manager, Tender } from '../simulation/types';
import { CONTRACT_LABELS, CONTRACT_TONES, clientName, companyName, industryName, monthLabel, occupationName, ownContracts, ownWorkers } from './model';
import type { FeatureProps } from './model';
import { Button, DescriptionList, Field, Grid, LinkButton, Meter, Modal, Notice, NumberInput, PageHeader, Section, Stats, Tag, compactMoney, money, number, percent } from './ui';

const tenderLabels = { open: '接受投标', awarded: '已定标', expired: '已截止' } as const;
const bidLabels = { submitted: '已提交', won: '已中标', lost: '未中标' } as const;

function businessOptions() {
  return Object.entries(BUSINESS_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>);
}

export function CustomersPage({ state, navigate }: FeatureProps) {
  const [industry, setIndustry] = useState('');
  const [selectedId, select] = useState('');
  const selected = state.clients.find((client) => client.id === selectedId);
  const active = ownContracts(state).filter((contract) => contract.status === 'active');
  const rows = industry ? state.clients.filter((client) => client.industryId === industry) : state.clients;
  return <>
    <PageHeader title="客户管理" description="查看客户的正式编制、外部用工需求与采购信用。"><Button onClick={() => navigate('bidding')}>前往招采大厅</Button></PageHeader>
    <Stats items={[
      { label: '市场客户', value: number(state.clients.length) },
      { label: '服务中客户', value: number(new Set(active.map((contract) => contract.clientId)).size) },
      { label: '招采中的客户', value: number(new Set(state.tenders.filter((tender) => tender.status === 'open').map((tender) => tender.clientId)).size) },
      { label: '市场外部用工缺口', value: `${number(state.clients.reduce((total, client) => total + Math.max(0, client.demand - client.formalStaff), 0))} 人` },
    ]} />
    <Section title="客户档案"><Grid rows={rows} rowKey={(row) => row.id} search={(row) => `${row.name} ${row.city} ${industryName(row.industryId)}`} searchLabel="搜索客户、城市或行业" filter={<select aria-label="筛选行业" value={industry} onChange={(event) => setIndustry(event.target.value)}><option value="">全部行业</option>{INDUSTRIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>} columns={[
      { title: '客户名称', sort: (row) => row.name, render: (row) => <><strong>{row.name}</strong><small className="feature-subtext">{row.city} · {industryName(row.industryId)}</small></> },
      { title: '经营景气', sort: (row) => row.condition, render: (row) => <Meter value={row.condition} tone={row.condition >= 65 ? 'good' : 'warn'} /> },
      { title: '正式员工 / 编制', render: (row) => `${number(row.formalStaff)} / ${number(row.headcountCap)}` },
      { title: '外部用工缺口', sort: (row) => row.demand - row.formalStaff, render: (row) => `${number(Math.max(0, row.demand - row.formalStaff))} 人` },
      { title: '付款信用', sort: (row) => row.credit, render: (row) => <Tag tone={row.credit >= 75 ? 'good' : 'warn'}>{Math.round(row.credit)} 分</Tag> },
      { title: '账期', sort: (row) => row.paymentMonths, render: (row) => `${row.paymentMonths} 个月` },
      { title: '操作', render: (row) => <LinkButton onClick={() => select(row.id)}>查看档案</LinkButton> },
    ]} /></Section>
    {selected && <Modal title={selected.name} onClose={() => select('')}>
      <CustomerDetails state={state} client={selected} />
      <div className="feature-form"><Notice>采购预算、编制和转正名额随客户经营表现按月调整。</Notice><footer><Button primary onClick={() => { select(''); navigate('bidding'); }}>查看可投标项目</Button></footer></div>
    </Modal>}
  </>;
}

function CustomerDetails({ state, client }: { state: GameState; client: Client }) {
  return <DescriptionList items={[
    { label: '所属行业 / 城市', value: `${industryName(client.industryId)} · ${client.city}` },
    { label: '外部用工岗位', value: occupationName(client.occupationId) },
    { label: '正式员工 / 编制', value: `${number(client.formalStaff)} / ${number(client.headcountCap)} 人` },
    { label: '实际劳动需求', value: `${number(client.demand)} 人` },
    { label: '正式员工月薪', value: money(client.formalWage) },
    { label: '正式员工月福利', value: money(client.formalBenefits) },
    { label: '外部用工预算', value: money(client.budget) },
    { label: '降本压力', value: `${Math.round(client.pressure)} 分` },
    { label: '合规 / 质量要求', value: `${Math.round(client.compliance)} / ${Math.round(client.quality)} 分` },
    { label: '本公司信任度', value: `${Math.round(client.trust[state.player.id] ?? 50)} 分` },
    { label: '可转正名额', value: `${client.conversionSlots} 人` },
    { label: '外包依赖度', value: percent(client.dependency) },
  ]} />;
}

export function BiddingPage(props: FeatureProps) {
  const { state, navigate } = props;
  const [selectedId, select] = useState('');
  const [business, setBusiness] = useState('');
  const [status, setStatus] = useState('open');
  const selected = state.tenders.find((tender) => tender.id === selectedId);
  const mine = state.bids.filter((bid) => bid.companyId === state.player.id);
  const bidsByTender = new Map(mine.map((bid) => [bid.tenderId, bid]));
  const rows = state.tenders.filter((tender) => (!status || tender.status === status) && (!business || tender.business === business));
  const preparation = bidPreparation(state);
  return <>
    <PageHeader title="招投标管理" description="比较招采条件、测算方案并提交报价。到期后由客户统一评审。"><Button onClick={() => navigate('contracts')}>查看我的合同</Button></PageHeader>
    <Stats items={[
      { label: '本月投标准备', value: `剩余 ${preparation.remaining} / ${preparation.limit} 点`, note: '月结恢复额度，每 25 名上期在册员工加 1 点，上限 8 点', tone: preparation.remaining ? 'info' : 'warn' },
      { label: '开放招采', value: state.tenders.filter((tender) => tender.status === 'open').length },
      { label: '待评审方案', value: mine.filter((bid) => bid.status === 'submitted').length },
      { label: '累计中标', value: mine.filter((bid) => bid.status === 'won').length, tone: 'good' },
      { label: '累计未中标', value: mine.filter((bid) => bid.status === 'lost').length },
    ]} />
    <Section title="招采大厅"><Grid rows={rows} rowKey={(row) => row.id} search={(row) => `${row.title} ${clientName(state, row.clientId)} ${occupationName(row.occupationId)}`} searchLabel="搜索项目、客户或岗位" filter={<>
      <select aria-label="筛选招标状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option><option value="open">接受投标</option><option value="awarded">已定标</option><option value="expired">已截止</option></select>
      <select aria-label="筛选业务类型" value={business} onChange={(event) => setBusiness(event.target.value)}><option value="">全部业务</option>{businessOptions()}</select>
    </>} empty="这个筛选条件下暂无项目。推进月份后将补充新的市场需求。" columns={[
      { title: '项目名称', sort: (row) => row.title, render: (row) => <><strong>{row.title}</strong><small className="feature-subtext">{row.pilot ? '首月试单 · ' : ''}{row.upstreamId ? `上游服务商 · ${companyName(state, row.upstreamId)}` : clientName(state, row.clientId)}</small></> },
      { title: '业务模式', render: (row) => <Tag tone="info">{BUSINESS_LABELS[row.business]}</Tag> },
      { title: '需求人数', sort: (row) => row.headcount, render: (row) => `${number(row.headcount)} 人` },
      { title: '准备额度', sort: bidPreparationCost, render: (row) => `${bidPreparationCost(row)} 点` },
      { title: '月度采购预算', sort: (row) => row.budget * row.headcount, render: (row) => <strong>{compactMoney(row.budget * row.headcount)}</strong> },
      { title: '合同期 / 账期', render: (row) => `${row.months} 月 / ${row.paymentMonths} 月` },
      { title: '评审月份', sort: (row) => row.deadline, render: (row) => monthLabel(row.deadline) },
      { title: '状态', render: (row) => { const bid = bidsByTender.get(row.id); return <Tag tone={bid?.status === 'won' ? 'good' : row.status === 'open' ? 'info' : 'neutral'}>{bid ? bidLabels[bid.status] : tenderLabels[row.status]}</Tag>; } },
      { title: '操作', render: (row) => <LinkButton onClick={() => select(row.id)}>{row.status === 'open' ? (bidsByTender.has(row.id) ? '已提交方案' : '制定方案') : '评审详情'}</LinkButton> },
    ]} /></Section>
    {selected && <BidDialog key={selected.id} {...props} tender={selected} existing={bidsByTender.get(selected.id)?.plan} close={() => select('')} />}
  </>;
}

function BidDialog({ state, tender, existing, close, run, busy }: FeatureProps & { tender: Tender; existing?: BidPlan; close: () => void }) {
  const [plan, setPlan] = useState(() => existing ?? defaultBidPlan(state, tender));
  const numericValid = [plan.price, plan.wage, plan.benefit, plan.training, plan.management, plan.headcount, plan.skill, plan.mobilization, plan.subcontract, plan.depth].every(Number.isFinite);
  const preview = numericValid ? estimateBid(state, tender, plan) : null;
  const set = <K extends keyof BidPlan,>(key: K, value: BidPlan[K]) => setPlan((old) => ({ ...old, [key]: value }));
  const matches = state.suppliers.filter((supplier) => supplier.specialty === plan.business);
  const suppliers = matches.length > 0 ? matches : state.suppliers;
  const maxDepth = supplierChain(state, { ...plan, depth: RULES.maxChainDepth - Number(Boolean(tender.upstreamId)) }).length;
  const editable = tender.status === 'open' && !existing;
  const preparation = bidPreparationCost(tender);
  const { remaining } = bidPreparation(state);
  const offers = state.bids.filter((item) => item.tenderId === tender.id).sort((a, b) => b.estimate.score - a.estimate.score);
  return <Modal title={editable ? '投标方案' : tender.status === 'open' ? '已提交方案' : '评审详情'} onClose={close}>
    <DescriptionList items={[
      { label: '项目名称', value: tender.title }, { label: '月度预算 / 人均', value: `${money(tender.budget * tender.headcount)} / ${money(tender.budget)}` },
      { label: '需求人数与岗位', value: `${tender.headcount} 人 · ${occupationName(tender.occupationId)}` }, { label: '合同期 / 付款周期', value: `${tender.months} 月 / ${tender.paymentMonths} 月` },
      { label: '客户验收要求', value: `技能 ${tender.skill} · 质量 ${tender.quality} · 到岗 ${percent(tender.attendance * 100)}` },
      { label: '定标月份', value: monthLabel(tender.deadline) },
      { label: '准备额度', value: editable ? `需 ${preparation} 点，本月余 ${remaining} 点` : `${preparation} 点` },
    ]} />
    {editable ? <form className="feature-form" onSubmit={async (event) => { event.preventDefault(); if (numericValid && (await run({ type: 'bid', tenderId: tender.id, plan })).ok) close(); }}>
      {tender.pilot && <Notice>这是为期 5 个月的同城试单。准备成本较低，仍需参与采购评审。</Notice>}
      <div className="feature-form-grid">
        <Field label="人均月服务报价（元）"><NumberInput value={plan.price} min={100} max={Math.floor(tender.budget * 1.03)} onChange={(value) => set('price', value)} /></Field>
        <Field label="人均税前月薪（元）"><NumberInput value={plan.wage} min={Math.ceil(Math.max(RULES.minimumWage, marketWage(state, tender.occupationId) * .54))} max={200000} onChange={(value) => set('wage', value)} /></Field>
        <Field label="拟服务人数"><NumberInput value={plan.headcount} min={Math.ceil(tender.headcount * .65)} max={tender.headcount} onChange={(value) => set('headcount', value)} /></Field>
        <Field label="自动招聘最低技能（分）" help="筛选自动招募和调配人员，合同仍按客户技能标准验收。"><NumberInput value={plan.skill} max={100} onChange={(value) => set('skill', value)} /></Field>
        <Field label="用工模式"><select value={plan.business} onChange={(event) => { const value = event.target.value as Business; setPlan((current) => ({ ...current, business: value, supplierId: null, subcontract: 0, depth: 0 })); }}>{businessOptions()}</select></Field>
        <Field label="现场实际管理方"><select value={plan.manager} onChange={(event) => set('manager', event.target.value as Manager)}><option value="provider">服务商管理</option><option value="client">客户直接管理</option></select></Field>
        <Field label="预计到岗周期（月）"><NumberInput value={plan.mobilization} max={6} onChange={(value) => set('mobilization', value)} /></Field>
        <Field label="人均月福利（元）" help={`另计 ${(RULES.statutoryRate * 100).toFixed(0)}% 的游戏内法定成本。`}><NumberInput value={plan.benefit} max={20000} onChange={(value) => set('benefit', value)} /></Field>
        <Field label="人均月培训（元）"><NumberInput value={plan.training} max={20000} onChange={(value) => set('training', value)} /></Field>
        <Field label="人均月管理（元）"><NumberInput value={plan.management} max={20000} onChange={(value) => set('management', value)} /></Field>
        <Field label="合作供应商"><select value={plan.supplierId ?? ''} onChange={(event) => { const id = event.target.value; setPlan((old) => ({ ...old, supplierId: id || null, subcontract: id ? old.subcontract || .25 : 0, depth: id ? 1 : 0 })); }}><option value="">全部自营</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
        {plan.supplierId && <><Field label="分包比例（%）"><NumberInput value={Math.round(plan.subcontract * 100)} min={1} max={RULES.maxSubcontract * 100} onChange={(value) => set('subcontract', value / 100)} /></Field><Field label="分包层数"><NumberInput value={plan.depth} min={1} max={maxDepth} onChange={(value) => set('depth', value)} /></Field></>}
      </div>
      {preview && <div className="feature-preview"><h3>达产后方案测算</h3><DescriptionList items={[
        { label: '预计月收入 / 成本', value: `${compactMoney(preview.revenue)} / ${compactMoney(preview.cost)}` },
        { label: '预计利润率', value: <Tag tone={preview.margin >= 0 ? 'good' : 'bad'}>{percent(preview.margin * 100)}</Tag> },
        { label: '预计到岗 / 交付质量', value: `${percent(preview.attendance * 100)} / ${Math.round(preview.quality)} 分` },
        { label: '招聘难度 / 离职风险', value: `${Math.round(preview.difficulty)} 分 / ${percent(preview.turnover * 100)}` },
        { label: '预计垫资', value: compactMoney(preview.exposure) },
        { label: '合规风险 / 预评分', value: `${Math.round(preview.risk)} / ${Math.round(preview.score)} 分` },
      ]} /></div>}
      {remaining < preparation && <Notice tone="warn">本月准备额度不足。可查看低额度采购，或月结后再提交尚未截止的项目。</Notice>}
      <footer><Button onClick={close}>关闭</Button><Button primary type="submit" disabled={busy || !numericValid || remaining < preparation}>提交投标</Button></footer>
    </form> : tender.status === 'open' && existing ? <>
      <DescriptionList items={[
        { label: '提交的人均服务报价', value: money(existing.price) }, { label: '提交的月薪预算', value: money(existing.wage) },
        { label: '计划服务人数', value: `${existing.headcount} 人` }, { label: '计划用工模式', value: BUSINESS_LABELS[existing.business] },
      ]} />
      <div className="feature-form"><Notice>报价已提交。推进至评审月份完成月结后，可查看定标结果。</Notice></div>
    </> : <Grid rows={offers} rowKey={(row) => row.id} empty="该项目未收到有效报价。" columns={[
      { title: '投标单位', render: (row) => companyName(state, row.companyId) },
      { title: '人均报价', render: (row) => money(row.plan.price) },
      { title: '综合评分', render: (row) => Math.round(row.estimate.score) },
      { title: '结果', render: (row) => <Tag tone={row.status === 'won' ? 'good' : 'neutral'}>{bidLabels[row.status]}</Tag> },
    ]} />}
  </Modal>;
}

export function ContractsPage(props: FeatureProps) {
  const { state, run, navigate, busy } = props;
  const [openId, select] = useState('');
  const [status, setStatus] = useState('');
  const contracts = ownContracts(state);
  const current = contracts.filter((contract) => contract.status === 'active');
  const rows = status ? contracts.filter((contract) => contract.status === status) : contracts;
  const selected = contracts.find((contract) => contract.id === openId);
  return <>
    <PageHeader title="合同管理" description="签署中标合同，查看交付结算、扣款和续约。"><Button onClick={() => navigate('bidding')}>查看招标</Button></PageHeader>
    <Stats items={[
      { label: '待签署', value: contracts.filter((contract) => contract.status === 'unsigned').length, tone: 'warn' },
      { label: '履约中', value: current.length, tone: 'good' },
      { label: '临近到期', value: current.filter((contract) => contract.remaining <= 2).length },
      { label: '累计合同收入', value: compactMoney(contracts.reduce((sum, contract) => sum + contract.cumulativeRevenue, 0)) },
    ]} />
    <Section title="合同台账"><Grid rows={rows} rowKey={(row) => row.id} search={(row) => `${row.title} ${clientName(state, row.clientId)} ${row.id}`} searchLabel="搜索合同或客户" filter={<select aria-label="筛选合同状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(CONTRACT_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>} empty="暂无合同。中标项目将在这里进入待签署状态。" columns={[
      { title: '合同名称', sort: (row) => row.title, render: (row) => <><strong>{row.title}</strong><small className="feature-subtext">{clientName(state, row.clientId)}</small></> },
      { title: '状态', render: (row) => <Tag tone={CONTRACT_TONES[row.status]}>{CONTRACT_LABELS[row.status]}</Tag> },
      { title: '服务人数', sort: (row) => row.headcount, render: (row) => `${row.headcount} 人` },
      { title: '合同余期', sort: (row) => row.remaining, render: (row) => `${row.remaining} 月` },
      { title: '最近结算', sort: (row) => row.revenue, render: (row) => money(row.revenue) },
      { title: '交付质量', sort: (row) => row.quality, render: (row) => row.status === 'unsigned' ? '—' : <Meter value={row.quality} label={`${Math.round(row.quality)} 分`} tone={row.quality >= row.qualityTarget ? 'good' : 'warn'} /> },
      { title: '操作', render: (row) => <div className="feature-inline-actions"><LinkButton onClick={() => select(row.id)}>合同详情</LinkButton>{row.status === 'unsigned' && <LinkButton disabled={busy} onClick={() => { void run({ type: 'sign', contractId: row.id }); }}>签署</LinkButton>}</div> },
    ]} /></Section>
    {selected && <ContractDialog {...props} contract={selected} close={() => select('')} />}
  </>;
}

function ContractDialog({ state, contract, close, navigate, run, busy }: FeatureProps & { contract: Contract; close: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const invoices = state.invoices.filter((invoice) => invoice.contractId === contract.id);
  const customer = state.clients.find((client) => client.id === contract.clientId);
  const tender = state.tenders.find(item => item.id === contract.tenderId);
  const team = ownWorkers(state).filter((worker) => worker.contractId === contract.id);
  const teamWage = team.length ? team.reduce((sum, worker) => sum + worker.wage, 0) / team.length : null;
  return <Modal title="合同详情" onClose={close}>
    <DescriptionList items={[
      { label: '合同名称', value: contract.title }, { label: '客户 / 上游', value: contract.upstreamId ? companyName(state, contract.upstreamId) : clientName(state, contract.clientId) },
      { label: '状态', value: <Tag tone={CONTRACT_TONES[contract.status]}>{CONTRACT_LABELS[contract.status]}</Tag> }, { label: '服务模式', value: BUSINESS_LABELS[contract.business] },
      { label: '最近一月服务收入', value: money(contract.revenue) }, { label: '累计服务收入', value: money(contract.cumulativeRevenue) },
      { label: '实际 / 要求到岗率', value: `${percent(contract.attendance * 100)} / ${percent(contract.attendanceTarget * 100)}` }, { label: '实际 / 要求交付质量', value: `${Math.round(contract.quality)} / ${Math.round(contract.qualityTarget)} 分` },
      { label: '客户验收技能 / 自动招聘门槛', value: `${contractSkillTarget(contract, tender)} / ${contract.plan.skill} 分` },
      { label: '合同期限 / 剩余期限', value: `${contract.term} 月 / ${contract.remaining} 月` }, { label: '付款周期', value: `${contract.paymentMonths} 个月` },
      { label: '合规风险', value: `${Math.round(contract.risk)} 分` }, { label: '扣款', value: money(contract.penalties) },
      { label: '客户正式岗位参考月薪', value: customer ? money(customer.formalWage) : '—' },
      { label: '本公司项目人员约定均薪', value: teamWage === null ? '—' : money(teamWage) },
      { label: '应收款余额', value: money(invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.received), 0)) },
      { label: contract.business === 'delivery' ? '成果完成度' : '本月供应商支出', value: contract.business === 'delivery' ? percent(contract.progress * 100) : money(contract.lastSupplierCost) },
    ]} />
    <div className="feature-form">
      {confirm && <Notice tone="warn">{contract.status === 'unsigned' ? '确认放弃签署该中标合同？此操作会影响客户信任和企业信誉。' : '终止合同可能产生违约支出，项目人员将退回待岗池。确认终止该合同？'}</Notice>}
      <footer>
        {confirm ? <><Button onClick={() => setConfirm(false)}>返回</Button><Button primary disabled={busy} onClick={async () => { if ((await run({ type: 'cancel', contractId: contract.id })).ok) close(); }}>确认{contract.status === 'unsigned' ? '放弃' : '终止'}</Button></> : <>
          {contract.status === 'unsigned' && <><Button disabled={busy} onClick={() => setConfirm(true)}>放弃签署</Button><Button primary disabled={busy} onClick={async () => { if ((await run({ type: 'sign', contractId: contract.id })).ok) close(); }}>签署合同</Button></>}
          {contract.status === 'active' && <><Button disabled={busy} onClick={() => setConfirm(true)}>终止合同</Button>{contract.remaining <= 2 && !contract.renewed && <Button disabled={busy} onClick={() => { void run({ type: 'renew', contractId: contract.id }); }}>申请续约</Button>}<Button primary onClick={() => { close(); navigate('staffing'); }}>配置交付人员</Button></>}
        </>}
      </footer>
    </div>
  </Modal>;
}
