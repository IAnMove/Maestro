"""Compile Hunyuan3D-2.1 mesh_inpaint_processor in the current directory.

Tencent's 2.1 tree only ships compile_mesh_painter.sh (g++ / python3-config).
That command does not work on Windows. This helper mirrors Hunyuan3D-2's
setup.py flags so Pinokio can build the same extension with MSVC or the
Linux toolchain. Run it from hy3dpaint/DifferentiableRenderer with pybind11
already installed in the Hunyuan env.
"""
from __future__ import annotations

import platform
import sys

from setuptools import Extension, setup


def extra_args(system_name: str | None = None, platform_name: str | None = None):
    system = (system_name or platform.system()).lower()
    plat = platform_name or sys.platform
    cpp_std = "c++14"
    if plat == "win32":
        return (
            ["/O2", f"/std:{cpp_std}", "/EHsc", "/MP", "/DWIN32_LEAN_AND_MEAN", "/bigobj"],
            [],
        )
    if system == "linux":
        return (
            ["-O3", f"-std={cpp_std}", "-fPIC", "-Wall", "-Wextra", "-pthread"],
            ["-fPIC", "-pthread"],
        )
    raise RuntimeError(f"Unsupported platform for mesh_inpaint_processor: {system}")


def main() -> None:
    import pybind11

    compile_args, link_args = extra_args()
    setup(
        name="mesh_inpaint_processor",
        ext_modules=[
            Extension(
                "mesh_inpaint_processor",
                ["mesh_inpaint_processor.cpp"],
                include_dirs=[pybind11.get_include(), pybind11.get_include(user=True)],
                language="c++",
                extra_compile_args=compile_args,
                extra_link_args=link_args,
            )
        ],
        script_args=["build_ext", "--inplace"],
    )


if __name__ == "__main__":
    main()
