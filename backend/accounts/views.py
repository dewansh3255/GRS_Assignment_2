from .serializers import MessageSerializer
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
from .audit import create_audit_log
from .models import AuditLog, ChatGroup, GroupMember, GroupMessage
from django.db import transaction
from .serializers import ChatGroupSerializer, GroupMessageSerializer, GroupMemberSerializer

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

            create_audit_log('REGISTER', user, {'username': user.username})

            return Response({
                "message": "User registered successfully. Proceed to 2FA setup.",
                "user_id": user.id  # <--- We return this so the frontend can request the QR code
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

            create_audit_log('LOGIN_SUCCESS', user, {'user_id': user.id})

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
        users = User.objects.exclude(
            id=request.user.id).values('id', 'username')
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


class ChangeUserRoleView(APIView):
    """
    Allows authenticated users to change their role between CANDIDATE and RECRUITER.
    Users cannot self-assign ADMIN role (only Django admin can do that).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        new_role = request.data.get('role', '').upper()

        # Only allow switching between CANDIDATE and RECRUITER
        if new_role not in ['CANDIDATE', 'RECRUITER']:
            return Response(
                {'error': 'Invalid role. Must be CANDIDATE or RECRUITER.'},
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

        new_user_id = request.data.get('user_id')
        encrypted_key = request.data.get('encrypted_key')

        if not new_user_id or not encrypted_key:
            return Response({"error": "user_id and encrypted_key are required."}, status=status.HTTP_400_BAD_REQUEST)

        new_user = get_object_or_404(User, id=new_user_id)

        member, created = GroupMember.objects.get_or_create(
            user=new_user,
            group=group,
            defaults={'role': 'member', 'encrypted_group_key': encrypted_key}
        )

        if not created:
            return Response({"error": "User is already in the group."}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"message": f"{new_user.username} added to the group."}, status=status.HTTP_201_CREATED)

    def patch(self, request, group_id, user_id):
        # Promoting a member to Admin
        group = get_object_or_404(ChatGroup, id=group_id)
        requester_membership = self._get_requester_membership(
            group, request.user)

        if requester_membership.role != 'owner':
            return Response({"error": "Only the owner can promote members."}, status=status.HTTP_403_FORBIDDEN)

        target_membership = get_object_or_404(
            GroupMember, group=group, user_id=user_id)
        target_membership.role = 'admin'
        target_membership.save()

        return Response({"message": f"{target_membership.user.username} is now an admin."}, status=status.HTTP_200_OK)

    def delete(self, request, group_id, user_id):
        # Removing a member
        group = get_object_or_404(ChatGroup, id=group_id)
        requester_membership = self._get_requester_membership(
            group, request.user)

        if requester_membership.role not in ['owner', 'admin']:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)

        target_membership = get_object_or_404(
            GroupMember, group=group, user_id=user_id)

        if target_membership.role == 'owner':
            return Response({"error": "Cannot remove the group owner."}, status=status.HTTP_400_BAD_REQUEST)

        target_membership.delete()
        # NOTE: The frontend MUST now initiate a Key Rotation process to ensure perfect forward secrecy!
        return Response({"message": "Member removed."}, status=status.HTTP_204_NO_CONTENT)


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
