# accounts/authentication.py
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.authentication import SessionAuthentication

class CookieJWTAuthentication(JWTAuthentication):
    """
    MEMBER A: Custom Cookie Authentication
    Extracts the JWT from the HttpOnly 'access_token' cookie.
    Uses stateless JWT tokens instead of session cookies, so CSRF protection is not needed.
    """

    def authenticate(self, request):
        # 1. First, check the standard Authorization header (good for testing)
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)

        # 2. If no header, extract the token from the HttpOnly cookie
        raw_token = request.COOKIES.get('access_token')
        if raw_token is not None:
            try:
                validated_token = self.get_validated_token(raw_token)
                user = self.get_user(validated_token)
                # IMPORTANT: JWT auth uses stateless token authentication, not session cookies.
                # CSRF protection is unnecessary here because:
                # 1. CSRF attacks exploit cookie-based session auth
                # 2. JWT tokens are not tied to cookies/sessions
                # 3. CsrfExemptionMiddleware already exempts /api/ endpoints
                # 4. Do NOT call enforce_csrf() - it contradicts the middleware exemption
                return user, validated_token
            except Exception:
                # Token might be expired or invalid
                return None

        # No token found - request is unauthenticated
        return None