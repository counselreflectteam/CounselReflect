# Dataset Directory

This directory should contain the AnnoMI dataset files.

## How to Get the Dataset

1. **Visit the official AnnoMI repository:**
   https://github.com/uccollab/AnnoMI

2. **Download the dataset files:**

   - `AnnoMI-simple.csv` (simplified version)
   - `AnnoMI-full.csv` (full version with additional annotations)

3. **Place the files here:**
   ```
   dataset/
   ├── .gitkeep
   ├── AnnoMI-simple.csv    ← Download this
   └── AnnoMI-full.csv      ← Download this
   ```

## Dataset Information

- **Source**: [uccollab/AnnoMI](https://github.com/uccollab/AnnoMI)
- **Description**: Expert-annotated motivational interviewing dialogues
- **Size**:
  - AnnoMI-simple.csv: ~2.4 MB
  - AnnoMI-full.csv: ~3.8 MB
- **License**: Please check the official repository for license terms

## Citation

If you use the AnnoMI dataset, please cite:

```bibtex
@INPROCEEDINGS{9746035,
  author={Wu, Zixiu and Balloccu, Simone and Kumar, Vivek and Helaoui, Rim and Reiter, Ehud and Reforgiato Recupero, Diego and Riboni, Daniele},
  booktitle={ICASSP 2022 - 2022 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)},
  title={Anno-MI: A Dataset of Expert-Annotated Counselling Dialogues},
  year={2022},
  pages={6177-6181},
  doi={10.1109/ICASSP43922.2022.9746035}
}
```

## Next Steps

After downloading the dataset, run:

```bash
python prepare_data.py \
    --input_path ./dataset/AnnoMI-simple.csv \
    --output_dir ./processed_data
```

This will create train/validation/test splits in the `processed_data/` directory.
