import os
import shutil

root_dir = os.path.dirname(os.path.abspath(__file__))
build_dir = os.path.join(root_dir, "frontend", "frontend", "build")

# 1. Copy styles/ -> build/styles/
src_styles = os.path.join(root_dir, "styles")
dst_styles = os.path.join(build_dir, "styles")
if os.path.exists(src_styles):
    shutil.copytree(src_styles, dst_styles, dirs_exist_ok=True)
    print("Synchronized styles/ ->", dst_styles)

# 2. Copy src/ -> build/src/
src_src = os.path.join(root_dir, "src")
dst_src = os.path.join(build_dir, "src")
if os.path.exists(src_src):
    shutil.copytree(src_src, dst_src, dirs_exist_ok=True)
    print("Synchronized src/ ->", dst_src)

# 3. Copy assets/ -> build/assets/
src_assets = os.path.join(root_dir, "assets")
dst_assets = os.path.join(build_dir, "assets")
if os.path.exists(src_assets):
    shutil.copytree(src_assets, dst_assets, dirs_exist_ok=True)
    print("Synchronized assets/ ->", dst_assets)

print("Synchronization complete!")
