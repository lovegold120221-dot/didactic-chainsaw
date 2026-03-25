# LSFB Dataset Conversion for VGT

This directory contains scripts to download and convert the LSFB (Linguistic Signs of Flanders in Belgium) dataset to the VGT pose format.

## LSFB Dataset

- **Website**: https://lsfb.info.unamur.be/
- **Paper**: Fink et al. "LSFB-CONT and LSFB-ISOL: Two New Datasets for Vision-Based Sign Language Recognition" (IJCNN 2021)
- **License**: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International

## Format Comparison

| Component  | Project Format | LSFB Dataset |
| ---------- | -------------- | ------------ |
| pose       | 33 points      | 23 points    |
| face       | 468 points     | 468 points   |
| left_hand  | 21 points      | 21 points    |
| right_hand | 21 points      | 21 points    |

**Note**: LSFB uses 23 pose landmarks while MediaPipe Holistic uses 33. The conversion script maps these appropriately.

## Prerequisites

```bash
# Create virtual environment
python3 -m venv venv_lsfb
source venv_lsfb/bin/activate

# Install dependencies
pip install lsfb-dataset numpy pandas opencv-python
```

## Conversion Steps

### 1. Download the LSFB Dataset

```bash
# Using the conversion script
source venv_lsfb/bin/activate
python3 scripts/convert_lsfb_to_vgt.py \
    --download \
    --destination ./lsfb_data \
    --splits fold_0 fold_1 fold_2  # Training folds

# Or download specific parts
python3 scripts/convert_lsfb_to_vgt.py --download --destination ./lsfb_data --splits mini_sample
```

### 2. Convert to VGT Pose Format

```bash
python3 scripts/convert_lsfb_to_vgt.py \
    --convert \
    --source ./lsfb_data \
    --destination ./src/assets/gestures/vgt \
    --language vgt
```

### 3. Generate Manifest

```bash
python3 scripts/convert_lsfb_to_vgt.py \
    --manifest \
    --source ./src/assets/gestures/vgt \
    --destination ./src/assets/gestures/vgt \
    --language vgt
```

## Alternative: Using the Shell Script

```bash
# Download
bash scripts/run_lsfb_conversion.sh --download --splits fold_0 fold_1 fold_2

# Convert
bash scripts/run_lsfb_conversion.sh --convert

# Generate manifest
bash scripts/run_lsfb_conversion.sh --manifest
```

## LSFB Dataset Structure

After downloading, the dataset structure is:

```
lsfb_data/
├── metadata/
│   ├── splits/
│   │   ├── all.json
│   │   ├── fold_0.json
│   │   └── ...
│   └── vocabulary.json
└── landmarks/
    └── isol/
        └── clean/
            └── fold_x/
                ├── pose/
                ├── left_hand/
                └── right_hand/
```

## Converting Specific Signs

To convert a specific sign or a subset:

```bash
python3 scripts/convert_lsfb_to_vgt.py \
    --convert \
    --source ./lsfb_data \
    --destination ./src/assets/gestures/vgt \
    --max-samples 100
```

## Dataset Information

- **LSFB-ISOL**: Isolated signs dataset with ~750 signs
- **Signer splits**: 5 folds (0-4), folds 2-4 for training, folds 0-1 for testing
- **Signers**: Multiple deaf signers from the Flemish deaf community
- **Pose format**: MediaPipe Holistic (converted to our format)
- **Preprocessing**: Linear interpolation for missing landmarks, Savitzky-Golay filtering for smoothing

## Citation

If you use the LSFB dataset, please cite:

```
@inproceedings{Fink2021,
  doi = {10.1109/ijcnn52387.2021.9534336},
  url = {https://doi.org/10.1109/ijcnn52387.2021.9534336},
  year = {2021},
  month = jul,
  publisher = {{IEEE}},
  author = {Jerome Fink and Benoit Frenay and Laurence Meurant and Anthony Cleve},
  title = {{LSFB}-{CONT} and {LSFB}-{ISOL}: Two New Datasets for Vision-Based Sign Language Recognition},
  booktitle = {2021 International Joint Conference on Neural Networks ({IJCNN})}
}
```
