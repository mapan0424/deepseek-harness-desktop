import assert from 'node:assert/strict'
import { backfillHistory } from '../lib/index.js'

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
