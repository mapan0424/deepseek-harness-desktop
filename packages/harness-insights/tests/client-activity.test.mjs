import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

let plugin
const context = {
  window: { __ModuleLoader__: { load(record) { plugin = record.factory(specifier => {
    if (specifier === 'react') return {}
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return {}
    throw new Error(`unexpected require: ${specifier}`)
  }) } } },
  document: {},
  navigator: { language: 'en' },
  Intl,
  Date,
  console,
}
vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), context)
assert.ok(plugin)

const zero = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, calls: 0 })
const now = new Date(2026, 7, 15, 12)
const key = '2026-08-15'
const usage = { ...zero(), inputTokens: 100, outputTokens: 20, calls: 1 }
const cal = plugin.calendar({ [key]: usage }, now)
assert.equal(cal.weeks.length, 53)
assert.equal(cal.weeks.every(week => week.days.length === 7), true)
assert.equal(cal.weeks.every(week => week.startDate.getDay() === 1), true, 'every week starts on Monday')
assert.equal(cal.weeks.at(-1).startDate.getTime(), new Date(2026, 7, 10, 12).getTime(), 'current week is the stable final column')
assert.deepEqual(Array.from(cal.months, item => String(item.label)), ['9', '10', '11', '12', '1', '2', '3', '4', '5', '6', '7', '8'])
assert.equal(cal.months.every((item, index, rows) => index === 0 || item.col > rows[index - 1].col), true)

const daily = plugin.modeCells(cal, 'daily')
assert.equal(daily.length, 53)
assert.equal(daily.every(week => week.length === 7), true)
assert.equal(daily.flat().filter(cell => cell.level > 0).length, 1)
assert.equal(daily.flat().find(cell => cell.key === key).level, 4, 'a sparse history must not jump to the darkest color')

const weekly = plugin.modeCells(cal, 'weekly')
const activeWeek = daily.findIndex(week => week.some(cell => cell.key === key))
assert.equal(weekly[activeWeek].filter(cell => cell.level > 0).length, 7, 'weekly mode uses the full column as an aggregate height')

const cumulative = plugin.modeCells(cal, 'cumulative')
const heights = cumulative.map(week => week.filter(cell => cell.level > 0).length)
assert.equal(heights.every((value, index) => index === 0 || value >= heights[index - 1]), true)
assert.equal(heights.at(-1), 7, 'cumulative mode reaches the full aggregate height')
assert.equal(Math.max(...cumulative.flat().map(cell => cell.level)), 4, 'sparse cumulative history uses a restrained color cap')

console.log('Harness Insights activity-grid tests passed.')
