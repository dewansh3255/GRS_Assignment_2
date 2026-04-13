"""
SECURITY PROOF OF CONCEPT: Account Lockout Bypass via Method Switching

This script demonstrates the CRITICAL bug where an attacker can bypass
the 15-minute 2FA lockout by switching between TOTP, Backup Code, and Email OTP
verification methods.

Run this test to confirm the vulnerability exists:
    python test_lockout_bypass.py

Expected Result (VULNERABLE):
    ✗ TOTP method locked after 3 failures
    ✗ User CAN switch to Backup Code method (should be blocked!)
    ✗ User gets 9 attempts instead of 3

Expected Result (AFTER FIX):
    ✗ TOTP method locked after 3 failures
    ✓ User CANNOT switch to Backup Code (returns 429 Locked)
    ✓ User CANNOT switch to Email OTP (returns 429 Locked)
    ✓ User only gets 3 attempts total
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
sys.path.insert(0, '/Users/dewansh/Documents/FCS_Project/backend')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from django.core.cache import cache

User = get_user_model()


def test_lockout_bypass_vulnerability():
    """
    Demonstrates the lockout bypass vulnerability:
    User can switch between 2FA methods to get 9 attempts instead of 3
    """
    
    print("\n" + "="*70)
    print("SECURITY TEST: Account Lockout Bypass Vulnerability")
    print("="*70 + "\n")
    
    # Setup test user
    username = 'testlockout'
    password = 'TestPassword123!@#'
    user = User.objects.create_user(username=username, password=password)
    user.is_verified = True
    user.save()
    
    # Create backup codes for testing
    from accounts.models import BackupCode
    import hashlib
    for i in range(3):
        code = f"TEST-{i:04d}-CODE"
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        BackupCode.objects.create(user=user, code_hash=code_hash, is_used=False)
    
    client = APIClient()
    
    # Step 1: Clear any existing cache
    print("[*] Clearing cache...")
    cache.clear()
    
    # Step 2: Authenticate and get to 2FA stage
    print("[*] Authenticating with password...")
    response = client.post('/api/auth/login/', {
        'username': username,
        'password': password
    })
    assert response.status_code == 200, f"Login failed: {response.data}"
    user_id = response.data['user_id']
    print(f"    ✓ Login successful (user_id: {user_id})")
    
    # Step 3: Try TOTP verification 3 times (will trigger lockout)
    print("\n[*] Attempting TOTP verification 3 times with wrong code...")
    totp_attempts = 0
    for attempt in range(3):
        response = client.post('/api/auth/login/verify-totp/', {
            'user_id': user_id,
            'code': '000000'  # Wrong code
        })
        totp_attempts += 1
        if response.status_code == 400:
            remaining = response.data.get('attempts_remaining', '?')
            print(f"    Attempt {totp_attempts}: Failed (remaining: {remaining})")
        else:
            print(f"    Attempt {totp_attempts}: Error {response.status_code}")
    
    # Step 4: Verify TOTP is now locked
    print("\n[*] Checking if TOTP is locked...")
    response = client.post('/api/auth/login/verify-totp/', {
        'user_id': user_id,
        'code': '000000'
    })
    
    if response.status_code == 429:
        print(f"    ✓ TOTP is locked (429 Too Many Requests)")
        print(f"    Message: {response.data.get('error')}")
    else:
        print(f"    ✗ TOTP is NOT locked! (Got {response.status_code})")
    
    # Step 5: THE BUG - Try Backup Code verification (should be blocked but isn't)
    print("\n" + "-"*70)
    print("[*] CRITICAL TEST: Attempting Backup Code verification...")
    print("    Expected: 429 Locked (account-wide lockout)")
    print("    Actual:   ???")
    print("-"*70)
    
    response = client.post('/api/auth/backup-codes/verify/', {
        'user_id': user_id,
        'backup_code': 'INVALID-BACKUP-CODE'
    })
    
    backup_attempts = 0
    if response.status_code == 429:
        print(f"\n    ✓ GOOD: Backup Code is also locked (429)")
        print(f"    Message: {response.data.get('error')}")
        print("\n    → LOCKOUT SYSTEM IS WORKING CORRECTLY (Not Vulnerable)")
    elif response.status_code == 400 or response.status_code == 200:
        print(f"\n    ✗ BAD: Backup Code is NOT locked! (Got {response.status_code})")
        print(f"    Message: {response.data.get('error', response.data.get('message'))}")
        print("\n    → VULNERABILITY CONFIRMED: User can switch methods to bypass lockout!")
        
        # If vulnerable, continue attacking with other methods
        print("\n[*] Exploiting vulnerability - attempting 3 more Backup Code tries...")
        backup_code_results = []
        for attempt in range(3):
            response = client.post('/api/auth/backup-codes/verify/', {
                'user_id': user_id,
                'backup_code': f'XXXX-{attempt:04d}-XXXX'
            })
            backup_attempts += 1
            status_code = response.status_code
            backup_code_results.append(status_code)
            
            if status_code == 429:
                print(f"    Attempt {backup_attempts} (Backup Code): Locked! (429)")
                print(f"    Note: This took {backup_attempts} attempt(s) to lock")
                break
            else:
                print(f"    Attempt {backup_attempts} (Backup Code): Allowed ({status_code})")
        
        # Try Email OTP as third method
        print("\n[*] Continuing exploit - attempting Email OTP...")
        response = client.post('/api/auth/email-otp/verify/', {
            'otp': '000000'
        }, HTTP_AUTHORIZATION=f'Bearer {None}')  # Not authenticated
        
        if response.status_code != 429:
            print(f"    Note: Email OTP also appears to not be locked ({response.status_code})")
    else:
        print(f"\n    ⚠ Unexpected status code: {response.status_code}")
        print(f"    Response: {response.data}")
    
    # Summary
    print("\n" + "="*70)
    print("VULNERABILITY SUMMARY")
    print("="*70)
    
    if response.status_code != 429:
        print("""
