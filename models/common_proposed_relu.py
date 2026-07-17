# Compatibility file for old trained checkpoints.
# Some checkpoints were saved with module path: models.common_proposed_relu
# This file keeps those checkpoints loadable without retraining.

from models.common import *
from models.common_ghost_simsppf import *