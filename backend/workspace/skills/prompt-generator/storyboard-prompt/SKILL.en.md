---
name: storyboard-prompt
description: Storyboard 2x3 Grid Prompt Specification — Generate a 6-panel sequential cinematic storyboard grid (2x3 Storyboard Grid) using prepared scene, character, and prop reference images for visual consistency
---

# Storyboard 2x3 Grid Prompt Specification (6 Sequential Cinematic Panels)

The visual prompt for each storyboard shot is a **single 2x3 storyboard grid (6 sequential cinematic panels in one composite image)**.
It illustrates the chronological progression of camera angles, character actions, emotional beats, and prop interactions within the scene while strictly maintaining visual consistency with reference images.

## Standard Prompt Structure

The prompt must start with the 2x3 grid header specifying the cinematic shooting style, lighting atmosphere, and main character consistency, followed by sequential panel breakdowns from Panel 1 to Panel 6:

```
Create a single 2x3 storyboard grid containing 6 sequential cinematic panels, shot on [visual style / 35mm film], [aesthetic, color grading & lighting]. High consistency in the main character: [character identity, key appearance & outfit]. No text, no captions, no borders.
- Panel 1: [Camera shot type & angle]. [Description of opening beat / setting the scene & character state].
- Panel 2: [Camera shot type & angle]. [Action progression / movement or key interaction].
- Panel 3: [Camera shot type & angle]. [Emotional reaction, detail close-up or conflict point].
- Panel 4: [Camera shot type & angle]. [New perspective / movement down the space or environment tension].
- Panel 5: [Camera shot type & angle]. [Over-the-shoulder or discovery moment / key story turn].
- Panel 6: [Camera shot type & angle]. [Climactic beat of this segment / immediate consequence & expression].
```

## Reference Example

```
Create a single 2x3 storyboard grid containing 6 sequential cinematic panels, shot on 35mm film, cyberpunk aesthetic, neon blue and orange color grading. High consistency in the main character: a young female explorer wearing a glowing white tech-jacket. No text, no captions, no borders.
- Panel 1: Extreme wide shot. The female explorer stands at the edge of a massive, foggy neon metropolis at dusk.
- Panel 2: Medium shot. She pulls up a glowing holographic map from her wrist device, illuminating her face.
- Panel 3: Close-up shot. Her eyes widen as she spots a hidden coordinates flashing red on the holographic screen.
- Panel 4: Low angle shot. She walks down a dark, rain-slicked alleyway flanked by humming server towers.
- Panel 5: Over-the-shoulder shot. She discovers a massive, rusted vault door hidden behind hanging wires.
- Panel 6: Medium close-up. The vault door hinges hiss open, casting a bright golden light over her amazed face.
```

## Rules & Guidelines

1. **Header**:
   - Must strictly begin with: `Create a single 2x3 storyboard grid containing 6 sequential cinematic panels`.
   - Specify film texture (e.g., `shot on 35mm film`) and scene atmosphere/lighting (e.g., `neon blue and orange color grading`).
   - Specify subject consistency (e.g., `High consistency in the main character: [character identity & key outfit]`).
   - Must conclude with: `No text, no captions, no borders.` to prevent subtitles, text overlays, or borders.

2. **Panel 1 to Panel 6 Sequence**:
   - Deconstruct the storyboard `description` (such as 【Shot 1】, 【Shot 2】) into 6 cinematic, sequential story beats.
   - Every panel must begin with a standard camera shot type and angle in English, such as:
     - `Extreme wide shot`, `Wide shot`, `Establishing shot`
     - `Medium shot`, `Medium close-up shot`
     - `Close-up shot`, `Extreme close-up shot`
     - `Low angle shot`, `High angle shot`, `Over-the-shoulder shot`, `Dutch angle shot`
   - Follow immediately with physical actions, expressions, and environmental/prop interaction.

3. **Multi-Modal Reference Image Integration**:
   - The system attaches prepared **Scene**, **Character**, and **Prop** reference images alongside this prompt.
   - The prompt must harmonize with the reference visuals so the model preserves identical faces, wardrobe, and environments across all 6 panels.

4. **Saving**:
   - Call `update_storyboard` with `storyboard_id` and the generated `image_prompt`.
