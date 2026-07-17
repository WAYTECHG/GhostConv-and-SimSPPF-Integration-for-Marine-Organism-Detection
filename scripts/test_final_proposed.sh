#!/usr/bin/env bash
python run_experiment.py test --variant proposed_ghost_simsppf --weights runs/train/proposed_ghost_simsppf/weights/best.pt --data data/urpc2020.yaml --batch-size 1 --img-size 640 --device 0 --task test --name proposed_ghost_simsppf
