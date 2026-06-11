@app.get("/messages")
def get_messages():

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id,
               sender,
               message_text,
               created_at
        FROM messages
        ORDER BY id DESC;
    """)

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return rows
