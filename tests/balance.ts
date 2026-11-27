import assert from 'node:assert/strict'
import { advanceMonth, applyAction, defaultBidPlan, estimateBid } from '../src/simulation/engine'
import { OCCUPATIONS } from '../src/simulation/data'
import type { BidPlan, Contract, Difficulty, GameAction, GameState, Origin, Tender } from '../src/simulation/types'
import { createWorker, createWorld, DEMO_SETUP } from '../src/simulation/world'

interface Profile {
  name: string
  origin: Origin
  wage: number
  price: number
  benefit: number
  research: 'matching' | 'scheduling' | 'payroll' | 'suppliers' | 'assessment' | 'recruitment'
  delivery?: 'preferred' | 'only'
  subcontract?: boolean
}

const profiles: Profile[] = [
  { name: '低价规模', origin: 'dispatch', wage: 0.98, price: 0.90, benefit: 260, research: 'payroll' },
  { name: '高端人才', origin: 'headhunter', wage: 1.10, price: 0.98, benefit: 580, research: 'assessment', delivery: 'preferred' },
  { name: '渠道服务', origin: 'regional', wage: 1.01, price: 0.96, benefit: 400, research: 'suppliers', subcontract: true },
  { name: '稳健经营', origin: 'bootstrap', wage: 1.06, price: 0.96, benefit: 520, research: 'scheduling' },
  { name: '技术驱动', origin: 'ai', wage: 1.05, price: 0.97, benefit: 430, research: 'matching' },
  { name: '专业服务', origin: 'software', wage: 1.04, price: 0.98, benefit: 450, research: 'recruitment', delivery: 'only' },
]

const scenarios: { seed: string; difficulty: Difficulty; city: string; economy: number }[] = [
  { seed: '平稳采购', difficulty: 'standard', city: '上海', economy: 0 },
  { seed: '区域扩张', difficulty: 'easy', city: '成都', economy: 12 },
  { seed: '低迷账期', difficulty: 'hard', city: '深圳', economy: -20 },
]

function apply(state: GameState, action: GameAction) {
  const result = applyAction(state, action)
  return result.ok ? result.state : state
}

function proposal(state: GameState, tender: Tender, profile: Profile): BidPlan {
  const base = defaultBidPlan(state, tender)
  const supplier = profile.subcontract ? state.suppliers.find(item => item.specialty === tender.business) : undefined
  return {
    ...base, price: Math.round(tender.budget * profile.price), wage: Math.round(base.wage * profile.wage),
    benefit: profile.benefit, training: profile.delivery ? 230 : 130,
    subcontract: supplier ? 0.35 : 0, supplierId: supplier?.id ?? null,
    depth: supplier ? (supplier.partnerId ? 2 : 1) : 0,
  }
}

