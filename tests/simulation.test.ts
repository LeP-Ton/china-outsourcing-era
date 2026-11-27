import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceMonth, applyAction, defaultBidPlan, estimateBid } from '../src/simulation/engine'
import { createDemoWorld } from '../src/simulation/demo'
import { validateSave } from '../src/persistence/save-format'
import type { BidPlan, Business, Contract, GameAction, GameState, Tender } from '../src/simulation/types'
import { createWorld, DEMO_SETUP } from '../src/simulation/world'

function play(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action)
  assert.ok(result.ok, result.message)
  return result.state
}

function makeContract(state: GameState, business: Business, companyId = 'player'): Contract {
  const tender = state.tenders.find(candidate => candidate.business === business)!
  const plan = defaultBidPlan(state, tender)
  return {
    id: `test-${business}`, tenderId: tender.id, title: tender.title, clientId: tender.clientId,
    companyId, upstreamId: null, occupationId: tender.occupationId, business,
    plan: { ...plan, headcount: 8, wage: Math.round(plan.wage * 1.25), benefit: 450 },
    headcount: 8, term: 6, remaining: 6, paymentMonths: 2, qualityTarget: 65, attendanceTarget: 0.75,
    signedAt: null, status: 'unsigned', attendance: 0, quality: 0, revenue: 0,
    cumulativeRevenue: 0, penalties: 0, risk: 0, progress: 0, lastSupplierCost: 0,
  }
}

const world = () => createWorld({ ...DEMO_SETUP, origin: 'bootstrap', seed: '结算回归2026' })

function close(state: GameState): GameState {
  const result = advanceMonth(state)
  assert.ok(result.ok, result.message)
  return result.state
}

function provision(state: GameState, business: Business): { state: GameState; contract: Contract; workerIds: string[] } {
  const contract = makeContract(state, business)
  state.contracts.push(contract)
  state = play(state, { type: 'sign', contractId: contract.id })
  const workerIds = state.workers
    .filter(worker => worker.occupationId === contract.occupationId && worker.city === state.setup.city)
    .sort((left, right) => right.skill - left.skill).slice(0, contract.headcount).map(worker => worker.id)
  const wage = Math.max(...state.workers.filter(worker => workerIds.includes(worker.id)).map(worker => worker.expectation)) * 1.2
  state = play(state, { type: 'hire', workerIds, wage: Math.round(wage), channel: 'referral', contractId: contract.id })
  return { state, contract: state.contracts.find(item => item.id === contract.id)!, workerIds }
}

test('随机种子复现世界和月结，且预估与动作保留输入快照', () => {
  const state = world()
  const identical = world()
  assert.deepEqual(state, identical)
  assert.notDeepEqual(state.workers, createWorld({ ...state.setup, seed: '另一个种子' }).workers)
  assert.equal(new Set(state.workers.map(worker => worker.id)).size, 1530)
  const tender = state.tenders[0]!
  const plan = defaultBidPlan(state, tender)
  assert.ok(Number.isFinite(estimateBid(state, tender, plan).score))
  const next = play(state, { type: 'bid', tenderId: tender.id, plan })
  assert.equal(state.bids.length, 0)
  assert.equal(next.bids.filter(bid => bid.companyId === state.player.id).length, 1)
  assert.deepEqual(close(state), close(identical))
})

test('招标由玩家和竞争对手共同竞逐，NPC 有履约与实际招聘记录', () => {
  let state = world()
  const tender = state.tenders.find(candidate => candidate.deadline === 0)!
  const plan: BidPlan = { ...defaultBidPlan(state, tender), price: Math.floor(tender.budget * 0.95) }
  state = play(state, { type: 'bid', tenderId: tender.id, plan })
  for (let month = 0; month < 4; month++) state = close(state)
  assert.ok(state.bids.some(bid => bid.companyId !== state.player.id))
  assert.ok(state.contracts.some(contract => contract.companyId !== state.player.id))
  assert.ok(state.competitors.some(company => company.totalHires > 0))
  assert.ok(state.competitors.some(company => company.reports.some(report => report.costs > 0)))
})

test('三种业务建立劳动关系并交付，收入先计入应收', () => {
  for (const business of ['dispatch', 'staffing', 'delivery'] as const) {
    let { state, contract } = provision(world(), business)
    assert.ok(state.workers.some(worker => worker.contractId === contract.id))
    state = close(state)
    const month = state.player.reports.at(-1)!
    const invoiced = state.invoices.filter(invoice => invoice.companyId === state.player.id)
    assert.ok(month.revenue > 0, business)
    assert.ok(month.payroll > 0, business)
    assert.equal(month.received, 0, business)
    assert.equal(invoiced.reduce((total, invoice) => total + invoice.amount - invoice.received, 0), month.receivables, business)
    assert.equal(month.profit, month.revenue - month.costs, business)
    assert.equal(month.openingCash + month.received + month.financing - month.paid - month.repayments, month.cash, business)
    for (let index = 0; index < 5; index++) state = close(state)
    assert.ok(state.player.reports.some(report => report.received > 0), business)
    assert.ok(state.invoices.every(invoice => invoice.received <= invoice.amount), business)
  }
})

