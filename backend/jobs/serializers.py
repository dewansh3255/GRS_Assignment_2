from rest_framework import serializers
from .models import Resume, Company, Job, Application


class ResumeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resume
        fields = ['id', 'user', 'file', 'is_encrypted', 'uploaded_at', 'digital_signature']
        read_only_fields = ['user', 'is_encrypted']


class AdminResumeSerializer(serializers.ModelSerializer):
    """Serializer for admins to view all resumes with user info"""
    user_username = serializers.ReadOnlyField(source='user.username')
    user_email = serializers.ReadOnlyField(source='user.email')
    user_role = serializers.ReadOnlyField(source='user.role')
    
    class Meta:
        model = Resume
        fields = ['id', 'user', 'user_username', 'user_email', 'user_role', 'file', 'is_encrypted', 'uploaded_at', 'digital_signature']
        read_only_fields = ['user', 'is_encrypted', 'uploaded_at']


class CompanySerializer(serializers.ModelSerializer):
    owner_username = serializers.ReadOnlyField(source='owner.username')
    employees_list = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = ['id', 'owner', 'owner_username', 'name', 'description', 'location', 'website', 'created_at', 'employees_list']
        read_only_fields = ['owner']

    def get_employees_list(self, obj):
        return [{'id': e.id, 'username': e.username} for e in obj.employees.all()]



class JobSerializer(serializers.ModelSerializer):
    company_name = serializers.ReadOnlyField(source='company.name')

    class Meta:
        model = Job
        fields = [
            'id', 'company', 'company_name', 'title', 'description',
            'required_skills', 'location', 'job_type',
            'salary_min', 'salary_max', 'deadline', 'created_at', 'is_active'
        ]
        read_only_fields = ['created_at']


# class ApplicationSerializer(serializers.ModelSerializer):
#     applicant_username = serializers.ReadOnlyField(source='applicant.username')
#     job_title = serializers.ReadOnlyField(source='job.title')

#     class Meta:
#         model = Application
#         fields = [
#             'id', 'applicant', 'applicant_username', 'job', 'job_title','digital_signature',
#             'resume', 'cover_note', 'status', 'recruiter_notes', 'applied_at', 'updated_at'
#         ]
#         read_only_fields = ['applicant', 'applied_at', 'updated_at']

class ApplicationSerializer(serializers.ModelSerializer):
    applicant_username = serializers.ReadOnlyField(source='applicant.username')
    job_title = serializers.ReadOnlyField(source='job.title')
    
    # 🚨 THIS IS THE LINE THAT WAS MISSING 🚨
    # It tells Django: "Don't look on the Application model, look at the linked Resume model!"
    digital_signature = serializers.ReadOnlyField(source='resume.digital_signature')

    class Meta:
        model = Application
        fields = [
            'id', 'applicant', 'applicant_username', 'job', 'job_title',
            'resume', 
            'digital_signature', # Now this will work perfectly
            'cover_note', 'status', 'recruiter_notes', 'applied_at', 'updated_at'
        ]
        read_only_fields = ['applicant', 'applied_at', 'updated_at']