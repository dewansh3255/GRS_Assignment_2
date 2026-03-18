from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny  # <--- IMPORT THIS
from .models import UserKeys, Profile, Message
from .serializers import UserRegistrationSerializer, UserKeysSerializer, ProfileSerializer, MessageSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated
import pyotp
from django.shortcuts import get_object_or_404
from django.contrib.auth import authenticate

User = get_user_model()

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
    MEMBER A: Registration Endpoint
    Creates the user and automatically generates their TOTP secret.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            
            # Generate the TOTP secret immediately upon registration
            user.totp_secret = pyotp.random_base32()
            user.save()
            
            return Response({
                "message": "User registered successfully. Proceed to 2FA setup.",
                "user_id": user.id # <--- We return this so the frontend can request the QR code
            }, status=status.HTTP_201_CREATED)
            
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomLoginView(APIView):
    """
    MEMBER A: Step 1 of Login (Password Check)
    """
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        
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
                "user_id": user.id
            }, status=status.HTTP_200_OK)
            
        return Response({"error": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)
class GenerateTOTPURIView(APIView):
    """
    MEMBER A: TOTP Setup (Requires user_id now)
    """
    permission_classes = [AllowAny]

    def get(self, request, user_id):
        user = get_object_or_404(User, id=user_id)

        totp = pyotp.TOTP(user.totp_secret)
        uri = totp.provisioning_uri(
            name=user.username, issuer_name="Secure Job Platform")

        return Response({"qr_uri": uri}, status=status.HTTP_200_OK)


class VerifyTOTPView(APIView):
    """
    MEMBER A: Step 2 of Login (OTP Check & Issue Cookies)
    """
    permission_classes = [AllowAny]

    def post(self, request):
        user_id = request.data.get("user_id")
        code = request.data.get("code")

        if not user_id or not code:
            return Response({"error": "Missing user_id or code."}, status=status.HTTP_400_BAD_REQUEST)

        user = get_object_or_404(User, id=user_id)
        totp = pyotp.TOTP(user.totp_secret)

        if totp.verify(code):
            user.is_verified = True
            user.save()

            refresh = RefreshToken.for_user(user)
            response = Response(
                {"message": "Logged in securely!", "access_token": str(refresh.access_token)}, status=status.HTTP_200_OK)

            # secure=True because requests come through HTTPS via nginx
            response.set_cookie('access_token', str(
                refresh.access_token), httponly=True, secure=True, samesite='Lax')
            response.set_cookie('refresh_token', str(
                refresh), httponly=True, secure=True, samesite='Lax')
            return response

        return Response({"error": "Invalid OTP code."}, status=status.HTTP_400_BAD_REQUEST)


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
    
from .serializers import MessageSerializer

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
            return Response({"public_key": user_keys.public_key}, status=status.HTTP_200_OK)
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
        # Automatically set the 'sender' to the person making the request
        serializer.save(sender=self.request.user)

class UserListView(APIView):
    """
    MEMBER B: Fetch List of Users for Chat
    Returns a list of all users (excluding the requester) to populate the chat sidebar.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Fetch all users EXCEPT the currently logged-in user
        users = User.objects.exclude(id=request.user.id).values('id', 'username')
        return Response(list(users), status=status.HTTP_200_OK)
    
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
