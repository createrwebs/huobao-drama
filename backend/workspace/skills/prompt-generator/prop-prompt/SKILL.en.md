---
name: prop-prompt
description: Final prop prompt specification — white-background single-item still life, standard product-photography viewpoint: accurate proportions, complete edges, background carries no narrative
---

# Final Prop Prompt (white-background single item · standard product photography)

What is generated is a white-background product shot: **using a standard product-photography viewpoint**, the frame contains only the prop itself, placed in isolation on a pure white background, **with no other elements mixed in** — no other objects, no people, no scene environment, no hands holding it.

Three hard requirements:
1. **Accurate proportions of all parts of the item** — no exaggeration, distortion, or stylized stretching; the prop's relative size relationships must be true
2. **Complete edges** — the prop is fully in frame as a whole, with margins on all sides; no part may be cropped by the frame edge
3. **The background carries no narrative content** — the pure white background is only a backing, with no sense of place, no plot hints, no decorative elements

## Output Structure (assemble a single coherent passage in this order, following the session language directive)

```
Single-item product shot, standard product-photography viewpoint,
[prop name + material/color/shape/size + degree of wear and damage details];
accurate proportions of all parts, placed in isolation on a pure white background,
centered and fully in frame, edges complete with no cropping;
background clean and carrying no narrative content, no other objects, no people, no scene;
soft even studio light, faint shadows, high detail
```

## Generation Rules

- Build around the prop's `name` and `description` (physical appearance): material, color, shape, size, degree of wear, signs of damage, and other physical details must be **carried through item by item** — they are the source of the prop's recognizability
- Standard product-photography viewpoint: a slightly high-angle 3/4 view (showing both the top and a side for maximum dimensionality); flat props (paper, ID cards, photos) use a straight top-down flat lay
- Present the single item centered and complete, with margins on all sides, accurate proportions, complete edges — do not crop the prop's body
- Soft even studio light, faint shadows, high detail
- Describe only the item itself; do not mention plot, characters, or usage (neither the background nor the frame carries narrative content)
- Do not mix unrelated words into the output; **do not** use "cinematic quality"-type words (a prop image is a product shot, not a film still)

## Prohibitions

- Hands holding it, people, other objects, or scene environment in frame
- Packaging, bases, display stands (unless they are part of the prop itself)
- Text, watermarks, signatures (text and graphics printed on the prop itself may be kept and described)
- Environmental reflections, colored light
- Exaggerated perspective, distortion, proportion errors, edge cropping

## Saving

Call `save_prop_final_prompt`: the prompt parameter contains no style words — **the project's visual style is automatically injected by the tool at the very front of the final prompt**.

## Image-generation reliability / ความถูกต้องก่อนส่งสร้างภาพ

- The asset specification has higher priority than generic project style. Use project style for rendering/materials/colors, never to replace the required layout, white background, neutral studio light, or empty-environment composition.
- Put layout and subject constraints FIRST, then identity/period/material details. End with the core background, consistency and no-text constraints again. Write a concise coherent prompt without omitting identifying details.
- Do not append Midjourney/CLI switches such as `--ar`, `--v`, `--style`, or model names. Aspect ratio and model are separate API parameters.
- Do not add decorative headings, numbered labels, visible names, subtitles, borders or watermarks to the generated image.
- Character: exactly one identity repeated across the face close-up and three full-body front/side/back views, not a group of different people. Match wardrobe in every view; keep hands empty and any required accessories worn/secured, not held in an action pose. Do not replace the reference sheet with a half-body poster.
- Scene: ignore portrait/skin/beauty/hair terms in generic style; use a single empty wide establishing view, with readable foreground/midground/background and the scene's own time-of-day lighting. No humans, human shadows or reflections. Outdoor settings must not invent walls or doors that do not exist.
- Prop: one complete isolated object on pure white; no human hands, extra products or environment. Material and wear must match the story period.
- Before saving, verify that the selected asset ID and all appearance/wardrobe/material facts come from the read tool. Do not invent celebrity likenesses, beauty transformations or modern items absent from the source.
