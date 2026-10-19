import os
import sys

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, copy_metadata

KEEP = {"linux": ("providers_shared", "providers_cuda"), "win32": ("providers_shared", "providers_cuda"), "darwin": ("providers_shared",)}
keep = KEEP.get(sys.platform, ("providers_",))


def wanted(path):
    name = os.path.basename(path).lower()
    return "providers_" not in name or any(k in name for k in keep)


binaries = [b for b in collect_dynamic_libs("onnxruntime") if wanted(b[0])]
datas = collect_data_files("onnxruntime") + copy_metadata("onnxruntime")
hiddenimports = ["onnxruntime.capi.onnxruntime_pybind11_state"]
