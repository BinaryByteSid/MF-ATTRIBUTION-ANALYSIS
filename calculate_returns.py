import pandas as pd
import numpy as np

# Load Nifty CSV
df = pd.read_csv("NIFTY50_2025-06-01_to_2026-06-01.csv")
df['Date'] = pd.to_datetime(df['Date'])
df = df.sort_values('Date').reset_index(drop=True)

# Latest date in the CSV
latest_date = df['Date'].max()
print("Latest Date in Nifty CSV:", latest_date)

# We want returns for:
# - 1 Month: from 1 month ago
# - 3 Months: from 3 months ago
# - 6 Months: from 6 months ago
# - FY till Date: since start of FY (April 1st, 2026? Or April 1st, 2025? Wait! The dates in CSV are from 2025-06-01 to 2026-06-01. If the latest date is 2026-06-01, the FY till Date would be from 2026-04-01 to 2026-06-01.)
# - Since Inception (01/01/2021) - Wait, the CSV starts at 2025-06-01, so it doesn't have 01/01/2021!

def get_return(start_date, end_date):
    start_row = df[df['Date'] >= start_date].iloc[0]
    end_row = df[df['Date'] <= end_date].iloc[-1]
    ret = (end_row['Close'] / start_row['Close'] - 1) * 100
    print(f"From {start_row['Date'].strftime('%Y-%m-%d')} (Close: {start_row['Close']}) to {end_row['Date'].strftime('%Y-%m-%d')} (Close: {end_row['Close']}) = {ret:.2f}%")

print("\n--- 1 Month Return ---")
get_return("2026-04-29", "2026-05-29")
get_return("2026-05-01", "2026-06-01")

print("\n--- 3 Months Return ---")
get_return("2026-02-27", "2026-05-29")
get_return("2026-03-01", "2026-06-01")

print("\n--- 6 Months Return ---")
get_return("2025-11-28", "2026-05-29")
get_return("2025-12-01", "2026-06-01")

print("\n--- FY till Date ---")
get_return("2026-04-01", "2026-05-29")
get_return("2026-04-01", "2026-06-01")
