import requests
from datetime import datetime

url = "https://www.amfiindia.com/gateway/pollingsebi/api/amfi/fundperformance"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "application/json"
}

# Open ended (1), Equity (1), Flexi Cap (3)
payload = {
    "maturityType": 1,
    "category": 1,
    "subCategory": 3,
    "mfid": 0,
    "reportDate": "30-Apr-2026"
}

print("Querying AMFI Performance API...")
try:
    resp = requests.post(url, json=payload, headers=headers, timeout=20)
    print("Status:", resp.status_code)
    if resp.status_code == 200:
        data = resp.json()
        print("Validation Message:", data.get("validationMsg"))
        rows = data.get("data", [])
        print("Total rows returned:", len(rows))
        if rows:
            print("\nSample Row Keys:")
            print(list(rows[0].keys()))
            print("\nSample Row values:")
            # Find a row containing HDFC
            hdfc_row = None
            for r in rows:
                if "hdfc" in str(r.get("schemeName", "")).lower():
                    hdfc_row = r
                    break
            if hdfc_row is None:
                hdfc_row = rows[0]
            for k, v in hdfc_row.items():
                print(f"  {k}: {v}")
    else:
        print(resp.text)
except Exception as e:
    print("Error:", e)
