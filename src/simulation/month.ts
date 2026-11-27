import { RULES, TECHNOLOGIES } from './data'
import { closeTenders, updateMarket } from './market'
import {
  addNews, CHANNEL_COST, deliveryBonus, dismissWorker, hireWorker, history, mobilizationShare, releaseWorkers,
  riskTarget, severance, staffedSeats, subcontractRate, supplierChain, supplierSeats,
} from './operations'
import { nextId, random, range } from './random'
import { clamp, evaluateDelivery, evaluateWorkerMonth, yuan } from './rules'
import type { Company, Contract, GameResult, GameState, MonthReport, Worker } from './types'

interface Ledger {
  report: MonthReport
  internalSupplierCost: number
}

interface ProjectDelivery {
  workerIds: Set<string>
  extraHours: number
}

export function possibleRenewal(state: GameState, contract: Contract): boolean {
  const client = state.clients.find(item => item.id === contract.clientId)
  return contract.status === 'active' && !contract.renewed && contract.remaining <= 2 && contract.remaining > 0
    && contract.quality >= contract.qualityTarget - 5 && contract.attendance >= contract.attendanceTarget - 0.12
    && (client?.condition ?? 0) >= 45 && !contract.parentContractId
}

export function renewContract(state: GameState, contract: Contract) {
  contract.remaining += contract.term
  contract.renewed = true
  addNews(state, 'business', '服务期限已延长', `${contract.title}连续履约达到续期条件，增加 ${contract.term} 个月服务期。`)
}

export function settlePayroll(company: Company, includeOvertime = true): number {
  const ordinaryWages = (company.wageArrears ?? 0) - (company.overtimeArrears ?? 0)
  const payableWages = includeOvertime ? company.wageArrears ?? 0 : ordinaryWages
  const payment = Math.min(company.cash, payableWages, company.payables)
  company.cash -= payment
  company.payables -= payment
  company.wageArrears = (company.wageArrears ?? 0) - payment
  company.overtimeArrears = (company.overtimeArrears ?? 0) - Math.max(0, payment - ordinaryWages)
  return payment
}

function blankLedger(state: GameState, company: Company, isPlayer: boolean): Ledger {
  const pending = state.pending
  return {
    internalSupplierCost: 0,
    report: {
      month: state.month, revenue: 0, costs: 0, profit: 0, cash: company.cash,
      openingCash: company.cashAtLastClose ?? company.cash, receivables: 0, received: 0, paid: 0,
      payroll: 0, benefits: 0, suppliers: 0, fixed: company.overhead,
      recruitment: isPlayer ? pending.recruitment : 0, training: isPlayer ? pending.training : 0,
      management: isPlayer ? pending.management : 0, research: isPlayer ? pending.research : 0,
      disputes: isPlayer ? pending.disputes : 0, financing: isPlayer ? pending.financing : 0,
      repayments: isPlayer ? pending.repayments : 0, penalty: 0, headcount: 0, departures: 0, conversions: 0,
      satisfaction: 0, averageIncome: 0, averageHours: 0, skill: 0,
    },
  }
}

function applyInvestments(state: GameState, report: MonthReport) {
  const workers = new Map(state.workers.map(worker => [worker.id, worker]))
  for (const program of state.training) {
    if (program.month !== state.month) continue
    for (const id of program.workerIds) {
      const worker = workers.get(id)
      if (!worker || worker.employerId !== state.player.id) continue
      const gain = Math.max(1, yuan(program.skillGain * (0.5 + worker.learning / 100)
        * (state.technologies.includes('assessment') ? 1.25 : 1)))
      worker.skill = clamp(worker.skill + gain)
      worker.belonging = clamp(worker.belonging + 4)
      history(worker, state.month, '完成技能培训', `技能等级提高 ${gain} 点`)
    }
  }
  report.research += TECHNOLOGIES.reduce((sum, technology) => sum
    + (state.technologies.includes(technology.id) ? technology.upkeep : 0), 0)
  for (const project of state.research) {
    project.remaining--
    if (project.remaining > 0) continue
    const technology = TECHNOLOGIES.find(item => item.id === project.techId)
    if (!technology) continue
    state.technologies.push(technology.id)
    state.player.tech += 2
    addNews(state, 'technology', `${technology.name}上线`, technology.detail)
  }
  state.research = state.research.filter(project => project.remaining > 0)
}