test('同一员工只能履约于一家雇主的一个项目，分包深度和占比受限', () => {
  const { state, contract } = provision(world(), 'staffing')
  const worker = state.workers.find(item => item.contractId === contract.id)!
  const other = makeContract(state, 'delivery', 'npc-1')
  other.status = 'active'
  state.contracts.push(other)
  assert.equal(applyAction(state, { type: 'assign', workerIds: [worker.id], contractId: other.id }).ok, false)
  assert.equal(applyAction(state, { type: 'subcontract', contractId: contract.id, supplierId: state.suppliers[0]!.id, ratio: 0.4, depth: 9 }).ok, false)
  assert.equal(applyAction(state, { type: 'subcontract', contractId: contract.id, supplierId: state.suppliers[0]!.id, ratio: 1.2, depth: 2 }).ok, false)
  assert.equal(state.workers.find(item => item.id === worker.id)?.contractId, contract.id)
})

test('合作链受容量和循环约束，首层分包费只记一次', () => {
  const initial = world()
  const contract = makeContract(initial, 'staffing')
  initial.contracts.push(contract)
  let state = play(initial, { type: 'sign', contractId: contract.id })
  const [first, second] = state.suppliers
  first!.partnerId = second!.id
  second!.partnerId = first!.id
  assert.equal(applyAction(state, {
    type: 'subcontract', contractId: contract.id, supplierId: first!.id, ratio: 0.5, depth: 3,
  }).ok, false)
  state = play(state, { type: 'subcontract', contractId: contract.id, supplierId: first!.id, ratio: 0.5, depth: 2 })
  state = close(state)
  const settlement = state.player.reports.at(-1)!
  assert.ok(settlement.suppliers > 0)
  assert.equal(settlement.suppliers, state.contracts.find(item => item.id === contract.id)!.lastSupplierCost)
  assert.equal(settlement.paid, settlement.costs)
})

test('人员缺口使交付减少，客户管理外包人员增加累积合规风险', () => {
  const { state, contract } = provision(world(), 'staffing')
  const activeIds = state.workers.filter(worker => worker.contractId === contract.id).map(worker => worker.id)
  const unstaffed = play(state, { type: 'assign', workerIds: activeIds, contractId: null })
  const reclassified = play(state, { type: 'management', contractId: contract.id, manager: 'client' })
  const delivered = close(state).contracts.find(item => item.id === contract.id)!
  const missing = close(unstaffed).contracts.find(item => item.id === contract.id)!
  const directManagement = close(reclassified).contracts.find(item => item.id === contract.id)!
  assert.ok(delivered.revenue > missing.revenue)
  assert.ok(directManagement.risk > delivered.risk)
})

test('自动发薪关闭时留存欠薪，手动支付扣除真实现金', () => {
  let { state } = provision(world(), 'staffing')
  state = play(state, { type: 'policies', values: { autoPayroll: false } })
  state = close(state)
  const owed = state.player.wageArrears ?? 0
  assert.ok(owed > 0)
  const cash = state.player.cash
  state = play(state, { type: 'settlePayroll' })
  assert.equal(state.player.wageArrears, 0)
  assert.equal(state.player.cash, cash - owed)
})

test('虚假或损坏存档不进入模拟，真实快照可往返读取', () => {
  const state = createDemoWorld()
  assert.ok(state.month >= 6)
  assert.ok(state.player.reports.some(report => report.revenue > 0))
  const saved = JSON.parse(JSON.stringify(state))
  assert.deepEqual(validateSave(saved), saved)
  assert.throws(() => validateSave({ ...saved, version: 2 }))
  assert.throws(() => validateSave({ ...saved, workers: [saved.workers[0], saved.workers[0]] }))
})

test('空转耗尽营运资金可以破产，破产后停止推进', () => {
  let state = createWorld({ ...DEMO_SETUP, seed: '破产回归', difficulty: 'hard' })
  for (let month = 0; month < 120 && state.player.status === 'operating'; month++) state = close(state)
  assert.equal(state.player.status, 'bankrupt')
  assert.equal(advanceMonth(state).ok, false)
})

