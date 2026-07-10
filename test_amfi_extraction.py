import requests
import re
import pandas as pd
from datetime import datetime

def map_section_to_ids(sec):
    sec_lower = str(sec).lower()
    maturity_id = 1
    if "close" in sec_lower:
        maturity_id = 2
    elif "interval" in sec_lower:
        maturity_id = 2
        
    cat_id = 1
    if "debt" in sec_lower:
        cat_id = 2
    elif "hybrid" in sec_lower:
        cat_id = 3
    elif "solution" in sec_lower:
        cat_id = 4
    elif "other" in sec_lower:
        cat_id = 5
        
    if cat_id == 1:
        sub_id = 1
    elif cat_id == 2:
        sub_id = 15
    elif cat_id == 3:
        sub_id = 30
    elif cat_id == 4:
        sub_id = 36
    elif cat_id == 5:
        sub_id = 38
        
    if cat_id == 1:
        if "large & mid" in sec_lower:
            sub_id = 2
        elif "large cap" in sec_lower:
            sub_id = 1
        elif "flexi cap" in sec_lower:
            sub_id = 3
        elif "multi cap" in sec_lower:
            sub_id = 4
        elif "mid cap" in sec_lower:
            sub_id = 5
        elif "small cap" in sec_lower:
            sub_id = 6
        elif "value" in sec_lower:
            sub_id = 7
        elif "elss" in sec_lower:
            sub_id = 8
        elif "contra" in sec_lower:
            sub_id = 9
        elif "dividend yield" in sec_lower:
            sub_id = 10
        elif "focused" in sec_lower:
            sub_id = 11
        elif "sectoral" in sec_lower or "thematic" in sec_lower:
            sub_id = 12
            
    return maturity_id, cat_id, sub_id

def clean_name(name: str) -> str:
    n = str(name).lower()
    n = n.replace("flexicap", "flexi cap")
    n = n.replace("multicap", "multi cap")
    n = n.replace("midcap", "mid cap")
    n = n.replace("smallcap", "small cap")
    n = n.replace("largecap", "large cap")
    n = n.replace("-", " ").replace("/", " ").replace("(", " ").replace(")", " ")
    tokens = n.split()
    suffixes_to_remove = {
        "direct", "regular", "retail", "plan", "growth", "option", "idcw", "dividend", 
        "payout", "reinvestment", "annual", "monthly", "weekly", "quarterly", "fortnightly",
        "bonus", "fund"
    }
    cleaned_tokens = [t for t in tokens if t not in suffixes_to_remove]
    return " ".join(cleaned_tokens)

def find_matching_perf_row(nav_name: str, perf_rows: list) -> dict | None:
    if not perf_rows:
        return None
    cleaned_nav = clean_name(nav_name)
    if not cleaned_nav:
        return None
    for p_row in perf_rows:
        p_name = p_row.get("schemeName") or ""
        cleaned_perf = clean_name(p_name)
        if cleaned_perf and (cleaned_perf in cleaned_nav or cleaned_nav in cleaned_perf):
            return p_row
    nav_tokens = set(cleaned_nav.split())
    best_row = None
    best_score = 0.0
    for p_row in perf_rows:
        p_name = p_row.get("schemeName") or ""
        cleaned_perf = clean_name(p_name)
        if not cleaned_perf:
            continue
        perf_tokens = set(cleaned_perf.split())
        intersection = nav_tokens.intersection(perf_tokens)
        if intersection:
            score = len(intersection) / len(nav_tokens.union(perf_tokens))
            if score > best_score:
                best_score = score
                best_row = p_row
    if best_score > 0.4:
        return best_row
    return None

def get_performance_stats(fund_name, category, date_str, is_direct=False):
    maturity_id, cat_id, sub_id = map_section_to_ids(category)
    url = "https://www.amfiindia.com/gateway/pollingsebi/api/amfi/fundperformance"
    headers = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"}
    payload = {
        "maturityType": maturity_id,
        "category": cat_id,
        "subCategory": sub_id,
        "mfid": 0,
        "reportDate": date_str
    }
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=20)
        if resp.status_code == 200:
            rows = resp.json().get("data", [])
            if not rows:
                return None
            
            # Find fund row
            match = find_matching_perf_row(fund_name, rows)
            if not match:
                return None
                
            fund_aum = float(match.get("dailyAUM")) if match.get("dailyAUM") else None
            
            # Category averages & ranks
            period_keys = [
                ("1M", "return1MonthRegular", "return1MonthDirect"),
                ("3M", "return3MonthRegular", "return3MonthDirect"),
                ("6M", "return6MonthRegular", "return6MonthDirect"),
                ("1Y", "return1YearRegular", "return1YearDirect"),
                ("SI", "returnSinceLaunchRegular", "returnSinceLaunchDirect")
            ]
            
            stats = {"fund_aum": fund_aum, "category_returns": {}, "ranks": {}}
            
            for label, reg_key, dir_key in period_keys:
                key = dir_key if is_direct else reg_key
                
                # Extract all valid returns for ranking and category average
                valid_rets = []
                for r in rows:
                    val = r.get(key)
                    if val is not None and val != "":
                        try:
                            valid_rets.append(float(val))
                        except ValueError:
                            pass
                
                if not valid_rets:
                    stats["category_returns"][label] = None
                    stats["ranks"][label] = (None, None)
                    continue
                    
                # Category average
                stats["category_returns"][label] = round(sum(valid_rets) / len(valid_rets), 4)
                
                # Fund rank
                fund_val_str = match.get(key)
                if fund_val_str is not None and fund_val_str != "":
                    try:
                        fund_val = float(fund_val_str)
                        # Sort descending
                        sorted_rets = sorted(valid_rets, reverse=True)
                        # Find rank (1-based index)
                        rank_num = sorted_rets.index(fund_val) + 1
                        rank_den = len(sorted_rets)
                        stats["ranks"][label] = (rank_num, rank_den)
                    except (ValueError, IndexError):
                        stats["ranks"][label] = (None, None)
                else:
                    stats["ranks"][label] = (None, None)
                    
            return stats
    except Exception as e:
        print(f"Error fetching stats for {date_str}: {e}")
    return None

# Test the function
print("Fetching stats for HDFC Mid Cap Fund (Regular)...")
# Let's query for April 30, 2026
res = get_performance_stats(
    fund_name="HDFC Mid Cap Fund-Reg(G)",
    category="Mid Cap Fund",
    date_str="30-Apr-2026",
    is_direct=False
)
print("Result:")
import json
print(json.dumps(res, indent=2))