function activeContracts(state: GameState): Contract[] {
  return state.contracts.filter(contract => contract.status === 'active')
}

function addWorker(groups: Map<string, Worker[]>, key: string, worker: Worker) {
  const group = groups.get(key)
  if (group) group.push(worker)
  else groups.set(key, [worker])
}

function fillVacancies(state: GameState, companies: Map<string, Company>, ledgers: Map<string, Ledger>) {
  const active = activeContracts(state)
  const children = new Map<string, number>()
  for (const contract of active) {
    if (contract.parentContractId) children.set(contract.parentContractId, (children.get(contract.parentContractId) ?? 0) + contract.headcount)
  }
  const openMarket = new Map<string, Worker[]>()
  const byContract = new Map<string, Worker[]>()
  const idleByRole = new Map<string, Worker[]>()
  const wagesByCompany = new Map<string, number>()
  const order = new Map<string, number>()
  state.workers.forEach((worker, index) => {
    order.set(worker.id, index)
    if (worker.status === 'market') addWorker(openMarket, worker.occupationId, worker)
    if (worker.employerId) {
      wagesByCompany.set(worker.employerId, (wagesByCompany.get(worker.employerId) ?? 0) + worker.wage)
      if (worker.contractId) addWorker(byContract, worker.contractId, worker)
      else addWorker(idleByRole, `${worker.employerId}:${worker.occupationId}`, worker)
    }
  })
  for (const contract of active) {
    const company = companies.get(contract.companyId)
    const ledger = ledgers.get(contract.companyId)
    const isPlayer = contract.companyId === state.player.id
    if (!company || !ledger || isPlayer && !state.policies.autoHire) continue
    const ramp = mobilizationShare(contract.plan, state.month - (contract.signedAt ?? state.month) + 1)
    const purchasedSeats = children.get(contract.id) ?? 0
    const target = Math.ceil(Math.max(0, staffedSeats(contract.plan) - purchasedSeats) * ramp)
    let assigned = byContract.get(contract.id) ?? []
    const role = `${company.id}:${contract.occupationId}`
    if (purchasedSeats) {
      const direct = [...assigned].sort((a, b) => b.skill - a.skill)
      for (const worker of direct.slice(target)) {
        worker.contractId = null
        worker.benchSince = state.month
        addWorker(idleByRole, role, worker)
        history(worker, state.month, '项目改用外部交付', `${contract.title} · 返回待岗`)
      }
      assigned = direct.slice(0, target)
    }
    let vacancy = target - assigned.length
    if (vacancy <= 0) continue
    const available = (idleByRole.get(role) ?? []).filter(worker => !worker.contractId)
      .sort((a, b) => b.skill - a.skill || order.get(a.id)! - order.get(b.id)!)
    for (const worker of available.slice(0, vacancy)) {
      worker.contractId = contract.id
      worker.benchSince = undefined
      history(worker, state.month, '项目调配', contract.title)
      vacancy--
    }
    if (vacancy <= 0) continue
    const committed = wagesByCompany.get(company.id) ?? 0
    if (company.cash - company.payables < committed * 0.46 + ledger.report.recruitment) continue
    const matching = (openMarket.get(contract.occupationId) ?? []).filter(worker => worker.status === 'market')
    const agePreference = state.clients.find(client => client.id === contract.clientId)?.agePreference
    const usesScreening = isPlayer && state.technologies.includes('screening')
    const usesMatching = isPlayer && state.technologies.includes('matching')
    const match = (worker: Worker) => worker.skill * (usesMatching ? 1.3 : 0.85)
      + (worker.city === company.city ? 11 : 0) - worker.expectation / Math.max(1, contract.plan.wage) * 30
      - (usesScreening && agePreference && worker.age > agePreference ? 9 : 0)
    matching.sort((left, right) => match(right) - match(left) || left.id.localeCompare(right.id))
    const channel = company.strategy === 'premium' ? 'referral' : 'platform'
    const cost = CHANNEL_COST[channel] * (isPlayer && state.technologies.includes('recruitment') ? 0.76 : 1)
    const attemptBudget = Math.ceil(vacancy * (isPlayer && usesScreening ? 2.55 : 2.12)) + 5
    for (const worker of matching.slice(0, attemptBudget)) {
      if (vacancy <= 0) break
      ledger.report.recruitment += yuan(cost)
      if (hireWorker(state, worker, company, contract.plan.wage, channel, contract)) {
        vacancy--
        wagesByCompany.set(company.id, (wagesByCompany.get(company.id) ?? 0) + worker.wage)
      }
    }
  }
}

