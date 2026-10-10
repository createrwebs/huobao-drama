---
name: continuity
description: Continuity and reference asset controls for video prompt generation
---

# Video Prompt Continuity & Reference Guidelines

Selective adaptation derived from zenstory-ai/drama-skills (commit c2426e03c0e7722bebcc6a488b6658dc38c65ac3, MIT License).
Existing native pipeline format, segment lengths, and tool contexts remain authoritative.

## 1. Native Format & Content Faithfulness
- Retain the native pipeline format:
  - Header line: `@Character (appearance, styling)`, `@Scene (lighting, geography)`, `; Props: @Prop (material, appearance).`
  - 3-second timeline blocks (`0-3s: ...`, `3-6s: ...`) covering the total segment duration (8–15 seconds, 2–4 subshots).
- Consume existing `description`, `duration`, and `result` faithfully. Do not invent new plot events, characters, or dialogue outside the storyboard description.
- Do not import upstream single-shot duration assumptions as a universal rule; respect the 8–15 second native segment structure.

## 2. Respect Target Model Constraints
- Actual supplied target model parameters take precedence.
- Never invent supported video lengths, audio features, or reference limits that the target model does not support.
- Translate emotional beats into visible, observable actions rather than literary abstraction.

## 3. Real Reference Assets vs. Text-to-Video
- **Distinguish Real References from Planned Prompts**:
  - Differentiate between actual available reference image assets and planned/placeholder references.
  - If required reference assets are missing, explicitly list the missing references.
  - **No Silent Fallback**: Never silently convert an Image-to-Video (I2V) workflow to Text-to-Video (T2V) without explicit user intent.
- **Authentic References Only**:
  - Prefer verified reference image context provided by the project.
  - Do not invent fake asset URLs or fabricated entity IDs.
