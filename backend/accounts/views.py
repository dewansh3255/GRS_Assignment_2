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
            except Exception:
                headline = ''

            results.append({
                'id': user.id,
                'username': user.username,
                'headline': headline,
                'role': user.role,
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

    def get(self, request, username):
        target_user = get_object_or_404(User, username=username)
        profile = get_object_or_404(Profile, user=target_user)

        # Log the view — never count self-views
        if request.user != target_user:
            ProfileView.objects.create(viewer=request.user, viewed_user=target_user)

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
        except Exception:
            headline = ''
        return {
            'id': conn.id,
            'username': other.username,
            'role': other.role,
            'headline': headline,
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
        posts = Post.objects.filter(author_id__in=ids).order_by('-created_at')[:50]
        return Response([{
            'id': p.id,
            'author_username': p.author.username,
            'author_role': p.author.role,
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
        ).order_by('-timestamp').select_related('viewer')

        seen, viewers = set(), []
        for v in recent:
            if v.viewer_id not in seen:
                seen.add(v.viewer_id)
                viewers.append({
                    'username': v.viewer.username,
                    'role': v.viewer.role,
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
                except Exception:
                    headline = ''
                results.append({
                    'id': u.id,
                    'username': u.username,
                    'headline': headline,
                    'role': u.role,
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
        # Basic mime check
        if not file.content_type.startswith('image/'):
            return Response({'error': 'File must be an image.'},
                            status=status.HTTP_400_BAD_REQUEST)

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
