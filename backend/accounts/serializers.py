from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db.models import Q
from .models import UserKeys, ChatGroup, GroupMember, GroupMessage, Connection, Notification
from .models import Profile, Message

User = get_user_model()

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password', 'phone_number')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            role='CANDIDATE',  # All new users default to CANDIDATE
            phone_number=validated_data.get('phone_number')
        )
        return user

class UserKeysSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserKeys
        fields = ['public_key', 'encrypted_private_key']

class ProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    role = serializers.CharField(source='user.role', read_only=True)
    profile_picture_url = serializers.SerializerMethodField()
    is_email_verified = serializers.BooleanField(source='user.is_email_verified', read_only=True)

    class Meta:
        model = Profile
        fields = [
            'username', 'role', 'headline', 'bio', 'location', 'skills',
            'education', 'experience', 'profile_picture_url',
            'is_headline_public', 'is_bio_public', 'is_location_public',
            'is_skills_public', 'is_education_public', 'is_experience_public',
            'is_view_history_public','is_email_verified'
        ]

    def get_profile_picture_url(self, obj):
        if obj.profile_picture:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.profile_picture.url)
            return obj.profile_picture.url
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')

        # Owner always sees everything
        if request and request.user == instance.user:
            return data

        # Real connection check (replaces the old False stub)
        is_connected = False
        if request and request.user.is_authenticated:
            is_connected = Connection.objects.filter(
                Q(sender=request.user, receiver=instance.user, status='ACCEPTED') |
                Q(sender=instance.user, receiver=request.user, status='ACCEPTED')
            ).exists()

        if not instance.is_headline_public and not is_connected:
            data.pop('headline', None)
        if not instance.is_bio_public and not is_connected:
            data.pop('bio', None)
        if not instance.is_location_public and not is_connected:
            data.pop('location', None)
        if not instance.is_skills_public and not is_connected:
            data.pop('skills', None)
        if not instance.is_education_public and not is_connected:
            data.pop('education', None)
        if not instance.is_experience_public and not is_connected:
            data.pop('experience', None)

        return data
from .models import Message


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.ReadOnlyField(source='sender.username')

    class Meta:
        model = Message
        fields = ['id', 'sender', 'sender_username', 'recipient', 'encrypted_content', 'encrypted_key', 'timestamp']
        read_only_fields = ['sender', 'timestamp']


class GroupMemberSerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source='user.username')
    
    class Meta:
        model = GroupMember
        fields = ['id', 'user', 'username', 'group', 'role', 'encrypted_group_key', 'joined_at']
        read_only_fields = ['role', 'joined_at']

class ChatGroupSerializer(serializers.ModelSerializer):
    members = GroupMemberSerializer(many=True, read_only=True)

    class Meta:
        model = ChatGroup
        fields = ['id', 'name', 'created_at','members']

class GroupMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.ReadOnlyField(source='sender.username')
    
    class Meta:
        model = GroupMessage
        fields = ['id', 'group', 'sender', 'sender_username', 'encrypted_content', 'timestamp']
        read_only_fields = ['sender', 'timestamp', 'group']


# --- MEMBER 1: SOCIAL SERIALIZERS ---

class ConnectionSerializer(serializers.ModelSerializer):
    sender_username = serializers.ReadOnlyField(source='sender.username')
    receiver_username = serializers.ReadOnlyField(source='receiver.username')

    class Meta:
        model = Connection
        fields = ['id', 'sender', 'sender_username', 'receiver', 'receiver_username', 'status', 'created_at']
        read_only_fields = ['sender', 'status', 'created_at']


class NotificationSerializer(serializers.ModelSerializer):
    sender_username = serializers.ReadOnlyField(source='sender.username')

    class Meta:
        model = Notification
        fields = [
            'id', 'notif_type', 'message', 'sender_username',
            'is_read', 'created_at', 'related_connection_id',
        ]
        read_only_fields = ['notif_type', 'message', 'sender_username', 'created_at', 'related_connection_id']