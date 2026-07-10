import requests
import json

url = "https://www.amfiindia.com/gateway/pollingsebi/api/amfi/fundperformance"
headers = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"}
payload = {
    "maturityType": 1,
    "category": 1,
    "subCategory": 5,
    "mfid": 0,
    "reportDate": "31-Mar-2026"
}

try:
    resp = requests.post(url, json=payload, headers=headers, timeout=20)
    if resp.status_code == 200:
        rows = resp.json().get("data", [])
        for r in rows:
            if "hdfc" in r.get("schemeName", "").lower():
                print("Found matching HDFC row:")
                for k, v in r.items():
                    print(f"  {k}: {v}")
                break
except Exception as e:
    print("Error:", e)
