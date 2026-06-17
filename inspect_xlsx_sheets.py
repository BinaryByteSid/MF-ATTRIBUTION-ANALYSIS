import openpyxl

try:
    wb = openpyxl.load_workbook("../NAV/exports/nav_on_2026-05-29.xlsx", read_only=True)
    print("Sheets in nav_on_2026-05-29.xlsx:", wb.sheetnames)
except Exception as e:
    print("Error:", e)
