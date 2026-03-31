"""
PyTorch 모델 -> ONNX 변환

사용:
  python export_onnx.py --input model.pt --output ../data/models/v1.onnx
"""

import argparse
import os
import sys

import torch
import onnx

from model import OFCPlacementModel


def parse_args():
    parser = argparse.ArgumentParser(description='Export OFC model to ONNX')
    parser.add_argument('--input', type=str, default='model.pt', help='PyTorch model path')
    parser.add_argument('--output', type=str, default='../data/models/v1.onnx', help='ONNX output path')
    parser.add_argument('--input-dim', type=int, default=62, help='Input dimension')
    return parser.parse_args()


def main():
    # Force UTF-8 stdout to avoid cp949 errors on Windows
    if sys.platform == 'win32':
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        os.environ['PYTHONIOENCODING'] = 'utf-8'

    args = parse_args()

    # Output directory
    output_dir = os.path.dirname(args.output)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    # Load model
    print(f"Loading model from {args.input}...")
    model = OFCPlacementModel(input_dim=args.input_dim)
    model.load_state_dict(torch.load(args.input, map_location='cpu', weights_only=True))
    model.eval()

    # ONNX export (use dynamo=False for legacy TorchScript-based export)
    dummy_input = torch.randn(1, args.input_dim)
    print(f"Exporting to ONNX: {args.output}")

    torch.onnx.export(
        model,
        dummy_input,
        args.output,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=['features'],
        output_names=['reward'],
        dynamic_axes={
            'features': {0: 'batch_size'},
            'reward': {0: 'batch_size'}
        },
        dynamo=False,
    )

    # Validate ONNX model
    onnx_model = onnx.load(args.output)
    onnx.checker.check_model(onnx_model)
    print("ONNX model validation passed.")

    # File size
    size_kb = os.path.getsize(args.output) / 1024
    print(f"ONNX model size: {size_kb:.1f} KB")
    print(f"Saved to: {args.output}")


if __name__ == '__main__':
    main()
