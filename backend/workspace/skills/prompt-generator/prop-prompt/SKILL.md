---
name: prop-prompt
description: 道具最终提示词规范 — 白底单品静物，标准产品摄影视角：比例准确、边缘完整、背景不承载叙事
---

# 道具最终提示词（白底单品 · 标准产品摄影）

生成的是一张白底单品图（product shot）：**采用标准产品摄影视角**，画面中只有道具本身，孤立放置在纯白背景上，**不掺杂任何其他元素**——没有其他物品、没有人物、没有场景环境、没有手部持握。

三条硬性要求：
1. **物品各部分比例准确**——不要夸张、变形或风格化拉伸，道具的相对尺寸关系必须真实
2. **边缘完整**——道具整体完整入镜，四周留白，任何部分都不得被画面边缘裁切
3. **背景不承载任何叙事内容**——纯白背景只是衬底，不带场景感、不带情节暗示、不带装饰元素

## 输出结构（按此顺序组装单段连贯描述，语言跟随会话语言指令）

```
单品产品图，标准产品摄影视角，[道具名 + 材质/颜色/形状/大小 + 新旧程度与磨损细节]，
物品各部分比例准确，孤立放置在纯白背景上，居中完整入镜，边缘完整无裁切，
背景纯净不承载任何叙事内容，无其他物品、无人物、无场景，
柔和均匀的影棚光，轻淡阴影，高细节
```

## 生成规则

- 以道具 `name`（名称）与 `description`（物品外貌）为核心：材质、颜色、形状、大小、新旧程度、磨损痕迹等物理细节**逐项落地**，这是道具辨识度的来源
- 标准产品摄影视角：微俯视 3/4 视角（同时看清顶面与侧面，最有立体感）；扁平道具（纸张、证件、照片）用正俯视平铺
- 单品居中完整呈现，四周留白，比例准确、边缘完整，不要裁切道具主体
- 柔和均匀的影棚光，阴影轻淡，高细节
- 只描写物品本身，不要提及剧情、角色或用途（背景与画面都不承载叙事内容）
- 输出使用会话语言指令指定的目标语言，不要混入无关词汇；**不要**"电影质感"类词汇（道具图是产品图不是剧照）

## 禁止事项

- 手部持握、人物、其他物品、场景环境入镜
- 包装、底座、展示架（除非它就是道具本体的一部分）
- 文字、水印、签名（道具本体上印刷的文字图案可以保留并描述）
- 环境反光、彩色光
- 夸张透视、变形、比例失真、边缘裁切

## 保存

调用 `save_prop_final_prompt`：prompt 参数不含风格词，**项目视觉风格由工具自动注入到最终提示词的最前方**。

## Image-generation reliability / ความถูกต้องก่อนส่งสร้างภาพ

- The asset specification has higher priority than generic project style. Use project style for rendering/materials/colors, never to replace the required layout, white background, neutral studio light, or empty-environment composition.
- Put layout and subject constraints FIRST, then identity/period/material details. End with the core background, consistency and no-text constraints again. Write a concise coherent prompt without omitting identifying details.
- Do not append Midjourney/CLI switches such as `--ar`, `--v`, `--style`, or model names. Aspect ratio and model are separate API parameters.
- Do not add decorative headings, numbered labels, visible names, subtitles, borders or watermarks to the generated image.
- Character: exactly one identity repeated across the face close-up and three full-body front/side/back views, not a group of different people. Match wardrobe in every view; keep hands empty and any required accessories worn/secured, not held in an action pose. Do not replace the reference sheet with a half-body poster.
- Scene: ignore portrait/skin/beauty/hair terms in generic style; use a single empty wide establishing view, with readable foreground/midground/background and the scene's own time-of-day lighting. No humans, human shadows or reflections. Outdoor settings must not invent walls or doors that do not exist.
- Prop: one complete isolated object on pure white; no human hands, extra products or environment. Material and wear must match the story period.
- Before saving, verify that the selected asset ID and all appearance/wardrobe/material facts come from the read tool. Do not invent celebrity likenesses, beauty transformations or modern items absent from the source.
