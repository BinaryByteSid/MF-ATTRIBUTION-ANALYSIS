import os

path = r"c:\Users\sidha\OneDrive\Desktop\NAV\nav_fetcher.py"
if os.path.exists(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
    with open("sibling_200_500.txt", "w", encoding="utf-8") as out:
        out.write("".join(lines[200:500]))
    print("Written to sibling_200_500.txt")
else:
    print("Not found")
