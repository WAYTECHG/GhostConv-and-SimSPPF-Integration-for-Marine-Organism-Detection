"""
Safe experiment runner for AIT2309246 DU-MobileYOLO variants.

Purpose
-------
This file organizes training, testing, detection, and checkpoint loading without
removing or renaming the original model files. The separate models/common_*.py
files are intentionally preserved because existing trained .pt checkpoints may
refer to those module paths.

Typical use
-----------
1) Place dataset locally and update data/urpc2020.yaml if needed.
2) Place your local weights under runs/train/<variant>/weights/best.pt, or pass
   --weights with the correct path.
3) Use this runner instead of manually editing models/yolo.py.

Examples
--------
python run_experiment.py --list
python run_experiment.py check --variant proposed_ghost_simsppf --weights runs/train/proposed_ghost_simsppf/weights/best.pt
python run_experiment.py test --variant proposed_ghost_simsppf --weights runs/train/proposed_ghost_simsppf/weights/best.pt --batch-size 1 --task test
python run_experiment.py detect --variant proposed_ghost_simsppf --weights runs/train/proposed_ghost_simsppf/weights/best.pt --source URPC2020/URPC2020/test/images/000008.jpg
python run_experiment.py train --variant proposed_ghost_simsppf --epochs 300 --batch-size 8 --img-size 640 --device 0 --workers 2 --weights=
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
YOLO_FILE = PROJECT_ROOT / "models" / "yolo.py"

# Keep names aligned with your report/runs folders.
# The common_module value is used only as a temporary import in models/yolo.py.
VARIANTS = {
    "baseline": {
        "description": "Original DU-MobileYOLO baseline",
        "cfg": "cfg/training/DU_MobileYOLO.yaml",
        "common_module": "models.common",
        "default_weight": "runs/train/baseline/weights/best.pt",
        "default_name": "baseline",
    },
    "yolov7_tiny": {
        "description": "YOLOv7-tiny retrained baseline",
        "cfg": "cfg/training/yolov7-tiny.yaml",
        "common_module": "models.common",
        "default_weight": "runs/train/yolov7_tiny/weights/best.pt",
        "default_name": "yolov7_tiny",
    },
    "proposed_ghost": {
        "description": "GhostConv ablation",
        "cfg": "cfg/training/proposed_ghost.yaml",
        "common_module": "models.common_ghost",
        "default_weight": "runs/train/proposed_ghost/weights/best.pt",
        "default_name": "proposed_ghost",
    },
    "proposed_sppf": {
        "description": "SPPF ablation",
        "cfg": "cfg/training/proposed_sppf.yaml",
        "common_module": "models.common_sppf",
        "default_weight": "runs/train/proposed_sppf/weights/best.pt",
        "default_name": "proposed_sppf",
    },
    "proposed_simsppf": {
        "description": "SimSPPF ablation",
        "cfg": "cfg/training/proposed_simsppf.yaml",
        "common_module": "models.common_simsppf",
        "default_weight": "runs/train/proposed_simsppf/weights/best.pt",
        "default_name": "proposed_simsppf",
    },
    "proposed_ghost_sppf": {
        "description": "GhostConv + SPPF ablation",
        "cfg": "cfg/training/proposed_ghost_sppf.yaml",
        "common_module": "models.common_ghost_sppf",
        "default_weight": "runs/train/proposed_ghost_sppf/weights/best.pt",
        "default_name": "proposed_ghost_sppf",
    },
    "proposed_ghost_simsppf": {
        "description": "Final proposed GhostConv + SimSPPF",
        "cfg": "cfg/training/proposed_ghost_simsppf.yaml",
        "common_module": "models.common_ghost_simsppf",
        "default_weight": "runs/train/proposed_ghost_simsppf/weights/best.pt",
        "default_name": "proposed_ghost_simsppf",
    },
}

IMPORT_PATTERN = re.compile(r"^from\s+models\.common[\w_]*\s+import\s+\*\s*$", re.MULTILINE)


def _rel(path: str | Path) -> str:
    return str(path).replace("\\", "/")


def _variant(name: str) -> dict:
    if name not in VARIANTS:
        available = ", ".join(VARIANTS)
        raise SystemExit(f"Unknown variant '{name}'. Available variants: {available}")
    return VARIANTS[name]


@contextmanager
def temporary_yolo_import(common_module: str):
    """Temporarily switch the common module imported by models/yolo.py.

    This is intentionally temporary. It allows each ablation YAML to be parsed
    using the matching common_*.py file, while preserving the original file after
    the command finishes.
    """
    original_text = YOLO_FILE.read_text(encoding="utf-8")
    new_import = f"from {common_module} import *"

    if not IMPORT_PATTERN.search(original_text):
        raise RuntimeError(
            "Could not find the common import line in models/yolo.py. "
            "No changes were made."
        )

    patched_text = IMPORT_PATTERN.sub(new_import, original_text, count=1)

    if patched_text != original_text:
        YOLO_FILE.write_text(patched_text, encoding="utf-8")
        print(f"[safe-runner] Temporarily using: {new_import}")
    else:
        print(f"[safe-runner] models/yolo.py already uses: {new_import}")

    try:
        yield
    finally:
        YOLO_FILE.write_text(original_text, encoding="utf-8")
        print("[safe-runner] Restored models/yolo.py to its previous state.")


def run_command(command: list[str]) -> int:
    print("[safe-runner] Running command:")
    print(" ".join(command))
    return subprocess.call(command, cwd=str(PROJECT_ROOT))


def list_variants() -> None:
    print("Available variants:\n")
    for key, value in VARIANTS.items():
        print(f"- {key}")
        print(f"  description   : {value['description']}")
        print(f"  cfg           : {value['cfg']}")
        print(f"  common module : {value['common_module']}")
        print(f"  default weight: {value['default_weight']}\n")


def check_files(variant_name: str, weights: str | None) -> None:
    v = _variant(variant_name)
    cfg = PROJECT_ROOT / v["cfg"]
    common_file = PROJECT_ROOT / (v["common_module"].replace(".", os.sep) + ".py")
    weight_path = PROJECT_ROOT / (weights or v["default_weight"])

    print(f"Variant       : {variant_name}")
    print(f"Description   : {v['description']}")
    print(f"YAML          : {_rel(cfg)} -> {'OK' if cfg.exists() else 'MISSING'}")
    print(f"Common module : {_rel(common_file)} -> {'OK' if common_file.exists() else 'MISSING'}")
    print(f"Weight path   : {_rel(weight_path)} -> {'OK' if weight_path.exists() else 'MISSING'}")
    print("\nNote: weights are not included in the submitted zip. Keep/copy them locally when testing.")


def load_check(variant_name: str, weights: str) -> int:
    v = _variant(variant_name)
    if not weights:
        weights = v["default_weight"]

    # Do not monkey-patch numpy._core here. Pandas/numpy are imported by
    # models/common.py during model loading, and overriding numpy._core can break
    # normal numpy imports on newer numpy versions.
    inline = (
        "import torch; "
        "from models.experimental import attempt_load; "
        f"m = attempt_load({weights!r}, map_location=torch.device('cpu')); "
        "print('LOAD OK:', type(m).__name__); "
        "print('Model stride:', getattr(m, 'stride', 'N/A'))"
    )

    with temporary_yolo_import(v["common_module"]):
        return run_command([sys.executable, "-c", inline])


def train(args: argparse.Namespace) -> int:
    v = _variant(args.variant)
    command = [
        sys.executable, "train.py",
        "--cfg", v["cfg"],
        "--data", args.data,
        "--hyp", args.hyp,
        "--epochs", str(args.epochs),
        "--batch-size", str(args.batch_size),
        "--img-size", str(args.img_size), str(args.img_size),
        "--device", args.device,
        "--workers", str(args.workers),
        "--project", args.project,
        "--name", args.name or v["default_name"],
        "--exist-ok",
    ]

    # Empty string means training from scratch; this avoids accidentally loading yolo7.pt.
    command.extend(["--weights", args.weights if args.weights is not None else ""])

    if args.extra:
        command.extend(args.extra)

    with temporary_yolo_import(v["common_module"]):
        return run_command(command)


def test(args: argparse.Namespace) -> int:
    v = _variant(args.variant)
    weights = args.weights or v["default_weight"]
    command = [
        sys.executable, "test.py",
        "--weights", weights,
        "--data", args.data,
        "--batch-size", str(args.batch_size),
        "--img-size", str(args.img_size),
        "--task", args.task,
        "--device", args.device,
        "--project", args.project,
        "--name", args.name or v["default_name"],
        "--exist-ok",
    ]
    if args.extra:
        command.extend(args.extra)

    with temporary_yolo_import(v["common_module"]):
        return run_command(command)


def detect(args: argparse.Namespace) -> int:
    v = _variant(args.variant)
    weights = args.weights or v["default_weight"]
    command = [
        sys.executable, "detect.py",
        "--weights", weights,
        "--source", args.source,
        "--img-size", str(args.img_size),
        "--conf-thres", str(args.conf_thres),
        "--iou-thres", str(args.iou_thres),
        "--device", args.device,
        "--project", args.project,
        "--name", args.name or v["default_name"],
        "--exist-ok",
    ]
    if args.save_txt:
        command.append("--save-txt")
    if args.extra:
        command.extend(args.extra)

    with temporary_yolo_import(v["common_module"]):
        return run_command(command)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Safe runner for AIT2309246 DU-MobileYOLO experiments")
    parser.add_argument("--list", action="store_true", help="List all available variants and exit")

    subparsers = parser.add_subparsers(dest="mode")

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--variant", default="proposed_ghost_simsppf", choices=sorted(VARIANTS.keys()))
    common.add_argument("--data", default="data/urpc2020.yaml")
    common.add_argument("--img-size", type=int, default=640)
    common.add_argument("--device", default="0")
    common.add_argument("--weights", default=None, help="Path to .pt weights. If omitted, the variant default is used.")
    common.add_argument("--extra", nargs=argparse.REMAINDER, help="Extra arguments forwarded to train.py/test.py/detect.py")

    p = subparsers.add_parser("files", parents=[common], help="Check whether YAML/common module/weight path exists")
    p.set_defaults(func=lambda a: (check_files(a.variant, a.weights), 0)[1])

    p = subparsers.add_parser("check", parents=[common], help="Load a .pt checkpoint on CPU to verify compatibility")
    p.set_defaults(func=load_check)

    p = subparsers.add_parser("train", parents=[common], help="Train a selected variant")
    p.add_argument("--hyp", default="data/hyp.scratch.p5.yaml")
    p.add_argument("--epochs", type=int, default=300)
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument("--workers", type=int, default=2)
    p.add_argument("--project", default="runs/train")
    p.add_argument("--name", default=None)
    p.set_defaults(func=train)

    p = subparsers.add_parser("test", parents=[common], help="Evaluate a selected variant using an existing checkpoint")
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--task", default="test", choices=["train", "val", "test", "speed", "study"])
    p.add_argument("--project", default="runs/test")
    p.add_argument("--name", default=None)
    p.set_defaults(func=test)

    p = subparsers.add_parser("detect", parents=[common], help="Run detection using an existing checkpoint")
    p.add_argument("--source", required=True, help="Image, folder, video, webcam id, or txt source")
    p.add_argument("--conf-thres", type=float, default=0.25)
    p.add_argument("--iou-thres", type=float, default=0.45)
    p.add_argument("--project", default="runs/detect")
    p.add_argument("--name", default=None)
    p.add_argument("--save-txt", action="store_true")
    p.set_defaults(func=detect)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.list or args.mode is None:
        list_variants()
        return 0

    if args.mode == "check":
        return args.func(args.variant, args.weights)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
