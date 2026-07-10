import requests
import json
from test_amfi_extraction import get_performance_stats

print("Fetching stats for HDFC Mid Cap Fund (Regular) on March 31, 2026...")
res = get_performance_stats(
    fund_name="HDFC Mid Cap Fund-Reg(G)",
    category="Mid Cap Fund",
    date_str="31-Mar-2026",
    is_direct=False
)
print("Result:")
print(json.dumps(res, indent=2))
