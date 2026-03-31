"""
JSONL Training Data → PyTorch Dataset
각 행: { "features": [...], "action_index": N, "reward": score }
"""

import json
import numpy as np
import torch
from torch.utils.data import Dataset


class OFCDataset(Dataset):
    """JSONL 파일에서 features + reward를 로드하는 PyTorch Dataset"""

    def __init__(self, jsonl_path, max_rows=None):
        """
        Args:
            jsonl_path: JSONL 파일 경로
            max_rows: 최대 로드 행 수 (None이면 전체)
        """
        self.features = []
        self.rewards = []
        self.action_indices = []

        with open(jsonl_path, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f):
                if max_rows and i >= max_rows:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                    self.features.append(row['features'])
                    self.rewards.append(row['reward'])
                    self.action_indices.append(row.get('action_index', 0))
                except (json.JSONDecodeError, KeyError):
                    continue

        self.features = torch.tensor(np.array(self.features, dtype=np.float32))
        self.rewards = torch.tensor(np.array(self.rewards, dtype=np.float32)).unsqueeze(1)
        self.action_indices = torch.tensor(np.array(self.action_indices, dtype=np.int64))

        print(f"Loaded {len(self.features)} samples from {jsonl_path}")

    def __len__(self):
        return len(self.features)

    def __getitem__(self, idx):
        return self.features[idx], self.rewards[idx]


def load_dataset(jsonl_path, train_ratio=0.8, max_rows=None):
    """
    JSONL 데이터를 train/val로 분할

    Returns:
        (train_dataset, val_dataset)
    """
    full_dataset = OFCDataset(jsonl_path, max_rows=max_rows)
    total = len(full_dataset)
    train_size = int(total * train_ratio)
    val_size = total - train_size

    train_dataset, val_dataset = torch.utils.data.random_split(
        full_dataset, [train_size, val_size]
    )

    print(f"Train: {train_size}, Val: {val_size}")
    return train_dataset, val_dataset
