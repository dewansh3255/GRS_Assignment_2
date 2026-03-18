from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import UserKeys
from .models import Profile

User = get_user_model()

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password', 'role', 'phone_number')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            role=validated_data.get('role', 'CANDIDATE'),
            phone_number=validated_data.get('phone_number')
        )
        return user

class UserKeysSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserKeys
        fields = ['public_key', 'encrypted_private_key']

class ProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Profile
        fields = [
            'username', 'headline', 'bio', 'location', 'skills',
            'is_headline_public', 'is_bio_public', 'is_location_public', 'is_skills_public'
        ]

    def to_representation(self, instance):
        # 1. Get the standard data dictionary
        data = super().to_representation(instance)
        
        # 2. Find out who is asking for the profile
        request = self.context.get('request')

        # 3. If the user is looking at their OWN profile, show them everything
        if request and request.user == instance.user:
            return data

        # 4. If someone else is looking, apply the privacy filters!
        # (Note: In Week 4, Member A will add an "is_connected" check here)
        is_connected = False # Defaulting to False until connections are built

        if not instance.is_headline_public and not is_connected:
            data.pop('headline', None)
        if not instance.is_bio_public and not is_connected:
            data.pop('bio', None)
        if not instance.is_location_public and not is_connected:
            data.pop('location', None)
        if not instance.is_skills_public and not is_connected:
            data.pop('skills', None)

        return data
from .models import Message

class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.ReadOnlyField(source='sender.username')

    class Meta:
        model = Message
        fields = ['id', 'sender', 'sender_username', 'recipient', 'encrypted_content', 'encrypted_key', 'timestamp']
        read_only_fields = ['sender', 'timestamp']