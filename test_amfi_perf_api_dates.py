import requests

url = "https://www.amfiindia.com/gateway/pollingsebi/api/amfi/fundperformance"
headers = {
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/json"
}

dates = ["31-Dec-2025", "30-Jan-2026", "27-Feb-2026", "31-Mar-2026"]
for d in dates:
    payload = {
        "maturityType": 1,
        "category": 1,
        "subCategory": 3,
        "mfid": 0,
        "reportDate": d
    }
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            rows = data.get("data", [])
            print(f"Date {d}: Success, returned {len(rows)} rows.")
        else:
            print(f"Date {d}: Failed status {resp.status_code}")
    except Exception as e:
        print(f"Date {d}: Error: {e}")
