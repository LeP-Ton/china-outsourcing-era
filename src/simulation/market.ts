import { CITIES, INDUSTRIES, OCCUPATIONS, REGION_WAGE, RULES } from './data'
import { addNews, adjudicateTender, history, marketWage, supplierSeats } from './operations'
import { nextId, pick, random, range } from './random'
import { clamp, yuan } from './rules'
import { isShortageMonth, isShortageRole, recruitingExpectation } from './scenarios'
import { createTender, createWorker, procurementBusiness } from './world'
import type { Client, GameState, Tender, Worker } from './types'

export function closeTenders(state: GameState) {
  const candidatesByRole = new Map<string, Worker[]>()
  for (const worker of state.workers) {
    const candidates = candidatesByRole.get(worker.occupationId)
    if (candidates) candidates.push(worker)
    else candidatesByRole.set(worker.occupationId, [worker])
  }
  for (const tender of state.tenders) {
    if (tender.status !== 'open' || tender.deadline > state.month) continue
    const parent = state.contracts.find(contract => contract.id === tender.parentContractId)
    if (tender.parentContractId && (!parent || parent.status !== 'active' || parent.remaining < 2)) {
      tender.status = 'expired'
      for (const bid of state.bids) if (bid.tenderId === tender.id && bid.status === 'submitted') bid.status = 'lost'
      continue
    }
    adjudicateTender(state, tender, candidatesByRole.get(tender.occupationId) ?? [])
  }
}

function evolveClient(state: GameState, client: Client, externalOutlay: number) {
  const previous = client.condition
  const baseTrend = INDUSTRIES.find(industry => industry.id === client.industryId)?.growth ?? 0
  const automationImpact = client.occupationId === 'ai' ? state.market.automation * 0.00022
    : ['support', 'labeling', 'production'].includes(client.occupationId) ? -state.market.automation * 0.00021 : 0
  client.growth = clamp(client.growth * 0.68 + (baseTrend + state.market.economy / 2300 + automationImpact) * 0.32
    + range(state, -0.014, 0.014), -0.10, 0.12)
  client.condition = yuan(clamp(client.condition + client.growth * 38 + (62 - client.condition) * 0.055 + range(state, -3.1, 3.1)))
  client.demand = yuan(clamp(client.demand * (1 + client.growth * 0.33), 75, 2800))
  if (state.month % 3 === 0) {
    // 正式编制受内部预算约束，业务需求可以在编制冻结时继续增长。
    const headcountChange = client.condition >= 61 ? client.growth * 0.14 + 0.006 : client.condition <= 37 ? -0.021 : 0
    client.headcountCap = yuan(clamp(client.headcountCap * (1 + headcountChange), client.demand * 0.36, client.demand * 0.92))
    client.pressure = yuan(clamp(client.pressure * 0.7 + (104 - client.condition) * 0.3, 16, 95))
    client.credit = yuan(clamp(client.credit * 0.84 + (client.condition + 12) * 0.16, 23, 98))
    client.formalWage = yuan(client.formalWage * (1 + clamp(client.growth * 0.04, -0.002, 0.004)))
  }
  const externalGap = Math.max(0, client.demand - client.formalStaff)
  client.budget = yuan(externalGap * marketWage(state, client.occupationId) * (1.81 - client.pressure / 380))
  const monthlyWage = client.formalStaff * (client.formalWage + client.formalBenefits)
  // 用业务经营产生的现金补充实际可用采购资金，应付采购款在到账时扣除。
  const estimatedOperatingFlow = monthlyWage * (0.022 + (client.condition - 48) * 0.0024) + externalOutlay * 0.73
  client.cash = yuan(clamp(client.cash + estimatedOperatingFlow, 0, Math.max(10_000_000, monthlyWage * 30)))
  if (client.condition <= 37 && previous > 37) {
    addNews(state, 'customer', `${client.name}压缩采购预算`, `经营评分降至 ${client.condition}。外部服务月度预算调整为 ${client.budget.toLocaleString('zh-CN')} 元，验收质量下限仍为 ${client.quality}。`, 'warning')
  }
  client.conversionSlots = Math.max(0, client.headcountCap - client.formalStaff)
  if (state.month % 6 === 0 && client.condition >= 60 && client.conversionSlots >= 3) {
    const hires = state.workers.filter(worker => worker.status === 'market' && worker.occupationId === client.occupationId
      && worker.city === client.city && recruitingExpectation(state, worker.occupationId, worker.expectation) <= client.formalWage)
      .sort((a, b) => b.skill + b.stability * 0.1 - a.skill - a.stability * 0.1)
      .slice(0, Math.min(2, Math.floor(client.conversionSlots / 3)))
    for (const worker of hires) {
      worker.status = 'client'
      worker.employerId = client.id
      worker.hiredAt = state.month
      worker.wage = client.formalWage
      worker.benchSince = undefined
      client.formalStaff++
      client.conversionSlots--
      history(worker, state.month, '进入客户正式岗位', `${client.name} · 税前月薪 ${client.formalWage} 元`)
    }
  }
  client.dependency = yuan(clamp(client.dependency * 0.8 + 20 * externalGap / Math.max(1, client.demand)))
}

