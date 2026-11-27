import type { GameState } from '../simulation/types'

type Slot = 'current' | 'manual'

let opening: Promise<IDBDatabase> | undefined
let pendingWrite: Promise<void> = Promise.resolve()

function database(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('gamex-outsourcing-era', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('saves')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('请关闭其他版本的游戏标签页后重新尝试。'))
    })
    opening.catch(() => { opening = undefined })
  }
  return opening
}

export function writeSave(slot: Slot, state: GameState): Promise<void> {
  const write = pendingWrite.then(async () => {
    const db = await database()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite')
      transaction.objectStore('saves').put(state, slot)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  })
  pendingWrite = write.catch(() => {})
  return write
}

export async function readSave(slot: Slot): Promise<GameState | undefined> {
  await pendingWrite
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction('saves').objectStore('saves').get(slot)
    request.onsuccess = () => resolve(request.result as GameState | undefined)
    request.onerror = () => reject(request.error)
  })
}
