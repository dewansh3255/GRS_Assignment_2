#!/usr/bin/env python3
"""
TEST: Unified 2FA Account Lockout Fix

This test demonstrates that the account lockout is now UNIFIED across all 2FA methods.
Previously, users could bypass lockout by switching methods. This test verifies that's fixed.

Run this test to confirm the security fix is working:
    python3 test_lockout_unified.py
"""

import os
import sys
import django
from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.core.cache import cache
from datetime import datetime, timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from accounts.views import (
    _account_2fa_lock_key,
    _account_2fa_fail_key,
    _check_account_2fa_lockout,
    _record_shared_2fa_failure,
    _clear_shared_2fa_lockout,
    SHARED_2FA_MAX_ATTEMPTS,
)

User = get_user_model()


class TestUnifiedLockoutFix(TransactionTestCase):
    """
    CRITICAL SECURITY FIX VERIFICATION
    
    Before the fix: Attacker could fail TOTP 3 times, then switch to backup codes,
                   getting 9 total attempts instead of 3.
    
    After the fix: All 2FA methods share the same lockout. After 3 failures on ANY
                   method, the account is locked for ALL methods.
    """
    
    def setUp(self):
        """Create test user"""
        cache.clear()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='SecurePass123!@#'
        )
        self.user.is_verified = True
        self.user.save()
    
    def tearDown(self):
        """Clean up"""
        cache.clear()
        self.user.delete()
    
    def test_unified_lockout_key_format(self):
        """Verify correct key format for unified lockout"""
        user_id = self.user.id
        
        fail_key = _account_2fa_fail_key(user_id)
        lock_key = _account_2fa_lock_key(user_id)
        
        # Keys should be unified (not method-specific like old code)
        self.assertEqual(fail_key, f"2fa_fail_count_{user_id}")
        self.assertEqual(lock_key, f"account_2fa_locked_{user_id}")
        
        # Verify keys don't contain method names (old code had totp_, backup_, etc)
        self.assertNotIn('totp_', fail_key)
        self.assertNotIn('backup_', fail_key)
        self.assertNotIn('email_', fail_key)
        print(f"✅ PASS: Unified key format verified")
    
    def test_lockout_not_active_initially(self):
        """Verify account is not locked initially"""
        locked, secs = _check_account_2fa_lockout(self.user.id)
        self.assertFalse(locked)
        self.assertEqual(secs, 0)
        print(f"✅ PASS: No lockout initially")
    
    def test_failure_1_not_locked(self):
        """Verify 1st failure doesn't lock account"""
        locked_now, attempts_left = _record_shared_2fa_failure(self.user.id, method='TOTP')
        
        # Should not be locked yet
        self.assertFalse(locked_now)
        self.assertEqual(attempts_left, SHARED_2FA_MAX_ATTEMPTS - 1)
        
        # Verify account is still accessible
        locked, secs = _check_account_2fa_lockout(self.user.id)
        self.assertFalse(locked)
        print(f"✅ PASS: 1st failure - {attempts_left} attempts remaining")
    
    def test_failure_2_not_locked(self):
        """Verify 2nd failure doesn't lock account"""
        _record_shared_2fa_failure(self.user.id, method='TOTP')
        locked_now, attempts_left = _record_shared_2fa_failure(self.user.id, method='TOTP')
        
        # Should not be locked yet
        self.assertFalse(locked_now)
        self.assertEqual(attempts_left, SHARED_2FA_MAX_ATTEMPTS - 2)
        
        # Verify account is still accessible
        locked, secs = _check_account_2fa_lockout(self.user.id)
        self.assertFalse(locked)
        print(f"✅ PASS: 2nd failure - {attempts_left} attempt remaining")
    
    def test_failure_3_locks_account(self):
        """Verify 3rd failure LOCKS THE ACCOUNT"""
        _record_shared_2fa_failure(self.user.id, method='TOTP')
        _record_shared_2fa_failure(self.user.id, method='TOTP')
        locked_now, attempts_left = _record_shared_2fa_failure(self.user.id, method='TOTP')
        
        # Should be locked NOW
        self.assertTrue(locked_now)
        self.assertEqual(attempts_left, 0)
        
        # Verify account is locked
        locked, secs = _check_account_2fa_lockout(self.user.id)
        self.assertTrue(locked)
        self.assertGreater(secs, 0)  # Should have TTL remaining
        print(f"✅ PASS: 3rd failure - Account locked for {secs} seconds")
    
    def test_critical_fix_totp_to_backup_switch_blocked(self):
        """
        CRITICAL TEST: Verify attacker CANNOT switch from TOTP to Backup Code
        
        Before Fix (VULNERABLE):
            1. Fail TOTP 3 times → Locked on TOTP
            2. Switch to Backup Code → NOT locked (different key!)
            3. Get 3 more attempts
        
        After Fix (SECURE):
            1. Fail TOTP 3 times → Account locked
            2. Try Backup Code → BLOCKED (account locked)
            3. Cannot proceed
        """
        # Step 1: Fail TOTP 3 times
        _record_shared_2fa_failure(self.user.id, method='TOTP')
        _record_shared_2fa_failure(self.user.id, method='TOTP')
        locked_now, _ = _record_shared_2fa_failure(self.user.id, method='TOTP')
        self.assertTrue(locked_now, "TOTP should be locked after 3 failures")
        
        # Step 2: Try Backup Code - should find account locked
        locked, secs = _check_account_2fa_lockout(self.user.id)
        self.assertTrue(locked, "CRITICAL: Backup code attempt should see account locked!")
        self.assertGreater(secs, 0)
        
        # ✅ FIX VERIFIED: Cannot bypass by switching methods
        print(f"✅ CRITICAL FIX VERIFIED: Cannot bypass TOTP → Backup Code switch")
        print(f"   Account locked for {secs} seconds, all methods blocked")
    
    def test_critical_fix_backup_to_email_switch_blocked(self):
        """
        CRITICAL TEST: Verify attacker CANNOT switch from Backup Code to Email OTP
        
        Before Fix (VULNERABLE):
            1. Fail Backup Code 3 times → Locked on Backup Code
            2. Switch to Email OTP → NOT locked (different key!)
            3. Get 3 more attempts
        
        After Fix (SECURE):
            1. Fail Backup Code 3 times → Account locked
            2. Try Email OTP → BLOCKED (account locked)
            3. Cannot proceed
        """
        # Step 1: Fail Backup Code 3 times
        _record_shared_2fa_failure(self.user.id, method='BackupCode')
        _record_shared_2fa_failure(self.user.id, method='BackupCode')
        locked_now, _ = _record_shared_2fa_failure(self.user.id, method='BackupCode')
        self.assertTrue(locked_now, "Backup Code should be locked after 3 failures")
        
        # Step 2: Try Email OTP - should find account locked
        locked, secs = _check_account_2fa_lockout(self.user.id)
        self.assertTrue(locked, "CRITICAL: Email OTP attempt should see account locked!")
        self.assertGreater(secs, 0)
        
        # ✅ FIX VERIFIED: Cannot bypass by switching methods
        print(f"✅ CRITICAL FIX VERIFIED: Cannot bypass BackupCode → Email OTP switch")
        print(f"   Account locked for {secs} seconds, all methods blocked")
    
    def test_clear_lockout_works(self):
        """Verify successful login clears the lockout"""
        # Lock the account
        _record_shared_2fa_failure(self.user.id, method='TOTP')
        _record_shared_2fa_failure(self.user.id, method='TOTP')
        _record_shared_2fa_failure(self.user.id, method='TOTP')
        
        # Verify it's locked
        locked, secs = _check_account_2fa_lockout(self.user.id)
        self.assertTrue(locked)
        
        # Clear lockout (happens on successful login)
        _clear_shared_2fa_lockout(self.user.id)
        
        # Verify it's no longer locked
        locked, secs = _check_account_2fa_lockout(self.user.id)
        self.assertFalse(locked)
        self.assertEqual(secs, 0)
        print(f"✅ PASS: Lockout cleared on successful login")
    
    def test_cross_method_failure_sharing(self):
        """
        Verify that failures from DIFFERENT methods share the same counter
        
        This is a key part of the fix: method1_fail + method2_fail + method3_fail
        should all contribute to the same counter.
        """
        # 1 TOTP failure
        _, attempts_left = _record_shared_2fa_failure(self.user.id, method='TOTP')
        self.assertEqual(attempts_left, 2)
        
        # 1 Backup Code failure (same counter)
        _, attempts_left = _record_shared_2fa_failure(self.user.id, method='BackupCode')
        self.assertEqual(attempts_left, 1)
        
        # 1 Email OTP failure (same counter - LOCKS ACCOUNT)
        locked_now, attempts_left = _record_shared_2fa_failure(self.user.id, method='EmailOTP')
        self.assertTrue(locked_now, "3rd failure across methods should lock account")
        self.assertEqual(attempts_left, 0)
        
        print(f"✅ PASS: Cross-method failures share same counter (1+1+1=locked)")