function publishTenders(state: GameState) {
  const clients = state.clients.map(client => ({ client, priority: range(state, 0, 40) + client.condition * 0.42 }))
    .sort((a, b) => b.priority - a.priority)
  const supply: Tender[] = []
  for (const { client } of clients) {
    if (supply.length >= 6) break
    if (state.tenders.some(tender => tender.clientId === client.id && tender.status === 'open' && !tender.upstreamId)) continue
    const active = state.contracts.filter(contract => contract.clientId === client.id && !contract.upstreamId
      && ['active', 'unsigned'].includes(contract.status))
    if (active.length >= 3 || client.budget <= 0) continue
    const available = client.demand - client.formalStaff - active.reduce((sum, contract) => sum + contract.headcount, 0)
    const recurringBudget = active.reduce((sum, contract) => sum + contract.plan.price * contract.headcount, 0)
    if (available < 7 || recurringBudget > client.budget * 0.9) continue
    const tender = createTender(state, client, procurementBusiness(state, client))
    tender.headcount = Math.min(available, tender.headcount + Math.floor(state.month / 15))
    tender.budget = yuan(tender.budget * (1 + (49 - client.pressure) / 235))
    supply.push(tender)
  }
  const subcontract = publishSubcontract(state)
  if (subcontract) supply.push(subcontract)
  state.tenders.unshift(...supply)
}

function publishSubcontract(state: GameState): Tender | undefined {
  if (state.month % 2 !== 0) return
  const used = new Set(state.tenders.map(tender => tender.parentContractId))
  // 资金充足的渠道商会主动配置区域协作包，缺编供应商则采购临时履约能力。
  for (const parent of state.contracts) {
    if (parent.status !== 'active' || parent.upstreamId || parent.remaining < 4
      || parent.headcount < 12 || parent.attendance <= 0 || used.has(parent.id)) continue
    const client = state.clients.find(item => item.id === parent.clientId)
    const upstream = state.competitors.find(item => item.id === parent.companyId)
    if (!client || !upstream || upstream.status !== 'operating') continue
    const proactive = upstream.strategy === 'channel'
    const gap = Math.ceil(parent.headcount * (1 - parent.attendance))
    const desired = proactive ? Math.max(gap, Math.ceil(parent.headcount * 0.22)) : gap
    const capacity = Math.floor(parent.headcount * RULES.maxSubcontract) - supplierSeats(parent.plan)
    const seats = Math.min(Math.floor(parent.headcount * 0.33), desired, capacity)
    const price = yuan(parent.plan.price * 0.93)
    if (seats < 3 || upstream.cash - upstream.payables < price * seats * 2) continue
    const tender = createTender(state, client, parent.business)
    tender.title = `${upstream.brand} · ${parent.title}协作包`
    tender.parentContractId = parent.id
    tender.upstreamId = upstream.id
    tender.headcount = seats
    tender.budget = price
    tender.months = Math.min(parent.remaining - 2, 6)
    tender.deadline = state.month + 1
    tender.paymentMonths = parent.paymentMonths + 1
    return tender
  }
}

