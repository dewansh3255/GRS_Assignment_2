from .serializers import MessageSerializer
from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from .models import UserKeys, Profile, Message
from .serializers import UserRegistrationSerializer, UserKeysSerializer, ProfileSerializer, MessageSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated
import random
import pyotp
import secrets
from secrets import compare_digest
import hashlib
from django.shortcuts import get_object_or_404
from django.contrib.auth import authenticate
from .audit import create_audit_log
from .models import AuditLog, ChatGroup, GroupMember, GroupMessage, BackupCode
from django.db import transaction
from .serializers import ChatGroupSerializer, GroupMessageSerializer, GroupMemberSerializer
from django.core.cache import cache
from django.core.mail import send_mail
from django.conf import settings
from .audit import create_audit_log

User = get_user_model()


class LoginRateThrottle(AnonRateThrottle):
    """5 TOTP/login attempts per minute per IP — brute force protection."""
    rate = '5/min'

class ProfileRateThrottle(AnonRateThrottle):
    rate = '30/min'


# ── TOTP Lockout helpers ────────────────────────────────────────────────────
TOTP_MAX_ATTEMPTS = 3
TOTP_LOCKOUT_SECONDS = 15 * 60  # 15 minutes


def _totp_fail_key(username: str) -> str:
    return f"totp_fail_count_{username.lower()}"


def _totp_lock_key(username: str) -> str:
    return f"totp_locked_{username.lower()}"


def _check_totp_lockout(username: str):
    """Returns (locked: bool, seconds_remaining: int)."""
    remaining = cache.ttl(_totp_lock_key(username))
    if remaining and remaining > 0:
        return True, remaining
    return False, 0


def _record_totp_failure(username: str):
    """
    Increments the failure counter for a username.
    Triggers a 15-minute lockout after TOTP_MAX_ATTEMPTS failures.
    Returns (locked_now: bool, attempts_remaining: int).
    """
    fail_key = _totp_fail_key(username)
    lock_key = _totp_lock_key(username)

    failures = cache.get(fail_key, 0) + 1
    cache.set(fail_key, failures, timeout=TOTP_LOCKOUT_SECONDS)

    if failures >= TOTP_MAX_ATTEMPTS:
        cache.set(lock_key, '1', timeout=TOTP_LOCKOUT_SECONDS)
        cache.delete(fail_key)
        return True, 0

    return False, TOTP_MAX_ATTEMPTS - failures


def _clear_totp_lockout(username: str):
    """Clear failure state after a successful TOTP verification."""
    cache.delete(_totp_fail_key(username))
    cache.delete(_totp_lock_key(username))
# ────────────────────────────────────────────────────


# ── BACKUP CODE & EMAIL OTP Lockout helpers ─────────────────────────────────
def _backup_code_fail_key(user_id: int) -> str:
    return f"backup_code_fail_count_{user_id}"


def _backup_code_lock_key(user_id: int) -> str:
    return f"backup_code_locked_{user_id}"


def _check_backup_code_lockout(user_id: int):
    """Returns (locked: bool, seconds_remaining: int)."""
    remaining = cache.ttl(_backup_code_lock_key(user_id))
    if remaining and remaining > 0:
        return True, remaining
    return False, 0


def _record_backup_code_failure(user_id: int):
    """
    Increments the failure counter for backup code.
    Triggers a 15-minute lockout after TOTP_MAX_ATTEMPTS failures.
    Returns (locked_now: bool, attempts_remaining: int).
    """
    fail_key = _backup_code_fail_key(user_id)
    lock_key = _backup_code_lock_key(user_id)

    failures = cache.get(fail_key, 0) + 1
    cache.set(fail_key, failures, timeout=TOTP_LOCKOUT_SECONDS)

    if failures >= TOTP_MAX_ATTEMPTS:
        cache.set(lock_key, '1', timeout=TOTP_LOCKOUT_SECONDS)
        cache.delete(fail_key)
        return True, 0

    return False, TOTP_MAX_ATTEMPTS - failures


def _clear_backup_code_lockout(user_id: int):
    """Clear failure state after a successful backup code verification."""
    cache.delete(_backup_code_fail_key(user_id))
    cache.delete(_backup_code_lock_key(user_id))


# ── EMAIL OTP Lockout helpers ───────────────────────────────────────────────
def _email_otp_fail_key(user_id: int) -> str:
    return f"email_otp_fail_count_{user_id}"


def _email_otp_lock_key(user_id: int) -> str:
    return f"email_otp_locked_{user_id}"


def _check_email_otp_lockout(user_id: int):
    """Returns (locked: bool, seconds_remaining: int)."""
    remaining = cache.ttl(_email_otp_lock_key(user_id))
    if remaining and remaining > 0:
        return True, remaining
    return False, 0


def _record_email_otp_failure(user_id: int):
    """
    Increments the failure counter for email OTP.
    Triggers a 15-minute lockout after TOTP_MAX_ATTEMPTS failures.
    Returns (locked_now: bool, attempts_remaining: int).
    """
    fail_key = _email_otp_fail_key(user_id)
    lock_key = _email_otp_lock_key(user_id)

    failures = cache.get(fail_key, 0) + 1
    cache.set(fail_key, failures, timeout=TOTP_LOCKOUT_SECONDS)

    if failures >= TOTP_MAX_ATTEMPTS:
        cache.set(lock_key, '1', timeout=TOTP_LOCKOUT_SECONDS)
        cache.delete(fail_key)
        return True, 0

    return False, TOTP_MAX_ATTEMPTS - failures


def _clear_email_otp_lockout(user_id: int):
    """Clear failure state after a successful email OTP verification."""
    cache.delete(_email_otp_fail_key(user_id))
    cache.delete(_email_otp_lock_key(user_id))


# ── REGISTRATION TOTP Lockout helpers ───────────────────────────────────────
def _reg_totp_fail_key(session_id: str) -> str:
    return f"reg_totp_fail_count_{session_id}"


def _reg_totp_lock_key(session_id: str) -> str:
    return f"reg_totp_locked_{session_id}"


def _check_reg_totp_lockout(session_id: str):
    """Returns (locked: bool, seconds_remaining: int)."""
    remaining = cache.ttl(_reg_totp_lock_key(session_id))
    if remaining and remaining > 0:
        return True, remaining
    return False, 0


def _record_reg_totp_failure(session_id: str):
    """
    Increments the failure counter for registration TOTP.
    Triggers a 15-minute lockout after TOTP_MAX_ATTEMPTS failures.
    Returns (locked_now: bool, attempts_remaining: int).
    """
    fail_key = _reg_totp_fail_key(session_id)
    lock_key = _reg_totp_lock_key(session_id)

    failures = cache.get(fail_key, 0) + 1
    cache.set(fail_key, failures, timeout=TOTP_LOCKOUT_SECONDS)

    if failures >= TOTP_MAX_ATTEMPTS:
        cache.set(lock_key, '1', timeout=TOTP_LOCKOUT_SECONDS)
        cache.delete(fail_key)
        return True, 0

    return False, TOTP_MAX_ATTEMPTS - failures


def _clear_reg_totp_lockout(session_id: str):
    """Clear failure state after a successful registration TOTP verification."""
    cache.delete(_reg_totp_fail_key(session_id))
    cache.delete(_reg_totp_lock_key(session_id))
# ────────────────────────────────────────────────────


# ── UNIFIED 2FA ACCOUNT LOCKOUT (fixes method-switching bypass) ───────────────
# CRITICAL FIX: Account-level lockout that affects ALL 2FA methods
# When any 2FA method fails 3 times, the ENTIRE ACCOUNT is locked for 15 mins
# This prevents bypassing the lockout by switching from TOTP to backup codes
SHARED_2FA_MAX_ATTEMPTS = 3
SHARED_2FA_LOCKOUT_SECONDS = 15 * 60  # 15 minutes


def _account_2fa_fail_key(user_id: int) -> str:
    """Shared failure counter for ALL 2FA methods (TOTP, Backup, Email OTP)."""
    return f"2fa_fail_count_{user_id}"


def _account_2fa_lock_key(user_id: int) -> str:
    """Unified lockout key that affects ALL 2FA methods for the account."""
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
    
    This replaces method-specific failure tracking to prevent bypass via method-switching.
    
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


