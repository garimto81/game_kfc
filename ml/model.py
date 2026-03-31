"""
OFC Pineapple Placement Model
62차원 feature vector → scalar reward 예측
"""

import torch
import torch.nn as nn


class OFCPlacementModel(nn.Module):
    """
    입력: 62차원 feature vector (board + hand + meta)
    출력: scalar reward 예측 (회귀)
    """

    def __init__(self, input_dim=62):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
        )

    def forward(self, x):
        return self.net(x)