function adjustCompetitorStaffing(state: GameState, ledgers: Map<string, Ledger>) {
  const idleByCompany = new Map<string, Worker[]>()
  for (const worker of state.workers) {
    if (worker.employerId && !worker.contractId) addWorker(idleByCompany, worker.employerId, worker)
  }
  for (const company of state.competitors) {
    const ledger = ledgers.get(company.id)
    if (!ledger || company.status !== 'operating') continue
    const idle = idleByCompany.get(company.id) ?? []
    const cashUnderPressure = company.cash - company.payables < 320000 + idle.length * 5500
    const wait = cashUnderPressure ? 1 : company.strategy === 'steady' ? 4 : 2
    for (const worker of idle) {
      if (state.month - (worker.benchSince ?? state.month) < wait) continue
      const compensation = severance(worker, state.month)
      ledger.report.disputes += compensation
      dismissWorker(state, worker, company, compensation)
    }
  }
}

function processContracts(state: GameState, companies: Map<string, Company>, ledgers: Map<string, Ledger>) {
  const deliveries = new Map<string, ProjectDelivery>()
  const purchased = new Map<string, Array<{ seats: number; quality: number }>>()
  const capacity = new Map(state.suppliers.map(supplier => [supplier.id, supplier.capacity]))
  const byContract = new Map<string, Worker[]>()
  for (const worker of state.workers) {
    if (worker.contractId) addWorker(byContract, worker.contractId, worker)
  }
  const active = activeContracts(state).sort((left, right) => Number(Boolean(right.parentContractId)) - Number(Boolean(left.parentContractId))
    || (left.signedAt ?? 0) - (right.signedAt ?? 0))
  for (const contract of active) {
    const ledger = ledgers.get(contract.companyId)
    const company = companies.get(contract.companyId)
    if (!ledger || !company) continue
    const player = company.id === state.player.id
    const client = state.clients.find(item => item.id === contract.clientId)
    const ramp = mobilizationShare(contract.plan, state.month - (contract.signedAt ?? state.month) + 1)
    const workers = (byContract.get(contract.id) ?? []).filter(worker => worker.employerId === company.id)
      .slice(0, Math.ceil(staffedSeats(contract.plan) * ramp))
    const chain = supplierChain(state, contract.plan)
    const first = chain[0]
    const supplierEngaged = first ? Math.min(Math.ceil(supplierSeats(contract.plan) * ramp),
      ...chain.map(supplier => capacity.get(supplier.id) ?? 0)) : 0
    for (const supplier of chain) capacity.set(supplier.id, (capacity.get(supplier.id) ?? 0) - supplierEngaged)
    const supplierManagement = player && state.technologies.includes('suppliers') ? 3 : 0
    const supplied = first ? Math.round(supplierEngaged * clamp((first.quality + supplierManagement) / 90, 0.55, 1)) : 0
    const chainQuality = chain.length ? chain.reduce((sum, supplier) => sum + supplier.quality, 0) / chain.length
      - (chain.length - 1) * Math.max(1, 4 - supplierManagement) : 0
    const children = purchased.get(contract.id) ?? []
    const childSeats = children.reduce((sum, item) => sum + item.seats, 0)
    const covered = Math.min(contract.headcount, workers.length + supplied + childSeats)
    const skill = (workers.reduce((sum, worker) => sum + worker.skill * (0.79 + worker.efficiency / 320), 0)
      + supplied * chainQuality * 0.86 + children.reduce((sum, item) => sum + item.seats * item.quality * 0.88, 0))
      / Math.max(1, workers.length + supplied + childSeats)
    const satisfaction = workers.length ? workers.reduce((sum, worker) => sum + worker.satisfaction, 0) / workers.length : 62
    const fatigue = workers.length ? workers.reduce((sum, worker) => sum + worker.fatigue, 0) / workers.length : 17
    const efficiency = 1 + Math.min(0.13, company.tech * 0.0033)
      + (player && state.technologies.includes('scheduling') ? 0.041 : 0)
      + (player && state.technologies.includes('analytics') ? 0.016 : 0)
      - (contract.plan.manager === 'client' && contract.business === 'delivery' ? 0.065 : 0)
    const output = evaluateDelivery({ seats: contract.headcount, covered, skill, targetSkill: contract.plan.skill,
      satisfaction, fatigue, management: Math.min(100, contract.plan.management / 10), efficiency })
    const attendance = covered / Math.max(1, contract.headcount)
    const fullPrice = contract.plan.price * contract.headcount
    const base = contract.business === 'delivery'
      ? fullPrice * (attendance * 0.31 + Math.min(1.08, output.output) * 0.69) : contract.plan.price * covered
    const bonus = contract.business === 'delivery' ? fullPrice * deliveryBonus(output.quality, contract.qualityTarget, attendance) : 0
    const penalty = yuan(Math.min(base * 0.43, fullPrice * (
      Math.max(0, contract.attendanceTarget - attendance) * 0.25 + Math.max(0, contract.qualityTarget - output.quality) * 0.0036)))
    contract.revenue = Math.max(0, yuan(base + bonus - penalty))
    contract.cumulativeRevenue += contract.revenue
    contract.penalties += penalty
    contract.attendance = attendance
    contract.quality = output.quality
    contract.progress = clamp(contract.progress + (contract.business === 'delivery' ? output.output : attendance) / contract.term, 0, 1)
    const risk = riskTarget(state, contract.business, contract.plan, client, attendance)
      + (company.wageArrears ?? 0) / Math.max(1, company.payables) * 22
      + (contract.plan.manager === 'client' && output.extraHours >= 20 && player && !state.policies.overtimeCompensation ? 16 : 0)
      - (player && state.technologies.includes('audit') ? 8 : 0)
    contract.risk = yuan(clamp(contract.risk * 0.66 + risk * 0.34))
    contract.lastSupplierCost = supplierEngaged * subcontractRate(state, contract.plan, contract.occupationId)
    ledger.report.revenue += contract.revenue
    ledger.report.penalty += penalty
    ledger.report.suppliers += contract.lastSupplierCost
    const managementDiscount = player && state.technologies.includes('payroll') ? 0.81 : 1
    ledger.report.management += yuan(workers.length * contract.plan.management * managementDiscount)
    ledger.report.training += yuan(workers.length * contract.plan.training)
    if (contract.revenue > 0) state.invoices.push({
      id: nextId(state, 'invoice'), companyId: company.id, clientId: contract.clientId, contractId: contract.id,
      upstreamId: contract.upstreamId, amount: contract.revenue, received: 0, issued: state.month,
      due: state.month + contract.paymentMonths, paidAt: null,
    })
    if (contract.parentContractId) {
      const parentShares = purchased.get(contract.parentContractId) ?? []
      parentShares.push({ seats: covered, quality: output.quality })
      purchased.set(contract.parentContractId, parentShares)
      const upstream = contract.upstreamId ? ledgers.get(contract.upstreamId) : undefined
      if (upstream) {
        upstream.report.suppliers += contract.revenue
        upstream.internalSupplierCost += contract.revenue
      }
    }
    deliveries.set(contract.id, { workerIds: new Set(workers.map(worker => worker.id)), extraHours: output.extraHours })
    const confidence = output.quality >= contract.qualityTarget && attendance >= contract.attendanceTarget ? 1 : -1
    company.reputation = clamp(company.reputation + confidence * (player ? 0.95 : 0.43))
    company.compliance = clamp(company.compliance + (contract.risk >= 48 ? -0.52 : 0.24))
    if (client) client.trust[company.id] = yuan(clamp((client.trust[company.id] ?? 48) + confidence * 1.6))
    if (player && confidence < 0 && contract.remaining === contract.term) {
      addNews(state, 'business', '首期交付验收出现扣款',
        `${contract.title}到岗率 ${yuan(attendance * 100)}%，交付质量 ${output.quality}，本期履约扣款 ${penalty.toLocaleString('zh-CN')} 元。`, 'warning')
    }
  }
  return deliveries
}

