"""
OFC Placement Model 학습 스크립트

사용:
  python train.py --data ../data/training/latest.jsonl --epochs 50
  python train.py --data ../data/training/latest.jsonl --epochs 100 --pretrained model.pt
"""

import argparse
import os
import time

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from model import OFCPlacementModel
from dataset import load_dataset


def parse_args():
    parser = argparse.ArgumentParser(description='OFC Placement Model Training')
    parser.add_argument('--data', type=str, required=True, help='JSONL 학습 데이터 경로')
    parser.add_argument('--epochs', type=int, default=50, help='학습 에폭 수')
    parser.add_argument('--batch-size', type=int, default=256, help='배치 크기')
    parser.add_argument('--lr', type=float, default=1e-3, help='학습률')
    parser.add_argument('--output', type=str, default='model.pt', help='모델 저장 경로')
    parser.add_argument('--pretrained', type=str, default=None, help='Fine-tune용 기존 모델')
    parser.add_argument('--max-rows', type=int, default=None, help='최대 로드 행 수')
    return parser.parse_args()


def train_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss = 0
    total_samples = 0

    for features, rewards in loader:
        features = features.to(device)
        rewards = rewards.to(device)

        optimizer.zero_grad()
        predictions = model(features)
        loss = criterion(predictions, rewards)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * features.size(0)
        total_samples += features.size(0)

    return total_loss / total_samples


def validate(model, loader, criterion, device):
    model.eval()
    total_loss = 0
    total_samples = 0
    total_correct_direction = 0

    with torch.no_grad():
        for features, rewards in loader:
            features = features.to(device)
            rewards = rewards.to(device)

            predictions = model(features)
            loss = criterion(predictions, rewards)

            total_loss += loss.item() * features.size(0)
            total_samples += features.size(0)

            # 방향 정확도: 예측이 0 이상/미만인 방향이 실제와 일치하는 비율
            pred_sign = (predictions > 0).float()
            true_sign = (rewards > 0).float()
            total_correct_direction += (pred_sign == true_sign).sum().item()

    avg_loss = total_loss / total_samples
    direction_accuracy = total_correct_direction / total_samples
    return avg_loss, direction_accuracy


def main():
    args = parse_args()

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Device: {device}")

    # ── 데이터 로드 ──
    print(f"\nLoading data from {args.data}...")
    train_dataset, val_dataset = load_dataset(args.data, max_rows=args.max_rows)

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False)

    # ── 모델 초기화 ──
    model = OFCPlacementModel(input_dim=62).to(device)

    if args.pretrained and os.path.exists(args.pretrained):
        print(f"Loading pretrained model from {args.pretrained}")
        model.load_state_dict(torch.load(args.pretrained, map_location=device))

    # ── 학습 설정 ──
    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', factor=0.5, patience=5
    )

    print(f"\nModel parameters: {sum(p.numel() for p in model.parameters()):,}")
    print(f"Epochs: {args.epochs}, Batch size: {args.batch_size}, LR: {args.lr}")
    print(f"{'='*60}")

    # ── 학습 루프 ──
    best_val_loss = float('inf')
    start_time = time.time()

    for epoch in range(1, args.epochs + 1):
        train_loss = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, direction_acc = validate(model, val_loader, criterion, device)
        scheduler.step(val_loss)

        # 최적 모델 저장
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), args.output)
            marker = ' *'
        else:
            marker = ''

        if epoch % 5 == 0 or epoch == 1 or marker:
            print(f"Epoch {epoch:3d}/{args.epochs} | "
                  f"Train Loss: {train_loss:.4f} | "
                  f"Val Loss: {val_loss:.4f} | "
                  f"Direction Acc: {direction_acc:.2%}{marker}")

    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"Training complete in {elapsed:.1f}s")
    print(f"Best validation loss: {best_val_loss:.4f}")
    print(f"Model saved to: {args.output}")

    # 모델 파일 크기
    model_size_kb = os.path.getsize(args.output) / 1024
    print(f"Model size: {model_size_kb:.1f} KB")


if __name__ == '__main__':
    main()