function operate(state: GameState, profile: Profile): GameState {
  const portfolio = state.contracts.filter(contract => contract.companyId === state.player.id && ['active', 'unsigned'].includes(contract.status))
  const closing = state.player.reports.at(-1)
  if (closing && closing.cash > 1_100_000 && state.month > 8 && !state.technologies.includes(profile.research)
    && !state.research.some(project => project.techId === profile.research)) {
    state = apply(state, { type: 'research', techId: profile.research })
  }
  for (const contract of portfolio) {
    if (contract.status === 'unsigned') {
      state = apply(state, { type: 'sign', contractId: contract.id })
    } else if (contract.remaining <= 2 && contract.revenue >= contract.plan.wage * contract.headcount * 1.38) {
      state = apply(state, { type: 'renew', contractId: contract.id })
    }
  }
  if (closing && closing.receivables >= 450_000 && state.player.cash < 350_000 && state.player.debt <= 150_000) {
    state = apply(state, { type: 'finance', amount: 300_000 })
  } else if (state.player.debt > 0 && state.player.cash > 1_900_000) {
    state = apply(state, { type: 'repay', amount: state.player.debt })
  }

  const open = state.tenders.filter(tender => tender.status === 'open' && tender.deadline >= state.month
    && (profile.delivery !== 'only' || tender.business === 'delivery') && (profile.subcontract || !tender.upstreamId)
    && !state.bids.some(bid => bid.companyId === state.player.id && bid.tenderId === tender.id))
  const cashCommitment = portfolio.reduce((total, contract) => total + contract.plan.wage * contract.headcount * 1.25, 0)
  const budget = Math.max(0, state.player.cash - cashCommitment * 1.25 - 145000)
  const feasible = open.map(tender => {
    const plan = proposal(state, tender, profile)
    const estimate = estimateBid(state, tender, plan)
    const specialized = tender.business === 'delivery' && profile.delivery ? 7 : 0
    return { tender, plan, estimate, merit: estimate.score + estimate.margin * 95 + specialized }
  }).filter(item => item.estimate.margin > 0.05 && item.estimate.cost * 1.55 <= budget)
    .sort((left, right) => right.merit - left.merit)
  const pendingBid = state.bids.filter(bid => bid.companyId === state.player.id && bid.status === 'submitted').length
  let exposed = 0
  for (const choice of feasible.slice(0, Math.max(0, Math.min(2 - pendingBid, 6 - portfolio.length - pendingBid)))) {
    if (exposed + choice.estimate.cost * 1.55 > budget) break
    state = apply(state, { type: 'bid', tenderId: choice.tender.id, plan: choice.plan })
    exposed += choice.estimate.cost * 1.55
  }

  const expectedHires = new Map<string, number>()
  for (const contract of portfolio) {
    const current = state.workers.filter(worker => worker.contractId === contract.id).length
    const stillNeeded = Math.max(0, Math.ceil(contract.headcount * (1 - contract.plan.subcontract)) - current)
    expectedHires.set(contract.occupationId, (expectedHires.get(contract.occupationId) ?? 0) + stillNeeded)
  }
  for (const bid of state.bids.filter(item => item.companyId === state.player.id && item.status === 'submitted')) {
    const tender = state.tenders.find(item => item.id === bid.tenderId)!
    const buffer = Math.ceil(tender.headcount * (1 - bid.plan.subcontract) * 0.33)
    expectedHires.set(tender.occupationId, (expectedHires.get(tender.occupationId) ?? 0) + buffer)
  }
  const idle = state.workers.filter(worker => worker.employerId === state.player.id && worker.contractId === null
    && state.month - (worker.benchSince ?? worker.history.at(-1)?.month ?? worker.hiredAt ?? state.month) >= 2)
    .sort((left, right) => right.skill - left.skill)
  const redundant: string[] = []
  for (const worker of idle) {
    const reserve = expectedHires.get(worker.occupationId) ?? 0
    if (reserve > 0) expectedHires.set(worker.occupationId, reserve - 1)
    else redundant.push(worker.id)
  }
  if (redundant.length) state = apply(state, { type: 'release', workerIds: redundant.slice(0, 20) })
  return state
}

function assertMonth(state: GameState) {
  for (const company of [state.player, ...state.competitors]) {
    const report = company.reports.at(-1)
    if (!report || ![state.month - 1, state.month].includes(report.month)) continue
    assert.ok(Number.isFinite(company.cash) && company.cash >= 0)
    assert.equal(report.revenue - report.costs, report.profit)
    assert.equal(report.openingCash + report.received + report.financing - report.paid - report.repayments, report.cash)
    assert.ok(report.receivables >= 0 && report.received >= 0)
  }
  for (const invoice of state.invoices) assert.ok(invoice.amount >= invoice.received && invoice.received >= 0)
  const ids = new Set(state.workers.map(worker => worker.id))
  assert.equal(ids.size, state.workers.length)
}