function collectInvoices(state: GameState, companies: Map<string, Company>, ledgers: Map<string, Ledger>) {
  const clients = new Map(state.clients.map(client => [client.id, client]))
  const due = state.invoices.filter(invoice => invoice.paidAt === null && invoice.due <= state.month)
    .sort((a, b) => Number(Boolean(a.upstreamId)) - Number(Boolean(b.upstreamId)) || a.due - b.due)
  for (const invoice of due) {
    const vendor = companies.get(invoice.companyId)
    if (!vendor) continue
    const client = clients.get(invoice.clientId)
    const upstream = invoice.upstreamId ? companies.get(invoice.upstreamId) : undefined
    const payer = invoice.upstreamId ? upstream : client
    if (!payer) continue
    const remaining = invoice.amount - invoice.received
    const age = state.month - invoice.due
    const credit = upstream ? clamp(60 + (upstream.cash - upstream.payables) / Math.max(1, remaining) * 9) : client?.credit ?? 0
    const cash = upstream ? Math.max(0, payer.cash - (upstream.wageArrears ?? 0)) : payer.cash
    if (cash <= 0 || age < 3 && random(state) > clamp(credit / 100 + age * 0.15, 0.2, 1)) {
      if (vendor.id === state.player.id && age === 1) {
        addNews(state, 'finance', '项目应收逾期', `${payer.name}未按原账期付款，${remaining.toLocaleString('zh-CN')} 元继续挂账。`, 'warning')
      }
      continue
    }
    const payment = Math.min(remaining, yuan(Math.floor(cash)))
    payer.cash -= payment
    vendor.cash += payment
    invoice.received += payment
    if (invoice.received === invoice.amount) invoice.paidAt = state.month
    const receiver = ledgers.get(vendor.id)
    if (receiver) receiver.report.received += payment
  }
}

