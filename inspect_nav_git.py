import subprocess
import os

nav_path = r"c:\Users\sidha\OneDrive\Desktop\NAV"
if os.path.exists(nav_path):
    print("NAV folder exists.")
    dot_git = os.path.join(nav_path, ".git")
    if os.path.exists(dot_git):
        print("NAV has .git folder.")
        # Run git status in NAV folder
        try:
            res = subprocess.run(["git", "status"], cwd=nav_path, capture_output=True, text=True, check=True)
            print("Git Status in NAV:")
            print(res.stdout)
        except Exception as e:
            print("Error running git status in NAV:", e)
    else:
        print("NAV does not have .git folder (not a Git repository directly)")
else:
    print("NAV folder does not exist.")
