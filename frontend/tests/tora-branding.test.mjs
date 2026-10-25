import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settingsSource } from './helpers/settings-harness.mjs'

const oldBrand = /huobao|firemux|火宝|화바오|휘바오/i
function strings(value) {
  return typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []
}

test('every locale brands visible text as ToraAPI and translates all auth controls', () => {
  const keys = [...new Set([...settingsSource.matchAll(/settings\.ai\.(tabTora|tora\w+)/g)].map(match => match[1]))]
  const files = readdirSync(new URL('../app/locales/', import.meta.url)).filter(file => file.endsWith('.json'))
  assert.ok(keys.length > 5)
  for (const file of files) {
    const locale = JSON.parse(readFileSync(new URL(`../app/locales/${file}`, import.meta.url), 'utf8'))
    assert.equal(locale.app.title, 'ToraAPI', file)
    for (const text of strings(locale)) assert.doesNotMatch(text, oldBrand, file)
    for (const key of keys) assert.ok(locale.settings.ai[key]?.trim(), `${file}: missing ${key}`)
    assert.match(locale.tour.settings.quick.desc, /ToraAPI/)
    assert.doesNotMatch(locale.tour.settings.quick.desc, /three|3 設定|3종|三条|ทั้งสาม|connectivity testing/)
  }
})

test('header, document title and frontend manifest use ToraAPI', () => {
  const layout = readFileSync(new URL('../app/layouts/default.vue', import.meta.url), 'utf8')
  const config = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  assert.match(layout, /t\('app\.title'\)/)
  assert.doesNotMatch(layout, />[^<]*(Huobao|Firemux|火)[^<]*</i)
  assert.match(config, /title: 'ToraAPI'/)
  assert.equal(pkg.name, 'toraapi-frontend')
  assert.equal(lock.name, pkg.name)
  assert.equal(lock.packages[''].name, pkg.name)
})
