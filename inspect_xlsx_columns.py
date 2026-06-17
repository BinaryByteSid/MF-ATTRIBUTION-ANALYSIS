import pandas as pd

port_excel_path = r"c:\Users\sidha\OneDrive\Desktop\portfolio last 6 months.xlsx"
df = pd.read_excel(port_excel_path, header=3)
print("Dataframe columns:")
for col in df.columns:
    print(f"  {col}: {df[col].dropna().iloc[:3].tolist()}")
    
print("\nUnique SD_Scheme ISIN:")
print(df['SD_Scheme ISIN'].dropna().unique())
