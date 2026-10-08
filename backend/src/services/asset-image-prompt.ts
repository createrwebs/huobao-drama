export type AssetImageKind = 'character' | 'scene' | 'prop'

/** Layout and subject constraints outrank generic project style directions. */
export function prepareAssetImagePrompt(prompt: string, kind?: AssetImageKind): string {
  if (!kind) return prompt
  const constraints: Record<AssetImageKind, string> = {
    character: 'Character reference sheet on a pure white seamless background: left frontal head-and-shoulders close-up; right exactly three equal-height full-body views of the SAME character, front, 90-degree side and back. Neutral A-pose, heads and soles aligned, entire bodies including feet visible. Identical face, hairstyle, clothing and accessories in every view; not multiple different people. Soft even studio lighting, all views in sharp focus. No text, captions, labels, borders or watermark.',
    scene: 'Empty environment reference, a single fixed-camera wide establishing shot. Foreground, midground and background in clear focus, readable continuous spatial layout and entrances/exits. No people, faces, crowds, human silhouettes or reflections, portraits or character close-ups. Preserve the described location, period, time and environmental lighting; not a beauty portrait, no portrait bokeh. No text or watermark.',
    prop: 'Single isolated prop reference on a pure white seamless background. Exactly one complete object, centered with space around its edges, realistic proportions and clearly visible material and details. Soft even studio lighting, entire object in sharp focus. No people, hands, faces, additional objects, scenery, text or watermark.',
  }
  return `${constraints[kind]}\n\nAsset details and project rendering style:\n${prompt.trim()}\n\nPriority: the reference layout, subject count, background and lighting instructions above override conflicting portrait framing, beauty styling, shallow depth of field, background or lighting directions in the project style. Preserve the asset's described identity, period, wardrobe, materials and colors.`
}