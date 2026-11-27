import { RULES, TECHNOLOGIES } from './data'
import { advanceMonth, possibleRenewal, renewContract, settlePayroll } from './month'
import {
  addNews, availableCash, bidPreparation, bidPreparationCost, CHANNEL_COST, dismissWorker, estimateBid, hireWorker, history, marketWage,
  releaseWorkers, severance, staffedSeats, validBid, validSupplier,
} from './operations'
import { nextId } from './random'
import { clamp, yuan } from './rules'
import type { Contract, GameAction, GameResult, GameState, Worker } from './types'

export { advanceMonth } from './month'
export { defaultBidPlan, estimateBid } from './operations'

class ActionError extends Error {}

function requireAction(valid: unknown, message: string): asserts valid {
  if (!valid) throw new ActionError(message)
}

function ownContract(state: GameState, id: string): Contract {
  const contract = state.contracts.find(item => item.id === id && item.companyId === state.player.id)
  requireAction(contract, '找不到本公司的合同。')
  return contract
}

function workersByIds(state: GameState, ids: string[]): Worker[] {
  const keys = new Set(ids)
  requireAction(keys.size > 0 && keys.size === ids.length && keys.size <= RULES.maxWorkersPerAction, '请选择有效人员，每次最多处理 100 人。')
  const workers = state.workers.filter(worker => keys.has(worker.id))
  requireAction(workers.length === keys.size, '人员列表已发生变化，请重新选择。')
  return workers
}

function validateWage(state: GameState, wage: number, workers: Worker[]) {
  requireAction(Number.isFinite(wage) && wage <= 200000 && workers.every(worker => wage >= Math.max(
    RULES.minimumWage, marketWage(state, worker.occupationId) * 0.54,
  )), '薪资低于岗位可用区间或超出系统范围，请核对金额。')
}

function requireFunding(state: GameState, cost: number) {
  requireAction(availableCash(state) >= cost, '可用资金不足，请先回收应收款、偿清到期义务或安排融资。')
}

function submitBid(state: GameState, action: Extract<GameAction, { type: 'bid' }>): string {
  const tender = state.tenders.find(item => item.id === action.tenderId && item.status === 'open')
  requireAction(tender && tender.deadline >= state.month, '该采购已经停止接收投标。')
  requireAction(!state.bids.some(item => item.companyId === state.player.id && item.tenderId === tender.id), '该采购已提交过本公司的投标报价。')
  requireAction(validBid(state, tender, action.plan), '方案超出采购预算、人员范围或支持的分包条件，请核对表单。')
  const preparation = bidPreparationCost(tender)
  const { remaining } = bidPreparation(state)
  requireAction(preparation <= remaining, `本月剩余 ${remaining} 点投标准备，本项目需要 ${preparation} 点。月结后恢复额度。`)
  const estimate = estimateBid(state, tender, action.plan)
  state.bids.unshift({ id: nextId(state, 'bid'), tenderId: tender.id, companyId: state.player.id, month: state.month,
    plan: { ...action.plan }, estimate, preparation, status: 'submitted' })
  return `投标方案已提交，本月还剩 ${remaining - preparation} 点准备额度。采购将在截止月评审。`
}

function recruit(state: GameState, action: Extract<GameAction, { type: 'hire' }>): string {
  const workers = workersByIds(state, action.workerIds)
  requireAction(workers.every(worker => worker.status === 'market'), '部分人员已接受其他录用，候选人列表需要刷新。')
  requireAction(Object.hasOwn(CHANNEL_COST, action.channel), '请选择可用的招聘渠道。')
  validateWage(state, action.wage, workers)
  const wage = yuan(action.wage)
  const target = action.contractId ? ownContract(state, action.contractId) : undefined
  if (target) {
    requireAction(target.status === 'active', '合同签署后可以招募项目成员。')
    requireAction(workers.every(worker => worker.occupationId === target.occupationId), '请选择与项目岗位一致的候选人。')
    requireAction(state.workers.filter(worker => worker.contractId === target.id).length < staffedSeats(target.plan), '项目自营席位已占满，请调整人员或分包比例。')
  }
  const cost = yuan(CHANNEL_COST[action.channel] * (state.technologies.includes('recruitment') ? 0.76 : 1))
  const attemptedOffer = `${state.player.name} · 税前月薪 ${wage} 元`
  const candidates = workers.filter(worker => !worker.history.some(entry => entry.month === state.month
    && entry.label === '拒绝录用' && entry.detail === attemptedOffer))
  requireAction(candidates.length, '候选人本月已拒绝相同报价，可调整待遇或邀请其他候选人。')
  requireFunding(state, candidates.length * cost)
  const available = target ? staffedSeats(target.plan) - state.workers.filter(worker => worker.contractId === target.id).length : candidates.length
  let accepted = 0
  let attempted = 0
  for (const worker of candidates) {
    if (accepted >= available) break
    attempted++
    if (hireWorker(state, worker, state.player, wage, action.channel, target)) accepted++
  }
  state.pending.recruitment += attempted * cost
  return `已发出 ${attempted} 份录用邀请，${accepted} 人接受，招聘费用 ${(attempted * cost).toLocaleString('zh-CN')} 元。`
}