function recognizeCosts(state: GameState, company: Company, ledger: Ledger, deliveries: Map<string, ProjectDelivery>,
  roster: Worker[], contracts: Map<string, Contract>) {
  const player = company.id === state.player.id
  const report = ledger.report
  const unpaidHours = new Map<string, number>()
  const priorOvertime = company.overtimeArrears ?? 0
  const priorWages = (company.wageArrears ?? 0) - priorOvertime
  let overtimeTotal = 0
  for (const worker of roster) {
    const contract = worker.contractId ? contracts.get(worker.contractId) : undefined
    const project = contract ? deliveries.get(contract.id) : undefined
    const extra = project?.workerIds.has(worker.id) ? project.extraHours : 0
    const benefit = contract?.plan.benefit ?? (player ? state.policies.defaultBenefit : 270)
    const overtime = yuan(worker.wage * extra / RULES.standardHours * 1.5)
    overtimeTotal += overtime
    if (player && !state.policies.overtimeCompensation && extra > 5) unpaidHours.set(worker.id, extra)
    report.payroll += worker.wage + overtime
    report.benefits += yuan(worker.wage * RULES.statutoryRate) + benefit
    worker.lastIncome = worker.wage + overtime
    worker.lastHours = contract ? RULES.standardHours + extra : RULES.standardHours
  }
  const interest = yuan(company.debt * RULES.monthlyInterest)
  report.fixed += interest
  // 工资和服务成本在发生期确认，逾期应付延续到以后月份。
  report.costs = report.payroll + report.benefits + report.recruitment + report.training + report.suppliers
    + report.management + report.research + report.fixed + report.disputes
  report.profit = report.revenue - report.costs
  company.cumulativeProfit += report.profit
  company.payables += report.costs - ledger.internalSupplierCost
  company.wageArrears = (company.wageArrears ?? 0) + report.payroll
  company.overtimeArrears = priorOvertime + overtimeTotal
  const wagePayment = !player || state.policies.autoPayroll ? settlePayroll(company, !player || state.policies.overtimeCompensation) : 0
  const ordinary = Math.min(company.payables - company.wageArrears, Math.max(0, company.cash - company.wageArrears))
  company.cash -= ordinary
  company.payables -= ordinary
  const paidOnTime = company.wageArrears === 0
  if (!paidOnTime) {
    company.reputation = clamp(company.reputation - 2.5)
    company.compliance = clamp(company.compliance - 8)
  }
  // 工资优先冲销以前月份的同类欠款，本月实际收入只按本期支付比例更新。
  const regularTotal = report.payroll - overtimeTotal
  const regularRatio = clamp((wagePayment - priorWages) / Math.max(1, regularTotal), 0, 1)
  const overtimeRatio = clamp((wagePayment - priorWages - regularTotal - priorOvertime) / Math.max(1, overtimeTotal), 0, 1)
  for (const worker of roster) {
    worker.lastIncome = yuan(worker.wage * regularRatio + ((worker.lastIncome ?? 0) - worker.wage) * overtimeRatio)
  }
  return { roster, contracts, unpaidHours, paidOnTime }
}

