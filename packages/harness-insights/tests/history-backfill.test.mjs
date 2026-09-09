import assert from 'node:assert/strict'
import { backfillHistory, restoreLegacyInsightsCheckpoint } from '../lib/index.js'

const header = { id: 'session-1', version: 7, createdAt: 1, isSeeded: false }
const events = [{ seq: 0, type: 'assistant/message' }]
const signal = new AbortController().signal

{
  const calls = []
  const ctx = {
    get(name) {
      if (name === 'sessionPersistence') return {
        async list(options) { calls.push(['list', options.signal]); return [{ header }] },
        async open(id, access, options) {
          calls.push(['open', id, access, options.signal])
          return {
            header,
            inheritedEventCount: 0,
            async read(offset, length, readOptions) { calls.push(['read', offset, length, readOptions.signal]); return { events } },
            async close() { calls.push(['close']) },
          }
        },
      }
      if (name === 'sessionProjectionCache') return {
        coldSnapshot(meta, inheritedEventCount, suppliedEvents) {
          calls.push(['coldSnapshot', meta, inheritedEventCount, suppliedEvents])
        },
      }
    },
    logger: { warn(message) { throw new Error(message) } },
  }
  await backfillHistory(ctx, signal)
  assert.deepEqual(calls.map(call => call[0]), ['list', 'open', 'read', 'coldSnapshot', 'close'])
  assert.equal(calls[3][1], header)
  assert.equal(calls[3][2], 0)
  assert.equal(calls[3][3], events)
}

{
  const calls = []
  const ctx = {
    get(name) {
      if (name === 'sessionPersistence') return {
        async listSnapshots(receivedSignal) { calls.push(['listSnapshots', receivedSignal]); return [{ header }] },
      }
      if (name === 'sessionProjectionCache') return {
        async coldSnapshot(id, receivedSignal) { calls.push(['coldSnapshot', id, receivedSignal]) },
      }
    },
    logger: { warn(message) { throw new Error(message) } },
  }
  await backfillHistory(ctx, signal)
  assert.deepEqual(calls.map(call => call[0]), ['listSnapshots', 'coldSnapshot'])
  assert.equal(calls[1][1], header.id)
}

console.log('Harness Insights history-backfill compatibility tests passed.')

{
  const legacyRow = { ver: 1, seq: 42, val: { totals: { inputTokens: 10 } } }
  const legacyRecord = {
    identity: { createdAt: 1, cwd: '/workspace' },
    rows: { harnessDesktopInsights: legacyRow, title: { ver: 1, seq: 42, val: {} } },
  }
  const calls = []
  const cache = {
    table: { get(id) { calls.push(['get', id]); return legacyRecord } },
    async put(id, identity, rows) { calls.push(['put', id, identity, rows]) },
  }
  const migrated = await restoreLegacyInsightsCheckpoint(cache, {
    header: { id: 'session-1', version: 3, createdAt: 1, cwd: '/workspace', isSeeded: false },
  })
  assert.equal(migrated, true)
  assert.deepEqual(calls.map(call => call[0]), ['get', 'put'])
  assert.deepEqual(calls[1][2], {
    formatVersion: 3,
    createdAt: 1,
    cwd: '/workspace',
    isSeeded: false,
    inheritedEventCount: 0,
  })
  assert.deepEqual(calls[1][3], { harnessDesktopInsights: legacyRow })
}

{
  const cache = {
    table: { get() { return { identity: { createdAt: 1 }, rows: { harnessDesktopInsights: { ver: 1 } } } } },
    async put() { throw new Error('seeded histories must not be promoted') },
  }
  const migrated = await restoreLegacyInsightsCheckpoint(cache, {
    header: { id: 'session-1', version: 3, createdAt: 1, isSeeded: true },
  })
  assert.equal(migrated, false)
}
