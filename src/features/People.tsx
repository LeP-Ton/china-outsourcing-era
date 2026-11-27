import { useState } from 'react';
import { BUSINESS_LABELS, OCCUPATIONS, RULES } from '../simulation/data';
import { severance } from '../simulation/operations';
import type { Contract, Manager, RecruitmentChannel, Worker } from '../simulation/types';
import { SEVERITY_LABELS, SEVERITY_TONES, clientName, latestReport, monthLabel, occupationName, ownContracts, ownWorkers } from './model';
import type { FeatureProps } from './model';
import { Button, DescriptionList, Empty, Field, Grid, LinkButton, Meter, Modal, Notice, NumberInput, PageHeader, Section, Stats, Tag, compactMoney, money, number, percent } from './ui';

const channels: Record<RecruitmentChannel, string> = {
  platform: '招聘平台', referral: '员工推荐', campus: '校园招聘', headhunter: '合作猎头',
};

const workerStatus = { market: '求职中', employed: '在职', client: '甲方直聘', inactive: '暂离市场' } as const;

function occupationOptions() {
  return OCCUPATIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>);
}

function selectedLimit(keys: string[], count: number) {
  return `${keys.length} 人已选，单次最多可操作 ${count} 人。`;
}

export function RecruitmentPage({ state, navigate, run, busy }: FeatureProps) {
  const [contractId, setContractId] = useState('');
  const [occupation, setOccupation] = useState('');
  const [city, setCity] = useState('');
  const [selected, select] = useState<string[]>([]);
  const [wage, setWage] = useState<number | null>(null);
  const [channel, setChannel] = useState<RecruitmentChannel>('platform');
  const [workerId, setWorkerId] = useState('');
  const active = ownContracts(state).filter((contract) => contract.status === 'active');
  const project = active.find((contract) => contract.id === contractId);
  const chosenOccupation = project?.occupationId ?? occupation;
  const segment = state.market.segments.find((item) => item.occupationId === chosenOccupation);
  const defaultWage = project?.plan.wage || segment?.wage || state.market.segments.reduce((sum, item) => sum + item.wage, 0) / Math.max(1, state.market.segments.length);
  const marketWorkers = state.workers.filter((worker) => worker.status === 'market');
  const matches = marketWorkers.filter((worker) => (!chosenOccupation || chosenOccupation === worker.occupationId) && (!city || city === worker.city));
  const assigned = ownWorkers(state).filter((worker) => worker.contractId === project?.id).length;
  const outsourced = Math.floor((project?.headcount ?? 0) * (project?.plan.subcontract ?? 0));
  const vacancies = Math.max(0, (project?.headcount ?? 0) - outsourced - assigned);
  const worker = state.workers.find((item) => item.id === workerId);
  const matchIds = new Set(matches.map((item) => item.id));
  const validSelected = selected.filter((id) => matchIds.has(id));
  const maxSelected = RULES.maxWorkersPerAction;
  const shownWage = wage ?? Math.round(defaultWage);
  return <>
    <PageHeader title="招聘管理" description="按岗位或项目筛选候选人，设定薪资并发出录用邀约。"><Button onClick={() => navigate('staffing')}>查看项目缺口</Button></PageHeader>
    <Stats items={[
      { label: '市场求职者', value: number(marketWorkers.length) },
      { label: '筛选匹配', value: number(matches.length), tone: 'info' },
      { label: '项目待补人员', value: project ? `${vacancies} 人` : '—' },
      { label: '当前市场参考月薪', value: segment ? money(segment.wage) : '—' },
    ]} />
    <Section title="招聘方案"><form className="feature-form" onSubmit={async (event) => { event.preventDefault(); const result = await run({ type: 'hire', workerIds: validSelected, wage: shownWage, channel, contractId: project?.id }); if (result.ok) select([]); }}>
      <div className="feature-form-grid">
        <Field label="录用配置"><select value={project?.id ?? ''} onChange={(event) => { setContractId(event.target.value); setWage(null); select([]); }}><option value="">直接录用为待岗员工</option>{active.map((contract) => <option key={contract.id} value={contract.id}>{contract.title}</option>)}</select></Field>
        <Field label="招聘渠道"><select value={channel} onChange={(event) => setChannel(event.target.value as RecruitmentChannel)}>{Object.entries(channels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="税前月薪（元）" help="候选人会结合薪资预期、市场机会与个人偏好回复邀约。"><NumberInput value={shownWage} min={RULES.minimumWage} onChange={setWage} /></Field>
        <Field label="已选候选人"><span className="feature-muted">{selectedLimit(validSelected, maxSelected)}</span></Field>
      </div>
      {project && vacancies === 0 && <Notice tone="warn">该项目的自营岗位已配满。可以改为录用待岗人员。</Notice>}
      <footer><Button disabled={!selected.length} onClick={() => select([])}>清空选择</Button><Button type="submit" primary disabled={busy || !validSelected.length || validSelected.length > maxSelected || (Boolean(project) && vacancies === 0)}>发出录用邀约</Button></footer>
    </form></Section>
    <Section title="候选人库"><Grid windowed rows={matches} rowKey={(row) => row.id} rowLabel={(row) => row.name} selected={validSelected} onSelect={select} search={(row) => `${row.name} ${row.education} ${occupationName(row.occupationId)}`} searchLabel="搜索姓名、学历或岗位" filter={<><select aria-label="筛选岗位" disabled={Boolean(project)} value={chosenOccupation} onChange={(event) => { setOccupation(event.target.value); select([]); }}><option value="">全部岗位</option>{occupationOptions()}</select><select aria-label="筛选城市" value={city} onChange={(event) => { setCity(event.target.value); select([]); }}><option value="">全部城市</option>{[...new Set(marketWorkers.map((item) => item.city))].sort((a, b) => a.localeCompare(b, 'zh-CN')).map((item) => <option key={item}>{item}</option>)}</select></>} columns={[
      { title: '姓名', sort: (row) => row.name, render: (row) => <><strong>{row.name}</strong><small className="feature-subtext">{row.city} · {row.education}</small></> },
      { title: '目标岗位', sort: (row) => row.occupationId, render: (row) => occupationName(row.occupationId) },
      { title: '工作经验', sort: (row) => row.experience, render: (row) => `${row.experience} 年` },
      { title: '专业技能', sort: (row) => row.skill, render: (row) => <Meter value={row.skill} label={`${Math.round(row.skill)} 分`} /> },
      { title: '预期月薪', sort: (row) => row.expectation, render: (row) => money(row.expectation) },
      { title: '操作', render: (row) => <LinkButton onClick={() => setWorkerId(row.id)}>查看简历</LinkButton> },
    ]} /></Section>
    {worker && <WorkerDialog worker={worker} close={() => setWorkerId('')} />}
  </>;
}

function WorkerDialog({ worker, contract, close }: { worker: Worker; contract?: Contract; close: () => void }) {
  return <Modal title={`${worker.name} · 人才档案`} onClose={close}>
    <DescriptionList items={[
      { label: '城市 / 年龄', value: `${worker.city} · ${worker.age} 岁` }, { label: '最高学历', value: worker.education },
      { label: '职业', value: occupationName(worker.occupationId) }, { label: '从业经验', value: `${worker.experience} 年` },
      { label: '技术能力', value: `${Math.round(worker.skill)} 分` }, { label: '工作效率', value: `${Math.round(worker.efficiency)} 分` },
      { label: '当前状态', value: workerStatus[worker.status] }, { label: '当前项目', value: contract?.title ?? '—' },
      { label: '期望月薪', value: money(worker.expectation) }, { label: '实际约定月薪', value: worker.wage ? money(worker.wage) : '—' },
      ...(worker.status === 'employed' ? [
        { label: '最近月实际工时', value: worker.lastHours == null ? '—' : `${Math.round(worker.lastHours)} 小时` },
        { label: '最近月实发收入', value: worker.lastIncome == null ? '—' : money(worker.lastIncome) },
      ] : []),
    ]} />
    <section className="feature-worker-history"><header className="feature-panel-header"><h2>职业履历</h2></header>{worker.history.length ? <div className="feature-timeline">
      {[...worker.history].reverse().map((entry, index) => <article key={`${entry.month}-${index}`}><time>{monthLabel(entry.month)}</time><h3>{entry.label}</h3><p>{entry.detail}</p></article>)}
    </div> : <Empty>暂无履历事件记录</Empty>}</section>
  </Modal>;
}

export function WorkforcePage({ state, navigate }: FeatureProps) {
  const [workerId, select] = useState('');
  const [status, setStatus] = useState('current');
  const current = ownWorkers(state);
  const currentIds = new Set(current.map((worker) => worker.id));
  const historical = state.workers.filter((worker) => !currentIds.has(worker.id) && worker.history.some((event) => event.label === '接受录用' && event.detail.startsWith(`${state.player.name} ·`)));
  const rows = status === 'current' ? current : status === 'former' ? historical : [...current, ...historical];
  const worker = state.workers.find((item) => item.id === workerId);
  const contracts = ownContracts(state);
  return <>
    <PageHeader title="人才资源库" description="查询在职、待岗和曾服务员工的能力与职业履历。"><Button onClick={() => navigate('recruitment')}>进入招聘管理</Button></PageHeader>
    <Stats items={[
      { label: '在册员工', value: number(current.length) }, { label: '项目在岗', value: number(current.filter((item) => item.contractId).length), tone: 'good' },
      { label: '待岗人员', value: number(current.filter((item) => !item.contractId).length), tone: 'warn' }, { label: '累计录用', value: number(state.player.totalHires) },
    ]} />
    <Section title="企业人员档案"><Grid windowed rows={rows} rowKey={(row) => row.id} search={(row) => `${row.name} ${row.id} ${occupationName(row.occupationId)} ${row.city}`} searchLabel="搜索员工、编号或岗位" filter={<select aria-label="筛选员工状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="current">企业在册</option><option value="former">历史员工</option><option value="all">全部人员</option></select>} empty="暂无员工记录，可到招聘管理补充人员。" columns={[
      { title: '员工', sort: (row) => row.name, render: (row) => <><strong>{row.name}</strong><small className="feature-subtext">{row.id} · {row.city}</small></> },
      { title: '职业', render: (row) => occupationName(row.occupationId) },
      { title: '项目 / 状态', render: (row) => currentIds.has(row.id) ? (contracts.find((item) => item.id === row.contractId)?.title ?? <Tag tone="warn">待岗</Tag>) : <Tag>{workerStatus[row.status]}</Tag> },
      { title: '专业技能', sort: (row) => row.skill, render: (row) => `${Math.round(row.skill)} 分` },
      { title: '税前月薪', sort: (row) => row.wage, render: (row) => row.wage ? money(row.wage) : '—' },
      { title: '操作', render: (row) => <LinkButton onClick={() => select(row.id)}>查看履历</LinkButton> },
    ]} /></Section>
    {worker && <WorkerDialog worker={worker} contract={contracts.find((item) => item.id === worker.contractId)} close={() => select('')} />}
  </>;
}

export function StaffingPage({ state, run, busy, navigate }: FeatureProps) {
  const active = ownContracts(state).filter((item) => item.status === 'active');
  const members = ownWorkers(state);
  const [contractId, setContract] = useState('');
  const [selected, select] = useState<string[]>([]);
  const [team, setTeam] = useState('');
  const [managerId, setManagerId] = useState('');
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [nextManager, setNextManager] = useState<Manager>('provider');
  const rows = team === '' ? members : members.filter((worker) => (worker.contractId ?? 'idle') === team);
  const managerContract = active.find((contract) => contract.id === managerId);
  const related = (id: string | null) => active.find((contract) => contract.id === id)?.title ?? '待岗';
  const countAt = (id: string) => members.reduce((count, worker) => count + Number(worker.contractId === id), 0);
  const selectedSet = new Set(selected);
  const releaseGroup = members.filter((worker) => selectedSet.has(worker.id) && worker.contractId === null);
  const canRelease = releaseGroup.length > 0 && releaseGroup.length === selected.length && releaseGroup.length <= RULES.maxWorkersPerAction;
  return <>
    <PageHeader title="用工管理" description="统筹项目人力、人员调配与现场实际管理权责。"><Button onClick={() => navigate('recruitment')}>招募交付人员</Button></PageHeader>
    <Section title="履约项目用工配置"><Grid rows={active} rowKey={(row) => row.id} empty="暂无履约项目。请在合同管理签署中标合同。" columns={[
      { title: '项目', render: (row) => <><strong>{row.title}</strong><small className="feature-subtext">{clientName(state, row.clientId)} · {BUSINESS_LABELS[row.business]}</small></> },
      { title: '约定规模', sort: (row) => row.headcount, render: (row) => `${row.headcount} 人` },
      { title: '实际自营在岗', sort: (row) => countAt(row.id), render: (row) => `${countAt(row.id)} 人` },
      { title: '自营缺口', render: (row) => `${Math.max(0, row.headcount - Math.floor(row.headcount * row.plan.subcontract) - countAt(row.id))} 人` },
      { title: '分包比例', render: (row) => percent(row.plan.subcontract * 100) },
      { title: '现场管理方', render: (row) => <Tag tone={row.plan.manager === 'provider' ? 'good' : 'warn'}>{row.plan.manager === 'provider' ? '服务商管理' : '客户直接管理'}</Tag> },
      { title: '操作', render: (row) => <LinkButton onClick={() => { setManagerId(row.id); setNextManager(row.plan.manager); }}>调整管理安排</LinkButton> },
    ]} /></Section>
    <Section title="项目调配" action={<select aria-label="筛选员工项目" value={team} onChange={(event) => { setTeam(event.target.value); select([]); }}><option value="">全部员工</option><option value="idle">当前待岗</option>{active.map((contract) => <option key={contract.id} value={contract.id}>{contract.title}</option>)}</select>}>
      <form className="feature-form" onSubmit={async (event) => { event.preventDefault(); if ((await run({ type: 'assign', workerIds: selected, contractId: contractId || null })).ok) select([]); }}>
        <div className="feature-form-grid"><Field label="调配目标"><select value={contractId} onChange={(event) => setContract(event.target.value)}><option value="">退回待岗池</option>{active.map((contract) => <option key={contract.id} value={contract.id}>{contract.title}</option>)}</select></Field><Field label="本次操作"><span className="feature-muted">{selectedLimit(selected, RULES.maxWorkersPerAction)}</span></Field></div>
        <footer><Button disabled={busy || !canRelease} onClick={() => setConfirmRelease(true)}>结束待岗员工劳动关系</Button><Button primary type="submit" disabled={busy || !selected.length || selected.length > RULES.maxWorkersPerAction}>提交调配</Button></footer>
      </form>
      <Grid windowed rows={rows} rowKey={(row) => row.id} rowLabel={(row) => row.name} selected={selected} onSelect={select} search={(row) => `${row.name} ${occupationName(row.occupationId)}`} searchLabel="搜索员工或岗位" columns={[
        { title: '员工', sort: (row) => row.name, render: (row) => row.name }, { title: '岗位', render: (row) => occupationName(row.occupationId) },
        { title: '当前配置', render: (row) => related(row.contractId) }, { title: '技能', sort: (row) => row.skill, render: (row) => `${Math.round(row.skill)} 分` },
        { title: '最近月工时', sort: (row) => row.lastHours ?? 0, render: (row) => row.lastHours == null ? '—' : `${Math.round(row.lastHours)} 小时` },
      ]} />
    </Section>
    {confirmRelease && <Modal title="结束待岗员工劳动关系" onClose={() => setConfirmRelease(false)}><div className="feature-form">
      <Notice tone="warn">确认结束 {releaseGroup.length} 名待岗员工的劳动关系？本期将确认 {money(releaseGroup.reduce((sum, worker) => sum + severance(worker, state.month), 0))} 经济补偿，并写入人员履历。</Notice>
      <footer><Button onClick={() => setConfirmRelease(false)}>取消</Button><Button primary disabled={busy || !canRelease} onClick={async () => { if ((await run({ type: 'release', workerIds: selected })).ok) { setConfirmRelease(false); select([]); } }}>确认结束劳动关系</Button></footer>
    </div></Modal>}
    {managerContract && <Modal title="调整实际管理安排" onClose={() => setManagerId('')}><form className="feature-form" onSubmit={async (event) => { event.preventDefault(); if ((await run({ type: 'management', contractId: managerContract.id, manager: nextManager })).ok) setManagerId(''); }}>
      <Notice>实际管理关系与合同形式共同影响用工风险。</Notice>
      <Field label={managerContract.title}><select value={nextManager} onChange={(event) => setNextManager(event.target.value as Manager)}><option value="provider">服务商管理</option><option value="client">客户直接安排工作</option></select></Field>
      <footer><Button primary type="submit" disabled={busy}>应用安排</Button></footer>
    </form></Modal>}
  </>;
}

export function PayrollPage({ state, run, busy }: FeatureProps) {
  const people = ownWorkers(state);
  const last = latestReport(state.player);
  const [selected, select] = useState<string[]>([]);
  const [wage, setWage] = useState(RULES.minimumWage * 2);
  const [benefit, setBenefit] = useState(state.policies.defaultBenefit);
  const [automatic, setAutomatic] = useState(state.policies.autoPayroll);
  const [overtime, setOvertime] = useState(state.policies.overtimeCompensation);
  const arrears = state.player.wageArrears ?? 0;
  return <>
    <PageHeader title="薪酬社保" description="管理工资、补偿与游戏内法定用工成本。"><Button primary disabled={busy || arrears <= 0} onClick={() => { void run({ type: 'settlePayroll' }); }}>发放应付工资</Button></PageHeader>
    <Stats items={[
      { label: '在册约定月薪总额', value: compactMoney(people.reduce((sum, worker) => sum + worker.wage, 0)) },
      { label: '上月工资支出', value: compactMoney(last?.payroll ?? 0) }, { label: '上月福利及法定成本', value: compactMoney(last?.benefits ?? 0) },
      { label: '尚有应付工资', value: compactMoney(arrears), tone: arrears > 0 ? 'bad' : 'good' },
    ]} />
    <Section title="薪酬结算规则"><form className="feature-form" onSubmit={(event) => { event.preventDefault(); void run({ type: 'policies', values: { autoPayroll: automatic, overtimeCompensation: overtime, defaultBenefit: benefit } }); }}>
      <div className="feature-form-grid"><Field label="人均默认月福利预算（元）" help="用于新项目的报价方案。"><NumberInput value={benefit} max={10000} onChange={setBenefit} /></Field><div className="feature-field"><span>结算选项</span><label className="feature-field-inline"><input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} />月结自动发放工资</label><label className="feature-field-inline"><input type="checkbox" checked={overtime} onChange={(event) => setOvertime(event.target.checked)} />支付加班补偿</label></div></div>
      <Notice>薪资义务按照实际模拟工时计算。关闭自动发放时，可在账务结算后手工支付。</Notice>
      <footer><Button primary type="submit" disabled={busy}>保存薪酬规则</Button></footer>
    </form></Section>
    <Section title="员工薪资台账"><form className="feature-form" onSubmit={async (event) => { event.preventDefault(); if ((await run({ type: 'compensation', workerIds: selected, wage })).ok) select([]); }}>
      <div className="feature-form-grid"><Field label="调整后的税前月薪（元）"><NumberInput value={wage} min={RULES.minimumWage} onChange={setWage} /></Field><Field label="本次批量调整"><span className="feature-muted">{selectedLimit(selected, RULES.maxWorkersPerAction)}</span></Field></div>
      <footer><Button primary type="submit" disabled={busy || !selected.length || selected.length > RULES.maxWorkersPerAction}>调整所选员工工资</Button></footer>
    </form><Grid windowed rows={people} rowKey={(row) => row.id} rowLabel={(row) => row.name} selected={selected} onSelect={select} search={(row) => `${row.name} ${occupationName(row.occupationId)}`} searchLabel="搜索员工或岗位" columns={[
      { title: '员工姓名', sort: (row) => row.name, render: (row) => row.name }, { title: '岗位', render: (row) => occupationName(row.occupationId) },
      { title: '当前约定月薪', sort: (row) => row.wage, render: (row) => money(row.wage) },
      { title: '预计月法定成本', render: (row) => money(row.wage * RULES.statutoryRate) },
      { title: '最近实际工时', sort: (row) => row.lastHours ?? 0, render: (row) => row.lastHours == null ? '—' : `${Math.round(row.lastHours)} 小时` },
      { title: '最近实发工资', sort: (row) => row.lastIncome ?? 0, render: (row) => row.lastIncome == null ? '—' : money(row.lastIncome) },
    ]} /></Section>
  </>;
}

