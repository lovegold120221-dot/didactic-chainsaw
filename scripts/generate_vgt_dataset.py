#!/usr/bin/env python3
"""
VGT Sign Language Dataset Generator

This script:
1. Downloads videos from the VGT dictionary
2. Extracts pose data using MediaPipe Holistic
3. Generates pose files in the app's format

Usage:
    python3 generate_vgt_dataset.py --download-videos
    python3 generate_vgt_dataset.py --extract-poses
    python3 generate_vgt_dataset.py --all
"""

import os
import json
import cv2
import argparse
import numpy as np
from pathlib import Path
from typing import Dict, List, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import time
import urllib.request

# MediaPipe Tasks Vision
from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision import (
    HolisticLandmarker,
    HolisticLandmarkerOptions,
    RunningMode,
)
from mediapipe.tasks.python.vision.core.image import Image, ImageFormat

# Paths
PROJECT_DIR = Path(__file__).parent.parent
VGT_DIR = PROJECT_DIR / "src/assets/gestures/vgt"
VIDEOS_DIR = VGT_DIR / "videos"
POSES_DIR = VGT_DIR / "poses"
MEDIAPIPE_DIR = PROJECT_DIR / "mediapipe"
MANIFEST_PATH = VGT_DIR / "manifest.json"


def ensure_model(model_name: str, url: str) -> str:
    """Download model if not exists."""
    model_path = MEDIAPIPE_DIR / model_name
    if not model_path.exists():
        print(f"Downloading {model_name}...")
        MEDIAPIPE_DIR.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, str(model_path))
        print(f"Downloaded to {model_path}")
    return str(model_path)


def create_holistic_landmarker() -> HolisticLandmarker:
    """Create and return a HolisticLandmarker instance."""
    model_path = ensure_model(
        "holistic_landmarker.task",
        "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task",
    )
    base_options = BaseOptions(model_asset_path=model_path)
    options = HolisticLandmarkerOptions(
        base_options=base_options,
        running_mode=RunningMode.VIDEO,
    )
    return HolisticLandmarker.create_from_options(options)


def download_video(url: str, dest_path: str, max_retries: int = 3) -> bool:
    """Download a video from URL."""
    if os.path.exists(dest_path):
        print(f"  Skipping (exists): {dest_path}")
        return True

    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=30, stream=True)
            if response.status_code == 200:
                with open(dest_path, "wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                return True
        except Exception as e:
            print(f"  Attempt {attempt + 1} failed: {e}")
            time.sleep(1)

    return False


def download_all_videos(
    words_path: str = None, max_workers: int = 5, max_videos: int = None
):
    """Download all videos from VGT dictionary."""
    if words_path is None:
        words_path = PROJECT_DIR / "vgt_words.json"

    with open(words_path, "r") as f:
        words = json.load(f)

    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

    videos_to_download = []
    for word in words:
        video_url = word.get("videoUrl", "")
        if video_url:
            sign_id = f"vgt_{word['id']}"
            filename = f"{sign_id}.mp4"
            dest_path = VIDEOS_DIR / filename
            videos_to_download.append(
                {"url": video_url, "dest": str(dest_path), "word": word}
            )

    if max_videos:
        videos_to_download = videos_to_download[:max_videos]

    print(f"Downloading {len(videos_to_download)} videos...")

    success = 0
    failed = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(download_video, v["url"], v["dest"]): v
            for v in videos_to_download
        }

        for i, future in enumerate(as_completed(futures)):
            v = futures[future]
            try:
                if future.result():
                    success += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"  Error: {e}")
                failed += 1

            if (i + 1) % 50 == 0:
                print(f"Progress: {i + 1}/{len(videos_to_download)}")

    print(f"\nDownload complete: {success} success, {failed} failed")
    return success, failed


