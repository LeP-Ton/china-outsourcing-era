import { OCCUPATIONS, RULES } from './data'
import { nextId, random, range } from './random'
import { calculateTenderScore, clamp, evaluateDelivery, yuan } from './rules'
import type {
  Bid, BidEstimate, BidPlan, Business, Client, Company, Contract, GameState,
  NewsKind, RecruitmentChannel, Severity, Supplier, Tender, Worker,
} from './types'

export const CHANNEL_COST: Record<RecruitmentChannel, number> = {
  platform: 180,
  referral: 270,
  campus: 110,
  headhunter: 720,
}

export function marketWage(state: GameState, occupationId: string): number {
  return state.market.segments.find(segment => segment.occupationId === occupationId)?.wage
    ?? OCCUPATIONS.find(occupation => occupation.id === occupationId)?.wage ?? 6000
}

export function addNews(state: GameState, kind: NewsKind, title: string, detail: string, severity: Severity = 'info') {
  state.news.unshift({ id: nextId(state, 'news'), month: state.month, kind, severity, title, detail })
  state.news.length = Math.min(state.news.length, 160)
}

export function history(worker: Worker, month: number, label: string, detail: string) {
  worker.history.push({ month, label, detail })
}

export function staffedSeats(plan: BidPlan): number {
  return plan.headcount - supplierSeats(plan)
}

export function supplierSeats(plan: BidPlan): number {
  return Math.floor(plan.headcount * plan.subcontract)
}

export function mobilizationShare(plan: BidPlan, elapsedMonths: number): number {
  return clamp(elapsedMonths / Math.max(1, plan.mobilization), 0, 1)
}

export function supplierChain(state: GameState, plan: BidPlan): Supplier[] {
  const chain: Supplier[] = []
  let id = plan.supplierId
  while (id && chain.length < plan.depth && chain.length < RULES.maxChainDepth) {
    const supplier = state.suppliers.find(candidate => candidate.id === id)
    if (!supplier || chain.some(node => node.id === supplier.id)) break
    chain.push(supplier)
    id = supplier.partnerId
  }
  return chain
}

export function validSupplier(state: GameState, plan: BidPlan, maxDepth = RULES.maxChainDepth): boolean {
  if (!Number.isFinite(plan.subcontract) || !Number.isInteger(plan.depth) || plan.depth > maxDepth) return false
  if (plan.subcontract < 0 || plan.subcontract > RULES.maxSubcontract) return false
  if (plan.subcontract === 0) return plan.supplierId === null && plan.depth === 0
  if (plan.depth <= 0 || supplierSeats(plan) === 0) return false
  return supplierChain(state, plan).length === plan.depth
}

export function subcontractRate(state: GameState, plan: BidPlan, occupationId: string): number {
  const supplier = supplierChain(state, plan)[0]
  if (!supplier) return 0
  // 首层价格随岗位成本与供应商费率变化，主合同提价不自动增加分包成本。
  return yuan(marketWage(state, occupationId) * supplier.rate)
}

export function availableCash(state: GameState): number {
  const { recruitment, training, research, disputes, management } = state.pending
  return state.player.cash - state.player.payables - recruitment - training - research - disputes - management
}

export function monthlyCost(state: GameState, plan: BidPlan, occupationId: string): number {
  return yuan(staffedSeats(plan) * (plan.wage * (1 + RULES.statutoryRate) + plan.benefit + plan.training + plan.management)
    + supplierSeats(plan) * subcontractRate(state, plan, occupationId))
}

function clientFor(state: GameState, tender: Tender | Contract): Client | undefined {
  return state.clients.find(client => client.id === tender.clientId)
}

function commissionedBusiness(tender: Tender, plan: BidPlan): Business {
  return tender.business === 'delivery' ? 'delivery' : plan.business
}

export function riskTarget(state: GameState, business: Business, plan: BidPlan, client: Client | undefined, attendance: number): number {
  const dispatchSeats = business === 'dispatch' && client ? plan.headcount + state.contracts.reduce((sum, contract) =>
    sum + (contract.clientId === client.id && contract.status === 'active' && contract.business === 'dispatch'
      && contract.plan !== plan && !contract.upstreamId ? contract.headcount : 0), 0) : 0
  const dispatchShare = client ? dispatchSeats / Math.max(1, client.formalStaff + dispatchSeats) : 0
  const managementMismatch = business === 'staffing' && plan.manager === 'client' ? 48
    : business === 'delivery' && plan.manager === 'client' ? 33 : 0
  const dispatchRatio = Math.max(0, dispatchShare - RULES.dispatchTargetRatio) * 75
  const chain = supplierChain(state, plan)
  const supplyRisk = chain.length
    ? (chain.length * 8 + (100 - Math.min(...chain.map(node => node.compliance))) * 0.55) * plan.subcontract
    : 0
  return clamp(9 + managementMismatch + dispatchRatio + supplyRisk + (1 - attendance) * 24
    + Math.max(0, state.market.regulation - 50) * 0.28)
}

