import { START_FUNDS } from './data'
import type { GameState, ScenarioId } from './types'

export const SCENARIO_MONTHS = 12
const SHORTAGE_ROLES = ['production', 'warehouse', 'retail']

export const SCENARIOS = {
  cash: {
    name: '回款寒冬',
    terms: '首年按客户招采类型定账期。直接人力外包至少 3 个月，直接专业业务外包至少 4 个月，直接派遣最长 2 个月。',
    objective: '累计实际回款达到启动资金的 40%，且每月末现金至少保有 30% 的启动资金。',
  },
  shortage: {
    name: '季节性用工荒',
    terms: '生产、仓储和门店候选人偏少。4–6 月与 9–11 月求职者薪资要求升高，人才流入放缓。',
    objective: '在缺工旺季实际交付至少 40 人月，且上述岗位的合同平均到岗率达到 90%。',
  },
  quality: {
    name: '质量优先采购',
    terms: '首年专业项目偏多，客户要求更高的技能和验收质量，并提高投标质量的权重。',
    objective: '年末三个月完成至少 45 人月的专业采购项目交付，且按实际到岗加权的交付质量达到 92 分。',
  },
} satisfies Record<ScenarioId, { name: string; terms: string; objective: string }>

export function isShortageRole(occupationId: string) {
  return SHORTAGE_ROLES.includes(occupationId)
}

export function isShortageMonth(month: number) {
  return (month >= 3 && month <= 5) || (month >= 8 && month <= 10)
}

export function recruitingExpectation(state: GameState, occupationId: string, expectation: number) {
  return state.setup.scenario === 'shortage' && isShortageMonth(state.month) && isShortageRole(occupationId)
    ? Math.round(expectation * 1.13) : expectation
}

interface ScenarioMetric {
  label: string
  value: number
  target: number
  unit: 'money' | 'seats' | 'percent' | 'score'
}

export function scenarioProgress(state: GameState) {
  const id = state.setup.scenario
  if (!id) return undefined
  const reports = state.player.reports.filter(report => report.month < SCENARIO_MONTHS)
  const elapsed = state.month >= SCENARIO_MONTHS
  const endedEarly = !elapsed && state.player.status === 'bankrupt'
  const complete = elapsed || endedEarly
  let metrics: ScenarioMetric[]
  if (id === 'cash') {
    const funds = START_FUNDS[state.setup.difficulty]
    metrics = [
      { label: '累计实际回款', value: reports.reduce((sum, report) => sum + report.received, 0), target: funds * 0.4, unit: 'money' },
      { label: '最低月末现金', value: reports.reduce((min, report) => Math.min(min, report.cash), funds), target: funds * 0.3, unit: 'money' },
    ]
  } else {
    const delivery = reports.reduce((total, report) => {
      if (!report.scenarioDelivery) return total
      return {
        planned: total.planned + report.scenarioDelivery.planned,
        covered: total.covered + report.scenarioDelivery.covered,
        qualityTotal: total.qualityTotal + report.scenarioDelivery.qualityTotal,
      }
    }, { planned: 0, covered: 0, qualityTotal: 0 })
    const shortage = id === 'shortage'
    metrics = [
      { label: shortage ? '旺季岗位实际交付' : '年末三个月专业交付', value: delivery.covered, target: shortage ? 40 : 45, unit: 'seats' },
      shortage
        ? { label: '旺季岗位到岗率', value: 100 * delivery.covered / Math.max(1, delivery.planned), target: 90, unit: 'percent' }
        : { label: '年末三个月交付质量', value: delivery.qualityTotal / Math.max(1, delivery.covered), target: 92, unit: 'score' },
    ]
  }
  return { scenario: SCENARIOS[id], metrics, complete, endedEarly, passed: elapsed && metrics.every(metric => metric.value >= metric.target) }
}