def extract_landmarks_list(landmarks, num_points: int) -> List[Dict[str, float]]:
    """Extract landmarks from MediaPipe result (list of NormalizedLandmark objects)."""
    if not landmarks:
        return [{"X": 0, "Y": 0, "Z": 0, "C": 0} for _ in range(num_points)]

    result = []
    for landmark in landmarks:
        if landmark is None:
            result.append({"X": 0, "Y": 0, "Z": 0, "C": 0})
        elif hasattr(landmark, "x"):  # NormalizedLandmark object
            result.append(
                {
                    "X": float(landmark.x) if landmark.x is not None else 0.0,
                    "Y": float(landmark.y) if landmark.y is not None else 0.0,
                    "Z": float(landmark.z) if landmark.z is not None else 0.0,
                    "C": float(landmark.visibility)
                    if landmark.visibility is not None
                    else 0.9,
                }
            )
        elif isinstance(landmark, (list, tuple)):
            result.append(
                {
                    "X": float(landmark[0]) if landmark[0] is not None else 0.0,
                    "Y": float(landmark[1]) if landmark[1] is not None else 0.0,
                    "Z": float(landmark[2])
                    if len(landmark) >= 3 and landmark[2] is not None
                    else 0.0,
                    "C": float(landmark[3])
                    if len(landmark) >= 4 and landmark[3] is not None
                    else 0.9,
                }
            )
        else:
            result.append({"X": 0, "Y": 0, "Z": 0, "C": 0})

    while len(result) < num_points:
        result.append({"X": 0, "Y": 0, "Z": 0, "C": 0})

    return result[:num_points]


def extract_pose_from_video(
    video_path: str,
    sign_id: str,
    sign_gloss: str,
    landmarker: HolisticLandmarker = None,
) -> Optional[Dict]:
    """Extract pose data from a video file."""
    # Create new landmarker if not provided
    if landmarker is None:
        landmarker = create_holistic_landmarker()

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"  Could not open video: {video_path}")
        return None

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 120:
        fps = 30  # Default to 30fps if invalid
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = int(frame_count / fps * 1000) if fps > 0 else 1000

    frames_data = []
    frame_idx = 0
    timestamp_ms = 0

    # Process every frame for better hand detection
    while cap.isOpened():
        ret, image = cap.read()
        if not ret:
            break

        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        mp_image = Image(image_format=ImageFormat.SRGB, data=rgb_image)

        # Process with landmarker
        result = landmarker.detect_for_video(mp_image, timestamp_ms)

        # Extract landmarks - new API returns list of lists
        pose_landmarks = result.pose_landmarks if result.pose_landmarks else []
        face_landmarks = result.face_landmarks if result.face_landmarks else []
        left_hand = result.left_hand_landmarks if result.left_hand_landmarks else []
        right_hand = result.right_hand_landmarks if result.right_hand_landmarks else []

        frame_data = {
            "_people": 1,
            "people": [
                {
                    "pose": extract_landmarks_list(pose_landmarks, 33),
                    "face": extract_landmarks_list(face_landmarks, 478),
                    "left_hand": extract_landmarks_list(left_hand, 21),
                    "right_hand": extract_landmarks_list(right_hand, 21),
                }
            ],
        }
        frames_data.append(frame_data)

        frame_idx += 1
        timestamp_ms = int(frame_idx * 1000 / fps) if fps > 0 else frame_idx * 33

    cap.release()

    if not frames_data:
        return None

    pose_data = {
        "header": {
            "version": 0.2,
            "width": 1000,
            "height": 1000,
            "depth": 3,
            "components": [
                {
                    "name": "pose",
                    "format": "XYZC",
                    "points": 33,
                    "limbs": [],
                    "colors": [],
                },
                {
                    "name": "face",
                    "format": "XYZC",
                    "points": 468,
                    "limbs": [],
                    "colors": [],
                },
                {
                    "name": "left_hand",
                    "format": "XYZC",
                    "points": 21,
                    "limbs": [],
                    "colors": [],
                },
                {
                    "name": "right_hand",
                    "format": "XYZC",
                    "points": 21,
                    "limbs": [],
                    "colors": [],
                },
            ],
        },
        "body": {
            "fps": fps,
            "frames": frames_data,
        },
    }

    return pose_data