test('融资同时增加现金和借款，重复投标无法刷新结果', () => {
  let state = world()
  const cash = state.player.cash
  state = play(state, { type: 'finance', amount: 200000 })
  assert.equal(state.player.cash, cash + 200000)
  assert.equal(state.player.debt, 200000)
  state = play(state, { type: 'repay', amount: 50000 })
  assert.equal(state.player.cash, cash + 150000)
  assert.equal(state.player.debt, 150000)
  const tender = state.tenders[0]!
  const bid = { type: 'bid', tenderId: tender.id, plan: defaultBidPlan(state, tender) } as const
  state = play(state, bid)
  assert.equal(applyAction(state, bid).ok, false)
  state = close(state)
  const settlement = state.player.reports.at(-1)!
  assert.equal(settlement.financing, 200000)
  assert.equal(settlement.repayments, 50000)
  assert.equal(settlement.cash, cash + 150000 - settlement.paid)
})

test('人才储备录用受报价影响，客户按经营需求更新预算', () => {
  const state = world()
  const market = state.market.segments.find(segment => segment.occupationId === 'software')!
  const candidates = state.workers.filter(worker => worker.occupationId === 'software' && worker.city === state.setup.city).slice(0, 60)
  assert.equal(candidates.length, 60)
  const workerIds = candidates.map(worker => worker.id)
  const low = play(state, { type: 'hire', workerIds, wage: Math.floor(market.wage * 0.7), channel: 'platform' })
  const high = play(state, { type: 'hire', workerIds, wage: Math.floor(market.wage * 1.2), channel: 'platform' })
  assert.ok(high.player.totalHires > low.player.totalHires)
  const next = close(state)
  assert.ok(next.clients.some((client, index) => client.demand !== state.clients[index]!.demand))
  assert.ok(next.clients.some((client, index) => client.budget !== state.clients[index]!.budget))
})

test('停发自动加班补偿仍产生加班工资义务，待岗解除记入履历', () => {
  let { state, contract } = provision(world(), 'staffing')
  const roster = state.workers.filter(worker => worker.contractId === contract.id)
  const selected = roster[0]!
  const reserve = roster.slice(1).map(worker => worker.id)
  assert.ok(reserve.length > 0)
  assert.equal(applyAction(state, { type: 'release', workerIds: [selected.id] }).ok, false)
  state = play(state, { type: 'assign', contractId: null, workerIds: reserve })
  state = play(state, { type: 'release', workerIds: [reserve[0]!] })
  const released = state.workers.find(worker => worker.id === reserve[0])!
  assert.equal(released.status, 'market')
  assert.ok(released.history.some(entry => entry.label === '结束劳动关系'))
  assert.ok(state.pending.disputes > 0)
  const deferred = play(state, { type: 'policies', values: { overtimeCompensation: false } })
  const paidMonth = close(state)
  const deferredMonth = close(deferred)
  assert.equal(deferredMonth.player.reports.at(-1)!.payroll, paidMonth.player.reports.at(-1)!.payroll)
  assert.ok((deferredMonth.player.overtimeArrears ?? 0) > 0)
  const settled = play(deferredMonth, { type: 'settlePayroll' })
  assert.equal(settled.player.overtimeArrears, 0)
})

test('上游协作服务费单独确认应收，同一笔付款由上游实际支出', () => {
  let state = world()
  const upstream = state.competitors[0]!
  const parent = makeContract(state, 'staffing', upstream.id)
  parent.status = 'active'
  parent.signedAt = state.month
  const child = { ...makeContract(state, 'staffing'), id: 'test-协作包', upstreamId: upstream.id, parentContractId: parent.id }
  child.headcount = child.plan.headcount = 3
  child.paymentMonths = 1
  state.contracts.push(parent, child)
  state = play(state, { type: 'sign', contractId: child.id })
  state = play(state, { type: 'policies', values: { autoHire: true } })
  state = close(state)
  const firstBill = state.invoices.find(invoice => invoice.contractId === child.id)!
  assert.ok(firstBill.amount > 0)
  assert.equal(firstBill.received, 0)
  assert.equal(firstBill.upstreamId, upstream.id)
  assert.equal(state.competitors[0]?.reports[0]?.suppliers, firstBill.amount)
  const billId = firstBill.id
  for (let month = 0; month < 5 && state.invoices.find(invoice => invoice.id === billId)!.paidAt === null; month++) {
    state = close(state)
  }
  const settled = state.invoices.find(invoice => invoice.id === billId)!
  assert.equal(settled.received, settled.amount)
  assert.notEqual(settled.paidAt, null)
  const payer = state.competitors[0]!.reports.find(report => report.month === settled.paidAt)!
  const receiver = state.player.reports.find(report => report.month === settled.paidAt)!
  assert.ok(payer.paid >= settled.amount)
  assert.ok(receiver.received >= settled.amount)
})
