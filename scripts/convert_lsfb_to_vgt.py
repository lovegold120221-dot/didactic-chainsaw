#!/usr/bin/env python3
"""
LSFB Dataset to VGT Pose Format Converter

This script converts the LSFB (Linguistic Signs of Flanders in Belgium) dataset
to the project's MediaPipe Holistic pose format.

LSFB Dataset: https://lsfb.info.unamur.be/
Paper: Fink et al. "LSFB-CONT and LSFB-ISOL: Two New Datasets for Vision-Based Sign Language Recognition"

Usage:
    1. Download the LSFB dataset:
       python3 convert_lsfb_to_vgt.py --download --destination ./lsfb_data

    2. Convert to VGT pose format:
       python3 convert_lsfb_to_vgt.py --convert --source ./lsfb_data --destination ./src/assets/gestures/vgt

Format Differences:
    - LSFB pose: 23 landmarks (different from MediaPipe's 33)
    - LSFB left_hand: 21 landmarks (matches MediaPipe)
    - LSFB right_hand: 21 landmarks (matches MediaPipe)
    - LSFB face: 468 landmarks (matches MediaPipe)
"""

import os
import json
import argparse
from pathlib import Path
from typing import Dict, List, Any, Tuple, Optional

try:
    import numpy as np

    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    print("Warning: numpy not installed. Run: pip install numpy")

try:
    from lsfb_dataset import LSFBIsolConfig, LSFBIsolLandmarks
    from lsfb_dataset.download import Downloader

    HAS_LSFB = True
except ImportError:
    HAS_LSFB = False
    print("Warning: lsfb-dataset not installed. Run: pip install lsfb-dataset")


# LSFB pose landmark indices (23 points) to MediaPipe pose (33 points) mapping
# Based on MediaPipe pose landmark definition
# LSFB uses a subset of MediaPipe pose landmarks
LSFB_TO_MEDIAPIPE_POSE_MAPPING = {
    0: 0,  # nose -> nose
    1: 1,  # neck -> left_eye
    2: 2,  # left_shoulder -> right_eye
    3: 3,  # left_elbow -> left_ear
    4: 4,  # left_wrist -> right_ear
    5: 5,  # right_shoulder -> right_shoulder
    6: 6,  # right_elbow -> left_shoulder
    7: 7,  # right_wrist -> left_elbow
    8: 8,  # mid_hip -> left_wrist
    9: 9,  # left_hip -> left_hip
    10: 10,  # left_knee -> left_knee
    11: 11,  # left_ankle -> left_ankle
    12: 12,  # right_hip -> right_hip
    13: 13,  # right_knee -> right_knee
    14: 14,  # right_ankle -> right_ankle
    15: 15,  # head -> left_ankle
    16: 16,  # forehead -> right_ankle
    17: 17,  # left_eye -> left_foot_index
    18: 18,  # right_eye -> right_foot_index
    19: 19,  # left_ear -> left_foot_index
    20: 20,  # right_ear -> left_foot_index
    21: 21,  # left_foot -> right_foot_index
    22: 22,  # right_foot -> right_foot_index
}