def extract_all_poses(
    words_path: str = None, max_workers: int = 2, max_videos: int = None
):
    """Extract poses from all downloaded videos."""
    if words_path is None:
        words_path = PROJECT_DIR / "vgt_words.json"

    with open(words_path, "r") as f:
        words = json.load(f)

    POSES_DIR.mkdir(parents=True, exist_ok=True)

    videos_processed = 0
    success = 0
    failed = 0

    for word in words:
        if max_videos and videos_processed >= max_videos:
            break

        video_url = word.get("videoUrl", "")
        if not video_url:
            continue

        sign_id = f"vgt_{word['id']}"
        video_path = VIDEOS_DIR / f"{sign_id}.mp4"
        pose_path = POSES_DIR / f"{sign_id}.pose.json"

        if not video_path.exists():
            continue

        videos_processed += 1

        if pose_path.exists():
            print(f"  Skipping (pose exists): {sign_id}")
            success += 1
            continue

        print(f"  Processing: {sign_id} ({word.get('gloss', '')})")

        try:
            pose_data = extract_pose_from_video(
                str(video_path), sign_id, word.get("gloss", "").lower()
            )

            if pose_data:
                with open(pose_path, "w") as f:
                    json.dump(pose_data, f)
                success += 1
                print(
                    f"    Saved: {pose_path.name} ({len(pose_data['frames'])} frames)"
                )
            else:
                failed += 1
                print(f"    Failed to extract pose")
        except Exception as e:
            failed += 1
            print(f"    Error: {e}")

        if videos_processed % 10 == 0:
            print(f"Progress: {videos_processed} videos processed")

    print(f"\nPose extraction complete: {success} success, {failed} failed")
    return success, failed


def update_manifest_with_poses():
    """Update manifest to include poseFile references."""
    if not MANIFEST_PATH.exists():
        print("Manifest not found")
        return

    with open(MANIFEST_PATH, "r") as f:
        manifest = json.load(f)

    signs = manifest.get("signs", [])

    # Check for pose files - use name without extension, then strip .pose
    pose_files = {
        p.stem.replace(".pose", ""): p.name for p in POSES_DIR.glob("*.pose.json")
    }

    added = 0
    for sign in signs:
        sign_id = sign.get("id", "")
        if sign_id in pose_files and "poseFile" not in sign:
            sign["poseFile"] = f"poses/{pose_files[sign_id]}"
            added += 1

    manifest["signs"] = signs

    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Updated manifest: added poseFile references to {added} signs")


def main():
    parser = argparse.ArgumentParser(description="VGT Sign Language Dataset Generator")
    parser.add_argument(
        "--download-videos",
        action="store_true",
        help="Download videos from VGT dictionary",
    )
    parser.add_argument(
        "--extract-poses", action="store_true", help="Extract poses from videos"
    )
    parser.add_argument(
        "--update-manifest",
        action="store_true",
        help="Update manifest with pose references",
    )
    parser.add_argument("--all", action="store_true", help="Run all steps")
    parser.add_argument(
        "--max-videos", type=int, default=None, help="Max number of videos to process"
    )
    parser.add_argument(
        "--workers", type=int, default=5, help="Number of parallel workers"
    )

    args = parser.parse_args()

    if args.all or args.download_videos:
        print("\n=== Step 1: Downloading videos ===")
        download_all_videos(max_workers=args.workers, max_videos=args.max_videos)

    if args.all or args.extract_poses:
        print("\n=== Step 2: Extracting poses ===")
        extract_all_poses(max_workers=args.workers, max_videos=args.max_videos)

    if args.all or args.update_manifest:
        print("\n=== Step 3: Updating manifest ===")
        update_manifest_with_poses()

    if not (
        args.all or args.download_videos or args.extract_poses or args.update_manifest
    ):
        parser.print_help()


if __name__ == "__main__":
    main()