export function TrainingPage({ state, run, busy }: FeatureProps) {
  const [selected, select] = useState<string[]>([]);
  const people = ownWorkers(state);
  return <>
    <PageHeader title="培训发展" description="安排员工技能培训，改善交付能力并记录个人成长。" />
    <Stats items={[
      { label: '可培训员工', value: number(people.length) }, { label: '平均专业技能', value: people.length ? `${Math.round(people.reduce((sum, worker) => sum + worker.skill, 0) / people.length)} 分` : '—' },
      { label: '累计培训人次', value: number(state.training.reduce((sum, item) => sum + item.workerIds.length, 0)) }, { label: '累计培养投入', value: compactMoney(state.training.reduce((sum, item) => sum + item.cost, 0)) },
    ]} />
    <Section title="技能培养计划" action={<Button primary disabled={busy || !selected.length || selected.length > RULES.maxWorkersPerAction} onClick={async () => { if ((await run({ type: 'train', workerIds: selected })).ok) select([]); }}>培训所选员工</Button>}>
      <Grid windowed rows={people} rowKey={(row) => row.id} rowLabel={(row) => row.name} search={(row) => `${row.name} ${occupationName(row.occupationId)}`} searchLabel="搜索员工或岗位" selected={selected} onSelect={select} columns={[
        { title: '员工', sort: (row) => row.name, render: (row) => row.name }, { title: '职业', render: (row) => occupationName(row.occupationId) },
        { title: '技能水平', sort: (row) => row.skill, render: (row) => <Meter value={row.skill} label={`${Math.round(row.skill)} 分`} /> },
        { title: '参与培养', render: (row) => `${state.training.filter((item) => item.workerIds.includes(row.id)).length} 次` },
      ]} />
    </Section>
    <Section title="培训记录"><Grid rows={state.training} rowKey={(row) => row.id} columns={[
      { title: '培训月份', sort: (row) => row.month, render: (row) => monthLabel(row.month) }, { title: '参与员工', render: (row) => `${row.workerIds.length} 人` },
      { title: '实际投入', sort: (row) => row.cost, render: (row) => money(row.cost) }, { title: '平均技能成长', sort: (row) => row.skillGain, render: (row) => `+${row.skillGain.toFixed(1)} 分` },
    ]} /></Section>
  </>;
}

