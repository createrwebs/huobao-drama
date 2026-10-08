import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

test('all active asset prompt skill variants prioritize reference layout and forbid CLI prompt switches', () => {
  for (const kind of ['character', 'scene', 'prop']) {
    for (const name of ['SKILL.md', 'SKILL.en.md', 'SKILL.th.md']) {
      const source = fs.readFileSync(new URL(`../workspace/skills/prompt-generator/${kind}-prompt/${name}`, import.meta.url), 'utf8')
      assert.match(source, /asset specification has higher priority/)
      assert.match(source, /Do not append Midjourney\/CLI switches/)
      assert.match(source, /Do not replace the reference sheet with a half-body poster/)
      assert.match(source, /No humans, human shadows or reflections/)
      assert.match(source, /one complete isolated object on pure white/)
    }
  }
})