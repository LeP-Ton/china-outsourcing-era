import { BUSINESS_LABELS, CITIES, DIFFICULTY_LABELS, OCCUPATIONS, ORIGIN_LABELS, PROCUREMENT_PROFILES, TECHNOLOGIES } from '../simulation/data'
import { SCENARIOS } from '../simulation/scenarios'
import type { GameState, Setup } from '../simulation/types'

const COLLECTIONS = ['competitors', 'clients', 'workers', 'suppliers', 'tenders', 'bids',
  'contracts', 'invoices', 'news', 'laborCases', 'technologies', 'research', 'training'] as const
const MAX_SAVE_BYTES = 45 * 1024 * 1024

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeLogo(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string' && value.length <= 2_100_000
    && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)
}

export function normalizeSetup(setup: Setup): Setup {
  const name = setup.name.trim()
  const brand = setup.brand.trim()
  const seed = setup.seed.trim()
  const city = setup.city.trim()
  if (!name || name.length > 48 || !brand || brand.length > 16 || !seed || seed.length > 80
    || !CITIES.some(value => value === city) || !Object.hasOwn(DIFFICULTY_LABELS, setup.difficulty)
    || !Object.hasOwn(ORIGIN_LABELS, setup.origin) || !safeLogo(setup.logo)
    || (setup.challenge !== undefined && ![5, 10, 20].includes(setup.challenge))
    || (setup.scenario !== undefined && (!Object.hasOwn(SCENARIOS, setup.scenario) || setup.challenge !== undefined))) {
    throw new Error('请检查企业名称、品牌、城市、随机种子、难度、经营模式和标志图片。')
  }
  return { ...setup, name, brand, seed, city }
}

function finiteFields(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))
}

export function validateSave(value: unknown): GameState {
  if (!object(value) || value.version !== 1 || !Number.isSafeInteger(value.month) || Number(value.month) < 0
    || !Number.isSafeInteger(value.rng) || Number(value.rng) < 1 || Number(value.rng) > 4294967295
    || !Number.isSafeInteger(value.nextId) || Number(value.nextId) < 1
    || !object(value.setup) || !object(value.player) || !object(value.policies) || !object(value.market)
    || !object(value.pending) || COLLECTIONS.some(key => !Array.isArray(value[key]))
    || !Array.isArray(value.player.reports) || !Array.isArray(value.market.segments)
    || !finiteFields(value.player, ['cash', 'debt', 'payables', 'reputation', 'compliance', 'tech', 'overhead', 'cumulativeProfit'])
    || typeof value.player.name !== 'string' || typeof value.player.brand !== 'string'
    || value.player.id !== 'player' || !safeLogo(value.player.logo)
    || !finiteFields(value.pending, ['recruitment', 'training', 'research', 'disputes', 'management', 'financing', 'repayments'])
    || !value.market.segments.every(segment => object(segment) && typeof segment.occupationId === 'string' && finiteFields(segment, ['wage', 'supply', 'demand', 'growth']))
    || !finiteFields(value.market, ['economy', 'automation', 'regulation'])
    || (value.market.procurementProfile !== undefined
      && (typeof value.market.procurementProfile !== 'string' || !Object.hasOwn(PROCUREMENT_PROFILES, value.market.procurementProfile)))
    || !['autoHire', 'autoRenew', 'autoPayroll', 'overtimeCompensation'].every(key => typeof (value.policies as Record<string, unknown>)[key] === 'boolean')
    || !finiteFields(value.policies, ['defaultBenefit'])) {
    throw new Error('存档格式不完整或版本不兼容。')
  }
  try {
    normalizeSetup(value.setup as unknown as Setup)
  } catch {
    throw new Error('存档中的企业设定无效。')
  }
  for (const key of COLLECTIONS) {
    if (key === 'technologies' || key === 'research') continue
    const values = value[key] as unknown[]
    const ids = new Set<string>()
    for (const item of values) {
      if (!object(item) || typeof item.id !== 'string' || ids.has(item.id)) {
        throw new Error('存档包含无效或重复的数据记录。')
      }
      ids.add(item.id)
    }
  }
  const state = value as unknown as GameState
  const occupations = new Set(OCCUPATIONS.map(occupation => occupation.id))
  const technologyIds = new Set<string>(TECHNOLOGIES.map(technology => technology.id))
  const companies = new Set([state.player.id, ...state.competitors.map(company => company.id)])
  const clients = new Set(state.clients.map(client => client.id))
  const contracts = new Map(state.contracts.map(contract => [contract.id, contract]))
  const trustedCompanies = [state.player, ...state.competitors].every(company =>
    Array.isArray(company.reports) && typeof company.brand === 'string' && typeof company.name === 'string'
    && ['operating', 'bankrupt'].includes(company.status)
    && Number.isFinite(company.payables) && company.payables >= 0
    && Number.isFinite(company.wageArrears ?? 0) && Number.isFinite(company.overtimeArrears ?? 0)
    && (company.overtimeArrears ?? 0) >= 0 && (company.overtimeArrears ?? 0) <= (company.wageArrears ?? 0)
    && (company.wageArrears ?? 0) <= company.payables
    && company.reports.every(report => object(report) && finiteFields(report, ['month', 'revenue', 'costs', 'profit', 'cash', 'received', 'receivables'])
      && (report.scenarioDelivery === undefined || (object(report.scenarioDelivery)
        && finiteFields(report.scenarioDelivery, ['planned', 'covered', 'qualityTotal'])))))
  if (!trustedCompanies
    || state.clients.some(client => !object(client.trust) || !occupations.has(client.occupationId))
    || state.tenders.some(tender => tender.pilot !== undefined && typeof tender.pilot !== 'boolean')
    || state.contracts.some(contract => !object(contract.plan) || !Number.isFinite(contract.plan.price)
      || (contract.skillTarget !== undefined && (!Number.isFinite(contract.skillTarget) || contract.skillTarget < 0 || contract.skillTarget > 100))
      || !Object.hasOwn(BUSINESS_LABELS, contract.business) || !companies.has(contract.companyId)
      || !clients.has(contract.clientId) || !occupations.has(contract.occupationId))
    || state.bids.some(bid => bid.preparation !== undefined && (!Number.isInteger(bid.preparation) || bid.preparation < 1 || bid.preparation > 3))
    || state.workers.some(worker => !Array.isArray(worker.history) || !occupations.has(worker.occupationId)
      || !['market', 'employed', 'client', 'inactive'].includes(worker.status)
      || typeof worker.name !== 'string' || !Number.isFinite(worker.skill) || !Number.isFinite(worker.expectation)
      || worker.history.some(entry => !object(entry) || typeof entry.label !== 'string' || typeof entry.detail !== 'string')
      || (worker.contractId !== null && contracts.get(worker.contractId)?.companyId !== worker.employerId)
      || (worker.status === 'employed' && !companies.has(worker.employerId ?? '')))
    || state.training.some(program => !Array.isArray(program.workerIds))
    || state.technologies.some(id => !technologyIds.has(id))
    || state.research.some(project => !object(project) || !technologyIds.has(project.techId) || !Number.isFinite(project.remaining))) {
    throw new Error('存档中的履历、合同、技术或企业报表无效。')
  }
  return state
}

export async function parseSaveFile(file: File): Promise<GameState> {
  if (file.size > MAX_SAVE_BYTES) throw new Error('存档文件超过 45 MB。')
  let value: unknown
  try { value = JSON.parse(await file.text()) }
  catch { throw new Error('无法读取此文件，请选择游戏导出的 JSON 存档。') }
  return validateSave(value)
}