export function LaborPage({ state, run, busy }: FeatureProps) {
  const [status, setStatus] = useState('open');
  const [selected, select] = useState('');
  const lookup = new Map(state.workers.map((worker) => [worker.id, worker]));
  const open = state.laborCases.filter((item) => item.status === 'open');
  const rows = status ? state.laborCases.filter((item) => item.status === status) : state.laborCases;
  const detail = state.laborCases.find((item) => item.id === selected);
  const last = latestReport(state.player);
  return <>
    <PageHeader title="劳动关系" description="跟进员工诉求、离职、转正和劳动争议补偿。" />
    <Stats items={[
      { label: '待处理事项', value: open.length, tone: open.length ? 'warn' : 'good' }, { label: '最近月离职', value: `${last?.departures ?? 0} 人` },
      { label: '累计客户转正', value: `${state.player.totalConversions} 人` }, { label: '待支付争议补偿', value: compactMoney(open.reduce((sum, item) => sum + item.compensation, 0)) },
    ]} />
    <Section title="劳动关系台账"><Grid rows={rows} rowKey={(row) => row.id} search={(row) => `${row.category} ${row.detail} ${lookup.get(row.workerId)?.name ?? ''}`} searchLabel="搜索员工或争议类型" filter={<select aria-label="筛选处理状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option><option value="open">待处理</option><option value="resolved">已处理</option></select>} empty="当前筛选范围内暂无劳动关系事项。" columns={[
      { title: '事项', render: (row) => <><strong>{row.category}</strong><small className="feature-subtext">{lookup.get(row.workerId)?.name ?? row.workerId}</small></> },
      { title: '发生月份', sort: (row) => row.month, render: (row) => monthLabel(row.month) },
      { title: '影响等级', render: (row) => <Tag tone={SEVERITY_TONES[row.severity]}>{SEVERITY_LABELS[row.severity]}</Tag> },
      { title: '应付补偿', sort: (row) => row.compensation, render: (row) => money(row.compensation) },
      { title: '状态', render: (row) => <Tag tone={row.status === 'open' ? 'warn' : 'good'}>{row.status === 'open' ? '待处理' : '已处理'}</Tag> },
      { title: '操作', render: (row) => <LinkButton onClick={() => select(row.id)}>查看事项</LinkButton> },
    ]} /></Section>
    {detail && <Modal title={detail.category} onClose={() => select('')}>
      <DescriptionList items={[
        { label: '员工', value: lookup.get(detail.workerId)?.name ?? detail.workerId }, { label: '发生月份', value: monthLabel(detail.month) },
        { label: '事项描述', value: detail.detail }, { label: '补偿金额', value: money(detail.compensation) },
      ]} /><div className="feature-form"><footer>{detail.status === 'open' && <Button primary disabled={busy} onClick={async () => { if ((await run({ type: 'resolve', caseId: detail.id })).ok) select(''); }}>支付补偿并处理</Button>}</footer></div>
    </Modal>}
  </>;
}
