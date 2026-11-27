import { useState } from 'react';
import { BUSINESS_LABELS, PROCUREMENT_PROFILES, RULES, TECHNOLOGIES } from '../simulation/data';
import { subcontractRate, supplierChain, supplierSeats } from '../simulation/operations';
import type { Contract, GameState, NewsKind } from '../simulation/types';
import { NEWS_LABELS, SEVERITY_LABELS, SEVERITY_TONES, clientName, companyName, latestReport, monthLabel, occupationName, ownContracts, ownWorkers } from './model';
import type { FeatureProps } from './model';
import { Button, DescriptionList, Empty, Field, Grid, LinkButton, Meter, Modal, Notice, NumberInput, PageHeader, Section, Stats, Tag, compactMoney, money, number, percent } from './ui';

export function MarketPage({ state, navigate }: FeatureProps) {
  const [shortage, setShortage] = useState(false);
  const rows = shortage ? state.market.segments.filter((segment) => segment.demand > segment.supply) : state.market.segments;
  const openMarket = new Map(state.tenders.filter((tender) => !tender.upstreamId).map((tender) => [tender.id, tender.occupationId]));
  const marketQuotes = new Map<string, { total: number; count: number }>();
  for (const bid of state.bids) {
    if (bid.status !== 'won' || bid.month < state.month - 6) continue;
    const occupation = openMarket.get(bid.tenderId);
    if (!occupation) continue;
    const current = marketQuotes.get(occupation) ?? { total: 0, count: 0 };
    marketQuotes.set(occupation, { total: current.total + bid.plan.price, count: current.count + 1 });
  }
  function averageQuote(id: string) {
    const quotes = marketQuotes.get(id);
    return quotes ? quotes.total / quotes.count : 0;
  }
  const procurement = state.market.procurementProfile && PROCUREMENT_PROFILES[state.market.procurementProfile];
  return <>
    <PageHeader title="市场中心" description={procurement ? `本局常规采购偏向${procurement.name}。可查看各岗位供需和薪酬。` : '跟踪岗位供需、招聘薪酬与服务行业景气。'}><Button onClick={() => navigate('rankings')}>比较竞争企业</Button><Button onClick={() => navigate('bidding')}>查看在招项目</Button></PageHeader>
    <Stats items={[
      { label: '综合景气变化', value: `${state.market.economy > 0 ? '+' : ''}${state.market.economy} 点`, tone: state.market.economy < 0 ? 'warn' : 'good' },
      { label: '人才需求指数', value: number(state.market.segments.reduce((sum, segment) => sum + segment.demand, 0)) },
      { label: '自动化渗透指数', value: `${Math.round(state.market.automation)} 分` },
      { label: '监管力度', value: `${Math.round(state.market.regulation)} 分` },
    ]} />
    <Section title="岗位供需行情"><Grid rows={rows} rowKey={(row) => row.occupationId} search={(row) => occupationName(row.occupationId)} searchLabel="搜索岗位" filter={<label className="feature-field-inline"><input type="checkbox" checked={shortage} onChange={(event) => setShortage(event.target.checked)} />仅供给偏紧</label>} columns={[
      { title: '岗位', sort: (row) => occupationName(row.occupationId), render: (row) => <strong>{occupationName(row.occupationId)}</strong> },
      { title: '参考月薪', sort: (row) => row.wage, render: (row) => money(row.wage) },
      { title: '近半年公开中标均价', sort: (row) => averageQuote(row.occupationId), render: (row) => averageQuote(row.occupationId) ? `${money(averageQuote(row.occupationId))} / 人月` : '—' },
      { title: '市场供给', sort: (row) => row.supply, render: (row) => number(row.supply) },
      { title: '需求指数', sort: (row) => row.demand, render: (row) => number(row.demand) },
      { title: '需求变动', sort: (row) => row.growth, render: (row) => <span className={row.growth >= 0 ? 'feature-ink--good' : 'feature-ink--warn'}>{row.growth > 0 ? '+' : ''}{(row.growth * 100).toFixed(1)}%</span> },
      { title: '招聘环境', sort: (row) => row.demand / Math.max(1, row.supply), render: (row) => <Tag tone={row.demand > row.supply ? 'warn' : 'good'}>{row.demand > row.supply ? '供给偏紧' : '人才充足'}</Tag> },
    ]} /></Section>
    <Section title="近期市场变化" action={<Button onClick={() => navigate('opinion')}>查阅行业新闻</Button>}><div className="feature-card-list">
      {state.news.filter((item) => ['market', 'customer', 'technology'].includes(item.kind)).slice(0, 4).map((item) => <article key={item.id} className="feature-card-row"><div><h3>{item.title}</h3><p>{item.detail}</p></div><small className="feature-muted">{monthLabel(item.month)}</small></article>)}
      {!state.news.some((item) => ['market', 'customer', 'technology'].includes(item.kind)) && <Empty>市场尚未出现显著变化。</Empty>}
    </div></Section>
  </>;
}