function openCase(state: GameState, worker: Worker, contract: Contract | undefined, category: string, compensation: number) {
  if (state.laborCases.some(item => item.workerId === worker.id && item.category === category && item.status === 'open')) return
  const detail = `${worker.name}对${contract?.title ?? '公司薪酬与岗位安排'}提出${category}申诉，金额已按本期记录估算。`
  state.laborCases.unshift({ id: nextId(state, 'case'), workerId: worker.id, contractId: contract?.id ?? null,
    month: state.month, category, detail, compensation, severity: compensation > 10000 ? 'critical' : 'warning', status: 'open' })
  history(worker, state.month, '提出劳动诉求', detail)
  addNews(state, 'labor', `${category}进入内部处理流程`, detail, 'warning')
}

function respondWorkers(state: GameState, company: Company, report: MonthReport, workforce: ReturnType<typeof recognizeCosts>) {
  const { roster, contracts, unpaidHours, paidOnTime } = workforce
  const player = company.id === state.player.id
  for (const worker of roster) {
    const contract = worker.contractId ? contracts.get(worker.contractId) : undefined
    const client = contract ? state.clients.find(item => item.id === contract.clientId) : undefined
    const segment = state.market.segments.find(item => item.occupationId === worker.occupationId)
    const marketRatio = worker.wage / Math.max(1, segment?.wage ?? worker.expectation)
    const parity = client ? (worker.wage + (contract?.plan.benefit ?? 0)) / (client.formalWage + client.formalBenefits) : 1
    const growth = clamp(40 + (contract?.plan.training ?? 0) * 0.085 + (contract?.business === 'delivery' ? 14 : 0))
    const month = evaluateWorkerMonth({
      satisfaction: worker.satisfaction, fatigue: worker.fatigue, wageRatio: marketRatio, parityRatio: parity,
      benefits: clamp((contract?.plan.benefit ?? (player ? state.policies.defaultBenefit : 270)) / 12),
      growth, security: clamp(76 - (contract ? Math.max(0, 4 - contract.remaining) * 5 : 8) - company.payables / Math.max(1, company.cash + 1) * 7),
      extraHours: (worker.lastHours ?? RULES.standardHours) - RULES.standardHours, paidOnTime,
      prospects: clamp(((segment?.demand ?? 1) / Math.max(1, segment?.supply ?? 1)) * 41 + worker.skill * 0.33),
      pressure: worker.pressure, riskTolerance: worker.risk, ambition: worker.growth, fairness: worker.fairness, stabilityNeed: worker.stability,
    })
    worker.satisfaction = month.satisfaction
    worker.fatigue = month.fatigue
    worker.belonging = yuan(clamp(worker.belonging * 0.9 + worker.satisfaction * 0.1))
    worker.health = yuan(clamp(worker.health + (worker.fatigue < 28 ? 1 : -(worker.fatigue - 27) / 18)))
    if (contract && random(state) < (0.06 + worker.learning / 1050 + (contract.plan.training ?? 0) / 6000)) {
      worker.skill = clamp(worker.skill + 1)
      if (worker.skill % 5 === 0) history(worker, state.month, '在岗技能成长', `专业技能达到 ${worker.skill}`)
    }
    if (player && !paidOnTime && random(state) < 0.12) openCase(state, worker, contract, '工资逾期', 0)
    const hours = unpaidHours.get(worker.id) ?? 0
    if (player && hours > 12 && random(state) < worker.fairness / 900) {
      openCase(state, worker, contract, '加班补偿', yuan(worker.wage * hours / RULES.standardHours * 1.5))
    }
    if (player && contract && contract.risk >= 55 && worker.fairness >= 63 && random(state) < 0.026) {
      openCase(state, worker, contract, '用工管理关系', yuan(worker.wage * (contract.risk / 70)))
    }
    const tenure = state.month - (worker.hiredAt ?? state.month)
    const conversion = client && contract && tenure >= 3 && client.conversionSlots > 0 && client.condition >= 63 && worker.skill >= contract.plan.skill + 4
      && random(state) < (worker.growth * 0.00038 + worker.stability * 0.00018) * Math.max(0, 1 - marketRatio * 0.51)
    if (conversion && client && contract) {
      client.formalStaff++
      client.conversionSlots--
      client.trust[company.id] = clamp((client.trust[company.id] ?? 48) + 1.3)
      company.totalConversions++
      report.conversions++
      worker.status = 'client'
      worker.employerId = client.id
      worker.contractId = null
      worker.wage = client.formalWage
      history(worker, state.month, '接受客户正式录用', `${client.name} · 税前月薪 ${client.formalWage} 元`)
    } else if (tenure >= 1 && random(state) < month.quitChance) {
      company.totalDepartures++
      report.departures++
      worker.status = worker.fatigue > 71 && worker.health < 57 ? 'inactive' : 'market'
      worker.employerId = null
      worker.contractId = null
      worker.wage = 0
      worker.hiredAt = null
      worker.benchSince = undefined
      const reason = paidOnTime ? '综合比较薪资、发展机会与外部岗位后离开' : '因工资逾期及工作不确定性离开'
      history(worker, state.month, '主动离职', `${company.name} · ${reason}`)
    }
  }
  if (player && report.departures >= Math.max(3, roster.length * 0.13)) {
    addNews(state, 'labor', '本月人岗波动扩大', `公司本月主动离职 ${report.departures} 人，离职记录涉及薪资、发展机会与项目安排。`, 'warning')
  }
  const retained = roster.filter(worker => worker.employerId === company.id)
  report.headcount = retained.length
  report.satisfaction = retained.length ? yuan(retained.reduce((sum, worker) => sum + worker.satisfaction, 0) / retained.length) : 0
  report.skill = retained.length ? yuan(retained.reduce((sum, worker) => sum + worker.skill, 0) / retained.length) : 0
  report.averageIncome = roster.length ? yuan(roster.reduce((sum, worker) => sum + (worker.lastIncome ?? 0), 0) / roster.length) : 0
  report.averageHours = roster.length ? yuan(roster.reduce((sum, worker) => sum + (worker.lastHours ?? 0), 0) / roster.length) : 0
}

