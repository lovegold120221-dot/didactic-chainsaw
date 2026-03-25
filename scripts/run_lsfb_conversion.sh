#!/bin/bash
# Download and Convert LSFB Dataset to VGT Format
#
# Prerequisites:
#   pip install lsfb-dataset numpy pandas opencv-python
#
# Usage:
#   1. Download the dataset:
#      bash scripts/run_lsfb_conversion.sh --download
#
#   2. Convert to VGT format:
#      bash scripts/run_lsfb_conversion.sh --convert
#
#   3. Generate manifest:
#      bash scripts/run_lsfb_conversion.sh --manifest

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LSFB_DATA="$PROJECT_DIR/lsfb_data"
VGT_DIR="$PROJECT_DIR/src/assets/gestures/vgt"

# Parse arguments
ACTION=""
SPLITS="fold_0 fold_1 fold_2"  # Default: use first 3 folds

while [[ $# -gt 0 ]]; do
    case $1 in
        --download)
            ACTION="download"
            shift
            ;;
        --convert)
            ACTION="convert"
            shift
            ;;
        --manifest)
            ACTION="manifest"
            shift
            ;;
        --splits)
            SPLITS="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

case "$ACTION" in
    download)
        echo "Downloading LSFB dataset (splits: $SPLITS)..."
        cd "$PROJECT_DIR"
        source venv_lsfb/bin/activate
        python3 scripts/convert_lsfb_to_vgt.py \
            --download \
            --destination "$LSFB_DATA" \
            --splits $SPLITS
        ;;
    convert)
        echo "Converting LSFB dataset to VGT format..."
        cd "$PROJECT_DIR"
        source venv_lsfb/bin/activate
        python3 scripts/convert_lsfb_to_vgt.py \
            --convert \
            --source "$LSFB_DATA" \
            --destination "$VGT_DIR" \
            --language vgt
        ;;
    manifest)
        echo "Generating manifest..."
        cd "$PROJECT_DIR"
        source venv_lsfb/bin/activate
        python3 scripts/convert_lsfb_to_vgt.py \
            --manifest \
            --source "$VGT_DIR" \
            --destination "$VGT_DIR" \
            --language vgt
        ;;
    *)
        echo "Usage: $0 [--download|--convert|--manifest] [--splits SPLITS]"
        echo ""
        echo "Steps:"
        echo "  1. --download  : Download LSFB dataset"
        echo "  2. --convert   : Convert to VGT pose format"
        echo "  3. --manifest  : Generate manifest.json"
        exit 1
        ;;
esac
