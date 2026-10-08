import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareAssetImagePrompt } from '../src/services/asset-image-prompt.js'

test('character reference includes full-body turnaround and preserves all asset details', () => {
  const details = 'Thai traveler in indigo cotton, scar above left eyebrow. ' + 'period clothing details; '.repeat(100)
  const prompt = prepareAssetImagePrompt(details, 'character')
  assert.ok(prompt.includes(details.trim()))
  assert.match(prompt, /exactly three equal-height full-body views/)
  assert.match(prompt, /Identical face, hairstyle, clothing/)
  assert.match(prompt, /override conflicting portrait framing/)
})
test('scene reference constraints override a conflicting beauty-portrait style', () => {
  const prompt = prepareAssetImagePrompt('Beauty portrait, shallow depth of field, golden hour; forest at dusk', 'scene')
  assert.ok(prompt.startsWith('Empty environment reference'))
  assert.match(prompt, /No people, faces, crowds/)
  assert.match(prompt, /not a beauty portrait, no portrait bokeh/)
  assert.match(prompt, /forest at dusk/)
})
test('prop reference is one complete object without hands or scenery', () => {
  assert.match(prepareAssetImagePrompt('Weathered wooden cup', 'prop'), /Exactly one complete object/)
  assert.match(prepareAssetImagePrompt('Weathered wooden cup', 'prop'), /No people, hands, faces/)
})
test('non-asset images keep their prompt unchanged', () => {
  assert.equal(prepareAssetImagePrompt('Storyboard action scene'), 'Storyboard action scene')
})