# Account Lockout Fix: Unified 2FA Lockout Implementation

## Problem Summary

The current implementation has **separate lockout counters** for each 2FA method:
- TOTP: `totp_locked_{username}`
- Backup Code: `backup_code_locked_{user_id}`
- Email OTP: `email_otp_locked_{user_id}`

This allows an attacker to:
1. Fail TOTP 3 times → locked
2. Switch to Backup Code → NOT locked (different key!)
3. Fail Backup Code 3 times → locked
4. Switch to Email OTP → NOT locked
5. Total: 9 attempts instead of 3 ❌

## Solution: Unified Account-Level Lockout

Implement a single shared counter that affects **all 2FA methods**.

---

## Implementation Steps

### Step 1: Add Unified Lockout Functions

**File**: `/backend/accounts/views.py`

Add these new functions at the beginning of the file (after existing lockout helpers):

```python
# ── UNIFIED 2FA LOCKOUT (fixes method-switching bypass) ──────────────────
SHARED_2FA_MAX_ATTEMPTS = 3
SHARED_2FA_LOCKOUT_SECONDS = 15 * 60  # 15 minutes

def _account_2fa_fail_key(user_id: int) -> str:
    """Shared failure counter for ALL 2FA methods"""
    return f"2fa_fail_count_{user_id}"

def _account_2fa_lock_key(user_id: int) -> str:
    """Unified lockout for ALL 2FA methods"""
    return f"account_2fa_locked_{user_id}"

def _check_account_2fa_lockout(user_id: int):
    """
    Check if account is locked for ANY 2FA method.
    Returns (locked: bool, seconds_remaining: int).
    """
    remaining = cache.ttl(_account_2fa_lock_key(user_id))
    if remaining and remaining > 0:
        return True, remaining
    return False, 0

def _record_shared_2fa_failure(user_id: int, method: str = "unknown"):
    """
    Records a 2FA failure that counts ACROSS ALL METHODS.
    When shared counter reaches SHARED_2FA_MAX_ATTEMPTS, locks the entire account.
    
    Returns (locked_now: bool, attempts_remaining: int).
    """
    fail_key = _account_2fa_fail_key(user_id)
    lock_key = _account_2fa_lock_key(user_id)
    
    failures = cache.get(fail_key, 0) + 1
    cache.set(fail_key, failures, timeout=SHARED_2FA_LOCKOUT_SECONDS)
    
    if failures >= SHARED_2FA_MAX_ATTEMPTS:
        cache.set(lock_key, '1', timeout=SHARED_2FA_LOCKOUT_SECONDS)
        cache.delete(fail_key)
        return True, 0
    
    return False, SHARED_2FA_MAX_ATTEMPTS - failures

def _clear_shared_2fa_lockout(user_id: int):
    """Clear shared 2FA failure state after ANY successful verification."""
    cache.delete(_account_2fa_fail_key(user_id))
    cache.delete(_account_2fa_lock_key(user_id))
# ────────────────────────────────────────────────────────────────────────────
```

### Step 2: Update VerifyTOTPView.post()

**File**: `/backend/accounts/views.py` (lines 351-503)

In the **LOGIN ATTEMPT** section (after line 437), update to use unified lockout:

**BEFORE** (lines 444-458):
```python
# 1. Enforce any active lockout before even checking the code
locked, secs = _check_totp_lockout(username)  # ← OLD: per-username lockout
if locked:
    mins = secs // 60
    create_audit_log('LOGIN_TOTP_BLOCKED', user, {
        'reason': 'Account locked — too many failed TOTP attempts',
        'seconds_remaining': secs,
    })
    return Response({
        "error": f"This account is locked due to too many failed 2FA attempts. "
                 f"Please try again in {mins} minute(s) and {secs % 60} second(s).",
        "locked": True,
        "seconds_remaining": secs,
        "minutes_remaining": mins,
    }, status=status.HTTP_429_TOO_MANY_REQUESTS)
```

**AFTER** (with unified lockout):
```python
# 1. Check UNIFIED account lockout (blocks all 2FA methods)
locked, secs = _check_account_2fa_lockout(user.id)  # ← NEW: account-wide lockout
if locked:
    mins = secs // 60
    create_audit_log('LOGIN_2FA_BLOCKED', user, {
        'reason': 'Account locked — too many failed 2FA attempts across all methods',
        'seconds_remaining': secs,
    })
    return Response({
        "error": f"Account is locked due to too many failed 2FA attempts. "
                 f"Please try again in {mins} minute(s) and {secs % 60} second(s).",
        "locked": True,
        "seconds_remaining": secs,
        "minutes_remaining": mins,
    }, status=status.HTTP_429_TOO_MANY_REQUESTS)
```