function completeWork(state: GameState) {
  for (const contract of activeContracts(state)) {
    if (state.policies.autoRenew && contract.companyId === state.player.id && possibleRenewal(state, contract) && contract.remaining === 1) {
      renewContract(state, contract)
    }
    contract.remaining--
    if (contract.remaining > 0) continue
    contract.status = 'completed'
    releaseWorkers(state, contract, '合同交付结束')
  }
  const occupied = new Set(activeContracts(state).map(contract => contract.id))
  for (const contract of activeContracts(state)) {
    if (!contract.parentContractId || occupied.has(contract.parentContractId)) continue
    contract.status = 'cancelled'
    releaseWorkers(state, contract, '上游合同终止')
  }
}

function finishBalance(state: GameState, company: Company, report: MonthReport) {
  const player = company.id === state.player.id
  const receivables = state.invoices.reduce((sum, invoice) => sum + (
    invoice.companyId === company.id && invoice.paidAt === null ? invoice.amount - invoice.received : 0), 0)
  report.receivables = receivables
  report.cash = company.cash
  report.paid = Math.max(0, report.openingCash + report.received + report.financing - report.repayments - report.cash)
  company.cashAtLastClose = report.cash
  company.reports.push(report)
  company.overdueMonths = company.payables > Math.max(20000, company.cash * 0.6)
    ? (company.overdueMonths ?? 0) + 1 : 0
  if (player && company.wageArrears && state.policies.autoPayroll) {
    const deferred = !state.policies.overtimeCompensation && company.wageArrears === company.overtimeArrears
    addNews(state, 'finance', '工资支出形成短期应付', deferred
      ? `${company.wageArrears.toLocaleString('zh-CN')} 元加班工资仍待手动发放。`
      : `自动发薪已使用可用现金，仍有 ${company.wageArrears.toLocaleString('zh-CN')} 元工资待付。`, deferred ? 'warning' : 'critical')
  }
  if ((company.overdueMonths ?? 0) >= 3 && company.cash + receivables * 0.27 < company.payables * 0.75) {
    company.status = 'bankrupt'
    for (const contract of activeContracts(state)) {
      if (contract.companyId !== company.id) continue
      contract.status = 'cancelled'
      releaseWorkers(state, contract, '企业停止经营')
    }
    for (const worker of state.workers) {
      if (worker.employerId !== company.id) continue
      worker.status = 'market'
      worker.employerId = null
      worker.contractId = null
      worker.hiredAt = null
      worker.wage = 0
      worker.benchSince = undefined
      history(worker, state.month, '企业停止经营', `${company.name} · 重新进入劳动力市场`)
    }
    addNews(state, 'finance', `${company.brand}停止经营`, '连续三个月无法覆盖到期经营义务，企业进入破产状态，存量应收仍保留在账上。', 'critical')
  }
}

