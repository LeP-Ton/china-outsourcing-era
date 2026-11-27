import { CITIES, INDUSTRIES, OCCUPATIONS, ORIGINS, PROCUREMENT_PROFILES, REGION_WAGE, START_FUNDS } from './data'
import { nextId, pick, random, range, seedNumber } from './random'
import { clamp } from './rules'
import { isShortageRole, SCENARIO_MONTHS } from './scenarios'
import type { Business, Client, Company, GameState, Occupation, ProcurementProfile, Setup, Strategy, Tender, Worker } from './types'

export const DEMO_SETUP: Setup = {
  name: '中衡人力资源服务有限公司', brand: '中衡人力', city: '上海',
  seed: 'GX-2026-06', difficulty: 'standard', origin: 'software',
}

const CLIENT_NAMES = [
  '云栖数科集团', '远图智造汽车', '灵犀智算科技', '朗岳精密电子', '启辰重工装备',
  '合川金融服务', '迅舟供应链', '青禾连锁商业', '临港城市运营', '明桥公共服务',
  '砺光软件产业', '航序新能源', '深林数据智能', '森澜光电制造', '卓野工业系统',
  '云川结算服务', '启途即时物流', '新芽商业管理',
]
const COMPETITOR_NAMES = ['广脉人力', '北宸专业服务', '维才科技', '协域人才', '清晖合规服务', '盛越企业服务', '联序外包', '聚行人力']
const STRATEGIES: Strategy[] = ['scale', 'premium', 'technology', 'channel', 'steady', 'expansion', 'steady', 'scale']
const SUPPLIER_NAMES = ['华东交付服务', '禾川劳务服务', '映川人才协作', '联洲运营支撑', '通序区域服务', '澄越技术服务']
const SURNAMES = Array.from('赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜谢苏唐庞姚江邓程梁董卢胡顾徐罗马林高郭')
const GIVEN_NAMES = [
  '晨曦', '思远', '梓宁', '晓然', '子文', '彦成', '文青', '雨桐', '景舟', '清荷', '嘉树', '睿希',
  '雨辰', '承安', '知言', '夏微', '若溪', '星冉', '柏舟', '婉晴', '泽安', '明珊', '淮序', '锦书',
  '林亦', '一凡', '宜之', '亦航', '铭心', '曼宁', '乐庭', '晓晋', '子琦', '若衡', '品毅', '梦书',
]

function integer(state: {rng: number}, min: number, max: number): number {
  return Math.round(range(state, min, max))
}

function company(id: string, name: string, city: string, cash: number, strategy: Strategy, reputation: number, compliance: number, tech: number, overhead: number): Company {
  return {
    id, name, brand: name, city, cash, debt: 0, payables: 0, wageArrears: 0,
    cashAtLastClose: cash, reputation, compliance, brandScore: 42, tech, overhead, strategy,
    status: 'operating', cumulativeProfit: 0, totalHires: 0, totalDepartures: 0,
    totalConversions: 0, reports: [],
  }
}

function createClient(state: GameState, name: string, index: number): Client {
  const industry = INDUSTRIES[index % INDUSTRIES.length]!
  const occupation = OCCUPATIONS.find(({ id }) => id === pickOccupation(index, industry.occupations))!
  const city = index < 7 ? state.setup.city : pick(state, CITIES)
  const demand = integer(state, 190, 1100)
  const headcountCap = Math.round(demand * range(state, 0.54, 0.84))
  const formalStaff = Math.round(headcountCap * range(state, 0.94, 1))
  const condition = integer(state, 42, 89)
  const formalWage = Math.round(occupation.wage * (REGION_WAGE[city] ?? 1) * range(state, 1.20, 1.48))
  return {
    id: `client-${index + 1}`, name, industryId: industry.id, city, condition,
    cash: demand * formalWage * range(state, 5, 12),
    growth: industry.growth * range(state, 0.6, 1.4), formalStaff, headcountCap, demand, formalWage,
    formalBenefits: integer(state, 790, 2100),
    budget: Math.round((demand - formalStaff) * formalWage * range(state, 1.14, 1.40)),
    pressure: integer(state, 26, 76), quality: integer(state, 66, 84),
    compliance: integer(state, 49, 91), credit: integer(state, 49, 97),
    dependency: integer(state, 18, 68), occupationId: occupation.id, paymentMonths: integer(state, 1, 3),
    conversionSlots: Math.max(0, headcountCap - formalStaff), agePreference: index % 5 === 2 ? 35 : null,
    trust: { [state.player.id]: state.setup.origin === 'regional' && index < 4 ? 61 : 48 },
  }
}