def create_pose_file(
    sign_id: str,
    sign_gloss: str,
    features: Dict[str, np.ndarray],
    fps: int = 30,
    duration_ms: int = 1000,
) -> Dict[str, Any]:
    """
    Convert LSFB features to VGT pose format.

    Args:
        sign_id: Unique sign identifier (e.g., 'vgt_hallo')
        sign_gloss: Sign gloss in Flemish/Dutch
        features: Dict with 'pose', 'left_hand', 'right_hand' arrays
        fps: Frames per second
        duration_ms: Duration in milliseconds

    Returns:
        Pose file dict in VGT format
    """
    num_frames = features["pose"].shape[0]

    pose_file = {
        "id": sign_id,
        "sign": sign_gloss,
        "meaning": "",  # To be filled
        "fps": fps,
        "duration": duration_ms,
        "header": {
            "version": 0.2,
            "width": 1000,
            "height": 1000,
            "depth": 3,
            "components": [
                {
                    "name": "pose",
                    "format": "XYZC",
                    "points": 33,  # MediaPipe pose
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
        "frames": [],
    }

    # Process each frame
    for frame_idx in range(num_frames):
        frame_data = {
            "people": [
                {
                    "id": 1,
                    "pose": convert_lsfb_pose_to_mediapipe(features["pose"][frame_idx]),
                    "face": [],  # LSFB doesn't include face landmarks by default
                    "left_hand": features["left_hand"][frame_idx].tolist()
                    if len(features["left_hand"]) > 0
                    else [],
                    "right_hand": features["right_hand"][frame_idx].tolist()
                    if len(features["right_hand"]) > 0
                    else [],
                }
            ]
        }
        pose_file["frames"].append(frame_data)

    return pose_file


def convert_lsfb_pose_to_mediapipe(lsfb_pose: np.ndarray) -> List[Dict[str, float]]:
    """
    Convert LSFB pose (23 points) to MediaPipe pose (33 points) format.

    Args:
        lsfb_pose: Array of shape (23, 2) or (23, 3) with XY(Z) coordinates

    Returns:
        List of 33 dicts with X, Y, Z, C keys
    """
    mediapipe_pose = []

    # LSFB pose format appears to be normalized 2D (X, Y) or 3D (X, Y, Z)
    # We need to map it to MediaPipe's 33-point format

    # Create a zero-filled MediaPipe pose
    for i in range(33):
        if i in LSFB_TO_MEDIAPIPE_POSE_MAPPING:
            lsfb_idx = LSFB_TO_MEDIAPIPE_POSE_MAPPING[i]
            if lsfb_idx < len(lsfb_pose):
                point = lsfb_pose[lsfb_idx]
                if len(point) >= 2:
                    x = float(point[0])
                    y = float(point[1])
                    z = float(point[2]) if len(point) >= 3 else 0.0
                    confidence = 0.9  # Default confidence for converted points
                else:
                    x, y, z, confidence = 0.0, 0.0, 0.0, 0.0
        else:
            x, y, z, confidence = 0.0, 0.0, 0.0, 0.0

        mediapipe_pose.append({"X": x, "Y": y, "Z": z, "C": confidence})

    return mediapipe_pose


def download_lsfb_dataset(
    destination: str, splits: List[str] = None, landmarks: List[str] = None
) -> bool:
    """
    Download LSFB dataset.

    Args:
        destination: Where to save the dataset
        splits: Which splits to download (e.g., ['fold_0', 'fold_1'])
        landmarks: Which landmarks to download

    Returns:
        True if successful
    """
    if not HAS_LSFB:
        print("Error: lsfb-dataset not installed")
        return False

    if splits is None:
        splits = ["mini_sample"]
    if landmarks is None:
        landmarks = ["pose", "left_hand", "right_hand"]

    os.makedirs(destination, exist_ok=True)

    downloader = Downloader(
        dataset="isol",
        destination=destination,
        splits=splits,
        landmarks=landmarks,
        include_videos=False,
        include_cleaned_poses=True,
        skip_existing_files=True,
    )

    try:
        downloader.download()
        print(f"Download complete to {destination}")
        return True
    except Exception as e:
        print(f"Download failed: {e}")
        return False


def convert_dataset(
    source: str, destination: str, max_samples: int = None, language: str = "vgt"
) -> Tuple[int, int]:
    """
    Convert LSFB dataset to VGT pose format.

    Args:
        source: Path to LSFB dataset root
        destination: Path to save VGT pose files
        max_samples: Maximum number of samples to convert (None for all)
        language: Language code for pose files

    Returns:
        Tuple of (successful, failed) conversion counts
    """
    if not HAS_LSFB or not HAS_NUMPY:
        print("Error: Missing required packages")
        return (0, 0)

    successful = 0
    failed = 0

    # Create destination directories
    poses_dir = os.path.join(destination, "poses")
    os.makedirs(poses_dir, exist_ok=True)

    # Load dataset configuration
    config = LSFBIsolConfig(
        root=source,
        landmarks=("pose", "left_hand", "right_hand"),
        split="all",
        use_3d=False,
        use_raw=False,  # Use preprocessed (interpolated + smoothed)
        target="sign_gloss",
        sequence_max_length=50,
        show_progress=True,
    )

    dataset = LSFBIsolLandmarks(config)

    # Get sign gloss to index mapping
    sign_to_idx = dataset.sign_to_id
    idx_to_sign = {v: k for k, v in sign_to_idx.items()}

    sample_count = 0

    for idx in range(len(dataset)):
        if max_samples and sample_count >= max_samples:
            break

        try:
            features, target = dataset[idx]

            # Create sign ID
            sign_gloss = (
                target
                if isinstance(target, str)
                else idx_to_sign.get(target, f"sign_{idx}")
            )
            sign_id = f"{language}_{sign_gloss.lower().replace(' ', '_')}"

            # Create pose file
            pose_data = create_pose_file(
                sign_id=sign_id,
                sign_gloss=sign_gloss,
                features=features,
                fps=30,
                duration_ms=int(1000 * features["pose"].shape[0] / 30),
            )

            # Save pose file
            pose_file_path = os.path.join(poses_dir, f"{sign_id}.pose.json")
            with open(pose_file_path, "w") as f:
                json.dump(pose_data, f, indent=2)

            successful += 1
            sample_count += 1

            if sample_count % 100 == 0:
                print(f"Processed {sample_count} signs...")

        except Exception as e:
            failed += 1
            print(f"Failed to convert sign {idx}: {e}")
            continue

    print(f"\nConversion complete: {successful} successful, {failed} failed")
    return (successful, failed)


def generate_manifest(
    source: str,
    destination: str,
    language: str = "vgt",
    language_name: str = "Vlaams Gebaretaal",
    region: str = "Belgium (Flanders)",
) -> str:
    """
    Generate manifest.json for converted dataset.

    Args:
        source: Path to converted poses
        destination: Where to save manifest
        language: Language code
        language_name: Full language name
        region: Region description

    Returns:
        Path to generated manifest
    """
    poses_dir = os.path.join(source, "poses")

    signs = []
    for pose_file in os.listdir(poses_dir):
        if pose_file.endswith(".pose.json"):
            sign_id = pose_file.replace(".pose.json", "")

            # Load pose file to get sign gloss
            pose_path = os.path.join(poses_dir, pose_file)
            with open(pose_path, "r") as f:
                pose_data = json.load(f)

            signs.append(
                {
                    "id": sign_id,
                    "flemish": pose_data.get("sign", ""),
                    "dutch": pose_data.get("sign", ""),
                    "english": pose_data.get("meaning", ""),
                    "category": "converted",
                    "poseFile": f"poses/{pose_file}",
                }
            )

    manifest = {
        "language": language,
        "languageName": language_name,
        "languageNameEnglish": "Flemish Sign Language",
        "region": region,
        "version": "1.0-converted",
        "description": f"Converted from LSFB dataset. {len(signs)} signs.",
        "poseFormat": {
            "type": "mediapipe-holistic",
            "components": {"pose": 33, "face": 468, "leftHand": 21, "rightHand": 21},
        },
        "signs": signs,
        "source": "LSFB Dataset (lsfb.info.unamur.be)",
    }

    manifest_path = os.path.join(destination, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Manifest generated: {manifest_path}")
    return manifest_path


def main():
    parser = argparse.ArgumentParser(
        description="Convert LSFB dataset to VGT pose format"
    )
    parser.add_argument("--download", action="store_true", help="Download LSFB dataset")
    parser.add_argument(
        "--convert", action="store_true", help="Convert dataset to VGT format"
    )
    parser.add_argument(
        "--manifest", action="store_true", help="Generate manifest from converted data"
    )
    parser.add_argument(
        "--destination", "-d", default="./lsfb_data", help="Destination path"
    )
    parser.add_argument("--source", "-s", help="Source path for conversion")
    parser.add_argument(
        "--splits", nargs="+", default=["fold_0", "fold_1"], help="Splits to download"
    )
    parser.add_argument("--max-samples", type=int, help="Max samples to convert")
    parser.add_argument("--language", default="vgt", help="Language code")

    args = parser.parse_args()

    if args.download:
        print("Downloading LSFB dataset...")
        success = download_lsfb_dataset(
            destination=args.destination, splits=args.splits
        )
        if success:
            print("Download complete!")
        else:
            print("Download failed. Check network connection.")

    if args.convert:
        if not args.source:
            print("Error: --source required for conversion")
            return

        print("Converting LSFB dataset to VGT format...")
        successful, failed = convert_dataset(
            source=args.source,
            destination=args.destination,
            max_samples=args.max_samples,
            language=args.language,
        )
        print(f"Conversion complete: {successful} successful, {failed} failed")

    if args.manifest:
        if not args.source:
            print("Error: --source required for manifest generation")
            return

        generate_manifest(
            source=args.source, destination=args.destination, language=args.language
        )


if __name__ == "__main__":
    main()
