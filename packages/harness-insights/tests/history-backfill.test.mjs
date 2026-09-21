import assert from 'node:assert/strict'
import { restoreLegacyInsightsCheckpoint } from '../lib/index.js'

const legacyRow = { ver: 1, seq: 42, val: { totals: { inputTokens: 10 } } }
const calls = []
const cache = {
  table: {
    get(id) {
      calls.push(['get', id])
      return {
        identity: { createdAt: 1, cwd: '/workspace' },
        rows: { harnessDesktopInsights: legacyRow },
      }
    },
  },
  async put(id, identity, rows) {
    calls.push(['put', id, identity, rows])
  },
}

const migrated = await restoreLegacyInsightsCheckpoint(cache, {
  header: { id: 'session-1', version: 3, createdAt: 1, cwd: '/workspace', isSeeded: false },
})

assert.equal(migrated, true)
assert.deepEqual(calls[1][2], {
  formatVersion: 3,
  createdAt: 1,
  cwd: '/workspace',
  isSeeded: false,
  inheritedEventCount: 0,
})
assert.deepEqual(calls[1][3], { harnessDesktopInsights: legacyRow })
console.log('Harness Insights legacy cache recovery tests passed.')
