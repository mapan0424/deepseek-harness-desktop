import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

assert.equal(manifest.name, '@anarkhgatsby/deepseek-harness-insights')
assert.equal(manifest.version, '0.1.3')
assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
assert.equal(manifest.dsh?.client?.platform, 'web')
assert.equal(manifest.repository?.url, 'https://github.com/mapan0424/deepseek-harness-insights.git')
assert.ok(manifest.files.includes('cordis.patch.yml'))
assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-session-projection'], '^0.1.1-rc.2')
assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-client-connection'], '^0.1.1-rc.2')
assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-client-locale'], '^0.1.1-rc.2')

console.log('Harness Insights bundle manifest test passed.')
