---
name: character-prompt
description: Final character prompt specification — front-face close-up + three-view turnaround (front / 90-degree side / back), serving as the appearance anchor for all subsequent generation
---

# Final Character Prompt (left: front-face close-up + right: three-view turnaround)

What is generated is a character reference sheet with a fixed composition:

- **Left: front-face close-up** — a frontal close view of head and shoulders, with facial features, hairstyle, and skin texture clearly visible, serving as the anchor for facial recognizability
- **Right: three equal-height full-body views side by side — front, 90-degree side, and back** — three full-body views of the same character at equal height, with the tops of the heads and the soles of the feet aligned

**Core principle: consistency > beauty.** This image is the appearance anchor for all subsequent character images and video references; it must be neutral, clear, and reusable — do not pursue the artistry of a single image.

## Output Structure (assemble a single coherent passage in this order, following the session language directive)

```
Character reference sheet, left side a front-face close-up, right side three equal-height full-body views
side by side showing front, 90-degree side, and back;
the close-up and the full-body views are the same character, full body in frame, neutral A-pose,
the three full-body views equal in height, side by side, tops of heads and soles of feet aligned;
[age impression + gender impression + physique], [facial features], [hairstyle], [clothing + accessories];
the face, hairstyle, and clothing of the front-face close-up and the three views are completely identical;
pure white background, soft even lighting, cinematic quality
```

## Description Order Rules

Put the **most recognizable features first**, covering every key element of `appearance` (looks) and `styling` (hair/clothing/makeup) in this order, with no omissions:

1. Identity anchors: age impression (e.g. "early twenties"), gender impression, physique (height and build, posture habits)
2. Facial features: face shape, eyes, other notable features (scars, moles, glasses, etc.) — the front-face close-up depends on this part especially
3. Hairstyle: color, length, style
4. Clothing: style, color, material, condition (e.g. "a wrinkled work uniform with solder marks on the cuffs")
5. Accessories: write only the recognizable ones; do not pile them on

Convert the character's personality traits into outward bearing and expression descriptions (e.g. "haggard" → "weary eyes, slightly slumped shoulders"); personality words must not appear directly.

## Composition & Consistency

- Left front-face close-up: facing the camera directly, neutral expression, head to shoulders fully in frame
- Right three full-body views: front, 90-degree side, and back of the same character, **equal in height, side by side, evenly spaced**, tops of heads and soles of feet on the same horizontal lines
- The close-up and the three full-body views must have the same face, the same hairstyle, and the same clothing — explicitly state "the face, hairstyle, and clothing of the front-face close-up and the three full-body views are completely identical"
- Neutral stance, natural expression — easy to reuse as a reference image
- Soft, even studio lighting; no dramatic light and shadow (the reference image must work in every kind of scene)
- Do not mix unrelated words into the output

## Prohibitions

- Dynamic poses, exaggerated expressions, props in hand, being in frame with other people
- Cropping the body (full-body views must be full body, head to soles fully in frame; the close-up must have head and shoulders fully in frame)
- Text, labels, watermarks, signatures
- Heavy shadows, colored background lighting, background props

## Saving

Call `save_character_final_prompt`: the prompt parameter contains no style words — **the project's visual style is automatically injected by the tool at the very front of the final prompt**.

## Image-generation reliability / ความถูกต้องก่อนส่งสร้างภาพ

- The asset specification has higher priority than generic project style. Use project style for rendering/materials/colors, never to replace the required layout, white background, neutral studio light, or empty-environment composition.
- Put layout and subject constraints FIRST, then identity/period/material details. End with the core background, consistency and no-text constraints again. Write a concise coherent prompt without omitting identifying details.
- Do not append Midjourney/CLI switches such as `--ar`, `--v`, `--style`, or model names. Aspect ratio and model are separate API parameters.
- Do not add decorative headings, numbered labels, visible names, subtitles, borders or watermarks to the generated image.
- Character: exactly one identity repeated across the face close-up and three full-body front/side/back views, not a group of different people. Match wardrobe in every view; keep hands empty and any required accessories worn/secured, not held in an action pose. Do not replace the reference sheet with a half-body poster.
- Scene: ignore portrait/skin/beauty/hair terms in generic style; use a single empty wide establishing view, with readable foreground/midground/background and the scene's own time-of-day lighting. No humans, human shadows or reflections. Outdoor settings must not invent walls or doors that do not exist.
- Prop: one complete isolated object on pure white; no human hands, extra products or environment. Material and wear must match the story period.
- Before saving, verify that the selected asset ID and all appearance/wardrobe/material facts come from the read tool. Do not invent celebrity likenesses, beauty transformations or modern items absent from the source.
