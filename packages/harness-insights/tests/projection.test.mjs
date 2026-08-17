import assert from 'node:assert/strict'
import { usageInsightsProjectionDefinition as def } from '../lib/index.js'

const assistant = (time, provider, model, usage) => ({
  type: 'assistant/message',
  time,
  data: {
    turn: 1,
    step: 1,
    message: { source: { kind: 'model', provider, model }, content: [] },
    usage,
  },
})

let state = def.init()
const untouched = def.apply(state, { type: 'user/message', time: 1, data: {} })
assert.equal(untouched, state, 'unrelated events preserve reference identity')

state = def.apply(state, assistant(
  new Date(2026, 7, 15, 10).getTime(),
  'deepseek',
  'deepseek-chat',
  { inputTokens: 100, outputTokens: 20, cacheReadTokens: 300, cacheWriteTokens: 10, reasoningTokens: 5 },
))
state = def.apply(state, assistant(
  new Date(2026, 7, 15, 11).getTime(),
  'deepseek',
  'deepseek-chat',
  { inputTokens: 40, outputTokens: 8 },
))
state = def.apply(state, assistant(
  new Date(2026, 7, 16, 9).getTime(),
  'openai',
  'gpt-test',
  { inputTokens: -1, outputTokens: Number.NaN, cacheReadTokens: 12 },
))
state = def.apply(state, { type: 'tool/call', time: 4, data: { name: 'browser', callId: 'x' } })
state = def.apply(state, { type: 'tool/call', time: 5, data: { name: 'browser', callId: 'y' } })
state = def.apply(state, { type: 'tool/call', time: 6, data: { name: 'bash', callId: 'z' } })

const view = def.view(state)
assert.deepEqual(view.totals, {
  inputTokens: 140,
  outputTokens: 28,
  cacheReadTokens: 312,
  cacheWriteTokens: 10,
  reasoningTokens: 5,
  calls: 3,
})
assert.equal(view.byModel['deepseek / deepseek-chat'].calls, 2)
assert.equal(view.byModel['openai / gpt-test'].cacheReadTokens, 12)
assert.equal(view.byDay['2026-08-15'].calls, 2)
assert.equal(view.byDay['2026-08-16'].calls, 1)
assert.deepEqual(view.tools, { browser: 2, bash: 1 })
assert.deepEqual(def.schema.parse(view), view)

console.log('Harness Insights projection tests passed.')
