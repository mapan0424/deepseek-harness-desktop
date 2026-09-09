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
  stateSchema: usageInsightsSchema,
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
  wire: {
    viewSchema: usageInsightsSchema,
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
  },
}

export const name = 'deepseek-harness-insights'
export const inject = ['sessionProjections']

async function listHistorySnapshots(persistence, signal) {
  // DSH 0.1.5 moved session persistence to `list({ signal })`.
  // Keep the old branch so the standalone plugin remains usable with the
  // earlier desktop runtime too.
  if (typeof persistence.list === 'function') return persistence.list({ signal })
  if (typeof persistence.listSnapshots === 'function') return persistence.listSnapshots(signal)
  throw new TypeError('Harness Insights: session persistence does not expose a list API')
}

async function backfillSnapshot(persistence, cache, snapshot, signal) {
  // DSH <= 0.1.3 owned the persistence read inside the cache service.
  if (cache.coldSnapshot.length < 3) {
    return cache.coldSnapshot(snapshot.header.id, signal)
  }

  // DSH >= 0.1.5 deliberately makes the caller own the complete read so the
  // cache can verify the session lifecycle before replacing a checkpoint.
  const handle = await persistence.open(snapshot.header.id, 'read', { signal })
  try {
    const { events } = await handle.read(0, Number.MAX_SAFE_INTEGER, { signal })
    return cache.coldSnapshot(handle.header, handle.inheritedEventCount, events)
  } finally {
    await handle.close()
  }
}

// DSH 0.1.5 deliberately rejects some v0 logs containing the retired
// subagent descriptor v2. Those source logs stay untouched, but the previous
// projection cache already contains an integrity-bound aggregate produced from
// that exact lifecycle. For an unseeded session, promote only our own stable
// aggregate row after proving the predecessor cache belongs to this header.
//
// Do not promote any other projection: their semantics belong to DSH itself
// and must be rebuilt by the runtime when that becomes possible.
export async function restoreLegacyInsightsCheckpoint(cache, snapshot) {
  if (cache?.table === undefined || typeof cache.put !== 'function') return false

  const header = snapshot.header
  if (header.isSeeded || !Number.isInteger(header.version)) return false

  const record = cache.table.get(header.id)
  if (record === undefined || record.identity?.formatVersion !== undefined) return false
  if (record.identity.createdAt !== header.createdAt || record.identity.cwd !== header.cwd) return false

  const insights = record.rows?.harnessDesktopInsights
  if (insights?.ver !== usageInsightsProjectionDefinition.stateVersion) return false

  await cache.put(header.id, {
    formatVersion: header.version,
    createdAt: header.createdAt,
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
    isSeeded: false,
    inheritedEventCount: 0,
  }, {
    harnessDesktopInsights: insights,
  })
  return true
}

export async function backfillHistory(ctx, signal) {
  const persistence = ctx.get('sessionPersistence')
  const cache = ctx.get('sessionProjectionCache')
  if (persistence === undefined || cache === undefined) return
  const snapshots = await listHistorySnapshots(persistence, signal)
  // Serial reads avoid competing decompression of many JSONL/Zstd sessions.
  // The official projection cache owns incremental replay and durable
  // checkpoints, so a second startup reads only tails or nothing at all.
  for (const snapshot of snapshots) {
    signal.throwIfAborted()
    try {
      await backfillSnapshot(persistence, cache, snapshot, signal)
    } catch (error) {
      if (signal.aborted) throw error
      try {
        if (await restoreLegacyInsightsCheckpoint(cache, snapshot)) continue
      } catch (restoreError) {
        if (signal.aborted) throw restoreError
        ctx.logger.warn(`Harness Insights: legacy usage recovery for "${snapshot.header.id}" failed: ${String(restoreError)}`)
      }
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
