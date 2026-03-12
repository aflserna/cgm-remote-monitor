"""
Pre-training script using OpenAPS Data Commons and OhioT1DM datasets.

Usage:
    python training/pretrain.py --dataset openaps --epochs 50

Datasets:
    - OpenAPS Data Commons: https://openaps.org/outcomes/data-commons/
    - OhioT1DM: http://smarthealth.cs.ohio.edu/OhioT1DM-dataset.html

This trains an LSTM model that serves as the base for personal fine-tuning.
"""

import argparse
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import os
import json

SEQUENCE_LEN = 36    # 3 hours of CGM at 5-min intervals
FEATURE_DIM = 10     # features per timestep
PREDICTION_HORIZONS = [6, 12, 18]  # 30, 60, 90 min (in 5-min steps)


class GlucoseLSTM(nn.Module):
    """
    LSTM model for multi-horizon glucose prediction.
    Predicts glucose at t+30, t+60, t+90 minutes simultaneously.
    """
    def __init__(self, input_size=FEATURE_DIM, hidden_size=128, num_layers=2, dropout=0.2):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout,
            batch_first=True,
        )
        self.attention = nn.MultiheadAttention(hidden_size, num_heads=4, dropout=0.1, batch_first=True)
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, len(PREDICTION_HORIZONS)),  # predict 3 horizons
        )

    def forward(self, x):
        lstm_out, _ = self.lstm(x)                     # (B, T, H)
        attn_out, _ = self.attention(lstm_out, lstm_out, lstm_out)
        out = self.fc(attn_out[:, -1, :])              # use last timestep
        return out                                      # (B, 3) — predictions for 30/60/90 min


class GlucoseDataset(Dataset):
    def __init__(self, sequences, targets):
        self.X = torch.FloatTensor(sequences)
        self.y = torch.FloatTensor(targets)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


def normalize_glucose(g, min_val=40, max_val=400):
    return (g - min_val) / (max_val - min_val)


def build_sequences_from_openaps(data_dir: str):
    """
    Process OpenAPS Data Commons CSV files.
    Expected columns: time, sgv (or glucose), iob, cob, bolus, basal
    """
    sequences, targets = [], []

    for fname in os.listdir(data_dir):
        if not fname.endswith('.csv'):
            continue
        try:
            df = pd.read_csv(os.path.join(data_dir, fname))
            df = df.sort_values('time').reset_index(drop=True)

            # Required columns
            if 'sgv' not in df.columns and 'glucose' not in df.columns:
                continue

            glucose_col = 'sgv' if 'sgv' in df.columns else 'glucose'
            df[glucose_col] = pd.to_numeric(df[glucose_col], errors='coerce')
            df = df.dropna(subset=[glucose_col])

            iob = df.get('iob', pd.Series(0, index=df.index)).fillna(0)
            cob = df.get('cob', pd.Series(0, index=df.index)).fillna(0)

            g = df[glucose_col].values

            # Slide window
            for i in range(SEQUENCE_LEN, len(g) - max(PREDICTION_HORIZONS)):
                window_g = g[i - SEQUENCE_LEN:i]

                # Skip if too many missing values
                if np.isnan(window_g).sum() > 5:
                    continue

                # Build feature matrix (SEQUENCE_LEN x FEATURE_DIM)
                features = []
                for j in range(SEQUENCE_LEN):
                    gval = window_g[j] if not np.isnan(window_g[j]) else window_g[~np.isnan(window_g)][-1]
                    trend = (window_g[j] - window_g[j-1]) if j > 0 else 0
                    features.append([
                        normalize_glucose(gval),
                        np.clip(trend / 5.0, -1, 1),
                        float(iob.iloc[i - SEQUENCE_LEN + j]) / 10.0,
                        float(cob.iloc[i - SEQUENCE_LEN + j]) / 100.0,
                        np.sin(2 * np.pi * (i % 288) / 288),  # time of day
                        np.cos(2 * np.pi * (i % 288) / 288),
                        0.0, 0.0, 0.0, 0.0,  # meal/exercise features (from manual input)
                    ])

                target = [
                    normalize_glucose(g[i + h])
                    for h in PREDICTION_HORIZONS
                ]

                sequences.append(features)
                targets.append(target)

        except Exception as e:
            print(f"Skipping {fname}: {e}")

    return np.array(sequences, dtype=np.float32), np.array(targets, dtype=np.float32)


def train(data_dir: str, output_dir: str, epochs: int = 50, batch_size: int = 256):
    print(f"Loading data from {data_dir}...")
    X, y = build_sequences_from_openaps(data_dir)
    print(f"Dataset: {len(X)} sequences")

    if len(X) == 0:
        print("No data found. Place OpenAPS CSV files in the data directory.")
        return

    # Train/val split
    split = int(0.9 * len(X))
    train_ds = GlucoseDataset(X[:split], y[:split])
    val_ds = GlucoseDataset(X[split:], y[split:])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)

    model = GlucoseLSTM()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.HuberLoss()

    best_val_loss = float('inf')

    for epoch in range(epochs):
        model.train()
        train_loss = 0
        for X_batch, y_batch in train_loader:
            optimizer.zero_grad()
            pred = model(X_batch)
            loss = criterion(pred, y_batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item()

        model.eval()
        val_loss = 0
        with torch.no_grad():
            for X_batch, y_batch in val_loader:
                pred = model(X_batch)
                val_loss += criterion(pred, y_batch).item()

        scheduler.step()

        train_loss /= len(train_loader)
        val_loss /= len(val_loader)

        # Convert loss to approximate mg/dL error
        mse_mgdl = val_loss * (360 ** 2)  # denormalized
        rmse = mse_mgdl ** 0.5

        print(f"Epoch {epoch+1}/{epochs} | Train loss: {train_loss:.4f} | Val loss: {val_loss:.4f} | ~RMSE: {rmse:.1f} mg/dL")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            os.makedirs(output_dir, exist_ok=True)
            torch.save(model.state_dict(), os.path.join(output_dir, 'base_model.pt'))
            print(f"  -> Saved best model")

    # Save model metadata
    with open(os.path.join(output_dir, 'model_info.json'), 'w') as f:
        json.dump({
            'version': 'base-lstm-v1',
            'input_size': FEATURE_DIM,
            'hidden_size': 128,
            'num_layers': 2,
            'sequence_len': SEQUENCE_LEN,
            'prediction_horizons_min': [30, 60, 90],
            'trained_on': 'openaps-data-commons',
            'val_loss': best_val_loss,
        }, f, indent=2)

    print(f"\nTraining complete. Model saved to {output_dir}/base_model.pt")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', default='data/openaps', help='Path to OpenAPS CSV files')
    parser.add_argument('--output-dir', default='models/base_model', help='Where to save trained model')
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--batch-size', type=int, default=256)
    args = parser.parse_args()

    train(args.data_dir, args.output_dir, args.epochs, args.batch_size)
