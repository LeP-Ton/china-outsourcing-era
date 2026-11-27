export type Business = 'dispatch' | 'staffing' | 'delivery'
export type Difficulty = 'easy' | 'standard' | 'hard'
export type Origin = 'bootstrap' | 'dispatch' | 'software' | 'headhunter' | 'ai' | 'regional'
export type Manager = 'provider' | 'client'
export type Strategy = 'scale' | 'premium' | 'technology' | 'channel' | 'steady' | 'expansion'
export type WorkerStatus = 'market' | 'employed' | 'client' | 'inactive'
export type ContractStatus = 'unsigned' | 'active' | 'completed' | 'cancelled'
export type TenderStatus = 'open' | 'awarded' | 'expired'
export type NewsKind = 'market' | 'customer' | 'labor' | 'finance' | 'business' | 'technology' | 'compliance'
export type Severity = 'info' | 'warning' | 'critical'
export type TechId = 'recruitment' | 'screening' | 'matching' | 'scheduling' | 'payroll' | 'analytics' | 'assessment' | 'audit' | 'suppliers'
export type RecruitmentChannel = 'platform' | 'referral' | 'campus' | 'headhunter'

export interface Setup {
  name: string
  brand: string
  logo?: string
  city: string
  seed: string
  difficulty: Difficulty
  origin: Origin
  challenge?: 5 | 10 | 20
}

export interface Occupation {
  id: string
  name: string
  wage: number
  demand: number
  skill: number
}

export interface Industry {
  id: string
  name: string
  growth: number
  occupations: string[]
}

export interface MarketSegment {
  occupationId: string
  wage: number
  supply: number
  demand: number
  growth: number
}

export interface WorldMarket {
  economy: number
  automation: number
  regulation: number
  segments: MarketSegment[]
}

export interface WorkerHistory {
  month: number
  label: string
  detail: string
}

export interface Worker {
  id: string
  name: string
  city: string
  age: number
  education: string
  occupationId: string
  experience: number
  skill: number
  efficiency: number
  learning: number
  expectation: number
  pressure: number
  risk: number
  growth: number
  stability: number
  fairness: number
  satisfaction: number
  belonging: number
  health: number
  fatigue: number
  status: WorkerStatus
  employerId: string | null
  contractId: string | null
  wage: number
  hiredAt: number | null
  benchSince?: number
  history: WorkerHistory[]
  lastHours?: number
  lastIncome?: number
}

export interface Client {
  id: string
  name: string
  industryId: string
  city: string
  condition: number
  cash: number
  growth: number
  formalStaff: number
  headcountCap: number
  demand: number
  formalWage: number
  formalBenefits: number
  budget: number
  pressure: number
  quality: number
  compliance: number
  credit: number
  dependency: number
  trust: Record<string, number>
  occupationId: string
  paymentMonths: number
  conversionSlots: number
  agePreference: number | null
}

export interface Company {
  id: string
  name: string
  brand: string
  logo?: string
  city: string
  cash: number
  debt: number
  payables: number
  wageArrears?: number
  overtimeArrears?: number
  cashAtLastClose?: number
  overdueMonths?: number
  reputation: number
  compliance: number
  brandScore: number
  tech: number
  overhead: number
  strategy: Strategy
  status: 'operating' | 'bankrupt'
  cumulativeProfit: number
  totalHires: number
  totalDepartures: number
  totalConversions: number
  reports: MonthReport[]
}

export interface Supplier {
  id: string
  name: string
  city: string
  specialty: Business
  quality: number
  compliance: number
  capacity: number
  rate: number
  partnerId: string | null
}

export interface Tender {
  id: string
  title: string
  clientId: string
  upstreamId: string | null
  parentContractId?: string | null
  business: Business
  occupationId: string
  headcount: number
  budget: number
  months: number
  deadline: number
  skill: number
  quality: number
  attendance: number
  paymentMonths: number
  status: TenderStatus
  winnerId: string | null
}

export interface BidPlan {
  price: number
  wage: number
  benefit: number
  training: number
  management: number
  headcount: number
  skill: number
  mobilization: number
  business: Business
  manager: Manager
  subcontract: number
  supplierId: string | null
  depth: number
}

export interface BidEstimate {
  revenue: number
  cost: number
  margin: number
  difficulty: number
  attendance: number
  quality: number
  turnover: number
  exposure: number
  risk: number
  score: number
}