export function makeBidPlan(state: GameState, tender: Tender, company: Company): BidPlan {
  const wage = marketWage(state, tender.occupationId)
  const specialization = company.strategy === 'premium' ? 1.08 : company.strategy === 'steady' ? 1.03
    : company.strategy === 'scale' ? 0.94 : 1
  const offer = company.strategy === 'scale' ? 0.86 : company.strategy === 'premium' ? 0.98
    : company.strategy === 'expansion' ? 0.89 : 0.93
  const supplier = company.strategy === 'channel' ? state.suppliers.find(candidate => candidate.specialty === tender.business) : undefined
  const subcontract = supplier && tender.headcount >= 5 ? 0.35 : 0
  const plan: BidPlan = {
    price: yuan(tender.budget * offer), wage: yuan(wage * specialization),
    benefit: company.id === state.player.id ? state.policies.defaultBenefit : company.strategy === 'steady' ? 430 : 260,
    training: company.strategy === 'premium' ? 230 : 135, management: tender.business === 'delivery' ? 720 : 480,
    headcount: tender.headcount, skill: tender.skill, mobilization: 1, business: tender.business,
    manager: tender.business === 'dispatch' ? 'client' : 'provider',
    subcontract, supplierId: subcontract ? supplier?.id ?? null : null, depth: subcontract ? 1 : 0,
  }
  plan.price = Math.min(tender.budget, Math.max(plan.price, Math.ceil(monthlyCost(state, plan, tender.occupationId) * 1.06 / plan.headcount)))
  return plan
}

export function defaultBidPlan(state: GameState, tender: Tender): BidPlan {
  return makeBidPlan(state, tender, state.player)
}

function estimateCompanyBid(state: GameState, tender: Tender, plan: BidPlan, company: Company, candidates: Worker[]): BidEstimate {
  const client = clientFor(state, tender)
  const segment = state.market.segments.find(item => item.occupationId === tender.occupationId)
  const wage = marketWage(state, tender.occupationId)
  const wageRatio = plan.wage / Math.max(1, wage)
  const selfSeats = staffedSeats(plan)
  const qualified = candidates.filter(worker => worker.skill >= plan.skill - 16
    && ((worker.status === 'market' && worker.expectation <= plan.wage * 1.14 && worker.city === company.city)
      || (worker.employerId === company.id && worker.contractId === null)))
  const outsideCandidates = Math.max(0, (segment?.supply ?? 0) - qualified.length) * 0.05
  const reserve = qualified.length + outsideCandidates
  const difficulty = clamp(46 + (1 - wageRatio) * 90 + (plan.skill - 55) * 0.67
    + ((segment?.demand ?? 0) / Math.max(1, segment?.supply ?? 1) - 1) * 11
    - Math.min(22, reserve / Math.max(1, selfSeats) * 7) - company.tech * 0.11)
  const supplier = supplierChain(state, plan)[0]
  const external = supplier ? Math.min(supplierSeats(plan), supplier.capacity) * clamp(supplier.quality / 94, 0.55, 1) : 0
  const hiringRate = clamp(0.92 + (wageRatio - 1) * 0.66 - difficulty * 0.0021
    + company.tech * 0.0011, 0.20, 1)
  const covered = Math.min(selfSeats, reserve, selfSeats * hiringRate) + external
  const blendedSkill = clamp(plan.skill + (wageRatio - 0.89) * 20 - difficulty * 0.04
    - Math.max(0, plan.depth - 1) * 3 * plan.subcontract)
  const report = evaluateDelivery({ seats: tender.headcount, covered, skill: blendedSkill, targetSkill: tender.skill,
    satisfaction: 65, fatigue: 12, management: Math.min(100, plan.management / 10), efficiency: 1 + company.tech * 0.0015 })
  const attendance = clamp(covered / Math.max(1, tender.headcount), 0, 1)
  const deviation = plan.business === tender.business ? 0 : plan.business === 'delivery' || tender.business === 'delivery' ? 16 : 7
  const quality = clamp(report.quality - deviation)
  const ramp = mobilizationShare(plan, 1)
  const performanceBonus = tender.business === 'delivery'
    ? deliveryBonus(quality, tender.quality, attendance) : 0
  const revenue = yuan(plan.price * (tender.business === 'delivery' ? tender.headcount
    * (attendance * 0.31 + Math.min(1.08, report.output) * 0.69 + performanceBonus) : covered))
  const cost = monthlyCost(state, plan, tender.occupationId)
  const exposure = yuan(cost * (tender.paymentMonths + 1) + selfSeats * CHANNEL_COST.platform)
  const audit = company.id === state.player.id && state.technologies.includes('audit') ? 8 : 0
  const risk = yuan(clamp(riskTarget(state, commissionedBusiness(tender, plan), plan, client, attendance) - audit))
  const score = calculateTenderScore({
    quote: plan.price, budget: tender.budget, quality, coverage: attendance * (0.67 + ramp * 0.33) * 100,
    reputation: company.reputation, relationship: client?.trust[company.id] ?? 48, compliance: company.compliance * (1 - risk / 230),
    stability: clamp(80 + (company.cash - company.payables - exposure) / Math.max(10000, exposure) * 21),
    priceWeight: clamp((tender.business === 'delivery' ? 20 : 27) + (client?.pressure ?? 55) * 0.19 - (client?.compliance ?? 65) * 0.11),
    qualityWeight: clamp((tender.business === 'delivery' ? 33 : 21) + ((client?.quality ?? 75) - 60) * 0.48),
  })
  const turnover = clamp(0.028 + (1 - wageRatio) * 0.11 + risk * 0.00035 - plan.benefit * 0.000012, 0.003, 0.30)
  return { revenue, cost, margin: revenue ? (revenue - cost) / revenue : 0, difficulty: yuan(difficulty),
    attendance, quality, turnover, exposure, risk, score }
}