def run_tests():
    """Run all tests"""
    print("\n" + "="*80)
    print("UNIFIED 2FA ACCOUNT LOCKOUT - SECURITY FIX VERIFICATION")
    print("="*80 + "\n")
    
    suite = unittest.TestLoader().loadTestsFromTestCase(TestUnifiedLockoutFix)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print("\n" + "="*80)
    if result.wasSuccessful():
        print("✅ ALL TESTS PASSED - SECURITY FIX VERIFIED")
        print("="*80 + "\n")
        print("SUMMARY:")
        print("  ✅ Unified lockout key format verified")
        print("  ✅ Lockout progression (1 fail, 2 fails, 3 fails → locked) works")
        print("  ✅ CRITICAL: TOTP → Backup Code switch is BLOCKED")
        print("  ✅ CRITICAL: Backup Code → Email OTP switch is BLOCKED")
        print("  ✅ Cross-method failure sharing works")
        print("  ✅ Lockout clearing on successful login works")
        print("\n🔒 SECURITY STATUS: SECURE - Brute force protection effective")
        print("="*80 + "\n")
        return True
    else:
        print("❌ SOME TESTS FAILED - FIX NOT WORKING PROPERLY")
        print("="*80 + "\n")
        return False


if __name__ == '__main__':
    import unittest
    success = run_tests()
    sys.exit(0 if success else 1)