function pickOccupation(index: number, occupations: string[]): string {
  return occupations[Math.floor(index / 10) % occupations.length]!
}

export function createWorker(state: GameState, occupation: Occupation, city: string): Worker {
  const age = integer(state, 21, 55)
  const skill = Math.max(25, Math.min(97, integer(state, occupation.skill - 20, occupation.skill + 21)))
  const expectation = Math.round(occupation.wage * (REGION_WAGE[city] ?? 1) * (0.75 + skill / 240 + range(state, -0.06, 0.11)) / 100) * 100
  return {
    id: nextId(state, 'worker'), name: pick(state, SURNAMES) + pick(state, GIVEN_NAMES), city, age,
    education: pick(state, occupation.skill >= 60 ? ['本科', '本科', '硕士', '专科'] : ['高中', '中专', '专科', '本科']),
    occupationId: occupation.id, experience: Math.max(0, age - integer(state, 19, 26)),
    skill, efficiency: integer(state, 50, 95), learning: integer(state, 32, 95),
    expectation, pressure: integer(state, 22, 95), risk: integer(state, 12, 92), growth: integer(state, 25, 95),
    stability: integer(state, 20, 97), fairness: integer(state, 24, 95), satisfaction: integer(state, 52, 76),
    belonging: integer(state, 32, 62), health: integer(state, 72, 100), fatigue: integer(state, 2, 27),
    status: 'market', employerId: null, contractId: null, wage: 0, hiredAt: null,
    history: [{ month: state.month, label: '进入人才市场', detail: `${city} · ${occupation.name}` }],
  }
}

export function procurementBusiness(state: GameState, client: Client): Business {
  if (state.month < SCENARIO_MONTHS) {
    if (state.setup.scenario === 'quality') return pick(state, ['delivery', 'delivery', 'delivery', 'staffing', 'dispatch'])
    if (state.setup.scenario === 'shortage' && isShortageRole(client.occupationId)) return pick(state, ['staffing', 'staffing', 'dispatch'])
  }
  const profile = state.market.procurementProfile
  if (!profile) return pick(state, client.quality > 76 ? ['delivery', 'delivery', 'staffing'] : ['dispatch', 'staffing', 'staffing', 'delivery'])
  return pick(state, PROCUREMENT_PROFILES[profile].businesses)
}

export function createTender(state: GameState, client: Client, business: Business, starter = false): Tender {
  const occupation = OCCUPATIONS.find(({ id }) => id === client.occupationId)!
  const firstYear = state.month < SCENARIO_MONTHS ? state.setup.scenario : undefined
  const professional = business === 'delivery'
  const strictQuality = professional && firstYear === 'quality'
  const surge = firstYear === 'shortage' && !professional && isShortageRole(occupation.id)
  const headcount = Math.min(client.demand - client.formalStaff,
    starter ? integer(state, 8, 11) : surge ? integer(state, 14, 23) : integer(state, 8, 22))
  const wage = state.market.segments.find(({ occupationId }) => occupationId === occupation.id)!.wage
  const budget = Math.round(wage * (professional ? range(state, 1.83, 2.05) : range(state, 1.67, 1.91)) / 100) * 100
  const creditTerm = client.paymentMonths + Number(client.credit < 45)
  const paymentMonths = business === 'dispatch' ? Math.min(2, creditTerm)
    : clamp(creditTerm, firstYear === 'cash' ? (professional ? 4 : 3) : professional ? 2 : 1, 4)
  const suffix: Record<Business, string> = { delivery: '专业服务项目', staffing: '人力外包采购', dispatch: '劳务派遣采购' }
  return {
    id: nextId(state, 'tender'), title: `${client.name}${occupation.name.replace(/工程师|专员|技工|员$/, '')}${suffix[business]}`,
    clientId: client.id, upstreamId: null, business, occupationId: occupation.id,
    headcount, budget, months: starter ? 5 : integer(state, 6, 12), deadline: state.month + Number(!starter && random(state) < 0.36),
    skill: clamp(occupation.skill + (professional ? integer(state, 0, 4) + (strictQuality ? 5 : 0) : -integer(state, 2, 8)), 40, 100),
    quality: professional ? Math.max(strictQuality ? 91 : 77, client.quality) : client.quality,
    attendance: 0.90, paymentMonths, status: 'open', winnerId: null,
    ...(starter ? { pilot: true } : {}),
  }
}

