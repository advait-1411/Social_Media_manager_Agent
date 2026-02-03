import sqlite3
import os

def migrate():
    db_path = os.path.join('backend', 'velvet_queue.db')
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found. Nothing to migrate.")
        return
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    columns_to_add = [
        ("approved_at", "DATETIME"),
        ("approved_by", "TEXT"),
        ("rejected_at", "DATETIME"),
        ("rejected_by", "TEXT"),
        ("rejection_reason", "TEXT"),
        ("last_publish_attempt_at", "DATETIME"),
        ("last_error", "TEXT")
    ]
    
    print(f"Running migration on {db_path}...")
    
    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE posts ADD COLUMN {col_name} {col_type}")
            print(f"✅ Added column {col_name}")
        except sqlite3.OperationalError:
            print(f"ℹ️ Column {col_name} already exists")
            
    conn.commit()
    conn.close()
    print("Migration complete!")

if __name__ == "__main__":
    migrate()
