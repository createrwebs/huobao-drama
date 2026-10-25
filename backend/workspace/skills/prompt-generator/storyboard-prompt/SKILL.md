---
name: storyboard-prompt
description: 分镜 2x3 Storyboard Grid 提示词规范 — 生成 6 格连续电影镜头画板（2x3 Storyboard Grid），结合已准备的场景、角色、道具参考图，保持视觉与角色高度一致性
---

# 分镜 2x3 Storyboard Grid 提示词规范 (6 Sequential Cinematic Panels)

每个分镜的画面提示词为 **单张 2x3 画板网格（6 格连续电影叙事镜头，集成在同一张图内）**。
旨在展现该分镜段落内机位视角、动作演进、神态情绪与关键道具交互的时间序列进程，并严格保持角色与场景的一致性。

## 标准提示词结构 (Standard Prompt Structure)

提示词必须以 2x3 镜头网格定义开头，指定电影拍摄质感、光影色调及主角一致性约束，紧接着列出 Panel 1 至 Panel 6 依序递进的镜头描述：

```
Create a single 2x3 storyboard grid containing 6 sequential cinematic panels, shot on [visual style / 35mm film], [aesthetic, color grading & lighting]. High consistency in the main character: [character identity, key appearance & outfit]. No text, no captions, no borders.
- Panel 1: [Camera shot type & angle]. [Description of opening beat / setting the scene & character state].
- Panel 2: [Camera shot type & angle]. [Action progression / movement or key interaction].
- Panel 3: [Camera shot type & angle]. [Emotional reaction, detail close-up or conflict point].
- Panel 4: [Camera shot type & angle]. [New perspective / movement down the space or environment tension].
- Panel 5: [Camera shot type & angle]. [Over-the-shoulder or discovery moment / key story turn].
- Panel 6: [Camera shot type & angle]. [Climactic beat of this segment / immediate consequence & expression].
```

## 参考示例 (Reference Example)

```
Create a single 2x3 storyboard grid containing 6 sequential cinematic panels, shot on 35mm film, cyberpunk aesthetic, neon blue and orange color grading. High consistency in the main character: a young female explorer wearing a glowing white tech-jacket. No text, no captions, no borders.
- Panel 1: Extreme wide shot. The female explorer stands at the edge of a massive, foggy neon metropolis at dusk.
- Panel 2: Medium shot. She pulls up a glowing holographic map from her wrist device, illuminating her face.
- Panel 3: Close-up shot. Her eyes widen as she spots a hidden coordinates flashing red on the holographic screen.
- Panel 4: Low angle shot. She walks down a dark, rain-slicked alleyway flanked by humming server towers.
- Panel 5: Over-the-shoulder shot. She discovers a massive, rusted vault door hidden behind hanging wires.
- Panel 6: Medium close-up. The vault door hinges hiss open, casting a bright golden light over her amazed face.
```

## 编写规则与规范 (Rules & Guidelines)

1. **信息头 (Header)**:
   - 必须强制以 `Create a single 2x3 storyboard grid containing 6 sequential cinematic panels` 开头。
   - 指明胶片质感（如 `shot on 35mm film`）与分镜氛围光线（如 `neon blue and orange color grading`）。
   - 指明主角一致性约束（如 `High consistency in the main character: [character identity & outfit]`）。
   - 必须以 `No text, no captions, no borders.` 结尾，坚决避免画面生成任何台词水印或粗白黑边框。

2. **Panel 1 至 Panel 6 镜头序列**:
   - 将分镜 `description` 中的【镜头1】、【镜头2】等情节拆解或平滑推进为 6 个富有电影节奏的连续画面。
   - 每个 Panel 必须以标准英文景别与机位角度开头，例如：
     - `Extreme wide shot`, `Wide shot`, `Establishing shot`
     - `Medium shot`, `Medium close-up shot`
     - `Close-up shot`, `Extreme close-up shot`
     - `Low angle shot`, `High angle shot`, `Over-the-shoulder shot`, `Dutch angle shot`
   - 紧接着描述该格人物的具体微动作、眼神视线、肢体状态及道具交互。

3. **多模态参考图协同 (Reference Images)**:
   - 系统会将预先准备好的 **场景图 (Scene)**、**角色图 (Character)**、**道具图 (Prop)** 作为参考图连同本提示词提交生图模型。
   - 提示词应与参考图中的人物外貌特征及场景基调紧密呼应，确保 6 格画面的面容、服饰、环境高度统一。

4. **保存方式**:
   - 调用 `update_storyboard` 工具，传入参数 `storyboard_id` 以及生成的 `image_prompt`。
