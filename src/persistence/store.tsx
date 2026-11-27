import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { advanceMonth, applyAction } from '../simulation/engine'
import { createDemoWorld } from '../simulation/demo'
import type { GameAction, GameResult, GameState, Setup } from '../simulation/types'
import { createWorld, DEMO_SETUP } from '../simulation/world'
import type { SimulationRequest } from '../workers/simulation.worker'
import { readSave, writeSave } from './database'
import { normalizeSetup, parseSaveFile, validateSave } from './save-format'

type Theme = 'light' | 'dark'

interface GameStore {
  state: GameState
  ready: boolean
  busy: boolean
  theme: Theme
  storageError: string | null
  setTheme: (theme: Theme) => void
  dispatch: (action: GameAction) => Promise<GameResult>
  newGame: (setup: Setup) => Promise<void>
  save: () => Promise<void>
  load: () => Promise<boolean>
  loadDemo: () => Promise<void>
  exportSave: () => Promise<void>
  importSave: (file: File) => Promise<void>
}

const GameContext = createContext<GameStore | null>(null)
let initialState: Promise<{ state: GameState; storageError: string | null }> | undefined

function runSimulation(request: SimulationRequest): Promise<GameResult> {
  const local = () => request.type === 'demo'
    ? { state: createDemoWorld(), ok: true, message: '已载入演示企业。' }
    : advanceMonth(request.state)
  if (!globalThis.Worker) return Promise.resolve().then(local)
  return new Promise<GameResult>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve(Promise.resolve().then(local))
      return
    }
    const timer = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('本次月结超时，当前经营进度仍可继续操作。'))
    }, 30_000)
    const cleanup = () => {
      window.clearTimeout(timer)
      worker.terminate()
    }
    worker.onmessage = (event: MessageEvent<GameResult | { error: string }>) => {
      cleanup()
      if ('error' in event.data) reject(new Error(event.data.error))
      else resolve(event.data)
    }
    worker.onerror = () => {
      cleanup()
      resolve(Promise.resolve().then(local))
    }
    try { worker.postMessage(request) }
    catch {
      cleanup()
      resolve(Promise.resolve().then(local))
    }
  })
}

async function initializeGame() {
  let storageError: string | null = null
  try {
    const saved = await readSave('current')
    if (saved) return { state: validateSave(saved), storageError }
  } catch {
    storageError = '自动存档无法读取。'
  }
  try {
    const demo = await runSimulation({ type: 'demo' })
    return { state: demo.state, storageError }
  } catch {
    return { state: createWorld(DEMO_SETUP), storageError }
  }
}

function readTheme(): Theme {
  try { return localStorage.getItem('gamex-outsourcing-theme') === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => createWorld(DEMO_SETUP))
  const current = useRef(state)
  const processing = useRef(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [theme, updateTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    let mounted = true
    initialState ??= initializeGame()
    void initialState.then(result => {
      if (!mounted) return
      current.current = result.state
      setState(result.state)
      setStorageError(result.storageError)
      setReady(true)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('gamex-outsourcing-theme', theme) } catch { /* 隐私模式下保留会话内主题。 */ }
  }, [theme])

  async function update(next: GameState) {
    current.current = next
    setState(next)
    try {
      await writeSave('current', next)
      setStorageError(null)
    } catch {
      setStorageError('自动存档写入失败，可在系统设置中导出存档。')
    }
  }

  async function run<T>(operation: () => Promise<T>): Promise<T> {
    if (processing.current || !ready) throw new Error('系统正在处理上一次操作。')
    processing.current = true
    setBusy(true)
    try {
      return await operation()
    } finally {
      processing.current = false
      setBusy(false)
    }
  }

  async function dispatch(action: GameAction): Promise<GameResult> {
    try {
      return await run(async () => {
        const result = action.type === 'advance'
          ? await runSimulation({ type: 'advance', state: current.current })
          : applyAction(current.current, action)
        if (result.ok) await update(result.state)
        return result
      })
    } catch (error) {
      return { state: current.current, ok: false, message: error instanceof Error ? error.message : '操作失败。' }
    }
  }

  const store: GameStore = {
    state, ready, busy, theme, setTheme: updateTheme, dispatch, storageError,
    newGame: setup => run(() => update(createWorld(normalizeSetup(setup)))),
    save: () => run(() => writeSave('manual', current.current)),
    load: () => run(async () => {
      const save = await readSave('manual') ?? await readSave('current')
      if (!save) return false
      await update(validateSave(save))
      return true
    }),
    loadDemo: () => run(async () => update((await runSimulation({ type: 'demo' })).state)),
    importSave: file => run(async () => update(await parseSaveFile(file))),
    exportSave: () => run(async () => {
      const data = current.current
      const filename = data.setup.brand.replace(/[\\/:*?"<>|]/g, '-')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename}-第${data.month + 1}月.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }),
  }

  return <GameContext.Provider value={store}>{children}</GameContext.Provider>
}

export function useGame(): GameStore {
  const store = useContext(GameContext)
  if (!store) throw new Error('经营系统尚未初始化。')
  return store
}
