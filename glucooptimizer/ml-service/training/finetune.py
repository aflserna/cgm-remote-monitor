"""
Personal fine-tuning: adapts the base model to an individual's glucose dynamics.
Triggered automatically when a user accumulates 30+ days of data.

Usage:
    python training/finetune.py --user-id <userId> --ns-url <url> --api-secret <secret>
"""

import argparse
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import os
import json
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from training.pretrain import GlucoseLSTM, GlucoseDataset, normalize_glucose, SEQUENCE_LEN, FEATURE_DIM, PREDICTION_HORIZONS


def load_base_model(model_dir='models/base_model'):
    model = GlucoseLSTM()
    model_path = os.path.join(model_dir, 'base_model.pt')
    if os.path.exists(model_path):
        model.load_state_dict(torch.load(model_path, map_location='cpu'))
        print(f"Loaded base model from {model_path}")
    else:
        print("Base model not found, starting from scratch (train pretrain.py first)")
    return model


def build_personal_sequences(ns_entries: list, ns_treatments: list):
    """
    Build training sequences from personal Nightscout data.
    """
    # Sort by time
    entries = sorted(ns_entries, key=lambda x: x.get('date', 0))
    glucose = {e['date']: e['sgv'] for e in entries if 'sgv' in e}

    sequences, targets = [], []
    times = sorted(glucose.keys())

    for i in range(SEQUENCE_LEN, len(times) - max(PREDICTION_HORIZONS)):
        window_times = times[i - SEQUENCE_LEN:i]
        g_vals = [glucose[t] for t in window_times]

        features = []
        for j, gval in enumerate(g_vals):
            trend = (g_vals[j] - g_vals[j-1]) / 5 if j > 0 else 0
            t_ms = window_times[j]
            hour = (t_ms // 3_600_000) % 24
            features.append([
                normalize_glucose(gval),
                np.clip(trend / 5.0, -1, 1),
                0.0,  # IOB (would need devicestatus alignment)
                0.0,  # COB
                np.sin(2 * np.pi * hour / 24),
                np.cos(2 * np.pi * hour / 24),
                0.0, 0.0, 0.0, 0.0,
            ])

        # Target: glucose at +30, +60, +90 min (6, 12, 18 steps)
        target_times = [i + h for h in PREDICTION_HORIZONS]
        if any(idx >= len(times) for idx in target_times):
            continue
        target = [normalize_glucose(glucose[times[idx]]) for idx in target_times]

        sequences.append(features)
        targets.append(target)

    return np.array(sequences, dtype=np.float32), np.array(targets, dtype=np.float32)


def finetune(user_id: str, ns_entries: list, ns_treatments: list,
             base_model_dir='models/base_model', output_dir=None,
             epochs=20, lr=1e-4):

    if output_dir is None:
        output_dir = f'models/personal/{user_id}'

    print(f"Fine-tuning for user {user_id} with {len(ns_entries)} CGM entries...")

    X, y = build_personal_sequences(ns_entries, ns_treatments)
    print(f"Built {len(X)} personal sequences")

    if len(X) < 100:
        print("Not enough personal data for fine-tuning (need at least 100 sequences ~7 days)")
        return False

    model = load_base_model(base_model_dir)

    # Freeze LSTM layers, only fine-tune attention + FC (transfer learning)
    for name, param in model.named_parameters():
        if 'lstm' in name:
            param.requires_grad = False

    optimizer = torch.optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=lr, weight_decay=1e-5
    )
    criterion = nn.HuberLoss()

    split = int(0.9 * len(X))
    train_ds = GlucoseDataset(X[:split], y[:split])
    val_ds = GlucoseDataset(X[split:], y[split:])
    train_loader = DataLoader(train_ds, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=64)

    best_val_loss = float('inf')

    for epoch in range(epochs):
        model.train()
        for X_b, y_b in train_loader:
            optimizer.zero_grad()
            loss = criterion(model(X_b), y_b)
            loss.backward()
            optimizer.step()

        model.eval()
        val_loss = 0
        with torch.no_grad():
            for X_b, y_b in val_loader:
                val_loss += criterion(model(X_b), y_b).item()
        val_loss /= len(val_loader)

        print(f"Epoch {epoch+1}/{epochs} | Val loss: {val_loss:.4f}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            os.makedirs(output_dir, exist_ok=True)
            torch.save(model.state_dict(), os.path.join(output_dir, 'personal_model.pt'))

    # Save metadata
    with open(os.path.join(output_dir, 'model_info.json'), 'w') as f:
        json.dump({
            'userId': user_id,
            'version': 'personal-v1',
            'val_loss': best_val_loss,
            'sequences_trained': len(X),
        }, f, indent=2)

    print(f"Personal model saved to {output_dir}")
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--user-id', required=True)
    parser.add_argument('--data-file', help='JSON file with {entries: [...], treatments: [...]}')
    args = parser.parse_args()

    with open(args.data_file) as f:
        data = json.load(f)

    finetune(args.user_id, data['entries'], data.get('treatments', []))