class UploadKeysView(APIView):
    """
    MEMBER B: Key Upload Endpoint
    Allows the frontend to save generated keys to the database.
    """
    # 1. Require the user to be fully authenticated via cookies
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # 2. NO MORE MOCK USER! Use the real logged-in user.
        user = request.user

        # 3. Save the keys securely
        keys, created = UserKeys.objects.update_or_create(
            user=user,
            defaults={
                'public_key': request.data.get('public_key'),
                'encrypted_private_key': request.data.get('encrypted_private_key')
            }
        )

        return Response(
            {"message": "Keys updated successfully!" if not created else "Keys created successfully!"},
            status=status.HTTP_200_OK
        )


class RegisterView(APIView):
    """
    MEMBER A: Deferred Registration Endpoint
    Validates input and generates TOTP secret. User is NOT written to the DB yet.
    Data is stored in Redis under a session token for 15 minutes.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            print("REGISTER VALIDATION ERRORS:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        session_id = secrets.token_hex(16)
        totp_secret = pyotp.random_base32()

        cache_data = serializer.validated_data.copy()
        cache_data['totp_secret'] = totp_secret
        
        # Store in redis
        cache.set(f"reg_{session_id}", cache_data, timeout=900)

        # Generate QR Code immediately
        totp = pyotp.TOTP(totp_secret)
        uri = totp.provisioning_uri(name=cache_data['username'], issuer_name="Secure Job Platform")

        return Response({
            "message": "User validated. Proceed to 2FA setup.",
            "session_id": session_id,
            "qr_uri": uri
        }, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomLoginView(APIView):
    """
    MEMBER A: Step 1 of Login (Password Check)
    Also enforces any active TOTP lockout so users cannot brute-force
    credentials while waiting for their TOTP window to expire.
    """
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        username = request.data.get('username', '') or ''
        password = request.data.get('password')

        # Enforce TOTP lockout at step 1 as well
        if username:
            locked, secs = _check_totp_lockout(username)
            if locked:
                mins = secs // 60
                return Response({
                    "error": f"This account is temporarily locked due to multiple failed 2FA attempts. "
                             f"Please try again in {mins} minute(s).",
                    "locked": True,
                    "seconds_remaining": secs,
                    "minutes_remaining": mins,
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        user = authenticate(username=username, password=password)
        if user:
            # If they haven't verified 2FA during registration, block login
            if not user.is_verified:
                return Response({
                    "error": "Account not verified. Please complete 2FA setup.",
                    "user_id": user.id,
                    "needs_setup": True
                }, status=status.HTTP_403_FORBIDDEN)

            return Response({
                "message": "Credentials valid. Proceed to 2FA.",
                "user_id": user.id,
                "username": user.username,
            }, status=status.HTTP_200_OK)

        return Response({"error": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)


class GenerateTOTPURIView(APIView):
    """
    MEMBER A: TOTP Setup (Requires user_id now)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        totp = pyotp.TOTP(user.totp_secret)
        uri = totp.provisioning_uri(
            name=user.username, issuer_name="Secure Job Platform")

        return Response({"qr_uri": uri}, status=status.HTTP_200_OK)


