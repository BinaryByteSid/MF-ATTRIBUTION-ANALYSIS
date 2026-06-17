from __future__ import annotations

import csv
import io
from typing import Any

import pandas as pd


def holdings_to_csv(holdings: list[dict]) -> bytes:
    """Converts a list of holding dicts to CSV bytes."""
    if not holdings:
        return b"No holdings data\n"
    df = pd.DataFrame(holdings)
    return df.to_csv(index=False).encode("utf-8")


def transactions_to_csv(transactions: list[dict]) -> bytes:
    """Converts a list of transaction dicts to CSV bytes."""
    if not transactions:
        return b"No transaction data\n"
    df = pd.DataFrame(transactions)
    return df.to_csv(index=False).encode("utf-8")


def attribution_to_csv(attribution_data: dict) -> bytes:
    """
    Converts attribution result to CSV.
    Outputs summary section + segment breakdown.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Summary section
    writer.writerow(["Attribution Summary"])
    writer.writerow(["Metric", "Value"])
    for key in ("total_return", "benchmark_return", "active_return",
                 "allocation_effect", "selection_effect", "interaction_effect"):
        val = attribution_data.get(key, 0)
        writer.writerow([key.replace("_", " ").title(), f"{val:.6f}"])

    writer.writerow([])

    # Segment breakdown
    segments = attribution_data.get("result_json", {}).get("segments", [])
    if segments:
        writer.writerow(["Segment Breakdown"])
        writer.writerow([
            "Asset Class", "Portfolio Weight", "Benchmark Weight",
            "Portfolio Return", "Benchmark Return",
            "Allocation Effect", "Selection Effect", "Interaction Effect",
        ])
        for s in segments:
            writer.writerow([
                s.get("asset_class", ""),
                f"{s.get('portfolio_weight', 0):.4f}",
                f"{s.get('benchmark_weight', 0):.4f}",
                f"{s.get('portfolio_return', 0):.6f}",
                f"{s.get('benchmark_return', 0):.6f}",
                f"{s.get('allocation_effect', 0):.6f}",
                f"{s.get('selection_effect', 0):.6f}",
                f"{s.get('interaction_effect', 0):.6f}",
            ])

    return output.getvalue().encode("utf-8")


def parse_transaction_csv(file_content: bytes) -> list[dict]:
    """
    Parse an uploaded CSV with columns:
    fund_isin, txn_type, txn_date, units, nav_at_txn, amount, folio_number
    Returns list of raw dicts for validation.
    """
    try:
        text = file_content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        rows.append({
            "fund_isin": row.get("fund_isin", "").strip(),
            "txn_type": row.get("txn_type", "").strip().lower(),
            "txn_date": row.get("txn_date", "").strip(),
            "units": row.get("units", "").strip(),
            "nav_at_txn": row.get("nav_at_txn", "").strip(),
            "amount": row.get("amount", "").strip(),
            "folio_number": row.get("folio_number", "").strip() or None,
        })
    return rows
