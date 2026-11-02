#!/usr/bin/env python3
"""
colab_worker.py - Continuous GPU Worker for Google Colab / Kaggle
Connects to Huobao Drama (www.toraapi.com/storyvdo), polls for video rendering tasks,
renders video on GPU using Diffusers/ModelScope/Wan, and uploads results to Cloudflare R2.
"""

import argparse
import json
import os
import sys
import time
import requests

try:
    import torch
    from PIL import Image
    from diffusers import TextToVideoSDPipeline, DPMSolverMultistepScheduler
    from diffusers.utils import export_to_video
except ImportError:
    print("[!] Missing dependencies. Please run:")
    print("    pip install diffusers transformers accelerate boto3 requests pillow imageio imageio-ffmpeg")
    sys.exit(1)

# Default Cloudflare R2 Configuration
DEFAULT_R2_CONFIG = {
    "account_id": "7b45cc55a0d93df72bdfdfe302f2eafd",
    "access_key_id": "2d40908e43c49d68fca4437c0c8b5d17",
    "secret_access_key": "ef786e8cbebf7081d49b670e6cadee789c6430be72a9ef713558cbfb08de1df2",
    "bucket": "vdo",
    "endpoint": "https://7b45cc55a0d93df72bdfdfe302f2eafd.r2.cloudflarestorage.com",
}

PIPELINE = None


def get_video_pipeline(model_name="ali-vilab/text-to-video-ms-1.7b"):
    global PIPELINE
    if PIPELINE is not None:
        return PIPELINE

    print(f"[*] Checking GPU acceleration...")
    if not torch.cuda.is_available():
        print("[!] WARNING: CUDA is not available. Video generation on CPU will be extremely slow.")
        device = "cpu"
        dtype = torch.float32
    else:
        device = "cuda"
        dtype = torch.float16
        print(f"[+] Using GPU: {torch.cuda.get_device_name(0)}")

    print(f"[*] Loading video diffusion model '{model_name}'...")
    pipe = TextToVideoSDPipeline.from_pretrained(model_name, torch_dtype=dtype, variant="fp16" if device == "cuda" else None)
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
    if device == "cuda":
        pipe.enable_model_cpu_offload()
        pipe.enable_vae_slicing()

    PIPELINE = pipe
    print("[+] Video pipeline loaded and ready.")
    return PIPELINE


