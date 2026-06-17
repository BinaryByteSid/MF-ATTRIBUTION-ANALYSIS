import psycopg2

try:
    conn = psycopg2.connect("postgresql://mfuser:secret@127.0.0.1:5432/mf_attribution")
    cur = conn.cursor()
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
    tables = cur.fetchall()
    print("Tables:", tables)
    for table in tables:
        name = table[0]
        cur.execute(f"SELECT count(*) FROM {name}")
        print(f"{name}: {cur.fetchone()[0]}")
except Exception as e:
    print("Error:", e)
