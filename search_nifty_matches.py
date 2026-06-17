import pandas as pd

df = pd.read_csv("NIFTY50_2025-06-01_to_2026-06-01.csv")
df['Date'] = pd.to_datetime(df['Date'])
df = df.sort_values('Date').reset_index(drop=True)

# Let's search all possible date pairs (d1, d2) where d2 is near the end of May 2026 / June 2026
# and see if the return is exactly -3.10%, -1.56%, 2.23%, 7.66%

target_returns = {
    "1M": -3.10,
    "3M": -1.56,
    "6M": 2.23,
    "FYTD": 7.66,
    "SI": 12.39
}

print("Searching for exact matches:")
for i in range(len(df)):
    for j in range(i+1, len(df)):
        d1 = df.loc[i, 'Date']
        d2 = df.loc[j, 'Date']
        c1 = df.loc[i, 'Close']
        c2 = df.loc[j, 'Close']
        
        # We only care about d2 being in late May or early June 2026
        if d2.year != 2026 or d2.month not in [5, 6]:
            continue
            
        ret = (c2 / c1 - 1) * 100
        
        for label, target in target_returns.items():
            if abs(ret - target) < 0.015:
                print(f"Match {label}: {d1.strftime('%Y-%m-%d')} ({c1:.2f}) -> {d2.strftime('%Y-%m-%d')} ({c2:.2f}) = {ret:.3f}% (target {target}%)")
