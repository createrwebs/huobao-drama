#!/usr/bin/env python3
"""
generate_drama_script.py
สคริปต์สร้างบทละครสั้นและแตก Prompt พร้อมคุม Character Reference สำหรับ Google Flow
"""

import os
import sys
import json
import argparse

def generate_with_gemini(prompt_topic: str, api_key: str):
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=api_key)
        
        system_instruction = """
คุณคือผู้กำกับและผู้เขียนบทละครสั้น AI ระดับมืออาชีพ หน้าที่ของคุณคือสร้างบทละครสั้นที่มีความยาว 3-5 ซีน
โดยต้องควบคุมความต่อเนื่องของตัวละคร (Character Consistency) สำหรับนำไปใช้ใน Google Flow (โมเดล Veo + Imagen)

กฎสำคัญ:
1. กำหนดตัวละครหลัก 1-2 ตัว พร้อมตั้งชื่อแท็ก เช่น @Danai, @Ploy
2. สร้างรายละเอียดรูปพรรณ (Visual Seed Description) ที่ชัดเจนและคงที่
3. แต่ละซีนต้องมีแท็กตัวละคร เช่น @Danai ใน video_prompt เสมอ
4. กำหนดมุมกล้อง แสง และการเคลื่อนไหวตามสไตล์ภาพยนตร์ (Cinematic camera tracking, 4k, realistic physics)
5. คืนค่าผลลัพธ์เป็น JSON ตามโครงสร้างนี้เท่านั้น (ห้ามมี markdown หรือคำอธิบายอื่นนอกเหนือจาก JSON):

{
  "title": "ชื่อเรื่อง",
  "characters": [
    {
      "tag": "@CharacterName",
      "description": "คำอธิบายรูปร่างหน้าตา ชุด และบุคลิกภาพภาษาอังกฤษสำหรับเป็น Reference"
    }
  ],
  "scenes": [
    {
      "scene_id": 1,
      "character": "@CharacterName",
      "prompt": "@CharacterName [การกระทำและฉากหลังเป็นภาษาอังกฤษอย่างละเอียดพร้อมระบุ cinematic lighting / camera movement]",
      "dialogue": "บทพูดภาษาไทยสั้นๆ",
      "duration": 5
    }
  ]
}
"""
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"สร้างบทละครสั้นในหัวข้อ: {prompt_topic}",
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"⚠️ เกิดข้อผิดพลาดในการเรียก Gemini API: {e}", file=sys.stderr)
        return None

def create_sample_script(topic: str):
    """Fallback generator สร้างโครงบทคุณภาพสูงเมื่อไม่มี API Key"""
    return {
        "title": f"ละครสั้น: {topic}",
        "characters": [
            {
                "tag": "@Danai",
                "description": "Thai male detective, 35 years old, sharp jawline, short black messy hair, wearing beige long trench coat and wet dark trousers, intense observant eyes, cinematic realism"
            }
        ],
        "scenes": [
            {
                "scene_id": 1,
                "character": "@Danai",
                "prompt": "@Danai walking alone down a dark rain-soaked Bangkok alley at midnight, neon reflection in puddles, cinematic slow-motion camera tracking front view, 4k photorealistic",
                "dialogue": "คืนนี้... มีบางอย่างผิดปกติเกิดขึ้นในเงามืด",
                "duration": 5
            },
            {
                "scene_id": 2,
                "character": "@Danai",
                "prompt": "Extreme close-up of @Danai finding a glowing encrypted microchip on the wet pavement, dynamic cinematic lighting, rain dripping from his hair",
                "dialogue": "นี่มัน... หลักฐานชิ้นสำคัญที่ทุกคนตามหา",
                "duration": 5
            },
            {
                "scene_id": 3,
                "character": "@Danai",
                "prompt": "@Danai looking back abruptly as black car headlights suddenly shine directly on him, dramatic volumetric light, cinematic action movie frame",
                "dialogue": "พวกมันมาถึงแล้ว!",
                "duration": 5
            }
        ]
    }

def main():
    parser = argparse.ArgumentParser(description="Generate Drama Script for Google Flow Auto-Pilot")
    parser.add_argument("topic", nargs="?", default="สืบสวนคดีลับในคืนฝนตก", help="หัวข้อหรือธีมของบทละครสั้น")
    parser.add_argument("--out", default="drama_script.json", help="ชื่อไฟล์ JSON ปลายทาง")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    script = None

    if api_key:
        print(f"✨ กำลังสร้างบทละครด้วย Gemini AI ในหัวข้อ: '{args.topic}'...")
        script = generate_with_gemini(args.topic, api_key)

    if not script:
        print(f"💡 กำลังสร้างโครงบทละครมาตรฐานสำหรับ Google Flow ในหัวข้อ: '{args.topic}'...")
        script = create_sample_script(args.topic)

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), args.out)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(script, f, ensure_ascii=False, indent=2)

    print(f"\n✅ บันทึกบทละครสั้นสำเร็จที่: {out_path}")
    print(f"🎬 เรื่อง: {script.get('title')}")
    print(f"👥 ตัวละคร: {', '.join([c.get('tag') for c in script.get('characters', [])])}")
    print(f"🎞️ จำนวนซีน: {len(script.get('scenes', []))} ซีน")
    print("\n👉 นำเนื้อหาในไฟล์นี้ไปวางในกล่องข้อความของ Chrome Extension บนหน้า Google Flow ได้ทันที!")

if __name__ == "__main__":
    main()