export function deliveryBonus(quality: number, target: number, coverage: number): number {
  return clamp((quality - target - 3) * 0.011, 0, 0.16) * clamp((coverage - 0.73) * 4.2, 0, 1)
}

export function estimateBid(state: GameState, tender: Tender, plan: BidPlan): BidEstimate {
  const candidates = state.workers.filter(worker => worker.occupationId === tender.occupationId)
  return estimateCompanyBid(state, tender, plan, state.player, candidates)
}

export function validBid(state: GameState, tender: Tender, plan: BidPlan): boolean {
  const amounts = [plan.price, plan.wage, plan.benefit, plan.training, plan.management, plan.headcount, plan.skill, plan.mobilization]
  return amounts.every(Number.isFinite)
    && plan.price >= 100 && plan.price <= tender.budget * 1.03
    && plan.wage >= Math.max(RULES.minimumWage, marketWage(state, tender.occupationId) * 0.54) && plan.wage <= 200000
    && [plan.benefit, plan.training, plan.management].every(value => value >= 0 && value <= 20000)
    && Number.isInteger(plan.headcount) && plan.headcount >= Math.ceil(tender.headcount * 0.65) && plan.headcount <= tender.headcount
    && plan.skill >= 0 && plan.skill <= 100 && Number.isInteger(plan.mobilization) && plan.mobilization >= 0 && plan.mobilization <= 6
    && ['dispatch', 'staffing', 'delivery'].includes(plan.business)
    && ['client', 'provider'].includes(plan.manager) && validSupplier(state, plan, RULES.maxChainDepth - Number(Boolean(tender.upstreamId)))
}

