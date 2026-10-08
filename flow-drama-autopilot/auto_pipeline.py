#!/usr/bin/env python3
"""
auto_pipeline.py
สคริปต์สั่งสร้างละครสั้นอัตโนมัติ 100% ผ่าน Flow Engine โดยไม่ต้องคลิกหน้าเว็บ
"""

import os
import sys
import glob
import json
import time
import subprocess

PROJECT_DIR = "/Users/noppanan/flow-drama-autopilot"
ENGINE_DIR = os.path.join(PROJECT_DIR, "flow-agent-ref/flow-agent")
FLOW_BIN = os.path.join(ENGINE_DIR, "bin/flow-macos")
COOKIES_DIR = os.path.join(ENGINE_DIR, "cookies")
OUTPUT_DIR = os.path.join(ENGINE_DIR, "output")

def check_account_synced():
    """ตรวจสอบว่ามีการซิงค์คุกกี้บัญชีจาก Extension แล้วหรือยัง"""
    if not os.path.exists(COOKIES_DIR):
        return False
    cookie_files = glob.glob(os.path.join(COOKIES_DIR, "account_*.json"))
    return len(cookie_files) > 0

def run_auto_pipeline(script_file="drama_script.json"):
    script_path = os.path.join(PROJECT_DIR, script_file)
    if not os.path.exists(script_path):
        print(f"❌ ไม่พบไฟล์บทละคร: {script_path}")
        return

    with open(script_path, "r", encoding="utf-8") as f:
        script_data = json.load(f)

    title = script_data.get("title", "ละครสั้น")
    scenes = script_data.get("scenes", [])
    total_scenes = len(scenes)

    print(f"\n=======================================================")
    print(f"🎬 เริ่มต้นการสร้างละครอัตโนมัติ: '{title}'")
    print(f"🎞️ จำนวนทั้งหมด: {total_scenes} ซีน")
    print(f"=======================================================\n")

    # 1. ตรวจสอบการเชื่อมต่อบัญชี
    print("🔍 กำลังตรวจสอบ Session บัญชี Google Flow...")
    if not check_account_synced():
        print("⚠️ ยังไม่พบคุกกี้บัญชี Google ในระบบ!")
        print("👉 กรุณาโหลด Extension 'bridge-extension' ใน chrome://extensions")
        print("   แล้วเปิดแท็บ https://flow.google.com ระบบจะซิงค์ให้อัตโนมัติใน 1 วินาที")
        print("\n⏳ กำลังรอการซิงค์บัญชี...")
        for _ in range(60):
            time.sleep(2)
            if check_account_synced():
                print("✅ ซิงค์บัญชี Google Flow สำเร็จเรียบร้อย!")
                break
        else:
            print("❌ หมดเวลาการรอ กรุณาโหลด Extension ก่อนเริ่มรัน")
            return

    # 2. วนลูปสร้างวิดีโอแต่ละซีนโดยตรงผ่าน Engine
    generated_videos = []
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for i, scene in enumerate(scenes, 1):
        prompt = scene.get("prompt", "")
        scene_id = scene.get("scene_id", i)
        char = scene.get("character", "Main")

        print(f"\n-------------------------------------------------------")
        print(f"🚀 [ซีนที่ {i}/{total_scenes}] ตัวละคร: {char}")
        print(f"📝 Prompt: {prompt[:80]}...")
        print(f"-------------------------------------------------------")

        cmd = [
            FLOW_BIN,
            "generate",
            prompt,
            "9:16",
            "8s",
            "720p"
        ]

        try:
            print("⏳ กำลังสั่ง Google Veo เรนเดอร์วิดีโอ (Background RPC)...")
            res = subprocess.run(cmd, cwd=ENGINE_DIR, capture_output=True, text=True)
            if res.returncode == 0:
                print(f"✅ ซีนที่ {i} สร้างสำเร็จ!")
            else:
                print(f"⚠️ ผลลัพธ์: {res.stdout.strip() or res.stderr.strip()}")
        except Exception as e:
            print(f"❌ เกิดข้อผิดพลาดในซีนที่ {i}: {e}")

        # พักสั้นๆ เพื่อให้ Google Flow ประมวลผล
        time.sleep(3)

    # 3. รวบรวมไฟล์และตัดต่อ
    print("\n=======================================================")
    print("🎞️ สั่งรวบรวมคลิปและตัดต่อด้วย FFmpeg...")
    print("=======================================================")

    videos = sorted(glob.glob(os.path.join(OUTPUT_DIR, "*.mp4")), key=os.path.getmtime)
    latest_videos = videos[-total_scenes:] if len(videos) >= total_scenes else videos

    if latest_videos:
        list_file = os.path.join(PROJECT_DIR, "concat_list.txt")
        with open(list_file, "w") as f:
            for v in latest_videos:
                f.write(f"file '{v}'\n")

        final_out = os.path.join(PROJECT_DIR, "final_drama.mp4")
        stitch_cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_file,
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            final_out
        ]

        subprocess.run(stitch_cmd, check=True)
        if os.path.exists(list_file):
            os.remove(list_file)

        print(f"\n🎉 ละครสั้นสำเร็จเรียบร้อย 100%!")
        print(f"📁 บันทึกไฟล์ที่: {final_out}")
    else:
        print("⚠️ ไม่พบไฟล์วิดีโอสำหรับรวมคลิป")

if __name__ == "__main__":
    run_auto_pipeline()
