import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

assert.equal(manifest.name, '@anarkhgatsby/deepseek-harness-insights')
assert.equal(manifest.version, '0.1.2')
assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
assert.equal(manifest.dsh?.client?.platform, 'web')
assert.equal(manifest.repository?.url, 'https://github.com/mapan0424/deepseek-harness-insights.git')
assert.ok(manifest.files.includes('cordis.patch.yml'))

console.log('Harness Insights bundle manifest test passed.')
