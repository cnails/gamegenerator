#!/usr/bin/env python3
"""Build script for creating standalone executable with PyInstaller."""

import os
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> None:
    """Build executable with PyInstaller."""
    project_root = Path(__file__).parent.parent
    os.chdir(project_root)

    # Check if PyInstaller is installed
    try:
        import PyInstaller
    except ImportError:
        print("Error: PyInstaller not installed. Install it with:")
        print("  pip install pyinstaller==6.3.0")
        sys.exit(1)

    # Clean previous builds
    dist_dir = project_root / "dist"
    build_dir = project_root / "build"
    spec_file = project_root / "game.spec"

    if dist_dir.exists():
        print("Cleaning previous build...")
        shutil.rmtree(dist_dir)
    if build_dir.exists():
        shutil.rmtree(build_dir)
    if spec_file.exists():
        spec_file.unlink()

    # Determine executable name based on OS
    if sys.platform == "win32":
        exe_name = "game.exe"
        icon = None  # Can add .ico file if needed
    else:
        exe_name = "game"
        icon = None

    # PyInstaller command
    # Use --noconsole on Windows to hide console, --windowed on macOS
    console_flag = "--noconsole" if sys.platform == "win32" else "--console"
    
    # Data directory separator: ; on Windows, : on Unix
    data_sep = ";" if sys.platform == "win32" else ":"
    
    cmd = [
        "pyinstaller",
        "--name=game",
        "--onefile",  # Single executable
        console_flag,  # Console handling based on OS
        f"--add-data=data{data_sep}data",  # Include data directory
        "--hidden-import=pygame",
        "--hidden-import=pygame._freetype",
        "--collect-all=pygame",
        "--clean",
        "game/__main__.py",
    ]

    # Add icon if available
    icon_path = project_root / "data" / "icon.ico"
    if icon_path.exists():
        cmd.extend(["--icon", str(icon_path)])

    print("Building executable with PyInstaller...")
    print(f"Command: {' '.join(cmd)}")
    print()

    # Run PyInstaller
    result = subprocess.run(cmd, cwd=project_root)

    if result.returncode != 0:
        print("Error: PyInstaller failed!")
        sys.exit(1)

    # Verify output
    exe_path = dist_dir / exe_name
    if not exe_path.exists():
        print(f"Error: Executable not found at {exe_path}")
        sys.exit(1)

    # Copy data directory if not already included
    data_dest = dist_dir / "data"
    data_src = project_root / "data"
    if data_src.exists() and not data_dest.exists():
        print("Copying data directory...")
        shutil.copytree(data_src, data_dest)

    # Print results
    print()
    print("=" * 60)
    print("Build completed successfully!")
    print("=" * 60)
    print(f"Executable: {exe_path}")
    print(f"Size: {exe_path.stat().st_size / 1024 / 1024:.2f} MB")
    print()
    print("To run the game:")
    if sys.platform == "win32":
        print(f"  {exe_path}")
    else:
        print(f"  ./{exe_path.name}")
    print()
    print("Note: Make sure the 'data' directory is in the same folder")
    print("      as the executable, or included in the build.")


if __name__ == "__main__":
    main()

