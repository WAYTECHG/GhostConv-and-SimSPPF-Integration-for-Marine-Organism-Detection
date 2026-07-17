#!/usr/bin/env bash
# Change the --source path to your test image or folder.
python run_experiment.py detect --variant proposed_ghost_simsppf --weights runs/train/proposed_ghost_simsppf/weights/best.pt --source URPC2020/URPC2020/test/images/000008.jpg --img-size 640 --device 0