function run(profile: Profile, scenario: typeof scenarios[number]) {
  let state = createWorld({ ...DEMO_SETUP, origin: profile.origin, ...scenario })
  state.market.economy = scenario.economy
  state = apply(state, { type: 'policies', values: { autoHire: true } })
  // 企业破产后，以仍在经营的观察账户继续推进，以检查同一市场是否稳定到第 120 月。
  let failed: GameState['player'] | undefined
  let failureMonth: number | undefined
  for (let month = 0; month < 120; month++) {
    if (!failed) state = operate(state, profile)
    const result = advanceMonth(state)
    assert.ok(result.ok, result.message)
    state = result.state
    assertMonth(state)
    if (!failed && state.player.status === 'bankrupt') {
      failed = state.player
      failureMonth = state.month
    }
    if (failed) state.player = { ...state.player, status: 'operating', reports: state.player.reports }
  }
  const company = failed ?? state.player
  const report = company.reports.at(-1)!
  const direct = state.invoices.filter(invoice => !invoice.upstreamId)
  const playerRevenue = direct.reduce((total, invoice) => total + (invoice.companyId === company.id ? invoice.amount : 0), 0)
  const directRevenue = direct.reduce((total, invoice) => total + invoice.amount, 0)
  return {
    策略: profile.name, 场景: scenario.seed, 模拟月数: state.month, 破产月: failureMonth ?? '—',
    累计利润: Math.round(company.cumulativeProfit), 市场份额: (100 * playerRevenue / Math.max(1, directRevenue)).toFixed(1) + '%',
    累计离职占录用: (100 * company.totalDepartures / Math.max(1, company.totalHires)).toFixed(1) + '%',
    员工薪资: Math.round(report.averageIncome), 员工满意度: report.satisfaction.toFixed(1),
  }
}

const results = profiles.flatMap(profile => scenarios.map(scenario => run(profile, scenario)))
const survival = profiles.map(profile => {
  const runs = results.filter(result => result.策略 === profile.name)
  return { 策略: profile.name, 生存率: (100 * runs.filter(result => result.破产月 === '—').length / runs.length).toFixed(0) + '%' }
})

const largeWorld = createWorld(DEMO_SETUP)
for (let index = largeWorld.workers.length; index < 30_000; index++) {
  largeWorld.workers.push(createWorker(largeWorld, OCCUPATIONS[index % OCCUPATIONS.length]!, largeWorld.setup.city))
}
largeWorld.player.cash = largeWorld.player.cashAtLastClose = 700_000_000
const fullRoster = largeWorld.workers.slice(0, 21_000)
for (const occupation of OCCUPATIONS) {
  const client = largeWorld.clients.find(candidate => candidate.occupationId === occupation.id) ?? largeWorld.clients[0]!
  const workers = fullRoster.filter(worker => worker.occupationId === occupation.id)
  const tender: Tender = {
    ...largeWorld.tenders[0]!, id: `load-${occupation.id}`, title: `性能测试 · ${occupation.name}`,
    clientId: client.id, occupationId: occupation.id, business: 'delivery', headcount: workers.length,
    skill: occupation.skill, budget: Math.round(occupation.wage * 2), status: 'awarded', winnerId: largeWorld.player.id,
  }
  const contract: Contract = {
    id: `run-${occupation.id}`, tenderId: tender.id, title: tender.title, companyId: largeWorld.player.id,
    clientId: tender.clientId, upstreamId: null, occupationId: occupation.id, business: tender.business,
    plan: defaultBidPlan(largeWorld, tender), headcount: workers.length, term: 12, remaining: 12,
    paymentMonths: 2, qualityTarget: 70, attendanceTarget: 0.9, signedAt: 0, status: 'active',
    quality: 0, attendance: 0, revenue: 0, cumulativeRevenue: 0, penalties: 0, progress: 0, risk: 0, lastSupplierCost: 0,
  }
  largeWorld.tenders.push(tender)
  largeWorld.contracts.push(contract)
  for (const worker of workers) {
    worker.employerId = largeWorld.player.id
    worker.status = 'employed'
    worker.hiredAt = 0
    worker.contractId = contract.id
    worker.wage = occupation.wage
  }
}
const startedAt = performance.now()
const largeResult = advanceMonth(largeWorld)
assert.ok(largeResult.ok, largeResult.message)
assertMonth(largeResult.state)
const duration = Math.round(performance.now() - startedAt)
const calculated = largeResult.state.workers.filter(worker => worker.lastHours !== undefined).length
assert.ok(calculated >= fullRoster.length)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ results, survival, performance: { population: largeResult.state.workers.length, employed: fullRoster.length, calculated, duration } }, null, 2))
} else {
  console.table(results)
  console.table(survival)
  console.log(`3 万人物（含 ${fullRoster.length} 名项目员工）的单月模拟耗时 ${duration}ms，计算了 ${calculated} 人的实际工时。`)
}
