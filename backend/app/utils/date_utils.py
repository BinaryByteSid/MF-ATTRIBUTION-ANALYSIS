from __future__ import annotations

from datetime import date
from typing import Optional


def get_previous_business_day(d: date) -> date:
    """Returns the previous weekday (Mon–Fri)."""
    from datetime import timedelta
    offset = max(1, (d.weekday() + 6) % 7 - 3) if d.weekday() == 0 else 1
    if d.weekday() == 0:    # Monday → Friday
        return d - timedelta(days=3)
    elif d.weekday() == 6:  # Sunday → Friday
        return d - timedelta(days=2)
    else:
        return d - timedelta(days=1)


def date_range(start: date, end: date) -> list[date]:
    """Returns all dates from start to end inclusive."""
    from datetime import timedelta
    if start > end:
        return []
    days = (end - start).days + 1
    return [start + timedelta(days=i) for i in range(days)]


def business_days_between(start: date, end: date) -> int:
    """Count of business days (Mon–Fri) between two dates, inclusive."""
    if start > end:
        return 0
    count = 0
    from datetime import timedelta
    current = start
    while current <= end:
        if current.weekday() < 5:
            count += 1
        current += timedelta(days=1)
    return count


def years_between(start: date, end: date) -> float:
    """Fractional years between two dates (actual/365)."""
    delta = (end - start).days
    return delta / 365.0


def fiscal_year_dates(year: int) -> tuple[date, date]:
    """Returns Indian FY dates: (1 Apr year, 31 Mar year+1)."""
    return (date(year, 4, 1), date(year + 1, 3, 31))


def parse_amfi_date(date_str: str) -> Optional[date]:
    """
    Parses AMFI date format: DD-Mon-YYYY → date.
    Examples: '31-Jan-2024', '28-Feb-2024'
    """
    from datetime import datetime
    for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except (ValueError, TypeError):
            continue
    return None
