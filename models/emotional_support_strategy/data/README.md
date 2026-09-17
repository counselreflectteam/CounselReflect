# ESConv Dataset

This directory should contain the ESConv (Emotional Support Conversation) dataset files.

## How to Get the Dataset

1. **Visit the official ESConv repository:**
   https://github.com/thu-coai/Emotional-Support-Conversation

2. **Download the dataset files:**

   - `train.jsonl`
   - `valid.jsonl`
   - `test.jsonl`

3. **Place the files in this directory:**
   ```
   data/
   ├── README.md (this file)
   ├── train.jsonl    ← Download this (~4 MB)
   ├── valid.jsonl    ← Download this (~0.9 MB)
   └── test.jsonl     ← Download this (~0.9 MB)
   ```

## Dataset Information

- **Paper**: [Towards Emotional Support Dialog Systems](https://aclanthology.org/2021.acl-long.269/) (ACL 2021)
- **Authors**: Liu, S., Zheng, C., Demasi, O., et al.
- **Total Size**: ~5.8 MB
- **Format**: JSONL (JSON Lines)

### Dataset Statistics

| Split     | Conversations | Utterances | Percentage |
| --------- | ------------- | ---------- | ---------- |
| Train     | 909           | 12,759     | 69.4%      |
| Valid     | 194           | 2,722      | 14.8%      |
| Test      | 194           | 2,895      | 15.8%      |
| **Total** | **1,297**     | **18,376** | **100%**   |

### Label Distribution

8 emotional support strategies:

- Affirmation and Reassurance
- Information
- Others
- Providing Suggestions
- Question
- Reflection of feelings
- Restatement or Paraphrasing
- Self-disclosure

## Citation

If you use the ESConv dataset, please cite:

```bibtex
@inproceedings{liu2021towards,
  title={Towards Emotional Support Dialog Systems},
  author={Liu, Siyang and Zheng, Chujie and Demasi, Orianna and Sabour, Sahand and Li, Yu and Yu, Zhou and Jiang, Yong and Huang, Minlie},
  booktitle={Proceedings of ACL 2021},
  pages={3469--3483},
  year={2021}
}
```

## Next Steps

After downloading the dataset, you can train the model:

```bash
python scripts/train_strategy_model.py \
    --data_dir ./data \
    --output_dir ./output
```
