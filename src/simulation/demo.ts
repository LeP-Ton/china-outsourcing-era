import { applyAction, advanceMonth, defaultBidPlan } from './engine'
import { nextId } from './random'
import type { BidPlan, Business, Contract, GameState } from './types'
import { createTender, createWorld, DEMO_SETUP } from './world'

function addOpeningContract(state: GameState, clientIndex: number, business: Business, headcount: number, priceMultiplier: number, title: string) {
  const client = state.clients[clientIndex]!
  const tender = { ...createTender(state, client, business), title, headcount, months: 12, deadline: state.month, attendance: 0.86, quality: 72 }
  const wage = state.market.segments.find(segment => segment.occupationId === client.occupationId)!.wage
  const plan: BidPlan = {
    ...defaultBidPlan(state, tender), wage: Math.round(wage * 1.14 / 100) * 100,
    price: Math.round(wage * priceMultiplier / 100) * 100, headcount, benefit: 460,
    training: 140, management: 450, manager: business === 'dispatch' ? 'client' : 'provider',
    subcontract: 0, depth: 0, supplierId: null,
  }
  const contract: Contract = {
    id: nextId(state, 'contract'), tenderId: tender.id, companyId: state.player.id, clientId: client.id,
    upstreamId: null, title, occupationId: tender.occupationId, business, plan, headcount, term: 12,
    remaining: 12, paymentMonths: client.paymentMonths, skillTarget: tender.skill, qualityTarget: tender.quality,
    attendanceTarget: tender.attendance, signedAt: 0, status: 'active', quality: 0, attendance: 0,
    revenue: 0, cumulativeRevenue: 0, penalties: 0, risk: 0, progress: 0, lastSupplierCost: 0,
  }
  state.tenders.push({ ...tender, budget: plan.price, status: 'awarded', winnerId: state.player.id })
  state.contracts.push(contract)
}

export function createDemoWorld(): GameState {
  let state = createWorld(DEMO_SETUP)
  state.policies.autoHire = true
  addOpeningContract(state, 0, 'delivery', 16, 2.15, '云栖数科 · 软件研发交付')
  addOpeningContract(state, 1, 'staffing', 26, 1.91, '远图智造 · 装配运营外包')
  addOpeningContract(state, 6, 'dispatch', 29, 1.83, '迅舟供应链 · 仓储劳务派遣')
  for (let month = 0; month < 6; month++) {
    if (month === 2) {
      addOpeningContract(state, 7, 'staffing', 20, 1.93, '青禾连锁 · 门店运营外包')
      const contract = state.contracts.at(-1)!
      contract.signedAt = month
    }
    if (month === 3) state = applyAction(state, { type: 'research', techId: 'matching' }).state
    state = advanceMonth(state).state
  }
  state.policies.autoHire = false
  return state
}