Then, **update the failure recording** (lines 464-485):

**BEFORE**:
```python
if not code_valid:
    err_msg = 'Invalid OTP code.'
    locked_now, attempts_left = _record_totp_failure(username)  # ← OLD: per-username
    create_audit_log('LOGIN_TOTP_FAILED', user, {
        'reason': err_msg,
        'attempts_remaining': attempts_left,
    })

    if locked_now:
        return Response({
            "error": f"Too many failed 2FA attempts. This account has been locked for "
                     f"{TOTP_LOCKOUT_SECONDS // 60} minutes.",
            "locked": True,
            "seconds_remaining": TOTP_LOCKOUT_SECONDS,
            "minutes_remaining": TOTP_LOCKOUT_SECONDS // 60,
        }, status=status.HTTP_429_TOO_MANY_REQUESTS)

    return Response({
        "error": err_msg,
        "locked": False,
        "attempts_remaining": attempts_left,
    }, status=status.HTTP_400_BAD_REQUEST)
```

**AFTER**:
```python
if not code_valid:
    err_msg = 'Invalid OTP code.'
    locked_now, attempts_left = _record_shared_2fa_failure(user.id, "totp")  # ← NEW: shared counter
    create_audit_log('LOGIN_2FA_FAILED', user, {
        'method': 'totp',
        'reason': err_msg,
        'attempts_remaining': attempts_left,
    })

    if locked_now:
        return Response({
            "error": f"Too many failed 2FA attempts. This account has been locked for "
                     f"{SHARED_2FA_LOCKOUT_SECONDS // 60} minutes.",
            "locked": True,
            "seconds_remaining": SHARED_2FA_LOCKOUT_SECONDS,
            "minutes_remaining": SHARED_2FA_LOCKOUT_SECONDS // 60,
        }, status=status.HTTP_429_TOO_MANY_REQUESTS)

    return Response({
        "error": err_msg,
        "locked": False,
        "attempts_remaining": attempts_left,
    }, status=status.HTTP_400_BAD_REQUEST)
```

And **update the success path** (lines 487-490):

**BEFORE**:
```python
# 3. Success — clear lockout and issue cookies
user.is_verified = True
user.save(update_fields=['is_verified'])
_clear_totp_lockout(username)  # ← OLD: per-username clear
```

**AFTER**:
```python
# 3. Success — clear UNIFIED lockout and issue cookies
user.is_verified = True
user.save(update_fields=['is_verified'])
_clear_shared_2fa_lockout(user.id)  # ← NEW: unified clear
```

### Step 3: Update VerifyBackupCodeView.post()

**File**: `/backend/accounts/views.py` (lines 1791-1870)

Replace the lockout checking and recording with unified approach:

**BEFORE** (lines 1801-1816):
```python
# 1. Check if account is locked due to too many failed attempts
locked, secs = _check_backup_code_lockout(user_id)
if locked:
    mins = secs // 60
    create_audit_log('BACKUP_CODE_BLOCKED', user, {
        'reason': 'Account locked — too many failed backup code attempts',
        'seconds_remaining': secs,
    })
    return Response({
        'error': f'This account is locked due to too many failed backup code attempts. '
                f'Please try again in {mins} minute(s) and {secs % 60} second(s).',
        'locked': True,
        'seconds_remaining': secs,
        'minutes_remaining': mins,
        'attempts_remaining': 0,
    }, status=status.HTTP_429_TOO_MANY_REQUESTS)
```

**AFTER**:
```python
# 1. Check UNIFIED account lockout (blocks all 2FA methods)
locked, secs = _check_account_2fa_lockout(user_id)
if locked:
    mins = secs // 60
    create_audit_log('LOGIN_2FA_BLOCKED', user, {
        'reason': 'Account locked — too many failed 2FA attempts across all methods',
        'seconds_remaining': secs,
    })
    return Response({
        'error': f'Account is locked due to too many failed 2FA attempts. '
                f'Please try again in {mins} minute(s) and {secs % 60} second(s).',
        'locked': True,
        'seconds_remaining': secs,
        'minutes_remaining': mins,
        'attempts_remaining': 0,
    }, status=status.HTTP_429_TOO_MANY_REQUESTS)
```