function assign(state: GameState, action: Extract<GameAction, { type: 'assign' }>): string {
  const workers = workersByIds(state, action.workerIds)
  requireAction(workers.every(worker => worker.employerId === state.player.id && worker.status === 'employed'), '只可调配本公司在职员工。')
  const target = action.contractId ? ownContract(state, action.contractId) : undefined
  if (target) {
    requireAction(target.status === 'active', '只有履约中的合同可以配置人员。')
    requireAction(workers.every(worker => worker.occupationId === target.occupationId), '选中人员的职业方向需与合同需求一致。')
    const roster = state.workers.filter(worker => worker.contractId === target.id).length
    const arrivals = workers.filter(worker => worker.contractId !== target.id).length
    requireAction(roster + arrivals <= staffedSeats(target.plan), '选中人员数量超过自营席位余额。')
  }
  let changed = 0
  for (const worker of workers) {
    if (worker.contractId === action.contractId) continue
    worker.contractId = action.contractId
    worker.benchSince = target ? undefined : state.month
    changed++
    history(worker, state.month, target ? '项目调配' : '转入人才储备', target?.title ?? '目前待岗，可安排其他项目')
  }
  requireAction(changed > 0, '选中人员已处于目标安排下。')
  return target ? `已配置 ${changed} 名员工至${target.title}。` : `已将 ${changed} 名员工转入人才储备。`
}