export interface Bid {
  id: string
  tenderId: string
  companyId: string
  month: number
  plan: BidPlan
  estimate: BidEstimate
  status: 'submitted' | 'won' | 'lost'
}

export interface Contract {
  id: string
  tenderId: string
  companyId: string
  clientId: string
  upstreamId: string | null
  parentContractId?: string | null
  title: string
  occupationId: string
  business: Business
  plan: BidPlan
  headcount: number
  term: number
  remaining: number
  paymentMonths: number
  qualityTarget: number
  attendanceTarget: number
  signedAt: number | null
  status: ContractStatus
  quality: number
  attendance: number
  revenue: number
  cumulativeRevenue: number
  penalties: number
  risk: number
  progress: number
  lastSupplierCost: number
  renewed?: boolean
}

export interface Invoice {
  id: string
  companyId: string
  clientId: string
  contractId: string
  amount: number
  issued: number
  due: number
  received: number
  upstreamId?: string | null
  paidAt: number | null
}

export interface MonthReport {
  month: number
  revenue: number
  costs: number
  profit: number
  openingCash: number
  cash: number
  receivables: number
  received: number
  paid: number
  payroll: number
  benefits: number
  recruitment: number
  training: number
  suppliers: number
  management: number
  research: number
  fixed: number
  disputes: number
  financing: number
  repayments: number
  penalty: number
  headcount: number
  departures: number
  conversions: number
  satisfaction: number
  averageIncome: number
  averageHours: number
  skill: number
}

export interface GameNews {
  id: string
  month: number
  kind: NewsKind
  severity: Severity
  title: string
  detail: string
}

export interface LaborCase {
  id: string
  workerId: string
  contractId: string | null
  month: number
  category: string
  detail: string
  severity: Severity
  compensation: number
  status: 'open' | 'resolved'
}

export interface Technology {
  id: TechId
  name: string
  detail: string
  cost: number
  months: number
  upkeep: number
}

export interface ResearchProject {
  techId: TechId
  remaining: number
}

export interface TrainingProgram {
  id: string
  workerIds: string[]
  month: number
  cost: number
  skillGain: number
}

export interface Policies {
  autoHire: boolean
  autoRenew: boolean
  autoPayroll: boolean
  overtimeCompensation: boolean
  defaultBenefit: number
}

export interface GameState {
  version: 1
  setup: Setup
  rng: number
  nextId: number
  month: number
  player: Company
  competitors: Company[]
  clients: Client[]
  workers: Worker[]
  suppliers: Supplier[]
  tenders: Tender[]
  bids: Bid[]
  contracts: Contract[]
  invoices: Invoice[]
  news: GameNews[]
  laborCases: LaborCase[]
  market: WorldMarket
  technologies: TechId[]
  research: ResearchProject[]
  training: TrainingProgram[]
  policies: Policies
  pending: { recruitment: number; training: number; research: number; disputes: number; management: number; financing: number; repayments: number }
}

export type GameAction =
  | { type: 'bid'; tenderId: string; plan: BidPlan }
  | { type: 'sign'; contractId: string }
  | { type: 'renew'; contractId: string }
  | { type: 'cancel'; contractId: string }
  | { type: 'hire'; workerIds: string[]; wage: number; channel: RecruitmentChannel; contractId?: string }
  | { type: 'assign'; workerIds: string[]; contractId: string | null }
  | { type: 'release'; workerIds: string[] }
  | { type: 'compensation'; workerIds: string[]; wage: number }
  | { type: 'subcontract'; contractId: string; supplierId: string | null; ratio: number; depth: number }
  | { type: 'management'; contractId: string; manager: Manager }
  | { type: 'train'; workerIds: string[] }
  | { type: 'research'; techId: TechId }
  | { type: 'resolve'; caseId: string }
  | { type: 'audit'; contractId: string }
  | { type: 'campaign' }
  | { type: 'settlePayroll' }
  | { type: 'finance'; amount: number }
  | { type: 'repay'; amount: number }
  | { type: 'policies'; values: Partial<Policies> }
  | { type: 'advance' }

export interface GameResult {
  state: GameState
  ok: boolean
  message: string
}

export type PageId = 'dashboard' | 'market' | 'customers' | 'bidding' | 'contracts' | 'recruitment' | 'workforce' | 'staffing' | 'suppliers' | 'payroll' | 'training' | 'research' | 'labor' | 'compliance' | 'opinion' | 'finance' | 'rankings' | 'settings'