**BEFORE** (lines 1830-1845):
```python
if not match:
    locked_now, attempts_left = _record_backup_code_failure(user_id)
    create_audit_log('BACKUP_CODE_FAILED', user, {
        'reason': 'invalid_or_used',
        'attempts_remaining': attempts_left
    })
    
    if locked_now:
        return Response({
            'error': f'Too many failed backup code attempts. This account has been locked for '
                    f'{TOTP_LOCKOUT_SECONDS // 60} minutes.',
            'locked': True,
            'seconds_remaining': TOTP_LOCKOUT_SECONDS,
            'minutes_remaining': TOTP_LOCKOUT_SECONDS // 60,
            'attempts_remaining': 0,
        }, status=status.HTTP_429_TOO_MANY_REQUESTS)
```

**AFTER**:
```python
if not match:
    locked_now, attempts_left = _record_shared_2fa_failure(user_id, "backup_code")
    create_audit_log('LOGIN_2FA_FAILED', user, {
        'method': 'backup_code',
        'reason': 'invalid_or_used',
        'attempts_remaining': attempts_left
    })
    
    if locked_now:
        return Response({
            'error': f'Too many failed 2FA attempts. This account has been locked for '
                    f'{SHARED_2FA_LOCKOUT_SECONDS // 60} minutes.',
            'locked': True,
            'seconds_remaining': SHARED_2FA_LOCKOUT_SECONDS,
            'minutes_remaining': SHARED_2FA_LOCKOUT_SECONDS // 60,
            'attempts_remaining': 0,
        }, status=status.HTTP_429_TOO_MANY_REQUESTS)
```

**BEFORE** (line 1858):
```python
_clear_backup_code_lockout(user_id)
```

**AFTER**:
```python
_clear_shared_2fa_lockout(user_id)
```

### Step 4: Update VerifyEmailOTPView.post()

**File**: `/backend/accounts/views.py` (lines 2051-2120)

Apply the same pattern:

**BEFORE** (lines 2066-2081):
```python
# 1. Check if account is locked due to too many failed attempts
locked, secs = _check_email_otp_lockout(user.id)
if locked:
    mins = secs // 60
    create_audit_log('EMAIL_OTP_BLOCKED', user, {
        'reason': 'Account locked — too many failed email OTP attempts',
        'seconds_remaining': secs,
    })
    return Response({
        'error': f'Email verification temporarily locked due to too many failed attempts. '
                f'Please try again in {mins} minute(s) and {secs % 60} second(s).',
        'locked': True,
        'seconds_remaining': secs,
        'minutes_remaining': mins,
        'attempts_remaining': 0,
    }, status=status.HTTP_429_TOO_MANY_REQUESTS)
```

**AFTER**:
```python
# 1. Check UNIFIED account lockout (blocks all 2FA methods)
locked, secs = _check_account_2fa_lockout(user.id)
if locked:
    mins = secs // 60
    create_audit_log('LOGIN_2FA_BLOCKED', user, {
        'reason': 'Account locked — too many failed 2FA attempts across all methods',
        'seconds_remaining': secs,
    })
    return Response({
        'error': f'Account is locked due to too many failed 2FA attempts. '
                f'Please try again in {mins} minute(s) and {secs % 60} second(s).',
        'locked': True,
        'seconds_remaining': secs,
        'minutes_remaining': mins,
        'attempts_remaining': 0,
    }, status=status.HTTP_429_TOO_MANY_REQUESTS)
```

**BEFORE** (lines 2087-2100):
```python
if not cached_data or cached_data['otp'] != submitted_otp:
    locked_now, attempts_left = _record_email_otp_failure(user.id)
    create_audit_log('EMAIL_VERIFY_FAILED', user, {
        'reason': 'invalid_or_expired_otp',
        'attempts_remaining': attempts_left
    })
    
    if locked_now:
        return Response({
            'error': f'Too many failed email OTP attempts. Verification is locked for '
                    f'{TOTP_LOCKOUT_SECONDS // 60} minutes.',
            'locked': True,
            'seconds_remaining': TOTP_LOCKOUT_SECONDS,
            'minutes_remaining': TOTP_LOCKOUT_SECONDS // 60,
```

**AFTER**:
```python
if not cached_data or cached_data['otp'] != submitted_otp:
    locked_now, attempts_left = _record_shared_2fa_failure(user.id, "email_otp")
    create_audit_log('LOGIN_2FA_FAILED', user, {
        'method': 'email_otp',
        'reason': 'invalid_or_expired_otp',
        'attempts_remaining': attempts_left
    })
    
    if locked_now:
        return Response({
            'error': f'Too many failed 2FA attempts. Account is locked for '
                    f'{SHARED_2FA_LOCKOUT_SECONDS // 60} minutes.',
            'locked': True,
            'seconds_remaining': SHARED_2FA_LOCKOUT_SECONDS,
            'minutes_remaining': SHARED_2FA_LOCKOUT_SECONDS // 60,
```

