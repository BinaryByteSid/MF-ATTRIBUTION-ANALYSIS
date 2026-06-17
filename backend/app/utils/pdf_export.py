from __future__ import annotations

import io
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


# ── Shared styles ─────────────────────────────────────────────────────────────
_styles = getSampleStyleSheet()
_title_style = ParagraphStyle(
    "ReportTitle", parent=_styles["Title"], fontSize=18,
    textColor=colors.HexColor("#1a237e"), spaceAfter=12,
)
_subtitle_style = ParagraphStyle(
    "ReportSubtitle", parent=_styles["Heading2"], fontSize=12,
    textColor=colors.HexColor("#37474f"), spaceAfter=8,
)
_body_style = _styles["BodyText"]
_header_bg = colors.HexColor("#1a237e")
_header_fg = colors.white
_row_alt = colors.HexColor("#f5f5f5")


def _build_table(headers: list[str], data: list[list], col_widths=None) -> Table:
    table_data = [headers] + data
    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), _header_bg),
        ("TEXTCOLOR", (0, 0), (-1, 0), _header_fg),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ALIGN", (0, 1), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    # Alternate row colours
    for i in range(1, len(table_data)):
        if i % 2 == 0:
            style_commands.append(("BACKGROUND", (0, i), (-1, i), _row_alt))
    t.setStyle(TableStyle(style_commands))
    return t


def generate_portfolio_summary_pdf(
    portfolio_name: str,
    summary: dict,
    holdings: list[dict],
    as_of_date: date,
    output_path: str,
) -> str:
    """Generates a professional portfolio summary PDF. Returns file path."""
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        rightMargin=20 * mm, leftMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
    )
    elements = []

    # Title
    elements.append(Paragraph(f"Portfolio Summary — {portfolio_name}", _title_style))
    elements.append(Paragraph(f"As of {as_of_date.strftime('%d %B %Y')}", _subtitle_style))
    elements.append(Spacer(1, 12))

    # KPI table
    kpi_headers = ["Metric", "Value"]
    kpi_data = [
        ["Total Current Value", f"₹{summary.get('total_value', 0):,.2f}"],
        ["Total Invested", f"₹{summary.get('total_invested', 0):,.2f}"],
        ["Absolute Return", f"{summary.get('absolute_return', 0):.2f}%"],
    ]
    if summary.get("xirr") is not None:
        kpi_data.append(["XIRR", f"{summary['xirr'] * 100:.2f}%"])
    if summary.get("cagr") is not None:
        kpi_data.append(["CAGR", f"{summary['cagr'] * 100:.2f}%"])

    elements.append(_build_table(kpi_headers, kpi_data, col_widths=[3 * inch, 3 * inch]))
    elements.append(Spacer(1, 20))

    # Holdings table
    elements.append(Paragraph("Holdings Breakdown", _subtitle_style))
    h_headers = ["Fund", "Units", "Avg NAV", "Current NAV", "Value (₹)", "Weight %", "Return %"]
    h_data = []
    for h in holdings:
        h_data.append([
            h.get("fund_name", "")[:35],
            f"{h.get('units', 0):,.2f}",
            f"{h.get('avg_nav', 0):,.2f}",
            f"{h.get('current_nav', 0):,.2f}",
            f"{h.get('current_value', 0):,.2f}",
            f"{h.get('weight', 0):.1f}",
            f"{h.get('return_pct', 0):.2f}",
        ])

    col_w = [2.2 * inch, 0.7 * inch, 0.7 * inch, 0.8 * inch, 1 * inch, 0.6 * inch, 0.7 * inch]
    elements.append(_build_table(h_headers, h_data, col_widths=col_w))

    doc.build(elements)
    return output_path


