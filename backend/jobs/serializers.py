from rest_framework import serializers

from .models import Resume



class ResumeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resume
        # --- ADD 'digital_signature' to the fields array ---
        fields = ['id', 'user', 'file', 'is_encrypted', 'uploaded_at', 'digital_signature']
        read_only_fields = ['user', 'is_encrypted']