export function advanceMonth(previous: GameState): GameResult {
  if (previous.player.status === 'bankrupt') return { state: previous, ok: false, message: '企业已停止经营，可查阅历史记录或开启新档。' }
  const state = structuredClone(previous)
  const companies = new Map([state.player, ...state.competitors].map(company => [company.id, company]))
  const ledgers = new Map([...companies.values()].filter(company => company.status === 'operating')
    .map(company => [company.id, blankLedger(state, company, company.id === state.player.id)]))
  const playerLedger = ledgers.get(state.player.id)!
  // 先结算本期经营，再进入下期市场，账期为一月的发票不会在开票月收现。
  closeTenders(state)
  applyInvestments(state, playerLedger.report)
  fillVacancies(state, companies, ledgers)
  adjustCompetitorStaffing(state, ledgers)
  const delivery = processContracts(state, companies, ledgers)
  collectInvoices(state, companies, ledgers)
  const rosterByCompany = new Map<string, Worker[]>()
  for (const worker of state.workers) {
    if (worker.employerId && worker.status === 'employed') addWorker(rosterByCompany, worker.employerId, worker)
  }
  const contracts = new Map(activeContracts(state).map(contract => [contract.id, contract]))
  for (const [id, ledger] of ledgers) {
    const company = companies.get(id)!
    const workforce = recognizeCosts(state, company, ledger, delivery, rosterByCompany.get(id) ?? [], contracts)
    respondWorkers(state, company, ledger.report, workforce)
    finishBalance(state, company, ledger.report)
    if (id !== state.player.id && company.strategy === 'technology' && ledger.report.profit > company.overhead
      && company.tech < 30 && random(state) < 0.18 && company.cash > 110000) {
      company.tech++
      // 研发费用留在应付，下月与工资、其他经营义务一起实际支付。
      company.payables += 24000
      company.cumulativeProfit -= 24000
      ledger.report.research += 24000
      ledger.report.costs += 24000
      ledger.report.profit -= 24000
    }
  }
  completeWork(state)
  for (const contract of state.contracts) {
    if (contract.status !== 'unsigned') continue
    const tender = state.tenders.find(item => item.id === contract.tenderId)
    if (tender && state.month > tender.deadline + 1) contract.status = 'cancelled'
  }
  state.pending = { recruitment: 0, training: 0, research: 0, disputes: 0, management: 0, financing: 0, repayments: 0 }
  state.month++
  updateMarket(state)
  const report = playerLedger.report
  const message = `月度结算完成，确认收入 ${report.revenue.toLocaleString('zh-CN')} 元，实际回款 ${report.received.toLocaleString('zh-CN')} 元。`
  return { state, ok: true, message }
}
