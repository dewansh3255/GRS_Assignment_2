#!/usr/bin/env python3
import os
import hashlib
import psycopg2
from psycopg2.extras import RealDictCursor

# Terminal Colors
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
RESET = '\033[0m'

def calculate_sha256(data_string: str) -> str:
    return hashlib.sha256(data_string.encode('utf-8')).hexdigest()

def verify_blockchain():
    print(f"{YELLOW}Initiating Independent Blockchain Audit Verification...{RESET}")
    print("-" * 65)

    # Note: Assumes running inside the VM or port-forwarded from host
    db_name = os.environ.get('DB_NAME', 'fcs_project')
    db_user = os.environ.get('DB_USER', 'fcs_user')
    db_password = os.environ.get('DB_PASS', 'fcs_password')
    db_host = os.environ.get('DB_HOST', 'localhost')
    
    try:
        conn = psycopg2.connect(
            dbname=db_name,
            user=db_user,
            password=db_password,
            host=db_host,
            port=5432
        )
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT l.*, u.username as user_name 
            FROM accounts_auditlog l
            LEFT JOIN accounts_user u ON l.user_id = u.id
            ORDER BY l.id;
        """)
        logs = cur.fetchall()
        
        if not logs:
            print("No audit logs found in the database. Exiting.")
            return

        is_valid = True
        
        for i, log in enumerate(logs):
            row_id = log['id']
            action = log['action']
            timestamp = log['timestamp']
            stored_prev_hash = log['prev_hash']
            stored_current_hash = log['current_hash']
            
            # Step 1: Verify prev_hash matches the previous node's current_hash
            if i == 0:
                expected_prev = '0' * 64 # Genesis block
            else:
                expected_prev = logs[i-1]['current_hash']
                
            if stored_prev_hash != expected_prev:
                print(f"{RED}[✗] CHAIN BROKEN AT BLOCK {row_id}{RESET}")
                print(f"    Expected Prev Hash : {expected_prev[:16]}...")
                print(f"    Stored Prev Hash   : {stored_prev_hash[:16]}...")
                is_valid = False
            
            # Step 2: Recalculate block hash and verify against stored_current_hash
            user_str = log['user_name'] if log['user_name'] is not None else "None"
            
            import json
            try:
                details_dict = json.loads(log['details']) if log['details'] else {}
            except:
                details_dict = {}
                
            payload = json.dumps({
                "action": action,
                "user": user_str,
                "timestamp": timestamp,
                "details": details_dict,
                "prev_hash": stored_prev_hash,
            }, sort_keys=True)
            
            recalculated_hash = calculate_sha256(payload)
            
            if recalculated_hash != stored_current_hash:
                print(f"{RED}[✗] BLOCK TEMPERED AT ID {row_id}{RESET}")
                print(f"    Recalculated Hash  : {recalculated_hash[:16]}...")
                print(f"    Stored Hash        : {stored_current_hash[:16]}...")
                is_valid = False
            
            if is_valid:
                print(f"{GREEN}[✓] Block {row_id:2d} Valid ({stored_current_hash[:10]}...){RESET}")
        
        print("-" * 65)
        if is_valid:
            print(f"{GREEN}SUCCESS: The entire audit log chain is cryptographically secure.{RESET}")
        else:
            print(f"{RED}CRITICAL ALERT: Tampering detected! The audit logs have been compromised.{RESET}")
            
    except psycopg2.OperationalError as e:
        print(f"Database connection failed: {e}")
        print("Ensure the database container is running and accessible on localhost:5432.")
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    verify_blockchain()