**Find the success path** (around line 2110) and update:

**BEFORE**:
```python
_clear_email_otp_lockout(user.id)
```

**AFTER**:
```python
_clear_shared_2fa_lockout(user.id)
```

---

## Testing the Fix

### Unit Test

```python
# test_unified_lockout.py
def test_unified_2fa_lockout():
    """Verify that all 2FA methods share the same lockout"""
    user = User.objects.create_user('testuser', password='Pass123!@')
    user.is_verified = True
    user.save()
    
    from accounts.models import BackupCode
    import hashlib
    
    # Create backup code
    code_hash = hashlib.sha256(b'TEST-0000-CODE').hexdigest()
    BackupCode.objects.create(user=user, code_hash=code_hash)
    
    client = APIClient()
    
    # Get to 2FA stage
    response = client.post('/api/auth/login/', {
        'username': 'testuser',
        'password': 'Pass123!@'
    })
    user_id = response.data['user_id']
    
    # Fail TOTP 3 times
    for i in range(3):
        response = client.post('/api/auth/login/verify-totp/', {
            'user_id': user_id,
            'code': '000000'
        })
        assert response.status_code in (400, 429)
    
    # Attempt 4: Should be locked
    response = client.post('/api/auth/login/verify-totp/', {
        'user_id': user_id,
        'code': '000000'
    })
    assert response.status_code == 429, f"TOTP should be locked, got {response.status_code}"
    
    # CRITICAL TEST: Backup code should also be locked now
    response = client.post('/api/auth/backup-codes/verify/', {
        'user_id': user_id,
        'backup_code': 'INVALID'
    })
    assert response.status_code == 429, f"Backup code should be locked (unified), got {response.status_code}"
    assert 'locked' in response.json()
    print("✓ PASS: Unified lockout works correctly")
```

### Manual Test

```bash
# Clear Redis cache
redis-cli -n 1 flushdb

# Test: Fail TOTP 3 times, then try backup code
curl -X POST http://localhost:8000/api/auth/login/verify-totp/ \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "code": "000000"}' && echo ""

curl -X POST http://localhost:8000/api/auth/login/verify-totp/ \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "code": "000000"}' && echo ""

curl -X POST http://localhost:8000/api/auth/login/verify-totp/ \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "code": "000000"}' && echo ""

# 4th attempt - should be 429
curl -X POST http://localhost:8000/api/auth/login/verify-totp/ \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "code": "000000"}' && echo ""

# Try backup code - should ALSO be 429 (this is the fix)
curl -X POST http://localhost:8000/api/auth/backup-codes/verify/ \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "backup_code": "XXXX-XXXX-XXXX"}' && echo ""
```

Expected output: Both return `{"error": "Account is locked...", "locked": true}`

---

## Cache Key Changes

### Before (VULNERABLE)
```
TOTP Method:       totp_fail_count_alice
                   totp_locked_alice

Backup Code:       backup_code_fail_count_1
                   backup_code_locked_1

Email OTP:         email_otp_fail_count_1
                   email_otp_locked_1
```

### After (SECURE)
```
All Methods:       2fa_fail_count_1
                   account_2fa_locked_1
```

---

## Migration Notes

- ✅ Old per-method lockout keys will expire naturally (15 min TTL)
- ✅ No database migration needed (Redis only)
- ✅ Old code is backward compatible (new code checks unified key)
- ✅ Can deploy without downtime

---

## Verification Checklist

- [ ] Unified lockout functions added to views.py
- [ ] VerifyTOTPView uses `_check_account_2fa_lockout()` and `_record_shared_2fa_failure()`
- [ ] VerifyBackupCodeView uses `_check_account_2fa_lockout()` and `_record_shared_2fa_failure()`
- [ ] VerifyEmailOTPView uses `_check_account_2fa_lockout()` and `_record_shared_2fa_failure()`
- [ ] All three views call `_clear_shared_2fa_lockout()` on success
- [ ] Tests confirm: 3 TOTP failures → blocks backup code (returns 429)
- [ ] Tests confirm: 3 backup failures → blocks email OTP (returns 429)
- [ ] Tests confirm: Success clears counter for all methods
- [ ] Audit logs updated to show unified 2FA events

---