function openingTenders(state: GameState): Tender[] {
  const ordered = state.clients.map(client => ({ client, priority: range(state, 0, 3) + Number(client.city === state.setup.city) * 0.65 }))
    .sort((a, b) => b.priority - a.priority).map(({ client }) => client)
  const starters = ordered.filter(client => client.city === state.setup.city && marketEntryRole(client.occupationId)).slice(0, 2)
  const other = ordered.filter(client => !starters.includes(client)).slice(0, 7)
  return [
    ...starters.map((client, index) => createTender(state, client, index === 0 ? 'staffing' : 'dispatch', true)),
    ...other.map((client, index) => createTender(state, client, index === 0 ? 'delivery' : procurementBusiness(state, client))),
  ]
}

function marketEntryRole(occupationId: string) {
  return OCCUPATIONS.some(occupation => occupation.id === occupationId && occupation.skill <= 62)
}

export function createWorld(setup: Setup): GameState {
  const origin = ORIGINS[setup.origin]
  const initialCash = START_FUNDS[setup.difficulty]
  const player = company('player', setup.name, setup.city, initialCash, origin.strategy, origin.reputation, origin.compliance, origin.tech, 26500)
  player.brand = setup.brand
  player.logo = setup.logo
  const state: GameState = {
    version: 1, setup: { ...setup }, rng: seedNumber(setup.seed), nextId: 1, month: 0, player,
    competitors: [], clients: [], workers: [], suppliers: [], tenders: [], bids: [], contracts: [], invoices: [],
    news: [], laborCases: [], technologies: setup.origin === 'ai' ? ['recruitment', 'screening'] : setup.origin === 'software' ? ['recruitment'] : [],
    research: [], training: [],
    market: { economy: 0, automation: 18, regulation: 52, segments: [] },
    policies: { autoHire: false, autoRenew: false, autoPayroll: true, overtimeCompensation: true, defaultBenefit: 320 },
    pending: { recruitment: 0, training: 0, research: 0, disputes: 0, management: 0, financing: 0, repayments: 0 },
  }
  state.market.procurementProfile = pick(state, Object.keys(PROCUREMENT_PROFILES) as ProcurementProfile[])
  state.competitors = COMPETITOR_NAMES.map((name, index) => {
    const strategy = STRATEGIES[index]!
    return company(`npc-${index + 1}`, `${name}有限公司`, index < 3 ? setup.city : pick(state, CITIES),
      integer(state, 720000, 2900000), strategy, integer(state, 42, 69),
      strategy === 'steady' ? integer(state, 80, 90) : integer(state, 52, 78),
      strategy === 'technology' ? 2 : 0, integer(state, 19000, 33000))
  })
  state.competitors.forEach((competitor, index) => { competitor.brand = COMPETITOR_NAMES[index]! })
  state.clients = CLIENT_NAMES.map((name, index) => createClient(state, name, index))
  for (let index = 0; index < 1530; index++) {
    const occupation = OCCUPATIONS[index % OCCUPATIONS.length]!
    if (setup.scenario === 'shortage' && isShortageRole(occupation.id) && index >= OCCUPATIONS.length * 100) continue
    const city = random(state) < 0.72 ? setup.city : pick(state, CITIES)
    state.workers.push(createWorker(state, occupation, city))
  }
  state.market.segments = OCCUPATIONS.map(occupation => ({
    occupationId: occupation.id,
    wage: Math.round(occupation.wage * (REGION_WAGE[setup.city] ?? 1) / 100) * 100,
    supply: state.workers.filter(worker => worker.occupationId === occupation.id).length,
    demand: occupation.demand, growth: 0,
  }))
  state.suppliers = SUPPLIER_NAMES.map((name, index) => ({
    id: `supplier-${index + 1}`, name, city: index < 3 ? setup.city : pick(state, CITIES),
    specialty: (['staffing', 'dispatch', 'staffing', 'delivery', 'dispatch', 'delivery'] as const)[index]!,
    quality: integer(state, 64, 88), compliance: integer(state, 52, 88), capacity: integer(state, 28, 65),
    rate: range(state, 1.24, 1.42), partnerId: index % 2 === 0 ? `supplier-${index + 2}` : null,
  }))
  state.tenders = openingTenders(state)
  state.news.push({
    id: nextId(state, 'news'), month: 0, kind: 'market', severity: 'info',
    title: `${setup.city}新年外部用工采购启动`,
    detail: `${state.clients.length} 家模拟客户已建立采购档案，首批 ${state.tenders.length} 个采购项目开放投标。常规采购以${PROCUREMENT_PROFILES[state.market.procurementProfile].name}为主。`,
  })
  return state
}
