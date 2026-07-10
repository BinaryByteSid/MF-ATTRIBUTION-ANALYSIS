import sys
sys.path.append("backend")

from app.utils.nav_fetcher import fetch_nav_history
import pandas as pd

nav_history = fetch_nav_history(135853)
df = pd.DataFrame(nav_history, columns=["Date", "NAV"])
df["Date"] = pd.to_datetime(df["Date"])
df = df.sort_values("Date").reset_index(drop=True)

# Resample or show month ends
df.set_index("Date", inplace=True)
monthly_ends = df.resample("ME").last()
print("Monthly end NAVs for HDFC Nifty 50 ETF (Scheme Code 135853):")
print(monthly_ends.to_string())
