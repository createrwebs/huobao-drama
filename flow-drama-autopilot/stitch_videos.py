#!/usr/bin/env python3
"""
stitch_videos.py
สคริปต์รวมคลิปวิดีโอจาก Google Flow ด้วย FFmpeg และใส่เสียงพากย์อัตโนมัติ
"""

import os
import glob
import subprocess
import json

def get_scene_files():
    downloads_dir = os.path.expanduser("~/Downloads")
    flow_dir = os.path.join(downloads_dir, "flow_drama")
    
    # Check both flow_drama subfolder and main Downloads
    search_dirs = [flow_dir, downloads_dir]
    files = []
    
    for d in search_dirs:
        if os.path.exists(d):
            found = sorted(glob.glob(os.path.join(d, "scene_*.mp4")))
            if found:
                files = found
                break
                
    return files

def stitch_videos(video_files, output_path="final_drama.mp4"):
    if not video_files:
        print("❌ ไม่พบคลิปซีน (scene_*.mp4) ในโฟลเดอร์ ~/Downloads หรือ ~/Downloads/flow_drama/")
        print("กรุณารอให้ Extension ดาวน์โหลดคลิปเสร็จสิ้นก่อนครับ")
        return False

    print(f"🎞️ พบคลิปทั้งหมด {len(video_files)} ซีน:")
    for f in video_files:
        print(f"   - {os.path.basename(f)}")

    # Create concat list for ffmpeg
    list_file = "concat_list.txt"
    with open(list_file, "w") as f:
        for vf in video_files:
            f.write(f"file '{os.path.abspath(vf)}'\n")

    print(f"\n⚡ กำลังรวบคลิปด้วย FFmpeg...")
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", list_file,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        output_path
    ]

    try:
        subprocess.run(cmd, check=True)
        if os.path.exists(list_file):
            os.remove(list_file)
        print(f"\n🎉 ประกอบคลิปวิดีโอสำเร็จเรียบร้อย!")
        print(f"🎬 ไฟล์ผลลัพธ์อยู่ที่: {os.path.abspath(output_path)}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"⚠️ เกิดข้อผิดพลาดขณะรัน FFmpeg: {e}")
        return False

if __name__ == "__main__":
    videos = get_scene_files()
    stitch_videos(videos)