def upload_to_r2(local_file, presigned_url=None, r2_key=None, r2_cfg=DEFAULT_R2_CONFIG):
    if presigned_url:
        print(f"[*] Uploading to R2 via pre-signed URL...")
        with open(local_file, "rb") as f:
            res = requests.put(presigned_url, data=f, headers={"Content-Type": "video/mp4"}, timeout=300)
            if res.status_code in (200, 201):
                print("[+] R2 upload successful via pre-signed URL.")
                return True
            print(f"[!] Pre-signed upload failed ({res.status_code}): {res.text}. Falling back to S3 client.")

    try:
        import boto3
        from botocore.config import Config

        s3 = boto3.client(
            "s3",
            endpoint_url=r2_cfg["endpoint"],
            aws_access_key_id=r2_cfg["access_key_id"],
            aws_secret_access_key=r2_cfg["secret_access_key"],
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
        key = r2_key or f"storyvdo/videos/worker_{int(time.time())}.mp4"
        print(f"[*] Uploading to R2 bucket '{r2_cfg['bucket']}' at key '{key}'...")
        s3.upload_file(local_file, r2_cfg["bucket"], key, ExtraArgs={"ContentType": "video/mp4"})
        print("[+] R2 upload successful via boto3 client.")
        return True
    except Exception as e:
        print(f"[!] S3 client upload failed: {e}")
        return False


def process_task(task, server_url, token, r2_cfg):
    task_id = task["task_id"]
    prompt = task.get("prompt") or "Cinematic motion video"
    screenshot_url = task.get("screenshot_url")
    r2_key = task.get("r2_key") or f"storyvdo/videos/{task_id}.mp4"
    presigned_url = task.get("presigned_upload_url")
    duration = task.get("duration") or 5
    seed = task.get("seed") or 42

    print(f"\n{'='*60}")
    print(f"[*] Processing Task #{task_id}")
    print(f"    Prompt: '{prompt}'")
    print(f"    Keyframe: {screenshot_url}")
    print(f"{'='*60}")

    keyframe_path = f"keyframe_{task_id}.png"
    if screenshot_url:
        try:
            print("[*] Downloading keyframe screenshot...")
            res = requests.get(screenshot_url, timeout=30)
            if res.status_code == 200:
                with open(keyframe_path, "wb") as f:
                    f.write(res.content)
                print(f"[+] Downloaded keyframe ({len(res.content)} bytes).")
            else:
                print(f"[!] Warning: failed to download keyframe (HTTP {res.status_code}).")
        except Exception as e:
            print(f"[!] Keyframe download error: {e}")

    output_video = f"video_{task_id}.mp4"
    try:
        pipe = get_video_pipeline()
        generator = torch.Generator(device="cpu").manual_seed(seed)
        print(f"[*] Running video diffusion inference (16 frames)...")
        start_time = time.monotonic()

        frames = pipe(
            prompt,
            num_inference_steps=25,
            height=256,
            width=384,
            num_frames=16,
            generator=generator,
        ).frames[0]

        export_to_video(frames, output_video_path=output_video, fps=8)
        elapsed = round(time.monotonic() - start_time, 2)
        print(f"[+] Video rendered in {elapsed}s: {output_video}")

        # Upload to Cloudflare R2
        uploaded = upload_to_r2(output_video, presigned_url=presigned_url, r2_key=r2_key, r2_cfg=r2_cfg)
        if not uploaded:
            raise RuntimeError("Failed to upload video to Cloudflare R2")

        # Report complete
        complete_url = f"{server_url}/api/v1/worker/jobs/{task_id}/complete"
        res = requests.post(
            complete_url,
            json={"r2_key": r2_key, "duration_seconds": 2},
            headers={"X-Worker-Token": token},
            timeout=30,
        )
        print(f"[+] Task #{task_id} completed and synced: {res.json()}")

    except Exception as exc:
        print(f"[!] Task #{task_id} failed: {exc}")
        fail_url = f"{server_url}/api/v1/worker/jobs/{task_id}/fail"
        try:
            requests.post(
                fail_url,
                json={"error_message": str(exc)},
                headers={"X-Worker-Token": token},
                timeout=15,
            )
        except Exception:
            pass
    finally:
        for p in (keyframe_path, output_video):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


def main():
    parser = argparse.ArgumentParser(description="Tora StoryVdo GPU Worker")
    parser.add_argument("--server", default="https://www.toraapi.com/storyvdo", help="Base URL of Huobao Drama server")
    parser.add_argument("--token", default="tora_colab_worker_secret_2026", help="Worker secret token")
    parser.add_argument("--interval", type=int, default=5, help="Polling interval in seconds")
    parser.add_argument("--model", default="ali-vilab/text-to-video-ms-1.7b", help="Video diffusion model")
    args = parser.parse_args()

    server_url = args.server.rstrip("/")
    token = args.token
    interval = args.interval

    print("=" * 65)
    print("🎬 Tora StoryVdo GPU Worker Running")
    print(f"   Target Server: {server_url}")
    print(f"   Poll Interval: {interval}s")
    print(f"   R2 Bucket:     {DEFAULT_R2_CONFIG['bucket']}")
    print("=" * 65)

    # Preload model
    get_video_pipeline(args.model)

    while True:
        try:
            poll_url = f"{server_url}/api/v1/worker/jobs/poll"
            res = requests.get(poll_url, headers={"X-Worker-Token": token}, timeout=15)
            if res.status_code == 200:
                data = res.json()
                if data.get("data", {}).get("has_job"):
                    task = data["data"]["job"]
                    process_task(task, server_url, token, DEFAULT_R2_CONFIG)
                else:
                    time.sleep(interval)
            elif res.status_code == 401:
                print(f"[!] Worker unauthorized. Check --token. Retrying in 30s...")
                time.sleep(30)
            else:
                print(f"[*] Poll status {res.status_code}: {res.text}. Retrying in {interval}s...")
                time.sleep(interval)
        except KeyboardInterrupt:
            print("\n[*] Worker stopping...")
            break
        except Exception as e:
            print(f"[!] Polling loop error: {e}. Retrying in {interval}s...")
            time.sleep(interval)


if __name__ == "__main__":
    main()
