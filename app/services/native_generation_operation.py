"""Typed adapters for operations admitted into the existing generation queue.

An adapter freezes caller input without I/O and validates/resolves resources
before native admission. It neither owns task storage nor starts workers.
"""
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class NativeGenerationOperation:
    freeze: Callable[[dict], tuple[dict, dict]]
    prepare: Callable[[dict], tuple[dict, list]]
    catalog: dict
    prepare_request: Callable | None = None
    worker: Callable[[str], bool] | None = None
    use_generation_defaults: bool = True