┌─────────────────────────────────────────────────────────────────┐
│ STATUS: CRITICAL VULNERABILITY CONFIRMED                        │
├─────────────────────────────────────────────────────────────────┤
│ Lockouts are per-method, not account-wide:                      │
│                                                                  │
│ TOTP Lockout:        Uses key "totp_locked_{username}"          │
│ Backup Code Lockout: Uses key "backup_code_locked_{user_id}"    │
│ Email OTP Lockout:   Uses key "email_otp_locked_{user_id}"      │
│                                                                  │
│ An attacker can:                                                │
│ 1. Fail TOTP 3 times (locked after 3rd attempt)                │
│ 2. Switch to Backup Code (NOT locked - different key!)         │
│ 3. Fail Backup Code 3 times (locked after 3rd attempt)         │
│ 4. Switch to Email OTP (NOT locked - different key!)           │
│ 5. Total attempts: 9 instead of 3                              │
│                                                                  │
│ IMPACT: Brute force attack success rate increased 3x            │
│                                                                  │
│ FIX: Implement unified account-level lockout that checks        │
│      "account_2fa_locked_{user_id}" in ALL three methods        │
└─────────────────────────────────────────────────────────────────┘
        """)
    else:
        print("""
┌─────────────────────────────────────────────────────────────────┐
│ STATUS: VULNERABILITY FIXED ✓                                   │
├─────────────────────────────────────────────────────────────────┤
│ Account lockout is now unified across all 2FA methods.          │
│ Switching methods does NOT bypass the 15-minute lockout.        │
└─────────────────────────────────────────────────────────────────┘
        """)
    
    # Cleanup
    print("\n[*] Cleaning up test data...")
    user.delete()
    cache.clear()
    print("    ✓ Done\n")


if __name__ == '__main__':
    try:
        test_lockout_bypass_vulnerability()
    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
