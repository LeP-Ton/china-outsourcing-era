import { advanceMonth } from '../simulation/engine'
import { createDemoWorld } from '../simulation/demo'
import type { GameState } from '../simulation/types'

export type SimulationRequest = { type: 'demo' } | { type: 'advance'; state: GameState }

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  try {
    const request = event.data
    const result = request.type === 'demo'
      ? { state: createDemoWorld(), ok: true, message: '已载入演示企业。' }
      : advanceMonth(request.state)
    self.postMessage(result)
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '后台模拟失败。' })
  }
}