export function adjudicateTender(state: GameState, tender: Tender, candidates: Worker[]) {
  const playerBid = state.bids.find(entry => entry.tenderId === tender.id
    && entry.companyId === state.player.id && entry.status === 'submitted')
  const entries: Bid[] = playerBid ? [playerBid] : []
  const active = state.contracts.filter(contract => contract.status === 'active')
  for (const rival of state.competitors) {
    if (rival.status !== 'operating' || rival.id === tender.upstreamId) continue
    const managed = active.filter(contract => contract.companyId === rival.id)
    const reserved = managed.reduce((sum, contract) => sum + monthlyCost(state, contract.plan, contract.occupationId) * 0.57, 0)
    const plan = makeBidPlan(state, tender, rival)
    const estimate = estimateCompanyBid(state, tender, plan, rival, candidates)
    if (rival.cash - rival.payables - reserved < Math.max(estimate.cost, estimate.exposure * 0.52) || managed.length >= 9) continue
    const appetite = 0.46 + (rival.city === clientFor(state, tender)?.city ? 0.17 : 0)
      + (rival.strategy === 'expansion' ? 0.16 : 0) + (managed.length === 0 ? 0.11 : 0) - managed.length * 0.033
    const marginTolerance = rival.strategy === 'expansion' && rival.cash > 1_100_000 ? -0.05 : 0.017
    if (estimate.margin < marginTolerance || random(state) > appetite) continue
    entries.push({ id: nextId(state, 'bid'), tenderId: tender.id, companyId: rival.id, month: state.month,
      plan, estimate, status: 'submitted' })
  }
  // 采购预算、组织能力和客户采购侧重点会共同影响定标。
  const scored = entries.map(entry => ({ entry, value: entry.estimate.score + range(state, -2.6, 2.6) }))
    .filter(({ entry }) => entry.estimate.attendance >= 0.42 && entry.estimate.quality >= tender.quality - 35)
    .sort((a, b) => b.value - a.value || a.entry.id.localeCompare(b.entry.id))
  const top = scored[0]
  const winner = top && top.value >= 42 ? top.entry : undefined
  tender.status = winner ? 'awarded' : 'expired'
  tender.winnerId = winner?.companyId ?? null
  for (const entry of entries) entry.status = entry === winner ? 'won' : 'lost'
  state.bids.unshift(...entries.filter(entry => entry !== playerBid))
  if (winner) {
    const forPlayer = winner.companyId === state.player.id
    const contract: Contract = {
      id: nextId(state, 'contract'), tenderId: tender.id, companyId: winner.companyId,
      clientId: tender.clientId, upstreamId: tender.upstreamId, parentContractId: tender.parentContractId,
      title: tender.title, occupationId: tender.occupationId, business: commissionedBusiness(tender, winner.plan),
      plan: { ...winner.plan }, headcount: winner.plan.headcount, term: tender.months, remaining: tender.months,
      paymentMonths: tender.paymentMonths, qualityTarget: tender.quality, attendanceTarget: tender.attendance,
      signedAt: forPlayer ? null : state.month, status: forPlayer ? 'unsigned' : 'active',
      quality: 0, attendance: 0, revenue: 0, cumulativeRevenue: 0, penalties: 0,
      risk: winner.estimate.risk, progress: 0, lastSupplierCost: 0,
    }
    state.contracts.unshift(contract)
    if (forPlayer) addNews(state, 'business', '新项目待签署', `${tender.title}完成采购评审，服务协议已进入签署环节。`)
  }
}

export function acceptChance(state: GameState, worker: Worker, company: Company, wage: number, channel: RecruitmentChannel) {
  const channelEffect = channel === 'headhunter' ? 0.25 : channel === 'referral' ? 0.17
    : channel === 'campus' ? (worker.experience < 3 ? 0.20 : -0.19) : 0
  const wageRatio = wage / Math.max(1, worker.expectation)
  const mobility = worker.city === company.city ? 0.12 : -0.09
  const cityWage = wage / Math.max(1, marketWage(state, worker.occupationId))
  return clamp(0.39 + (wageRatio - 0.88) * 1.10 + (cityWage - 0.9) * 0.13
    + mobility + channelEffect + (company.reputation - 50) * 0.003 + worker.pressure * 0.0016, 0.03, 0.995)
}

export function hireWorker(state: GameState, worker: Worker, company: Company, wage: number, channel: RecruitmentChannel, contract?: Contract): boolean {
  if (worker.status !== 'market') return false
  const accepted = random(state) < acceptChance(state, worker, company, wage, channel)
  if (!accepted) {
    if (company.id === state.player.id) history(worker, state.month, '拒绝录用', `${company.name} · 税前月薪 ${wage} 元`)
    return false
  }
  worker.status = 'employed'
  worker.employerId = company.id
  worker.contractId = contract?.id ?? null
  worker.hiredAt = state.month
  worker.benchSince = contract ? undefined : state.month
  worker.wage = yuan(wage)
  worker.satisfaction = yuan(clamp(53 + (wage / worker.expectation - 0.9) * 37 + (company.reputation - 50) * 0.08))
  worker.belonging = 35
  company.totalHires++
  history(worker, state.month, '接受录用', `${company.name} · 税前月薪 ${yuan(wage)} 元${contract ? ` · ${contract.title}` : ' · 待岗'}`)
  return true
}

export function releaseWorkers(state: GameState, contract: Contract, label: string) {
  for (const worker of state.workers) {
    if (worker.contractId !== contract.id) continue
    worker.contractId = null
    worker.benchSince = state.month
    history(worker, state.month, label, `${contract.title} · 回到人才储备`)
  }
}

export function severance(worker: Worker, month: number): number {
  const tenure = month - (worker.hiredAt ?? month)
  return yuan(worker.wage * clamp(Math.ceil((tenure + 1) / 6) * 0.5, 0.5, 6))
}

export function dismissWorker(state: GameState, worker: Worker, company: Company, compensation: number) {
  history(worker, state.month, '结束劳动关系', `${company.name} · 结束待岗安排，确认经济补偿 ${compensation} 元`)
  worker.status = 'market'
  worker.employerId = null
  worker.contractId = null
  worker.hiredAt = null
  worker.benchSince = undefined
  worker.wage = 0
}