function mutate(state: GameState, action: Exclude<GameAction, { type: 'advance' }>): string {
  switch (action.type) {
    case 'bid':
      return submitBid(state, action)
    case 'sign': {
      const contract = ownContract(state, action.contractId)
      requireAction(contract.status === 'unsigned', '该合同当前不可签署。')
      const parent = state.contracts.find(item => item.id === contract.parentContractId)
      requireAction(!contract.parentContractId || parent?.status === 'active', '上游项目已结束，协作协议无法签署。')
      contract.status = 'active'
      contract.signedAt = state.month
      if (parent) contract.remaining = Math.min(contract.remaining, parent.remaining)
      return '合同签署完成，可开始招聘及人员调配。'
    }
    case 'renew': {
      const contract = ownContract(state, action.contractId)
      requireAction(possibleRenewal(state, contract), '续签需在临近到期时满足交付表现和客户经营条件。')
      renewContract(state, contract)
      return `合同已续签 ${contract.term} 个月。`
    }
    case 'cancel': {
      const contract = ownContract(state, action.contractId)
      requireAction(contract.status === 'active' || contract.status === 'unsigned', '该合同已经结束。')
      const fee = contract.status === 'active' ? yuan(contract.plan.price * contract.headcount * 0.14) : 0
      contract.status = 'cancelled'
      contract.penalties += fee
      state.pending.disputes += fee
      state.player.reputation = clamp(state.player.reputation - (fee ? 3 : 1))
      const client = state.clients.find(item => item.id === contract.clientId)
      if (client) client.trust[state.player.id] = clamp((client.trust[state.player.id] ?? 48) - (fee ? 6 : 2))
      releaseWorkers(state, contract, '合同提前终止')
      return fee ? `合同已终止，${fee.toLocaleString('zh-CN')} 元违约支出将在本期确认。` : '未签署合同已放弃。'
    }
    case 'hire':
      return recruit(state, action)
    case 'assign':
      return assign(state, action)
    case 'release': {
      const workers = workersByIds(state, action.workerIds)
      requireAction(workers.every(worker => worker.employerId === state.player.id && worker.status === 'employed'
        && worker.contractId === null), '只可结束本公司待岗人员的劳动关系。')
      requireAction((state.player.wageArrears ?? 0) === 0, '请先结清应付工资，再处理待岗人员。')
      const decisions = workers.map(worker => ({ worker, compensation: severance(worker, state.month) }))
      const total = decisions.reduce((sum, item) => sum + item.compensation, 0)
      requireFunding(state, total)
      state.pending.disputes += total
      for (const { worker, compensation } of decisions) dismissWorker(state, worker, state.player, compensation)
      return `已结束 ${workers.length} 名待岗员工的劳动关系，本期确认 ${total.toLocaleString('zh-CN')} 元经济补偿。`
    }
    case 'compensation': {
      const workers = workersByIds(state, action.workerIds)
      requireAction(workers.every(worker => worker.employerId === state.player.id && worker.status === 'employed'), '只可调整本公司员工薪资。')
      validateWage(state, action.wage, workers)
      const wage = yuan(action.wage)
      for (const worker of workers) {
        if (worker.wage === wage) continue
        const previous = worker.wage
        worker.wage = wage
        history(worker, state.month, '薪资调整', `税前月薪由 ${previous.toLocaleString('zh-CN')} 元调整为 ${wage.toLocaleString('zh-CN')} 元`)
      }
      return `已更新 ${workers.length} 人的薪资，工资费用将在本期确认。`
    }
    case 'subcontract': {
      const contract = ownContract(state, action.contractId)
      requireAction(contract.status === 'active' || contract.status === 'unsigned', '只能调整当前合同的外部合作安排。')
      const plan = { ...contract.plan, subcontract: action.ratio, supplierId: action.supplierId, depth: action.depth }
      requireAction(validSupplier(state, plan, RULES.maxChainDepth - Number(Boolean(contract.upstreamId))),
        '比例或路径超出可用范围，请检查供应商关系与合同席位。')
      requireAction(state.workers.filter(worker => worker.contractId === contract.id).length <= staffedSeats(plan), '已经配置的本公司人员超出自营额度，请先调配人员。')
      contract.plan = plan
      return plan.subcontract ? '分包合作已更新，本期按供应商有效承接人数结算。' : '分包安排已移除。'
    }
    case 'management': {
      const contract = ownContract(state, action.contractId)
      requireAction(contract.status === 'active' || contract.status === 'unsigned', '只能调整当前合同的管理安排。')
      requireAction(action.manager === 'client' || action.manager === 'provider', '请选择实际管理方。')
      contract.plan = { ...contract.plan, manager: action.manager }
      return '实际管理方已更新，项目质量与合规风险将在本期重新评估。'
    }
    case 'train': {
      const workers = workersByIds(state, action.workerIds)
      requireAction(workers.every(worker => worker.employerId === state.player.id && worker.status === 'employed'), '只能为本公司在职员工安排培训。')
      const trained = new Set(state.training.filter(item => item.month === state.month).flatMap(item => item.workerIds))
      requireAction(workers.every(worker => !trained.has(worker.id)), '部分人员本月已经安排培训。')
      const cost = workers.length * 880
      requireFunding(state, cost)
      state.training.unshift({ id: nextId(state, 'training'), workerIds: workers.map(worker => worker.id),
        month: state.month, cost, skillGain: 3 })
      state.pending.training += cost
      return `已为 ${workers.length} 人安排技能培训，本月结算后更新履历。`
    }
    case 'research': {
      const technology = TECHNOLOGIES.find(item => item.id === action.techId)
      requireAction(technology, '该研发项目不存在。')
      requireAction(!state.technologies.includes(technology.id) && !state.research.some(project => project.techId === technology.id), '该技术已研发或正在推进。')
      requireFunding(state, technology.cost)
      state.pending.research += technology.cost
      state.research.push({ techId: technology.id, remaining: technology.months })
      return `${technology.name}已立项，预计 ${technology.months} 个月后上线。`
    }
    case 'resolve': {
      const dispute = state.laborCases.find(item => item.id === action.caseId && item.status === 'open')
      requireAction(dispute, '该劳动诉求已经处理或不存在。')
      requireAction(dispute.category !== '工资逾期' || (state.player.wageArrears ?? 0) === 0, '请先结清公司应付工资，再关闭工资逾期诉求。')
      const overtime = dispute.category === '加班补偿'
      requireAction(!overtime || (state.player.overtimeArrears ?? 0) === 0, '请先结清公司应付加班工资，再关闭加班诉求。')
      if (!overtime) requireFunding(state, dispute.compensation)
      dispute.status = 'resolved'
      if (!overtime) state.pending.disputes += dispute.compensation
      state.player.compliance = clamp(state.player.compliance + 1.5)
      const worker = state.workers.find(item => item.id === dispute.workerId)
      if (worker) {
        worker.satisfaction = clamp(worker.satisfaction + 5)
        history(worker, state.month, '劳动诉求处理完成', dispute.category)
      }
      return overtime ? '已核对加班工资支付情况并关闭劳动诉求。' : '劳动诉求已处理，补偿金额列入本期支出。'
    }
    case 'audit': {
      const contract = ownContract(state, action.contractId)
      requireAction(contract.status === 'active', '只可对履约中项目发起内部检查。')
      const fee = state.technologies.includes('audit') ? 1900 : 4200
      requireFunding(state, fee)
      state.pending.management += fee
      const mismatch = contract.business !== 'dispatch' && contract.plan.manager === 'client'
      const finding = mismatch ? '发现客户直接管理人员，需重新配置实际管理权责。' : '已核验人员安排及工时记录。'
      if (!mismatch) contract.risk = clamp(contract.risk - 8)
      addNews(state, 'compliance', '完成项目用工抽查', `${contract.title}。${finding}`, mismatch ? 'warning' : 'info')
      return finding
    }
    case 'campaign': {
      const cost = 18000
      requireFunding(state, cost)
      requireAction(!state.news.some(item => item.month === state.month && item.title === '公司发布雇主品牌宣传'), '本月雇主品牌宣传已发布。')
      state.pending.management += cost
      state.player.brandScore = clamp(state.player.brandScore + 8)
      const report = state.player.reports.at(-1)
      addNews(state, 'business', '公司发布雇主品牌宣传', report?.headcount
        ? `雇主品牌评分升至 ${yuan(state.player.brandScore)}，同期员工满意度为 ${report.satisfaction}。`
        : `雇主品牌评分升至 ${yuan(state.player.brandScore)}。`)
      return '雇主品牌宣传已发布，宣传费用将在本期确认。'
    }
    case 'finance': {
      const amount = yuan(action.amount)
      const credit = Math.min(2_000_000, 600_000 + Math.max(0, state.player.cumulativeProfit) * 0.35
        + state.player.reputation * 7500)
      requireAction(Number.isFinite(amount) && amount >= 1000 && amount + state.player.debt <= credit, '融资金额超出本期授信范围。')
      state.player.cashAtLastClose ??= state.player.cash
      state.player.cash += amount
      state.player.debt += amount
      state.pending.financing += amount
      return `${amount.toLocaleString('zh-CN')} 元周转资金已到账，按月计提融资利息。`
    }
    case 'repay': {
      const amount = yuan(action.amount)
      requireAction(Number.isFinite(amount) && amount > 0 && amount <= state.player.debt && amount <= state.player.cash, '还款金额需在剩余借款和可用现金范围内。')
      state.player.cashAtLastClose ??= state.player.cash
      state.player.cash -= amount
      state.player.debt -= amount
      state.pending.repayments += amount
      return `已偿还 ${amount.toLocaleString('zh-CN')} 元贷款本金。`
    }
    case 'settlePayroll': {
      state.player.cashAtLastClose ??= state.player.cash
      const payment = settlePayroll(state.player)
      requireAction(payment > 0, '当前没有待付工资，或可用于发薪的现金不足。')
      return `已支付 ${payment.toLocaleString('zh-CN')} 元待发工资。`
    }
    case 'policies': {
      const { autoHire, autoRenew, autoPayroll, overtimeCompensation, defaultBenefit } = action.values
      const flags = [autoHire, autoRenew, autoPayroll, overtimeCompensation]
      requireAction(flags.every(value => value === undefined || typeof value === 'boolean'), '自动化与加班政策须为开关值。')
      requireAction(defaultBenefit === undefined || Number.isFinite(defaultBenefit) && defaultBenefit >= 0 && defaultBenefit <= 10000, '默认福利金额超出范围。')
      if (autoHire !== undefined) state.policies.autoHire = autoHire
      if (autoRenew !== undefined) state.policies.autoRenew = autoRenew
      if (autoPayroll !== undefined) state.policies.autoPayroll = autoPayroll
      if (overtimeCompensation !== undefined) state.policies.overtimeCompensation = overtimeCompensation
      if (defaultBenefit !== undefined) state.policies.defaultBenefit = yuan(defaultBenefit)
      return '经营规则已保存。'
    }
  }
}

export function applyAction(previous: GameState, action: GameAction): GameResult {
  if (action.type === 'advance') return advanceMonth(previous)
  if (previous.player.status === 'bankrupt') return { state: previous, ok: false, message: '企业已停止经营，可查阅历史记录或开启新档。' }
  const state = structuredClone(previous)
  try {
    return { state, ok: true, message: mutate(state, action) }
  } catch (error) {
    if (error instanceof ActionError) return { state: previous, ok: false, message: error.message }
    throw error
  }
}
