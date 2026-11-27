export function clamp(value: number, lower = 0, upper = 100): number {
  return Math.min(upper, Math.max(lower, value))
}

export function yuan(value: number): number {
  return Math.round(value)
}

export interface WorkerMonthInput {
  satisfaction: number
  fatigue: number
  wageRatio: number
  parityRatio: number
  benefits: number
  growth: number
  security: number
  extraHours: number
  paidOnTime: boolean
  prospects: number
  pressure: number
  riskTolerance: number
  ambition: number
  fairness: number
  stabilityNeed: number
}

export function evaluateWorkerMonth(input: WorkerMonthInput) {
  const fatigue = clamp(input.fatigue * 0.66 + input.extraHours * 0.84)
  const wageEffect = clamp((input.wageRatio - 1) * 46, -33, 23)
  const fairnessEffect = Math.max(0, 1 - input.parityRatio) * (5 + input.fairness * 0.2)
  const growthEffect = (input.growth - 40) * (0.06 + input.ambition * 0.002)
  const stabilityEffect = (input.security - 60) * (0.06 + input.stabilityNeed * 0.002)
  const target = clamp(65 + wageEffect + input.benefits * 0.15 + growthEffect + stabilityEffect
    - fairnessEffect - fatigue * 0.29 - (input.paidOnTime ? 0 : 28))
  const satisfaction = clamp(Math.round(input.satisfaction * 0.67 + target * 0.33))
  const quitChance = clamp(
    0.004
    + Math.max(0, 59 - satisfaction) * 0.0026
    + Math.max(0, 1 - input.wageRatio) * 0.10
    + Math.max(0, input.prospects - 50) * 0.0012
    + input.riskTolerance * 0.00032
    + input.ambition * Math.max(0, 65 - input.growth) * 0.000014
    + (input.paidOnTime ? 0 : 0.045)
    - input.pressure * 0.00034,
    0.002,
    0.29,
  )
  return { satisfaction, fatigue: Math.round(fatigue), quitChance }
}

interface TenderScoreInput {
  quote: number
  budget: number
  quality: number
  coverage: number
  reputation: number
  relationship: number
  compliance: number
  stability: number
  priceWeight: number
  qualityWeight: number
}

export function calculateTenderScore(input: TenderScoreInput): number {
  const price = clamp(79 + (1 - input.quote / Math.max(1, input.budget)) * 108)
  const priceWeight = clamp(input.priceWeight / 100, 0.18, 0.52)
  const qualityWeight = clamp(input.qualityWeight / 100, 0.14, 0.40)
  const delivery = input.quality * 0.64 + input.coverage * 0.36
  const reliability = input.reputation * 0.36 + input.relationship * 0.24
    + input.compliance * 0.21 + input.stability * 0.19
  return Math.round((price * priceWeight + delivery * qualityWeight
    + reliability * (1 - priceWeight - qualityWeight)) * 10) / 10
}

interface DeliveryInput {
  seats: number
  covered: number
  skill: number
  targetSkill: number
  satisfaction: number
  fatigue: number
  management: number
  efficiency: number
}

export function evaluateDelivery(input: DeliveryInput) {
  const staffing = clamp(input.covered / Math.max(1, input.seats), 0, 1)
  const skill = clamp(input.skill / Math.max(1, input.targetSkill), 0.2, 1.25)
  const efficiency = clamp(input.efficiency, 0.7, 1.35)
  // 管理与技术能够改善产出，缺岗和疲劳仍会挤压实际交付能力。
  const quality = input.covered === 0 ? 0 : clamp(
    (30 + 43 * skill + 14 * staffing + input.management * 0.13
      + (input.satisfaction - 58) * 0.16 - input.fatigue * 0.17) * efficiency,
  )
  const output = clamp(staffing * (0.66 + 0.33 * skill) * efficiency * (1 - input.fatigue / 300), 0, 1.2)
  const extraHours = yuan(clamp((1 - staffing) * 53 + Math.max(0, 1 - skill) * 24
    - (efficiency - 1) * 55 - input.management * 0.08 + 6, 0, 60))
  return { quality: yuan(quality), coverage: yuan(staffing * 100), output, extraHours }
}