class VerifyTOTPView(APIView):
    """
    MEMBER A: Step 2 of Login (OTP Check & Issue Cookies)
    Rate-limited to 5 attempts/min per IP to prevent brute-force.
    Per-username retry policy: 3 attempts allowed; 3rd failure triggers
    a 15-minute Redis lockout stored under totp_locked_{username}.
    """
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        session_id = request.data.get("session_id")
        user_id = request.data.get("user_id")
        code = request.data.get("code")

        if not code:
            return Response({"error": "Missing OTP code."}, status=status.HTTP_400_BAD_REQUEST)

        # --- REGISTRATION ATTEMPT ---
        if session_id:
            data = cache.get(f"reg_{session_id}")
            if not data:
                return Response({"error": "Registration session expired. Please register again."}, status=status.HTTP_400_BAD_REQUEST)
            
            # 1. Check if registration TOTP is locked due to too many failed attempts
            locked, secs = _check_reg_totp_lockout(session_id)
            if locked:
                mins = secs // 60
                return Response({
                    "error": f"Too many failed TOTP attempts. Registration is temporarily locked. "
                            f"Please try again in {mins} minute(s) and {secs % 60} second(s).",
                    "locked": True,
                    "seconds_remaining": secs,
                    "minutes_remaining": mins,
                    "attempts_remaining": 0,
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)
            
            # 2. Validate the TOTP code
            totp = pyotp.TOTP(data['totp_secret'])
            if not totp.verify(code, valid_window=1):
                locked_now, attempts_left = _record_reg_totp_failure(session_id)
                
                if locked_now:
                    return Response({
                        "error": f"Too many failed TOTP attempts. Registration is locked for "
                                f"{TOTP_LOCKOUT_SECONDS // 60} minutes.",
                        "locked": True,
                        "seconds_remaining": TOTP_LOCKOUT_SECONDS,
                        "minutes_remaining": TOTP_LOCKOUT_SECONDS // 60,
                        "attempts_remaining": 0,
                    }, status=status.HTTP_429_TOO_MANY_REQUESTS)
                
                return Response({
                    "error": "Invalid OTP code.",
                    "locked": False,
                    "attempts_remaining": attempts_left,
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # 3. TOTP verified - create user
            with transaction.atomic():
                user = User.objects.create_user(
                    username=data['username'],
                    email=data['email'],
                    password=data['password'],
                    phone_number=data.get('phone_number'),
                    role='CANDIDATE'
                )
                user.totp_secret = data['totp_secret']
                user.is_verified = True
                user.save()

                # Generate initial backup codes
                import string, random, hashlib
                from accounts.models import BackupCode
                plaintext_codes = []
                for _ in range(8):
                    raw = ''.join(random.choices(string.ascii_uppercase + string.digits, k=12))
                    formatted = f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"
                    code_hash = hashlib.sha256(formatted.encode()).hexdigest()
                    BackupCode.objects.create(user=user, code_hash=code_hash)
                    plaintext_codes.append(formatted)
            
            create_audit_log('REGISTER', user, {'username': user.username})
            cache.delete(f"reg_{session_id}")
            _clear_reg_totp_lockout(session_id)

            refresh = RefreshToken.for_user(user)
            response = Response({
                "message": "Registered and logged in securely!", 
                "access_token": str(refresh.access_token), 
                "user_id": user.id,
                "backup_codes": plaintext_codes
            }, status=status.HTTP_200_OK)
            
            # Explicitly set CSRF token cookie after login
            from django.middleware.csrf import get_token
            csrf_token = get_token(request)
            response.set_cookie('csrftoken', csrf_token, httponly=False, secure=True, samesite='Lax')
            
            response.set_cookie('access_token', str(refresh.access_token), httponly=True, secure=True, samesite='Lax')
            return response

        # --- LOGIN ATTEMPT ---
        if not user_id:
            return Response({"error": "Missing user_id for login verification."}, status=status.HTTP_400_BAD_REQUEST)

        user = get_object_or_404(User, id=user_id)
        username = user.username

        # 1. Check UNIFIED account lockout (blocks ALL 2FA methods)
        # CRITICAL FIX: Use account-level lockout, not method-specific
        locked, secs = _check_account_2fa_lockout(user.id)
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

        # 2. Validate the TOTP code
        totp = pyotp.TOTP(user.totp_secret)
        code_valid = totp.verify(code, valid_window=0)

        if not code_valid:
            err_msg = 'Invalid OTP code.'
            # CRITICAL FIX: Use unified account lockout instead of per-method lockout
            locked_now, attempts_left = _record_shared_2fa_failure(user.id, method='TOTP')
            create_audit_log('LOGIN_2FA_FAILED', user, {
                'method': 'TOTP',
                'reason': err_msg,
                'attempts_remaining': attempts_left,
            })

            if locked_now:
                return Response({
                    "error": f"Too many failed 2FA attempts across all methods. "
                             f"Account locked for {SHARED_2FA_LOCKOUT_SECONDS // 60} minutes.",
                    "locked": True,
                    "seconds_remaining": SHARED_2FA_LOCKOUT_SECONDS,
                    "minutes_remaining": SHARED_2FA_LOCKOUT_SECONDS // 60,
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            return Response({
                "error": err_msg,
                "locked": False,
                "attempts_remaining": attempts_left,
            }, status=status.HTTP_400_BAD_REQUEST)

        # 3. Success — clear unified lockout and issue cookies
        user.is_verified = True
        user.save(update_fields=['is_verified'])
        _clear_shared_2fa_lockout(user.id)

        create_audit_log('LOGIN_SUCCESS', user, {'user_id': user.id})

        refresh = RefreshToken.for_user(user)
        response = Response(
            {"message": "Logged in securely!", "access_token": str(refresh.access_token), "user_id": user.id},
            status=status.HTTP_200_OK,
        )
        
        # Explicitly set CSRF token cookie after login
        from django.middleware.csrf import get_token
        csrf_token = get_token(request)
        response.set_cookie('csrftoken', csrf_token, httponly=False, secure=True, samesite='Lax')
        
        response.set_cookie('access_token', str(
            refresh.access_token), httponly=True, secure=True, samesite='Lax')
        response.set_cookie('refresh_token', str(
            refresh), httponly=True, secure=True, samesite='Lax')
        return response


class ProfileRetrieveUpdateView(generics.RetrieveUpdateAPIView):
    """
    MEMBER A: Profile Endpoint with Privacy Controls
    GET: View a profile (strips private fields if not owner).
    PATCH: Update your own profile.
    """
    serializer_class = ProfileSerializer
    # MUST BE LOGGED IN (Requires Cookie!)
    permission_classes = [IsAuthenticated]
    lookup_field = 'user__username'
    lookup_url_kwarg = 'username'
    queryset = Profile.objects.all()

    def get_object(self):
        return self.request.user.profile


class LogoutView(APIView):
    """Securely clear the authentication cookies."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        response = Response({"message": "Successfully logged out."}, status=status.HTTP_200_OK)
        response.delete_cookie('access_token', path='/', domain=settings.SESSION_COOKIE_DOMAIN, samesite='Lax')
        response.delete_cookie('refresh_token', path='/', domain=settings.SESSION_COOKIE_DOMAIN, samesite='Lax')
        return response


class AuthCheckView(APIView):
    """Simple authentication check for frontend guards."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"authenticated": True}, status=status.HTTP_200_OK)

    def get_object(self):
        # If no username is provided in URL, return the logged-in user's profile
        username = self.kwargs.get('username')
        if not username:
            return get_object_or_404(Profile, user=self.request.user)
        return super().get_object()


class GetPublicKeyView(APIView):
    """
    MEMBER B: Fetch Recipient's Public Key
    Allows a user to get another user's public key to encrypt a message for them.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, username):
        target_user = get_object_or_404(User, username=username)
        try:
            # We use .keys because of the related_name='keys' in the UserKeys model
            user_keys = target_user.keys
            return Response({
                "id": target_user.id,
                "username": target_user.username,
                "public_key": user_keys.public_key
            }, status=status.HTTP_200_OK)
        except UserKeys.DoesNotExist:
            return Response({"error": "User has not set up their encryption keys yet."}, status=status.HTTP_404_NOT_FOUND)


class MessageListCreateView(generics.ListCreateAPIView):
    """
    MEMBER B: E2EE Messaging Endpoint
    GET: Fetch my inbox (messages where I am the recipient).
    POST: Send an encrypted message to someone else.
    """
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Only return messages sent TO the currently logged-in user
        return Message.objects.filter(recipient=self.request.user).order_by('-timestamp')

    def perform_create(self, serializer):
        from rest_framework.exceptions import PermissionDenied
        from jobs.models import Application, Company
        from django.db.models import Q

        sender = self.request.user
        recipient = serializer.validated_data['recipient']

        sender_role = getattr(sender, 'role', '')
        recipient_role = getattr(recipient, 'role', '')

        # ── Path 1: Check ACCEPTED connection — always allowed ────────────
        from .models import Connection
        is_connected = Connection.objects.filter(
            Q(sender=sender, receiver=recipient) | Q(sender=recipient, receiver=sender),
            status='ACCEPTED'
        ).exists()
        if is_connected:
            serializer.save(sender=sender)
            return

        # ── Path 2: RECRUITER initiating to an applicant ──────────────────
        # Allowed if sender is a RECRUITER and recipient has applied to any
        # job in the recruiter's company (as owner OR employee), irrespective
        # of the recipient's role field.
        if sender_role == 'RECRUITER':
            recruiter_company_ids = list(Company.objects.filter(
                Q(owner=sender) | Q(employees=sender)
            ).values_list('id', flat=True))

            if recruiter_company_ids:
                applied = Application.objects.filter(
                    applicant=recipient,
                    job__company_id__in=recruiter_company_ids
                ).exists()
                if applied:
                    serializer.save(sender=sender)
                    return

            raise PermissionDenied(
                "You can only message applicants who have applied to your company's jobs, "
                "or users you are connected with."
            )

        # ── Path 3: CANDIDATE replying to a recruiter who messaged first ──
        if sender_role == 'CANDIDATE' and recipient_role == 'RECRUITER':
            recruiter_messaged_first = Message.objects.filter(
                sender=recipient,
                recipient=sender
            ).exists()
            if recruiter_messaged_first:
                serializer.save(sender=sender)
                return
            raise PermissionDenied(
                "You can only reply to a recruiter after they have contacted you first."
            )

        # ── Path 4: Everything else requires a connection ─────────────────
        raise PermissionDenied(
            "You can only send direct messages to your connections."
        )





class UserListView(APIView):
    """
    MEMBER B: Fetch List of Users for Chat
    Returns a list of connected users to populate the chat sidebar.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        # Fetch accepted connections where user is either sender or receiver
        connections = Connection.objects.filter(
            (Q(sender=user) | Q(receiver=user)),
            status='ACCEPTED'
        )
        
        pure_connected_ids = set()
        for conn in connections:
            if conn.sender_id == user.id:
                pure_connected_ids.add(conn.receiver_id)
            else:
                pure_connected_ids.add(conn.sender_id)

        all_visible_ids = set(pure_connected_ids)

        # Include users with prior message history
        messages = Message.objects.filter(Q(sender=user) | Q(recipient=user))
        for msg in messages:
            if msg.sender_id == user.id:
                all_visible_ids.add(msg.recipient_id)
            else:
                all_visible_ids.add(msg.sender_id)

        # Include job applicants if the user is a recruiter
        from jobs.models import Application
        apps = Application.objects.filter(
            Q(job__company__owner=user) | Q(job__company__employees=user)
        )
        for app in apps:
            all_visible_ids.add(app.applicant_id)

        users = User.objects.filter(id__in=all_visible_ids).exclude(id=request.user.id)
        result = []
        for u in users:
            result.append({
                'id': u.id,
                'username': u.username,
                'is_connected': u.id in pure_connected_ids,
                'role': u.role
            })
        return Response(result, status=status.HTTP_200_OK)


class GetMyKeysView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user_keys = request.user.keys
            return Response({
                "public_key": user_keys.public_key,
                "encrypted_private_key": user_keys.encrypted_private_key
            }, status=status.HTTP_200_OK)
        except UserKeys.DoesNotExist:
            return Response({"error": "No keys found."}, status=status.HTTP_404_NOT_FOUND)


class ChangeUserRoleView(APIView):
    """
    Allows authenticated users to change their role between CANDIDATE and RECRUITER.
    Requires TOTP verification as this is a high-risk action.
    MEMBER 3: TOTP enforcement on role change.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        new_role = request.data.get('role', '').upper()
        totp_code = request.data.get('totp_code', '').strip()

        # Only allow switching between CANDIDATE and RECRUITER
        if new_role not in ['CANDIDATE', 'RECRUITER']:
            return Response(
                {'error': 'Invalid role. Must be CANDIDATE or RECRUITER.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # MEMBER 3: Verify TOTP for high-risk action
        if not totp_code:
            return Response(
                {'error': 'TOTP code is required for role change.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        totp = pyotp.TOTP(request.user.totp_secret)
        if not totp.verify(totp_code):
            create_audit_log('ROLE_CHANGE_FAILED', request.user, {
                'reason': 'invalid_totp',
                'attempted_role': new_role
            })
            return Response(
                {'error': 'Invalid authenticator code. Role change denied.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        old_role = request.user.role
        if old_role == new_role:
            return Response(
                {'message': f'Already a {new_role}.'},
                status=status.HTTP_200_OK
            )

        # Update the role
        request.user.role = new_role
        request.user.save()

        # Audit log the role change
        create_audit_log('ROLE_CHANGE', request.user, {
            'old_role': old_role,
            'new_role': new_role
        })

        return Response({
            'message': f'Role changed from {old_role} to {new_role}.',
            'role': new_role
        }, status=status.HTTP_200_OK)


class AuditLogListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'ADMIN':
            return Response({'error': 'Admin only.'}, status=status.HTTP_403_FORBIDDEN)
        logs = AuditLog.objects.all().order_by('id').values(
            'id', 'action', 'timestamp', 'prev_hash', 'current_hash', 'details'
        )
        return Response(list(logs))


class GroupListCreateView(APIView):
    """
    MEMBER B: Group Chat Management
    GET: List all groups the logged-in user is a part of.
    POST: Create a new group and distribute the encrypted AES keys.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Find all groups where the user is a member
        memberships = GroupMember.objects.filter(user=request.user)
        groups = [membership.group for membership in memberships]
        serializer = ChatGroupSerializer(groups, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        name = request.data.get('name')
        members_data = request.data.get('members', [])

        if not name or not members_data:
            return Response({"error": "Group name and members are required."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Create the Group
        group = ChatGroup.objects.create(name=name)

        # 2. Add all members
        for member in members_data:
            user_id = member.get('user_id')
            encrypted_key = member.get('encrypted_key')

            # --- THE FIX: Handle the special -1 flag for the Creator ---
            if user_id == -1:
                user_obj = request.user
                role = 'owner'
            else:
                try:
                    user_obj = User.objects.get(id=user_id)
                    role = 'member'
                except User.DoesNotExist:
                    continue  # Skip invalid users

            GroupMember.objects.create(
                user=user_obj,
                group=group,
                role=role,
                encrypted_group_key=encrypted_key
            )

        serializer = ChatGroupSerializer(group)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class GroupDetailView(APIView):
    """
    MEMBER B: Group Deletion
    DELETE: Destroys the group and all associated messages/members.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, group_id):
        group = get_object_or_404(ChatGroup, id=group_id)

        # Verify the requester is the OWNER
        try:
            membership = GroupMember.objects.get(
                group=group, user=request.user)
            if membership.role != 'owner':
                return Response({"error": "Only the group owner can delete the group."}, status=status.HTTP_403_FORBIDDEN)
        except GroupMember.DoesNotExist:
            return Response({"error": "You are not a member of this group."}, status=status.HTTP_403_FORBIDDEN)

        group.delete()
        return Response({"message": "Group successfully deleted."}, status=status.HTTP_204_NO_CONTENT)


class GroupMemberManageView(APIView):
    """
    MEMBER B: Group Membership Management
    POST: Add a new member (Requires Admin/Owner)
    DELETE: Kick a member (Requires Admin/Owner)
    PATCH: Promote to Admin (Requires Owner)
    """
    permission_classes = [IsAuthenticated]

    def _get_requester_membership(self, group, user):
        return get_object_or_404(GroupMember, group=group, user=user)

    def post(self, request, group_id):
        # Adding a new member
        group = get_object_or_404(ChatGroup, id=group_id)
        requester_membership = self._get_requester_membership(
            group, request.user)

        if requester_membership.role not in ['owner', 'admin']:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)

        new_username = request.data.get('username')
        encrypted_key = request.data.get('encrypted_key')

        if not new_username or not encrypted_key:
            return Response({"error": "username and encrypted_key are required."}, status=status.HTTP_400_BAD_REQUEST)

        new_user = get_object_or_404(User, username=new_username)

        member, created = GroupMember.objects.get_or_create(
            user=new_user,
            group=group,
            defaults={'role': 'member', 'encrypted_group_key': encrypted_key}
        )

        if not created:
            return Response({"error": "User is already in the group."}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"message": f"{new_user.username} added to the group."}, status=status.HTTP_201_CREATED)

    def patch(self, request, group_id, username):
        # Promoting a member to Admin
        group = get_object_or_404(ChatGroup, id=group_id)
        requester_membership = self._get_requester_membership(
            group, request.user)

        if requester_membership.role != 'owner':
            return Response({"error": "Only the owner can promote members."}, status=status.HTTP_403_FORBIDDEN)

        target_membership = get_object_or_404(
            GroupMember, group=group, user__username=username)
        target_membership.role = 'admin'
        target_membership.save()

        return Response({"message": f"{target_membership.user.username} is now an admin."}, status=status.HTTP_200_OK)

    def delete(self, request, group_id, username):
        # Removing a member
        group = get_object_or_404(ChatGroup, id=group_id)
        requester_membership = self._get_requester_membership(
            group, request.user)

        if requester_membership.role not in ['owner', 'admin']:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)

        target_membership = get_object_or_404(
            GroupMember, group=group, user__username=username)

        if target_membership.role == 'owner':
            return Response({"error": "Cannot remove the group owner."}, status=status.HTTP_400_BAD_REQUEST)

        target_membership.delete()
        # NOTE: The frontend MUST now initiate a Key Rotation process to ensure perfect forward secrecy!
        return Response({"message": "Member removed."}, status=status.HTTP_204_NO_CONTENT)


class GroupKeyRotateView(APIView):
    """
    MEMBER B: Forward Secrecy / Key Rotation
    Allows an admin/owner to bulk-update the encrypted AES group keys for all remaining members.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, group_id):
        group = get_object_or_404(ChatGroup, id=group_id)
        
        # Verify requester has permission
        try:
            requester_membership = GroupMember.objects.get(group=group, user=request.user)
            if requester_membership.role not in ['owner', 'admin']:
                return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)
        except GroupMember.DoesNotExist:
            return Response({"error": "You are not a member of this group."}, status=status.HTTP_403_FORBIDDEN)

        keys_data = request.data.get('keys', [])
        if not keys_data:
            return Response({"error": "Keys data is required."}, status=status.HTTP_400_BAD_REQUEST)

        updated_count = 0
        for item in keys_data:
            uname = item.get('username')
            encrypted_key = item.get('encrypted_key')
            if uname and encrypted_key:
                # Update the member's encrypted key
                updated = GroupMember.objects.filter(group=group, user__username=uname).update(encrypted_group_key=encrypted_key)
                updated_count += updated

        return Response({"message": f"Successfully rotated keys for {updated_count} members."}, status=status.HTTP_200_OK)


class GroupMessageListCreateView(APIView):
    """
    MEMBER B: E2EE Group Messaging Endpoint
    GET: Fetch all encrypted messages for a specific group.
    POST: Send an encrypted message to the group.
    """
    permission_classes = [IsAuthenticated]

    def _verify_membership(self, group_id, user):
        if not GroupMember.objects.filter(group_id=group_id, user=user).exists():
            return False
        return True

    def get(self, request, group_id):
        if not self._verify_membership(group_id, request.user):
            return Response({"error": "You are not a member of this group."}, status=status.HTTP_403_FORBIDDEN)

        messages = GroupMessage.objects.filter(
            group_id=group_id).order_by('timestamp')
        serializer = GroupMessageSerializer(messages, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, group_id):
        if not self._verify_membership(group_id, request.user):
            return Response({"error": "You are not a member of this group."}, status=status.HTTP_403_FORBIDDEN)

        encrypted_content = request.data.get('encrypted_content')
        if not encrypted_content:
            return Response({"error": "Encrypted content is required."}, status=status.HTTP_400_BAD_REQUEST)

        group = get_object_or_404(ChatGroup, id=group_id)

        message = GroupMessage.objects.create(
            group=group,
            sender=request.user,
            encrypted_content=encrypted_content
        )

        serializer = GroupMessageSerializer(message)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# ====================================================================
# MEMBER 1: SOCIAL NETWORK VIEWS
# ====================================================================

from .models import Connection, Post, ProfileView, Notification
from django.db.models import Q


class UserSearchView(APIView):
    """
    MEMBER 1: Search users by username or headline.
    GET /api/auth/users/search/?q=<query>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if len(q) < 2:
            return Response([])

        users = User.objects.filter(
            Q(username__icontains=q) | Q(profile__headline__icontains=q)
        ).exclude(id=request.user.id).select_related('profile')[:20]

        results = []
        for user in users:
            conn = Connection.objects.filter(
                Q(sender=request.user, receiver=user) |
                Q(sender=user, receiver=request.user)
            ).first()

            if conn:
                if conn.status == 'ACCEPTED':
                    conn_status = 'connected'
                elif conn.status == 'PENDING':
                    conn_status = 'pending_sent' if conn.sender == request.user else 'pending_received'
                else:
                    conn_status = 'none'
                conn_id = conn.id
            else:
                conn_status = 'none'
                conn_id = None

            try:
                headline = user.profile.headline if user.profile.is_headline_public else ''
                profile_picture_url = user.profile.profile_picture.url if user.profile.profile_picture else None
            except Exception:
                headline = ''
                profile_picture_url = None

            results.append({
                'id': user.id,
                'username': user.username,
                'headline': headline,
                'role': user.role,
                'profile_picture_url': profile_picture_url,
                'connection_status': conn_status,
                'connection_id': conn_id,
            })

        return Response(results)


class PublicProfileView(APIView):
    """
    MEMBER 1: View any user's public profile.
    Applies privacy filters based on connection status.
    Logs a ProfileView (self-views not counted).
    GET /api/auth/profile/<username>/public/
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ProfileRateThrottle]

    def get(self, request, username):
        target_user = get_object_or_404(User, username=username)
        profile = get_object_or_404(Profile, user=target_user)

        # Log the view — never count self-views, respect privacy setting, and debounce 1 hour
        if request.user != target_user:
            try:
                if request.user.profile.is_view_history_public:
                    from django.utils import timezone
                    from datetime import timedelta
                    recent_view = ProfileView.objects.filter(
                        viewer=request.user,
                        viewed_user=target_user,
                        timestamp__gte=timezone.now() - timedelta(hours=1)
                    ).exists()
                    if not recent_view:
                        ProfileView.objects.create(viewer=request.user, viewed_user=target_user)
            except Exception:
                pass

        serializer = ProfileSerializer(profile, context={'request': request})
        data = dict(serializer.data)

        # Determine connection status between viewer and profile owner
        conn = Connection.objects.filter(
            Q(sender=request.user, receiver=target_user) |
            Q(sender=target_user, receiver=request.user)
        ).first()

        if conn:
            if conn.status == 'ACCEPTED':
                data['connection_status'] = 'connected'
            elif conn.sender == request.user:
                data['connection_status'] = 'pending_sent'
            else:
                data['connection_status'] = 'pending_received'
            data['connection_id'] = conn.id
        else:
            data['connection_status'] = 'none'
            data['connection_id'] = None

        data['is_own_profile'] = (request.user == target_user)

        # View count only visible to profile owner
        if request.user == target_user:
            data['view_count'] = ProfileView.objects.filter(viewed_user=target_user).count()

        # Append Posts for the public profile feed
        posts = Post.objects.filter(author=target_user).order_by('-created_at')[:20]
        data['posts'] = [{
            'id': p.id,
            'author_username': p.author.username,
            'author_role': p.author.role,
            'content': p.content,
            'created_at': p.created_at,
            'is_mine': False,
        } for p in posts]

        return Response(data)


class ConnectionListView(APIView):
    """
    MEMBER 1: List accepted connections + pending requests.
    GET /api/auth/connections/
    """
    permission_classes = [IsAuthenticated]

    def _format(self, conn, me):
        other = conn.receiver if conn.sender == me else conn.sender
        try:
            headline = other.profile.headline if other.profile.is_headline_public else ''
            profile_picture_url = other.profile.profile_picture.url if other.profile.profile_picture else None
        except Exception:
            headline = ''
            profile_picture_url = None
        return {
            'id': conn.id,
            'username': other.username,
            'role': other.role,
            'headline': headline,
            'profile_picture_url': profile_picture_url,
            'status': conn.status,
            'created_at': conn.created_at,
        }

    def get(self, request):
        accepted = Connection.objects.filter(
            Q(sender=request.user) | Q(receiver=request.user),
            status='ACCEPTED'
        ).select_related('sender__profile', 'receiver__profile')

        pending_received = Connection.objects.filter(
            receiver=request.user, status='PENDING'
        ).select_related('sender__profile')

        pending_sent = Connection.objects.filter(
            sender=request.user, status='PENDING'
        ).select_related('receiver__profile')

        return Response({
            'connections': [self._format(c, request.user) for c in accepted],
            'pending_received': [self._format(c, request.user) for c in pending_received],
            'pending_sent': [self._format(c, request.user) for c in pending_sent],
        })


class SendConnectionRequestView(APIView):
    """
    MEMBER 1: Send a connection request to another user.
    POST /api/auth/connections/send/<username>/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, username):
        target = get_object_or_404(User, username=username)

        if target == request.user:
            return Response({'error': 'Cannot connect with yourself.'}, status=status.HTTP_400_BAD_REQUEST)

        existing = Connection.objects.filter(
            Q(sender=request.user, receiver=target) |
            Q(sender=target, receiver=request.user)
        ).first()

        if existing:
            return Response({'error': 'A connection already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        conn = Connection.objects.create(sender=request.user, receiver=target, status='PENDING')
        create_audit_log('CONNECTION_REQUEST_SENT', request.user, {'to_user': target.username})

        # Notify receiver
        Notification.objects.create(
            recipient=target,
            sender=request.user,
            notif_type='CONNECTION_REQUEST',
            message=f'{request.user.username} sent you a connection request',
            related_connection_id=conn.id,
        )

        return Response(
            {'id': conn.id, 'message': f'Connection request sent to {target.username}.'},
            status=status.HTTP_201_CREATED
        )


class ConnectionDetailView(APIView):
    """
    MEMBER 1: Accept/reject a pending request, or remove an accepted connection.
    PATCH /api/auth/connections/<pk>/  — body: {"action": "ACCEPT" | "REJECT"}
    DELETE /api/auth/connections/<pk>/ — remove connection (either side)
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        conn = get_object_or_404(Connection, id=pk, receiver=request.user, status='PENDING')
        action = request.data.get('action', '').upper()

        if action == 'ACCEPT':
            conn.status = 'ACCEPTED'
            conn.save()
            create_audit_log('CONNECTION_ACCEPTED', request.user, {'from_user': conn.sender.username})
            # Notify original sender
            Notification.objects.create(
                recipient=conn.sender,
                sender=request.user,
                notif_type='CONNECTION_ACCEPTED',
                message=f'{request.user.username} accepted your connection request',
            )
            # Remove the original CONNECTION_REQUEST notification (no longer actionable)
            Notification.objects.filter(
                recipient=request.user,
                related_connection_id=conn.id,
                notif_type='CONNECTION_REQUEST',
            ).delete()
            return Response({'message': f'Now connected with {conn.sender.username}!'})
        elif action == 'REJECT':
            # Remove the original CONNECTION_REQUEST notification
            Notification.objects.filter(
                recipient=request.user,
                related_connection_id=conn.id,
                notif_type='CONNECTION_REQUEST',
            ).delete()
            conn.delete()
            return Response({'message': 'Request declined.'})
        else:
            return Response({'error': 'Action must be ACCEPT or REJECT.'}, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        conn = get_object_or_404(
            Connection,
            Q(sender=request.user, id=pk) | Q(receiver=request.user, id=pk)
        )
        conn.delete()
        return Response({'message': 'Connection removed.'}, status=status.HTTP_204_NO_CONTENT)


class FeedView(APIView):
    """
    MEMBER 1: Social feed — posts from connections + own posts.
    GET  /api/auth/feed/ — paginated feed
    POST /api/auth/feed/ — create a new post
    """
    permission_classes = [IsAuthenticated]

    def _connected_ids(self, user):
        """Return a set of user IDs the current user is connected to (+ self)."""
        sent_ids = Connection.objects.filter(
            sender=user, status='ACCEPTED'
        ).values_list('receiver_id', flat=True)
        received_ids = Connection.objects.filter(
            receiver=user, status='ACCEPTED'
        ).values_list('sender_id', flat=True)
        ids = set(sent_ids) | set(received_ids)
        ids.add(user.id)
        return ids

    def get(self, request):
        ids = self._connected_ids(request.user)
        posts = Post.objects.filter(author_id__in=ids).select_related('author__profile').order_by('-created_at')[:50]
        return Response([{
            'id': p.id,
            'author_username': p.author.username,
            'author_role': p.author.role,
            'author_profile_picture_url': p.author.profile.profile_picture.url if p.author.profile.profile_picture else None,
            'content': p.content,
            'created_at': p.created_at,
            'is_mine': p.author_id == request.user.id,
        } for p in posts])

    def post(self, request):
        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Content is required.'}, status=status.HTTP_400_BAD_REQUEST)
        post = Post.objects.create(author=request.user, content=content)

        # Notify all connections about the new post
        connection_ids = self._connected_ids(request.user) - {request.user.id}
        notifs = [
            Notification(
                recipient_id=uid,
                sender=request.user,
                notif_type='NEW_POST',
                message=f'{request.user.username} shared a new post',
            )
            for uid in connection_ids
        ]
        if notifs:
            Notification.objects.bulk_create(notifs)

        return Response({
            'id': post.id,
            'author_username': post.author.username,
            'author_role': post.author.role,
            'content': post.content,
            'created_at': post.created_at,
            'is_mine': True,
        }, status=status.HTTP_201_CREATED)

    def delete(self, request, post_id):
        """
        MEMBER 2: Delete a post — only the author can delete their own post.
        DELETE /api/auth/feed/<post_id>/
        """
        post = get_object_or_404(Post, id=post_id)
        if post.author != request.user:
            return Response({'error': 'You can only delete your own posts.'}, status=status.HTTP_403_FORBIDDEN)
        post.delete()
        create_audit_log('POST_DELETED', request.user, {'post_id': post_id})
        return Response({'message': 'Post deleted.'}, status=status.HTTP_204_NO_CONTENT)


class ProfileViewersView(APIView):
    """
    MEMBER 1: Who recently viewed my profile (last 30 days, max 10 unique).
    GET /api/auth/profile/me/viewers/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            if not request.user.profile.is_view_history_public:
                return Response({'viewers': [], 'view_count': 0, 'hidden': True})
        except Exception:
            pass

        from django.utils import timezone
        from datetime import timedelta

        recent = ProfileView.objects.filter(
            viewed_user=request.user,
            timestamp__gte=timezone.now() - timedelta(days=30)
        ).order_by('-timestamp').select_related('viewer__profile')

        seen, viewers = set(), []
        for v in recent:
            if v.viewer_id not in seen:
                seen.add(v.viewer_id)
                try:
                    profile_picture_url = v.viewer.profile.profile_picture.url if v.viewer.profile.profile_picture else None
                except Exception:
                    profile_picture_url = None
                viewers.append({
                    'username': v.viewer.username,
                    'role': v.viewer.role,
                    'profile_picture_url': profile_picture_url,
                    'viewed_at': v.timestamp,
                })
            if len(viewers) >= 10:
                break

        total = ProfileView.objects.filter(viewed_user=request.user).count()
        return Response({'viewers': viewers, 'view_count': total, 'hidden': False})


# ====================================================================
# MEMBER 1: ADDITIONAL SOCIAL VIEWS
# ====================================================================

from .serializers import NotificationSerializer


class NotificationListView(APIView):
    """
    MEMBER 1: Get my notifications + unread count.
    GET /api/auth/notifications/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifs = Notification.objects.filter(
            recipient=request.user
        ).select_related('sender').order_by('-created_at')[:30]

        unread_count = Notification.objects.filter(
            recipient=request.user, is_read=False
        ).count()

        return Response({
            'notifications': NotificationSerializer(notifs, many=True).data,
            'unread_count': unread_count,
        })


class MarkNotificationReadView(APIView):
    """
    MEMBER 1: Mark one or all notifications as read.
    POST /api/auth/notifications/<pk>/read/    → mark one
    POST /api/auth/notifications/read-all/     → mark all
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk=None):
        if pk:
            notif = get_object_or_404(Notification, id=pk, recipient=request.user)
            notif.is_read = True
            notif.save()
        else:
            Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({'message': 'Marked as read.'})


class ConnectionSuggestionsView(APIView):
    """
    MEMBER 1: BFS-based 2nd-degree connection suggestions.
    GET /api/auth/connections/suggestions/
    Returns up to 10 users sorted by mutual connection count.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 1st degree IDs
        sent_ids = set(Connection.objects.filter(
            sender=request.user, status='ACCEPTED').values_list('receiver_id', flat=True))
        received_ids = set(Connection.objects.filter(
            receiver=request.user, status='ACCEPTED').values_list('sender_id', flat=True))
        direct_ids = sent_ids | received_ids

        # Count mutual connections for each candidate 2nd-degree node
        mutual_count: dict[int, int] = {}
        for cid in direct_ids:
            c_out = set(Connection.objects.filter(
                sender_id=cid, status='ACCEPTED').values_list('receiver_id', flat=True))
            c_in = set(Connection.objects.filter(
                receiver_id=cid, status='ACCEPTED').values_list('sender_id', flat=True))
            for uid in (c_out | c_in):
                if uid != request.user.id and uid not in direct_ids:
                    mutual_count[uid] = mutual_count.get(uid, 0) + 1

        sorted_ids = sorted(mutual_count.items(), key=lambda x: -x[1])[:10]

        results = []
        for uid, mutuals in sorted_ids:
            try:
                u = User.objects.select_related('profile').get(id=uid)
                try:
                    headline = u.profile.headline if u.profile.is_headline_public else ''
                    profile_picture_url = u.profile.profile_picture.url if u.profile.profile_picture else None
                except Exception:
                    headline = ''
                    profile_picture_url = None
                results.append({
                    'id': u.id,
                    'username': u.username,
                    'headline': headline,
                    'role': u.role,
                    'profile_picture_url': profile_picture_url,
                    'mutual_connections': mutuals,
                    'connection_status': 'none',
                    'connection_id': None,
                })
            except User.DoesNotExist:
                pass

        return Response(results)


class ProfilePictureUploadView(APIView):
    """
    MEMBER 1: Upload / replace the current user's profile picture.
    POST /api/auth/profile/me/picture/  (multipart/form-data, field: picture)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if 'picture' not in request.FILES:
            return Response({'error': 'No picture provided. Send field name: picture'},
                            status=status.HTTP_400_BAD_REQUEST)

        file = request.FILES['picture']

        # Strict extension check — must be jpg, jpeg, png, gif, or webp
        import os
        allowed_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in allowed_extensions:
            return Response(
                {'error': f'Unsupported file type "{ext}". Allowed formats: JPG, JPEG, PNG, GIF, WEBP.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Content-type must be an image
        allowed_mimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        if file.content_type not in allowed_mimes:
            return Response(
                {'error': f'Invalid file content type "{file.content_type}". Please upload a real image file.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Size check — 10 MB max
        max_size_mb = 10
        if file.size > max_size_mb * 1024 * 1024:
            size_mb = file.size / (1024 * 1024)
            return Response(
                {'error': f'Image is too large ({size_mb:.1f} MB). Please upload an image under {max_size_mb} MB.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        profile = request.user.profile
        profile.profile_picture = file
        profile.save()

        picture_url = None
        if profile.profile_picture:
            picture_url = request.build_absolute_uri(profile.profile_picture.url)

        return Response({'message': 'Profile picture updated.', 'picture_url': picture_url})


class NetworkGraphView(APIView):
    """
    MEMBER 1: Return graph data for the connection network visualisation.
    GET /api/auth/connections/graph/
    Returns nodes (degree 0/1/2) and unique edges.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        me = request.user

        # 1st degree
        first_degree: dict[int, dict] = {}
        for conn in Connection.objects.filter(
            Q(sender=me) | Q(receiver=me), status='ACCEPTED'
        ).select_related('sender', 'receiver'):
            other = conn.receiver if conn.sender == me else conn.sender
            first_degree[other.id] = {'id': other.id, 'username': other.username, 'role': other.role, 'degree': 1}

        edges: list[tuple[int, int]] = [(me.id, uid) for uid in first_degree]

        # 2nd degree
        second_degree: dict[int, dict] = {}
        for uid in first_degree:
            for conn in Connection.objects.filter(
                Q(sender_id=uid) | Q(receiver_id=uid), status='ACCEPTED'
            ).select_related('sender', 'receiver'):
                other = conn.receiver if conn.sender_id == uid else conn.sender
                oid = other.id
                if oid != me.id and oid not in first_degree:
                    second_degree[oid] = {'id': oid, 'username': other.username, 'role': other.role, 'degree': 2}
                edges.append((uid, oid))

        nodes = [
            {'id': me.id, 'username': me.username, 'role': me.role, 'degree': 0}
        ] + list(first_degree.values()) + list(second_degree.values())

        # Deduplicate edges
        seen_edges: set[tuple[int, int]] = set()
        unique_edges = []
        for a, b in edges:
            key = (min(a, b), max(a, b))
            if key not in seen_edges:
                seen_edges.add(key)
                unique_edges.append({'from': a, 'to': b})

        return Response({'nodes': nodes, 'edges': unique_edges})


# ====================================================================
# MEMBER 2: PASSWORD CHANGE & ACCOUNT DELETION (High-Risk Actions with TOTP)
# ====================================================================

class PasswordChangeView(APIView):
    """
    MEMBER 2: Secure password change with TOTP verification.
    
    Background: Password changes are critical security events. An attacker who gains
    brief session access (e.g., via a shared computer) must be stopped from
    permanently taking over the account. Requiring a live TOTP code ensures the
    user physically has their authenticator device — enforcing 2-factor confirmation.
    
    POST /api/auth/account/password-change/
    Body: { old_password, new_password, totp_code }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        old_password = request.data.get('old_password', '')
        new_password = request.data.get('new_password', '')
        totp_code = request.data.get('totp_code', '').strip()

        if not all([old_password, new_password, totp_code]):
            return Response({'error': 'old_password, new_password, and totp_code are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({'error': 'New password must be at least 8 characters.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Verify old password
        user = authenticate(username=request.user.username, password=old_password)
        if not user:
            create_audit_log('PASSWORD_CHANGE_FAILED', request.user, {'reason': 'wrong_old_password'})
            return Response({'error': 'Current password is incorrect.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Verify TOTP — prevents session hijack attacks
        totp = pyotp.TOTP(request.user.totp_secret)
        if not totp.verify(totp_code):
            create_audit_log('PASSWORD_CHANGE_FAILED', request.user, {'reason': 'invalid_totp'})
            return Response({'error': 'Invalid authenticator code. Password change denied.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # All checks passed — update password
        request.user.set_password(new_password)
        request.user.save()
        create_audit_log('PASSWORD_CHANGED', request.user, {})

        return Response({'message': 'Password changed successfully. Please log in again.'}, status=status.HTTP_200_OK)


class AccountDeleteView(APIView):
    """
    MEMBER 2: Permanent account deletion with TOTP verification.
    
    Background: Account deletion is irreversible. Without strong confirmation,
    an XSS-injected script or CSRF attack could trigger deletion silently.
    TOTP verification + password confirmation provide a two-factor barrier
    that cannot be bypassed even with a valid session cookie.
    
    POST /api/auth/account/delete/
    Body: { password, totp_code }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        password = request.data.get('password', '')
        totp_code = request.data.get('totp_code', '').strip()

        if not all([password, totp_code]):
            return Response({'error': 'password and totp_code are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Verify password
        user = authenticate(username=request.user.username, password=password)
        if not user:
            return Response({'error': 'Password is incorrect.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Verify TOTP
        totp = pyotp.TOTP(request.user.totp_secret)
        if not totp.verify(totp_code):
            create_audit_log('ACCOUNT_DELETE_FAILED', request.user, {'reason': 'invalid_totp'})
            return Response({'error': 'Invalid authenticator code. Account deletion denied.'},
                            status=status.HTTP_400_BAD_REQUEST)

        create_audit_log('ACCOUNT_DELETED', request.user, {'username': request.user.username})
        username = request.user.username
        request.user.delete()

        response = Response({'message': f'Account "{username}" has been permanently deleted.'},
                            status=status.HTTP_200_OK)
        # Clear auth cookies
        response.delete_cookie('access_token')
        response.delete_cookie('refresh_token')
        return response


# ====================================================================
# MEMBER 3: BACKUP CODES (2FA Recovery)
# ====================================================================

class GenerateBackupCodesView(APIView):
    """
    MEMBER 3: Generate one-time backup codes for 2FA account recovery.
    
    Background: TOTP requires a physical device. If a user loses their phone,
    they face permanent account lockout. Backup codes (similar to GitHub/Google's
    recovery codes) solve this by providing 8 single-use codes stored as
    SHA-256 hashes. The plaintext is shown only once (never stored in DB)
    — if lost, codes must be regenerated (which invalidates old ones).
    
    POST /api/auth/backup-codes/generate/
    Requires TOTP verification to prevent unauthorized code regeneration.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        totp_code = request.data.get('totp_code', '').strip()

        # Verify TOTP before generating codes (prevents unauthorized regeneration)
        if not totp_code:
            return Response({'error': 'totp_code is required to generate backup codes.'},
                            status=status.HTTP_400_BAD_REQUEST)

        totp = pyotp.TOTP(request.user.totp_secret)
        if not totp.verify(totp_code):
            return Response({'error': 'Invalid authenticator code.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Invalidate all existing backup codes for this user
        BackupCode.objects.filter(user=request.user).delete()

        # Generate 8 new unique codes (format: XXXX-XXXX-XXXX)
        plaintext_codes = []
        for _ in range(8):
            raw = secrets.token_hex(6).upper()  # e.g., 'A3F9C2B1E4D7'
            formatted = f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"  # e.g., 'A3F9-C2B1-E4D7'
            code_hash = hashlib.sha256(formatted.encode()).hexdigest()
            BackupCode.objects.create(user=request.user, code_hash=code_hash)
            plaintext_codes.append(formatted)

        create_audit_log('BACKUP_CODES_GENERATED', request.user, {'count': 8})

        return Response({
            'message': 'Backup codes generated. Store them safely — they will not be shown again.',
            'codes': plaintext_codes,
            'count': len(plaintext_codes)
        }, status=status.HTTP_201_CREATED)


class ListBackupCodesView(APIView):
    """
    MEMBER 3: Returns the count of remaining unused backup codes.
    Does NOT return the actual codes (they are hashed in DB).
    
    GET /api/auth/backup-codes/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        total = BackupCode.objects.filter(user=request.user).count()
        unused = BackupCode.objects.filter(user=request.user, is_used=False).count()
        return Response({'total': total, 'remaining': unused})


class VerifyBackupCodeView(APIView):
    """
    MEMBER 3: Login fallback using a backup code instead of TOTP.
    
    Background: This endpoint is called during the login flow when a user
    cannot access their authenticator app. The backup code is hashed and
    compared against stored hashes. On success, the code is marked as used
    (single-use) and JWT cookies are issued — identical to the TOTP flow.
    
    Security: Max 3 attempts per user before 15-minute lockout.
    
    POST /api/auth/backup-codes/verify/
    Body: { user_id, backup_code }
    """
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        user_id = request.data.get('user_id')
        backup_code = request.data.get('backup_code', '').strip().upper()

        if not user_id or not backup_code:
            return Response({'error': 'user_id and backup_code are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        user = get_object_or_404(User, id=user_id)

        # 1. Check UNIFIED account lockout (affects ALL 2FA methods)
        # CRITICAL FIX: Use account-level lockout, not backup-code-specific
        locked, secs = _check_account_2fa_lockout(user_id)
        if locked:
            mins = secs // 60
            create_audit_log('LOGIN_2FA_BLOCKED', user, {
                'method': 'BackupCode',
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

        # 2. Hash the submitted code and look for a match using constant-time comparison
        code_hash = hashlib.sha256(backup_code.encode()).hexdigest()
        matches = BackupCode.objects.filter(
            user=user, is_used=False
        )
        
        match = None
        for backup in matches:
            if compare_digest(backup.code_hash, code_hash):
                match = backup
                break

        if not match:
            # CRITICAL FIX: Use unified account lockout instead of backup-code-specific lockout
            locked_now, attempts_left = _record_shared_2fa_failure(user_id, method='BackupCode')
            create_audit_log('LOGIN_2FA_FAILED', user, {
                'method': 'BackupCode',
                'reason': 'invalid_or_used',
                'attempts_remaining': attempts_left
            })
            
            if locked_now:
                return Response({
                    'error': f'Too many failed 2FA attempts across all methods. '
                            f'Account locked for {SHARED_2FA_LOCKOUT_SECONDS // 60} minutes.',
                    'locked': True,
                    'seconds_remaining': SHARED_2FA_LOCKOUT_SECONDS,
                    'minutes_remaining': SHARED_2FA_LOCKOUT_SECONDS // 60,
                    'attempts_remaining': 0,
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            return Response({
                'error': 'Invalid or already-used backup code.',
                'locked': False,
                'attempts_remaining': attempts_left,
            }, status=status.HTTP_400_BAD_REQUEST)

        # 3. Mark this code as used (single-use enforced)
        match.is_used = True
        match.save()

        create_audit_log('LOGIN_WITH_BACKUP_CODE', user, {'backup_code_id': match.id})
        _clear_shared_2fa_lockout(user_id)

        # 4. Issue JWT cookies — same as normal TOTP login
        refresh = RefreshToken.for_user(user)
        response = Response(
            {'message': 'Logged in with backup code.', 'access_token': str(refresh.access_token)},
            status=status.HTTP_200_OK
        )
        response.set_cookie('access_token', str(refresh.access_token),
                            httponly=True, secure=True, samesite='Lax')
        response.set_cookie('refresh_token', str(refresh),
                            httponly=True, secure=True, samesite='Lax')
        return response

from .models import Report

# ====================================================================
# MEMBER 4: ADMIN ENDPOINTS
# ====================================================================

class AdminUserListView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        if request.user.role != 'ADMIN':
            return Response(status=status.HTTP_403_FORBIDDEN)
        users = User.objects.all().order_by('-date_joined')
        data = [{
            'id': u.id, 'username': u.username, 'email': u.email, 
            'role': u.role, 'is_active': u.is_active, 
            'is_verified': u.is_verified, 'date_joined': u.date_joined
        } for u in users]
        return Response(data)

class AdminUserSuspendView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, user_id):
        if request.user.role != 'ADMIN':
            return Response(status=status.HTTP_403_FORBIDDEN)
        user = get_object_or_404(User, id=user_id)
        if user.is_superuser or user.role == 'ADMIN':
            return Response({'error': 'Cannot suspend admins'}, status=status.HTTP_400_BAD_REQUEST)
        user.is_active = not user.is_active
        user.save()
        create_audit_log('USER_SUSPEND_TOGGLED', request.user, {'target_user': user.username, 'is_active': user.is_active})
        return Response({'message': 'Success', 'is_active': user.is_active})

class AdminUserDeleteView(APIView):
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, user_id):
        if request.user.role != 'ADMIN':
            return Response(status=status.HTTP_403_FORBIDDEN)
        user = get_object_or_404(User, id=user_id)
        if user.is_superuser or user.role == 'ADMIN':
            return Response({'error': 'Cannot delete admins'}, status=status.HTTP_400_BAD_REQUEST)
        username = user.username
        user.delete()
        create_audit_log('ADMIN_DELETED_USER', request.user, {'target_user': username})
        return Response(status=status.HTTP_204_NO_CONTENT)

class AdminPostListView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        if request.user.role != 'ADMIN':
            return Response(status=status.HTTP_403_FORBIDDEN)
        posts = Post.objects.all().order_by('-created_at').select_related('author')
        data = [{
            'id': p.id, 'author_username': p.author.username, 'content': p.content, 'created_at': p.created_at
        } for p in posts]
        return Response(data)

class AdminPostDeleteView(APIView):
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, post_id):
        if request.user.role != 'ADMIN':
            return Response(status=status.HTTP_403_FORBIDDEN)
        post = get_object_or_404(Post, id=post_id)
        post.delete()
        create_audit_log('ADMIN_DELETED_POST', request.user, {'post_id': post_id})
        return Response(status=status.HTTP_204_NO_CONTENT)

class CreateReportView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get user's own reports and recent report status for other users"""
        user_reports = Report.objects.filter(reporter=request.user).order_by('-created_at')
        data = [{
            'id': r.id,
            'reported_user': r.reported_user.username if r.reported_user else None,
            'reported_post': r.reported_post.id if r.reported_post else None,
            'reason': r.reason,
            'created_at': r.created_at,
            'is_resolved': r.is_resolved
        } for r in user_reports]
        return Response(data)
    
    def post(self, request):
        reported_user_id = request.data.get('reported_user_id')
        reported_post_id = request.data.get('reported_post_id')
        reason = request.data.get('reason', '').strip()
        
        if not reason:
            return Response({'error': 'Reason is required'}, status=status.HTTP_400_BAD_REQUEST)
        if len(reason) > 500:
            return Response({'error': 'Reason must not exceed 500 characters'}, status=status.HTTP_400_BAD_REQUEST)
            
        reported_user = User.objects.filter(id=reported_user_id).first() if reported_user_id else None
        reported_post = Post.objects.filter(id=reported_post_id).first() if reported_post_id else None

        from django.utils import timezone
        from datetime import timedelta
        
        if reported_user:
            recent_report = Report.objects.filter(
                reporter=request.user,
                reported_user=reported_user,
                created_at__gte=timezone.now() - timedelta(hours=12)
            ).exists()
            if recent_report:
                return Response({'error': 'You have recently reported this user. Please wait 12 hours.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        
        Report.objects.create(
            reporter=request.user,
            reported_user=reported_user,
            reported_post=reported_post,
            reason=reason
        )
        return Response({'message': 'Report submitted'}, status=status.HTTP_201_CREATED)

class AdminReportListView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        if request.user.role != 'ADMIN':
            return Response(status=status.HTTP_403_FORBIDDEN)
        reports = Report.objects.all().order_by('-created_at').select_related('reporter', 'reported_user', 'reported_post')
        data = [{
            'id': r.id, 
            'reporter_username': r.reporter.username,
            'reported_user': r.reported_user.username if r.reported_user else None,
            'reported_post_content': r.reported_post.content if r.reported_post else None,
            'reason': r.reason, 
            'is_resolved': r.is_resolved,
            'created_at': r.created_at
        } for r in reports]
        return Response(data)

class AdminReportResolveView(APIView):
    permission_classes = [IsAuthenticated]
    
    def patch(self, request, report_id):
        if request.user.role != 'ADMIN':
            return Response(status=status.HTTP_403_FORBIDDEN)
        report = get_object_or_404(Report, id=report_id)
        report.is_resolved = True
        report.save()
        create_audit_log('ADMIN_RESOLVED_REPORT', request.user, {'report_id': report.id})
        return Response({'message': 'Resolved'})
    
class SendEmailOTPView(APIView):
    """Generates an OTP, stores it in Redis, and sends it via Django SMTP."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        new_email = request.data.get('new_email')

        if not new_email:
            return Response({"error": "New email is required."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Check if email is already verified and locked
        if getattr(user, 'is_email_verified', False):
            return Response({"error": "Your email is already verified and cannot be changed."}, status=status.HTTP_403_FORBIDDEN)

        # 2. Generate a 6-digit OTP and store it in Redis for 10 minutes (600 seconds)
        otp = str(random.randint(100000, 999999))
        cache_key = f"email_otp_{user.id}"
        cache.set(cache_key, {"otp": otp, "email": new_email}, timeout=600)

        # 3. Send the OTP via Django's built-in SMTP engine
        subject = "SecureJobs - Verify Your Email"
        message = f"Hello,\n\nYour 6-digit verification code is: {otp}\n\nThis code will expire in 10 minutes.\n\nSecureJobs Team"
        
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.EMAIL_HOST_USER, # Uses the email configured in settings.py
                recipient_list=[new_email],
                fail_silently=False,
            )
            create_audit_log('OTP_SENT', user, {'target_email': new_email})
            return Response({"message": "OTP sent successfully to the new email address."}, status=status.HTTP_200_OK)
            
        except Exception as e:
            # Print to Docker logs AND send it to the frontend so we can see it
            print(f"SMTP ERROR: {str(e)}")
            return Response(
                {"error": f"SMTP Error: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
class VerifyEmailOTPView(APIView):
    """
    Verifies the OTP and permanently locks the email address.
    Security: Max 3 attempts per user before 15-minute lockout.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        user = request.user
        submitted_otp = request.data.get('otp', '').strip()

        if getattr(user, 'is_email_verified', False):
            return Response({"error": "Email is already verified."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Check UNIFIED account lockout (affects ALL 2FA methods)
        # CRITICAL FIX: Use account-level lockout, not email-otp-specific
        locked, secs = _check_account_2fa_lockout(user.id)
        if locked:
            mins = secs // 60
            create_audit_log('LOGIN_2FA_BLOCKED', user, {
                'method': 'EmailOTP',
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

        cache_key = f"email_otp_{user.id}"
        cached_data = cache.get(cache_key)

        # 2. Check if OTP exists and matches
        if not cached_data or cached_data['otp'] != submitted_otp:
            # CRITICAL FIX: Use unified account lockout instead of email-otp-specific lockout
            locked_now, attempts_left = _record_shared_2fa_failure(user.id, method='EmailOTP')
            create_audit_log('LOGIN_2FA_FAILED', user, {
                'method': 'EmailOTP',
                'reason': 'invalid_or_expired_otp',
                'attempts_remaining': attempts_left
            })
            
            if locked_now:
                return Response({
                    'error': f'Too many failed 2FA attempts across all methods. '
                            f'Account locked for {SHARED_2FA_LOCKOUT_SECONDS // 60} minutes.',
                    'locked': True,
                    'seconds_remaining': SHARED_2FA_LOCKOUT_SECONDS,
                    'minutes_remaining': SHARED_2FA_LOCKOUT_SECONDS // 60,
                    'attempts_remaining': 0,
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            return Response({
                'error': 'Invalid or expired OTP.',
                'locked': False,
                'attempts_remaining': attempts_left,
            }, status=status.HTTP_400_BAD_REQUEST)

        # 3. Update the user record
        user.email = cached_data['email']
        user.is_email_verified = True
        user.save()

        # 4. Clean up cache and log the success
        cache.delete(cache_key)
        _clear_shared_2fa_lockout(user.id)
        create_audit_log('EMAIL_VERIFIED', user, {'new_email': user.email})

        return Response({"message": "Email successfully verified and locked!"}, status=status.HTTP_200_OK)

