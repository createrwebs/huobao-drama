import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadAgentSkills } from '../src/agents/skills.js'

describe('Story Continuity Skills Integration', () => {
  describe('storyboard_breaker agent skills loading', () => {
    it('loads Thai continuity child skill with key continuity rules', async () => {
      const prompt = await loadAgentSkills('storyboard_breaker', 'th')

      assert.ok(prompt.includes('## Skill: storyboard-breaker/continuity'), 'Should inject continuity child skill section')
      assert.ok(prompt.includes('จุดเริ่มต้น (Initial State)'), 'Should enforce initial state requirement')
      assert.ok(prompt.includes('การกระทำหลักที่มองเห็นได้'), 'Should enforce single visible action requirement')
      assert.ok(prompt.includes('จุดสิ้นสุด (End State)'), 'Should enforce end state requirement')
      assert.ok(prompt.includes('ทิศทางสายตา (Gaze)'), 'Should enforce gaze / eyeline continuity lock')
      assert.ok(prompt.includes('กฎของภาพเฟรมแรก (First-Frame Rule)'), 'Should enforce first-frame initial state only rule')
      assert.ok(prompt.includes('replace_existing=true'), 'Should enforce destructive replace warning')
      assert.ok(prompt.includes('ห้ามคิดข้อเท็จจริงขึ้นเอง'), 'Should prevent hallucinating missing facts')
      assert.ok(prompt.includes('zenstory-ai/drama-skills'), 'Should maintain attribution')
    })

    it('falls back to English base skill when requested locale has no translation', async () => {
      const prompt = await loadAgentSkills('storyboard_breaker', 'en')

      assert.ok(prompt.includes('## Skill: storyboard-breaker/continuity'), 'Should inject continuity child skill section')
      assert.ok(prompt.includes('Initial State (Start)'), 'Should enforce initial state in English')
      assert.ok(prompt.includes('One Main Visible Action'), 'Should enforce single visible action in English')
      assert.ok(prompt.includes('End State (End)'), 'Should enforce end state in English')
      assert.ok(prompt.includes('Gaze & Eyelines'), 'Should enforce gaze continuity lock in English')
      assert.ok(prompt.includes('First-Frame Image Rule'), 'Should enforce first-frame starting state rule in English')
      assert.ok(prompt.includes('save_storyboards'), 'Should mention save_storyboards non-destructive caution')
      assert.ok(prompt.includes('zenstory-ai/drama-skills'), 'Should maintain attribution in fallback')
    })
  })

  describe('prompt_generator agent skills loading', () => {
    it('loads Thai video continuity child skill with key reference and format rules', async () => {
      const prompt = await loadAgentSkills('prompt_generator', 'th')

      assert.ok(prompt.includes('## Skill: prompt-generator/video-prompt/continuity'), 'Should inject video prompt continuity child skill section')
      assert.ok(prompt.includes('ตัวละคร: @ชื่อตัวละคร'), 'Should require native header format')
      assert.ok(prompt.includes('0-3s'), 'Should require 3-second timeline blocks')
      assert.ok(prompt.includes('8-15 วินาที'), 'Should preserve 8-15s segment length')
      assert.ok(prompt.includes('ห้ามเปลี่ยนจาก Image-to-Video (I2V) ไปเป็น Text-to-Video (T2V) โดยพลการ'), 'Should prohibit silent I2V to T2V fallback')
      assert.ok(prompt.includes('ข้อกำหนดจริงของโมเดลวิดีโอปลายทางมีสิทธิ์สูงสุด'), 'Should prioritize target model constraints')
      assert.ok(prompt.includes('zenstory-ai/drama-skills'), 'Should maintain attribution')
    })

    it('falls back to English base video continuity skill for non-Thai locales', async () => {
      const prompt = await loadAgentSkills('prompt_generator', 'ja')

      assert.ok(prompt.includes('## Skill: prompt-generator/video-prompt/continuity'), 'Should inject video prompt continuity child skill section')
      assert.ok(prompt.includes('@Character'), 'Should require native header format in English')
      assert.ok(prompt.includes('0-3s'), 'Should require 3s timeline format in English')
      assert.ok(prompt.includes('8–15 seconds'), 'Should retain native 8-15s segment duration')
      assert.ok(prompt.includes('Never silently convert an Image-to-Video (I2V) workflow to Text-to-Video (T2V)'), 'Should prohibit silent I2V to T2V fallback in English')
      assert.ok(prompt.includes('Distinguish Real References from Planned Prompts'), 'Should distinguish real refs from planned prompts')
      assert.ok(prompt.includes('zenstory-ai/drama-skills'), 'Should maintain attribution in fallback')
    })
  })

  describe('agent boundary isolation', () => {
    it('does not leak continuity child skills into extractor agent', async () => {
      const promptTh = await loadAgentSkills('extractor', 'th')
      const promptEn = await loadAgentSkills('extractor', 'en')

      assert.ok(!promptTh.includes('storyboard-breaker/continuity'), 'extractor must not have storyboard continuity')
      assert.ok(!promptTh.includes('prompt-generator/video-prompt/continuity'), 'extractor must not have video continuity')
      assert.ok(!promptEn.includes('storyboard-breaker/continuity'), 'extractor fallback must not have storyboard continuity')
      assert.ok(!promptEn.includes('prompt-generator/video-prompt/continuity'), 'extractor fallback must not have video continuity')
    })

    it('does not leak continuity child skills into script_rewriter agent', async () => {
      const promptTh = await loadAgentSkills('script_rewriter', 'th')
      const promptEn = await loadAgentSkills('script_rewriter', 'en')

      assert.ok(!promptTh.includes('storyboard-breaker/continuity'), 'script_rewriter must not have storyboard continuity')
      assert.ok(!promptTh.includes('prompt-generator/video-prompt/continuity'), 'script_rewriter must not have video continuity')
      assert.ok(!promptEn.includes('storyboard-breaker/continuity'), 'script_rewriter fallback must not have storyboard continuity')
      assert.ok(!promptEn.includes('prompt-generator/video-prompt/continuity'), 'script_rewriter fallback must not have video continuity')
    })
  })
})
