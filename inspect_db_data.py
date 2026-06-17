import sqlite3

conn = sqlite3.connect("backend/db.sqlite3")
cursor = conn.cursor()

# Check tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print("Tables in SQLite:", tables)

for t in tables:
    cursor.execute(f"SELECT COUNT(*) FROM {t};")
    count = cursor.fetchone()[0]
    print(f"Table '{t}': {count} rows")
    if count > 0:
        cursor.execute(f"PRAGMA table_info({t});")
        cols = [c[1] for c in cursor.fetchall()]
        print("  Columns:", cols)
        cursor.execute(f"SELECT * FROM {t} LIMIT 5;")
        rows = cursor.fetchall()
        print("  Sample rows:")
        for r in rows:
            print("   ", r)

conn.close()