def generate_attribution_pdf(
    portfolio_name: str,
    attribution_data: dict,
    output_path: str,
) -> str:
    """Generates attribution analysis PDF with Brinson breakdown table."""
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        rightMargin=20 * mm, leftMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
    )
    elements = []

    elements.append(Paragraph(f"Attribution Analysis — {portfolio_name}", _title_style))
    period = f"{attribution_data.get('period_start', '')} to {attribution_data.get('period_end', '')}"
    elements.append(Paragraph(f"Period: {period} | Method: {attribution_data.get('method', 'brinson').upper()}", _subtitle_style))
    elements.append(Spacer(1, 12))

    # Summary
    summary_headers = ["Metric", "Value"]
    summary_data = [
        ["Total Portfolio Return", f"{attribution_data.get('total_return', 0) * 100:.2f}%"],
        ["Benchmark Return", f"{attribution_data.get('benchmark_return', 0) * 100:.2f}%"],
        ["Active Return", f"{attribution_data.get('active_return', 0) * 100:.2f}%"],
        ["Allocation Effect", f"{attribution_data.get('allocation_effect', 0) * 100:.2f}%"],
        ["Selection Effect", f"{attribution_data.get('selection_effect', 0) * 100:.2f}%"],
        ["Interaction Effect", f"{attribution_data.get('interaction_effect', 0) * 100:.2f}%"],
    ]
    elements.append(_build_table(summary_headers, summary_data, col_widths=[3 * inch, 3 * inch]))
    elements.append(Spacer(1, 20))

    # Segment breakdown
    segments = attribution_data.get("result_json", {}).get("segments", [])
    if segments:
        elements.append(Paragraph("Segment Breakdown", _subtitle_style))
        seg_headers = ["Asset Class", "Port Wt%", "Bench Wt%", "Port Ret%", "Bench Ret%", "Alloc", "Select", "Inter"]
        seg_data = []
        for s in segments:
            seg_data.append([
                s.get("asset_class", ""),
                f"{s.get('portfolio_weight', 0) * 100:.1f}",
                f"{s.get('benchmark_weight', 0) * 100:.1f}",
                f"{s.get('portfolio_return', 0) * 100:.2f}",
                f"{s.get('benchmark_return', 0) * 100:.2f}",
                f"{s.get('allocation_effect', 0) * 100:.3f}",
                f"{s.get('selection_effect', 0) * 100:.3f}",
                f"{s.get('interaction_effect', 0) * 100:.3f}",
            ])
        col_w = [1.2 * inch] + [0.7 * inch] * 7
        elements.append(_build_table(seg_headers, seg_data, col_widths=col_w))

    doc.build(elements)
    return output_path


def generate_tax_summary_pdf(
    portfolio_name: str,
    transactions: list[dict],
    stcg_total: float,
    ltcg_total: float,
    output_path: str,
) -> str:
    """Generates tax summary PDF with STCG/LTCG breakdown."""
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        rightMargin=20 * mm, leftMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
    )
    elements = []

    elements.append(Paragraph(f"Capital Gains Tax Summary — {portfolio_name}", _title_style))
    elements.append(Spacer(1, 12))

    # Summary
    summary_data = [
        ["Short-Term Capital Gains (STCG)", f"₹{stcg_total:,.2f}"],
        ["Long-Term Capital Gains (LTCG)", f"₹{ltcg_total:,.2f}"],
        ["Total Tax Liability", f"₹{stcg_total + ltcg_total:,.2f}"],
    ]
    elements.append(_build_table(["Tax Category", "Amount"], summary_data, col_widths=[3 * inch, 3 * inch]))
    elements.append(Spacer(1, 20))

    # Transaction detail
    if transactions:
        elements.append(Paragraph("Redemption Details", _subtitle_style))
        t_headers = ["Fund", "Date", "Units", "Amount (₹)", "STCG (₹)", "LTCG (₹)"]
        t_data = [
            [
                t.get("fund_name", "")[:30],
                str(t.get("date", "")),
                f"{t.get('units', 0):,.2f}",
                f"{t.get('amount', 0):,.2f}",
                f"{t.get('stcg_tax', 0):,.2f}",
                f"{t.get('ltcg_tax', 0):,.2f}",
            ]
            for t in transactions
        ]
        elements.append(_build_table(t_headers, t_data))

    doc.build(elements)
    return output_path
