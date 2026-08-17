function isFiniteNonnegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isTokenTotals(value) {
  return typeof value === 'object' && value !== null
    && isFiniteNonnegative(value.inputTokens)
    && isFiniteNonnegative(value.outputTokens)
    && isFiniteNonnegative(value.cacheReadTokens)
    && isFiniteNonnegative(value.cacheWriteTokens)
    && isFiniteNonnegative(value.reasoningTokens)
    && Number.isInteger(value.calls) && value.calls >= 0
}

function isRecord(value, accept) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(accept)
}

const usageInsightsSchema = {
  parse(value) {
    const valid = typeof value === 'object' && value !== null
      && isTokenTotals(value.totals)
      && (value.firstUsedAt === null || isFiniteNonnegative(value.firstUsedAt))
      && (value.lastUsedAt === null || isFiniteNonnegative(value.lastUsedAt))
      && isRecord(value.byDay, isTokenTotals)
      && isRecord(value.byModel, isTokenTotals)
      && isRecord(value.tools, item => Number.isInteger(item) && item >= 0)
    if (!valid) throw new TypeError('invalid Harness Insights projection value')
    return value
  },
}

function zeroTotals() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    calls: 0,
  }
}

function finiteNonnegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function usageOf(value) {
  if (typeof value !== 'object' || value === null) return undefined
  return {
    inputTokens: finiteNonnegative(value.inputTokens),
    outputTokens: finiteNonnegative(value.outputTokens),
    cacheReadTokens: finiteNonnegative(value.cacheReadTokens),
    cacheWriteTokens: finiteNonnegative(value.cacheWriteTokens),
    reasoningTokens: finiteNonnegative(value.reasoningTokens),
    calls: 1,
  }
}

function plus(left, right) {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    calls: left.calls + right.calls,
  }
}

function dayKey(time) {
  const date = new Date(time)
  if (!Number.isFinite(date.getTime())) return 'unknown'
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function modelKey(message) {
  const source = message?.source
  if (source?.kind !== 'model') return 'unknown / unknown'
  const provider = typeof source.provider === 'string' && source.provider.length > 0 ? source.provider : 'unknown'
  const model = typeof source.model === 'string' && source.model.length > 0 ? source.model : 'unknown'
  return `${provider} / ${model}`
}

export const usageInsightsProjectionDefinition = {
  key: 'harnessDesktopInsights',
  schema: usageInsightsSchema,
  stateVersion: 1,
  init: () => ({
    totals: zeroTotals(),
    firstUsedAt: null,
    lastUsedAt: null,
    byDay: {},
    byModel: {},
    tools: {},
  }),
  apply(state, event) {
    if (event.type === 'tool/call') {
      const name = typeof event.data?.name === 'string' && event.data.name.length > 0
        ? event.data.name
        : 'unknown'
      return { ...state, tools: { ...state.tools, [name]: (state.tools[name] ?? 0) + 1 } }
    }
    if (event.type !== 'assistant/message') return state
    const usage = usageOf(event.data?.usage)
    if (usage === undefined) return state
    const day = dayKey(event.time)
    const model = modelKey(event.data?.message)
    return {
      totals: plus(state.totals, usage),
      firstUsedAt: state.firstUsedAt === null ? event.time : Math.min(state.firstUsedAt, event.time),
      lastUsedAt: state.lastUsedAt === null ? event.time : Math.max(state.lastUsedAt, event.time),
      byDay: { ...state.byDay, [day]: plus(state.byDay[day] ?? zeroTotals(), usage) },
      byModel: { ...state.byModel, [model]: plus(state.byModel[model] ?? zeroTotals(), usage) },
      tools: state.tools,
    }
  },
  view(state) {
    return {
      totals: state.totals,
      firstUsedAt: state.firstUsedAt,
      lastUsedAt: state.lastUsedAt,
      byDay: state.byDay,
      byModel: state.byModel,
      tools: state.tools,
    }
  },
}

export const name = 'harness-desktop-insights'
export const inject = ['sessionProjections']

async function backfillHistory(ctx, signal) {
  const persistence = ctx.get('sessionPersistence')
  const cache = ctx.get('sessionProjectionCache')
  if (persistence === undefined || cache === undefined) return
  const snapshots = await persistence.listSnapshots(signal)
  // Serial reads avoid competing decompression of many JSONL/Zstd sessions.
  // The official projection cache owns incremental replay and durable
  // checkpoints, so a second startup reads only tails or nothing at all.
  for (const snapshot of snapshots) {
    signal.throwIfAborted()
    try {
      await cache.coldSnapshot(snapshot.header.id, signal)
    } catch (error) {
      if (signal.aborted) throw error
      ctx.logger.warn(`Harness Insights: history projection for "${snapshot.header.id}" failed: ${String(error)}`)
    }
  }
}

export function apply(ctx) {
  ctx.sessionProjections.register(usageInsightsProjectionDefinition)
  ctx.inject(['sessionPersistence', 'sessionProjectionCache'], child => {
    child.effect(() => {
      const controller = new AbortController()
      void backfillHistory(child, controller.signal).catch(error => {
        if (!controller.signal.aborted) child.logger.warn(`Harness Insights: history backfill failed: ${String(error)}`)
      })
      return () => controller.abort(new Error('Harness Insights stopped'))
    }, 'harness-insights: history projection backfill')
  })
}