export function updateMarket(state: GameState) {
  const priorEconomy = state.market.economy
  state.market.economy = yuan(clamp(priorEconomy * 0.8 + Math.sin(state.month / 8) * 4 + range(state, -8, 8), -36, 36))
  state.market.automation = clamp(state.market.automation + range(state, 0.12, 0.79), 0, 93)
  state.market.regulation = yuan(clamp(state.market.regulation * 0.9 + 5.4 + range(state, -3, 3), 30, 85))
  if (state.market.economy < -10 && priorEconomy >= -10) {
    addNews(state, 'market', '采购需求随景气回落', `综合景气指数降至 ${state.market.economy}。各行业经营状态和招标预算将随需求变化。`, 'warning')
  }
  if (state.month > 0 && state.month % 18 === 0) {
    addNews(state, 'technology', '自动化改变初级岗位招聘结构', `行业自动化指数升至 ${yuan(state.market.automation)}。基础客服与标注需求承压，算法与数据岗位需求上行。`)
  }
  const shortage = state.setup.scenario === 'shortage' && isShortageMonth(state.month)
  if (shortage && !isShortageMonth(state.month - 1)) {
    addNews(state, 'labor', '一线岗位进入季节性用工荒', '生产、仓储和门店人才流入放缓，求职者期望薪资上升 13%。可提前储备或调配在册员工。', 'warning')
  }
  const priorOutlays = new Map<string, number>()
  for (const invoice of state.invoices) {
    if (!invoice.upstreamId && invoice.issued === state.month - 1) {
      priorOutlays.set(invoice.clientId, (priorOutlays.get(invoice.clientId) ?? 0) + invoice.amount)
    }
  }
  for (const client of state.clients) evolveClient(state, client, priorOutlays.get(client.id) ?? 0)
  const supply = new Map<string, number>()
  for (const worker of state.workers) {
    if (worker.status === 'market') {
      supply.set(worker.occupationId, (supply.get(worker.occupationId) ?? 0) + 1)
      if (state.month % 3 === 0) worker.expectation = yuan(worker.expectation * 0.9
        + marketWage(state, worker.occupationId) * (REGION_WAGE[worker.city] ?? 1) / (REGION_WAGE[state.setup.city] ?? 1) * (0.077 + worker.skill * 0.00035))
    }
    if (state.month % 12 === 0) {
      worker.age++
      if (worker.status === 'employed' || worker.status === 'client') worker.experience++
    }
  }
  for (const segment of state.market.segments) {
    const occupation = OCCUPATIONS.find(item => item.id === segment.occupationId)
    if (!occupation) continue
    const localDemand = state.clients.reduce((sum, client) => sum + (client.occupationId === segment.occupationId
      ? Math.max(0, client.demand - client.formalStaff) : 0), 0)
    const automation = occupation.id === 'ai' ? 1 + state.market.automation / 160
      : ['support', 'labeling', 'production'].includes(occupation.id) ? 1 - state.market.automation / 255 : 1
    const strained = shortage && isShortageRole(occupation.id)
    const targetDemand = (occupation.demand * 0.57 + localDemand * 0.18 * (1 + state.market.economy / 150) * automation) * (strained ? 1.18 : 1)
    segment.growth = clamp((targetDemand - segment.demand) / Math.max(1, segment.demand), -0.25, 0.25) * 0.21
    segment.demand = Math.max(5, yuan(segment.demand * (1 + segment.growth)))
    const seekers = supply.get(segment.occupationId) ?? 0
    const normalInflow = Math.min(seekers < 58 ? 12 : 5, Math.max(0, Math.round((190 - seekers) * 0.045)))
    const inflow = strained ? Math.floor(normalInflow * 0.25) : normalInflow
    for (let index = 0; index < inflow && state.workers.length < 4200; index++) {
      const city = random(state) < 0.69 ? state.setup.city : pick(state, CITIES)
      state.workers.push(createWorker(state, occupation, city))
      supply.set(segment.occupationId, (supply.get(segment.occupationId) ?? 0) + 1)
    }
    segment.supply = supply.get(segment.occupationId) ?? 0
    const wageAnchor = occupation.wage * (REGION_WAGE[state.setup.city] ?? 1)
    const projected = wageAnchor * clamp(0.95 + (segment.demand / Math.max(1, segment.supply) - 1) * 0.105, 0.83, 1.43)
    segment.wage = yuan(segment.wage * 0.94 + projected * 0.06)
  }
  publishTenders(state)
}