export function SuppliersPage({ state, run, busy, navigate }: FeatureProps) {
  const active = ownContracts(state).filter((contract) => contract.status === 'active');
  const [contractId, setContractId] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [editing, setEditing] = useState(false);
  const [profileId, setProfileId] = useState('');
  const profile = state.suppliers.find((supplier) => supplier.id === profileId);
  const contract = active.find((item) => item.id === contractId) ?? active[0];
  const relatedSuppliers = specialty ? state.suppliers.filter((item) => item.specialty === specialty) : state.suppliers;
  return <>
    <PageHeader title="供应商管理" description="维护项目分包，跟踪各层服务方、用工主体和资金流。"><Button onClick={() => navigate('bidding')}>查看上游招采</Button></PageHeader>
    <Stats items={[
      { label: '合作供应商资源', value: state.suppliers.length }, { label: '进行中的分包项目', value: active.filter((item) => item.plan.subcontract > 0).length },
      { label: '承接上游项目', value: active.filter((item) => item.upstreamId).length }, { label: '最近月供应商费用', value: compactMoney(latestReport(state.player)?.suppliers ?? 0) },
    ]} />
    <Section title="外包关系拓扑" action={contract && <Button primary onClick={() => setEditing(true)}>编辑分包配置</Button>}>
      {contract ? <><div className="feature-form"><Field label="履约项目"><select value={contract.id} onChange={(event) => setContractId(event.target.value)}>{active.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field></div><SupplyNetwork state={state} contract={contract} /></> : <Empty>签署合同后，可在此查看链路并安排分包。</Empty>}
    </Section>
    <Section title="供应商名录"><Grid rows={relatedSuppliers} rowKey={(row) => row.id} search={(row) => `${row.name} ${row.city}`} searchLabel="搜索供应商或城市" filter={<select aria-label="筛选供应商业务" value={specialty} onChange={(event) => setSpecialty(event.target.value)}><option value="">全部业务</option>{Object.entries(BUSINESS_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>} columns={[
      { title: '合作单位', sort: (row) => row.name, render: (row) => <><strong>{row.name}</strong><small className="feature-subtext">{row.city}</small></> }, { title: '优势业务', render: (row) => BUSINESS_LABELS[row.specialty] },
      { title: '月度承接容量', sort: (row) => row.capacity, render: (row) => `${number(row.capacity)} 人` }, { title: '履约质量', sort: (row) => row.quality, render: (row) => `${row.quality} 分` },
      { title: '合规信誉', sort: (row) => row.compliance, render: (row) => `${row.compliance} 分` }, { title: '报价系数', sort: (row) => row.rate, render: (row) => `市场薪酬 × ${row.rate.toFixed(2)}` },
      { title: '操作', render: (row) => <LinkButton onClick={() => setProfileId(row.id)}>查看供应商</LinkButton> },
    ]} /></Section>
    {editing && contract && <SupplierDialog key={contract.id} state={state} contract={contract} run={run} busy={busy} close={() => setEditing(false)} />}
    {profile && <Modal title={profile.name} onClose={() => setProfileId('')}><DescriptionList items={[
      { label: '主要地区', value: profile.city }, { label: '专业方向', value: BUSINESS_LABELS[profile.specialty] }, { label: '服务容量', value: `${profile.capacity} 人` }, { label: '履约与合规', value: `${profile.quality} / ${profile.compliance} 分` },
      { label: '可用下游伙伴', value: profile.partnerId ? companyName(state, profile.partnerId) : '暂无' }, { label: '标准报价系数', value: `${profile.rate.toFixed(2)} 倍市场薪酬` },
    ]} /></Modal>}
  </>;
}

function SupplyNetwork({ state, contract }: { state: GameState; contract: Contract }) {
  const chain = supplierChain(state, contract.plan);
  const workers = ownWorkers(state).filter((worker) => worker.contractId === contract.id);
  const seats = supplierSeats(contract.plan);
  const worstCapacity = chain.length ? Math.min(...chain.map((supplier) => supplier.capacity)) : 0;
  const unitRate = subcontractRate(state, contract.plan, contract.occupationId);
  const quote = contract.plan.price * contract.headcount;
  const payer = clientName(state, contract.clientId);
  const parent = state.contracts.find((item) => item.id === contract.parentContractId);
  const management = contract.plan.manager === 'client' ? payer : state.player.name;
  const payroll = workers.reduce((total, worker) => total + worker.wage, 0);
  return <>
    <div className="feature-network" aria-label="项目采购与交付关系">
      <div className="feature-network-node"><small>最终客户</small><strong>{payer}</strong><p>{parent ? `主合同约定月采购额 ${compactMoney(parent.plan.price * parent.headcount)}` : `月采购额 ${compactMoney(quote)}`}</p></div>
      {contract.upstreamId && <><span className="feature-network-arrow" aria-hidden="true">→</span><div className="feature-network-node"><small>上游主服务商</small><strong>{companyName(state, contract.upstreamId)}</strong><p>约定月度分包额 {compactMoney(quote)}</p></div></>}
      <span className="feature-network-arrow" aria-hidden="true">→</span><div className="feature-network-node"><small>本公司</small><strong>{state.player.name}</strong><p>{workers.length} 名自营员工 · {seats} 个分包岗位</p></div>
      <div className="feature-network-branches">
        <div className="feature-network-step"><span className="feature-network-arrow" aria-hidden="true">→</span><div className="feature-network-node"><small>自营劳动者</small><strong>{occupationName(contract.occupationId)}</strong><p>{workers.length} 人在岗 · 约定税前月工资合计 {compactMoney(payroll)}</p></div></div>
        {chain.length > 0 && <div className="feature-network-step">
          {chain.map((supplier, index) => <div className="feature-network-step" key={supplier.id}><span className="feature-network-arrow" aria-hidden="true">→</span><div className="feature-network-node"><small>下游第 {index + 1} 层</small><strong>{supplier.name}</strong><p>{index === 0 ? `采购参考单价 ${money(unitRate)} / 人月` : `承接容量 ${supplier.capacity} 人`}</p></div></div>)}
          <span className="feature-network-arrow" aria-hidden="true">→</span><div className="feature-network-node"><small>供应商交付人员</small><strong>{occupationName(contract.occupationId)}</strong><p>分包配置 {seats} 人</p></div>
        </div>}
      </div>
    </div>
    <DescriptionList items={[
      { label: '自营人员的劳动合同主体', value: state.player.name }, { label: '分包人员的服务交付方', value: chain.at(-1)?.name ?? '无分包' },
      { label: '合同实际管理方', value: management }, { label: '本公司上期供应商支出', value: money(contract.lastSupplierCost) },
      { label: '分包链单项目容量上限', value: `${worstCapacity} 人` }, { label: '本公司累计合同收入', value: money(contract.cumulativeRevenue) },
    ]} />
  </>;
}

function SupplierDialog({ state, contract, run, busy, close }: Pick<FeatureProps, 'state' | 'run' | 'busy'> & { contract: Contract; close: () => void }) {
  const [id, setId] = useState(contract.plan.supplierId ?? '');
  const [ratio, setRatio] = useState(Math.round((contract.plan.subcontract || .25) * 100));
  const [depth, setDepth] = useState(contract.plan.depth || 1);
  const max = supplierChain(state, { ...contract.plan, supplierId: id || null, depth: RULES.maxChainDepth - Number(Boolean(contract.upstreamId)) }).length;
  const supplier = state.suppliers.find((item) => item.id === id);
  const valid = !supplier || (Number.isFinite(ratio) && Math.floor(contract.headcount * ratio / 100) > 0 && depth <= max);
  return <Modal title="编辑分包配置" onClose={close}><form className="feature-form" onSubmit={async (event) => { event.preventDefault(); if ((await run({ type: 'subcontract', contractId: contract.id, supplierId: id || null, ratio: id ? ratio / 100 : 0, depth: id ? depth : 0 })).ok) close(); }}>
    <div className="feature-form-grid"><Field label="下游供应商"><select value={id} onChange={(event) => { setId(event.target.value); setDepth(1); }}><option value="">无分包 · 全部自营</option>{state.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name} · {BUSINESS_LABELS[item.specialty]}</option>)}</select></Field>
      {supplier && <><Field label="分包岗位比例（%）"><NumberInput value={ratio} min={1} max={RULES.maxSubcontract * 100} onChange={setRatio} /></Field><Field label="下游层数"><NumberInput value={depth} min={1} max={max} onChange={setDepth} /></Field><Field label="拟分包岗位"><span>{Number.isFinite(ratio) ? Math.floor(contract.headcount * ratio / 100) : '—'} / {contract.headcount} 人</span></Field></>}
    </div>
    <Notice>分包配置会改变本期承接容量、交付质量、供应商支出与合规风险。</Notice>
    <footer><Button onClick={close}>关闭</Button><Button type="submit" primary disabled={busy || !valid}>保存分包配置</Button></footer>
  </form></Modal>;
}

export function ResearchPage({ state, run, busy }: FeatureProps) {
  const [filter, updateFilter] = useState('');
  const rows = TECHNOLOGIES.filter((tech) => !filter || (state.technologies.includes(tech.id) ? 'done' : state.research.some((item) => item.techId === tech.id) ? 'active' : 'ready') === filter);
  return <>
    <PageHeader title="技术研发" description="投资有明确业务作用的工具，研发完成后按月承担维护成本。" />
    <Stats items={[
      { label: '已上线技术', value: state.technologies.length }, { label: '研发中项目', value: state.research.length, tone: 'info' }, { label: '月度技术维护', value: money(TECHNOLOGIES.filter((item) => state.technologies.includes(item.id)).reduce((sum, item) => sum + item.upkeep, 0)) }, { label: '企业技术水平', value: `${state.player.tech} 分` },
    ]} />
    <Section title="研发路线"><Grid rows={rows} rowKey={(row) => row.id} search={(row) => `${row.name} ${row.detail}`} searchLabel="搜索研发方向" filter={<select value={filter} aria-label="筛选研发状态" onChange={(event) => updateFilter(event.target.value)}><option value="">全部研发项目</option><option value="ready">可立项</option><option value="active">研发中</option><option value="done">已上线</option></select>} columns={[
      { title: '研发项目', sort: (row) => row.name, render: (row) => <><strong>{row.name}</strong><small className="feature-subtext">{row.detail}</small></> },
      { title: '立项资金', sort: (row) => row.cost, render: (row) => money(row.cost) }, { title: '研发周期', sort: (row) => row.months, render: (row) => `${row.months} 月` }, { title: '月维护成本', sort: (row) => row.upkeep, render: (row) => money(row.upkeep) },
      { title: '进度', render: (row) => { const project = state.research.find((item) => item.techId === row.id); return state.technologies.includes(row.id) ? <Tag tone="good">已上线</Tag> : project ? <Meter value={(1 - project.remaining / row.months) * 100} label={`余 ${project.remaining} 月`} /> : <Tag>待立项</Tag>; } },
      { title: '操作', render: (row) => <LinkButton disabled={busy || state.technologies.includes(row.id) || state.research.some((item) => item.techId === row.id)} onClick={() => { void run({ type: 'research', techId: row.id }); }}>立项研发</LinkButton> },
    ]} /></Section>
  </>;
}

export function CompliancePage({ state, navigate, run, busy }: FeatureProps) {
  const [threshold, setThreshold] = useState(false);
  const rows = ownContracts(state).filter((contract) => contract.status === 'active').sort((left, right) => right.risk - left.risk);
  const mismatches = rows.filter((contract) => contract.business === 'dispatch' ? contract.plan.manager !== 'client' : contract.plan.manager !== 'provider');
  const riskTitle = (contract: Contract) => contract.risk >= 65 ? '高风险' : contract.risk >= 35 ? '需关注' : '常规';
  return <>
    <PageHeader title="合规风控" description="结合合同形式、实际管理关系、出勤与薪酬义务排查合规风险。"><Button onClick={() => navigate('labor')}>查看劳动争议</Button></PageHeader>
    <Stats items={[
      { label: '企业合规信誉', value: `${Math.round(state.player.compliance)} 分`, tone: 'good' }, { label: '合同管理关系偏差', value: mismatches.length, tone: mismatches.length ? 'warn' : 'neutral' },
      { label: '高风险合同', value: rows.filter((contract) => contract.risk >= 65).length, tone: 'bad' }, { label: '游戏内监管指数', value: `${Math.round(state.market.regulation)} 分` },
    ]} />
    <Notice>风险分依据游戏内规则计算，适用于本局经营决策。风险会随实际履约情况逐月积累或缓解。</Notice>
    <Section title="履约风险台账"><Grid rows={threshold ? rows.filter((row) => row.risk >= 35) : rows} rowKey={(row) => row.id} search={(row) => `${row.title} ${clientName(state, row.clientId)}`} searchLabel="搜索合同或客户" filter={<label className="feature-field-inline"><input type="checkbox" checked={threshold} onChange={(event) => setThreshold(event.target.checked)} />仅显示需关注合同</label>} empty="当前范围内没有履约风险记录。" columns={[
      { title: '履约合同', sort: (row) => row.title, render: (row) => row.title }, { title: '合同业务', render: (row) => BUSINESS_LABELS[row.business] }, { title: '实际管理方', render: (row) => row.plan.manager === 'client' ? '客户' : '服务商' },
      { title: '风险分', sort: (row) => row.risk, render: (row) => <Meter value={row.risk} label={`${Math.round(row.risk)} 分`} tone={row.risk >= 65 ? 'bad' : row.risk >= 35 ? 'warn' : 'good'} /> },
      { title: '风险评级', render: (row) => <Tag tone={row.risk >= 65 ? 'bad' : row.risk >= 35 ? 'warn' : 'good'}>{riskTitle(row)}</Tag> },
      { title: '操作', render: (row) => <div className="feature-inline-actions"><LinkButton disabled={busy} onClick={() => { void run({ type: 'audit', contractId: row.id }); }}>发起自查</LinkButton><LinkButton onClick={() => navigate('staffing')}>查看管理安排</LinkButton></div> },
    ]} /></Section>
  </>;
}

export function OpinionPage({ state, run, busy }: FeatureProps) {
  const [kind, setKind] = useState('');
  const [selectedId, select] = useState('');
  const [campaign, setCampaign] = useState(false);
  const selected = state.news.find((item) => item.id === selectedId);
  const report = latestReport(state.player);
  const rows = kind ? state.news.filter((item) => item.kind === kind) : state.news;
  return <>
    <PageHeader title="舆情中心" description="查阅由市场、企业经营和人物经历生成的行业新闻。"><Button primary disabled={busy} onClick={() => setCampaign(true)}>发起品牌宣传</Button></PageHeader>
    <Stats items={[
      { label: '企业品牌声量', value: `${Math.round(state.player.brandScore)} 分`, tone: 'info' }, { label: '企业履约信誉', value: `${Math.round(state.player.reputation)} 分` },
      { label: '最近月员工满意度', value: report?.headcount ? `${Math.round(report.satisfaction)} 分` : '—' }, { label: '当前月行业动态', value: state.news.filter((item) => item.month === state.month).length },
    ]} />
    <Section title="行业新闻档案"><Grid rows={rows} rowKey={(row) => row.id} search={(row) => `${row.title} ${row.detail}`} searchLabel="搜索新闻或企业" filter={<select aria-label="筛选新闻分类" value={kind} onChange={(event) => setKind(event.target.value as NewsKind | '')}><option value="">全部动态</option>{Object.entries(NEWS_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>} columns={[
      { title: '新闻标题', render: (row) => <strong>{row.title}</strong> }, { title: '类别', render: (row) => NEWS_LABELS[row.kind] },
      { title: '关注等级', render: (row) => <Tag tone={SEVERITY_TONES[row.severity]}>{SEVERITY_LABELS[row.severity]}</Tag> }, { title: '月份', sort: (row) => row.month, render: (row) => monthLabel(row.month) },
      { title: '操作', render: (row) => <LinkButton onClick={() => select(row.id)}>阅读新闻</LinkButton> },
    ]} /></Section>
    {selected && <Modal title={selected.title} onClose={() => select('')}><div className="feature-form feature-news-body"><p className="feature-muted">{monthLabel(selected.month)} · {NEWS_LABELS[selected.kind]}</p><p>{selected.detail}</p></div></Modal>}
    {campaign && <Modal title="发起品牌宣传" onClose={() => setCampaign(false)}><div className="feature-form"><Notice>雇主品牌宣传费用为 ¥18,000。品牌声量与员工反馈会分别记录。</Notice><footer><Button onClick={() => setCampaign(false)}>关闭</Button><Button primary disabled={busy} onClick={async () => { if ((await run({ type: 'campaign' })).ok) setCampaign(false); }}>确认宣传</Button></footer></div></Modal>}
  </>;
}
