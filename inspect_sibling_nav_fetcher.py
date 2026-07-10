import os

path = r"c:\Users\sidha\OneDrive\Desktop\NAV\nav_fetcher.py"
if os.path.exists(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
    print("Total lines:", len(lines))
    print("".join(lines[:200]))
else:
    print("Not found")
