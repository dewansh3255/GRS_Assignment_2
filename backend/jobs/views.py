import os

from cryptography.fernet import Fernet
from django.shortcuts import get_object_or_404
from django.http import FileResponse, Http404, HttpResponseForbidden
from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.files.base import ContentFile

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied

from .models import Resume, ResumeKey, Company, Job, Application, CompanyPost, CompanyAccess, CompanySave
from .serializers import ResumeSerializer, AdminResumeSerializer, CompanySerializer, JobSerializer, ApplicationSerializer, CompanyPostSerializer, CompanyAccessSerializer, CompanySaveSerializer
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status, generics, filters
from django.db import transaction
from django.db.models import Q
from accounts.audit import create_audit_log
from rest_framework.throttling import UserRateThrottle

# class ResumeUploadView(APIView):
#     permission_classes = [IsAuthenticated]
#     parser_classes = [MultiPartParser, FormParser]

#     def post(self, request, format=None):
#         file = request.FILES.get('file')
#         if not file:
#             return Response({"detail": "No file provided"}, status=400)

#         # Let the model's custom save() method handle all the encryption
#         # and ResumeKey creation automatically!
#         resume = Resume.objects.create(user=request.user, file=file)

#         serializer = ResumeSerializer(resume)
#         return Response(serializer.data, status=status.HTTP_201_CREATED)

class UploadRateThrottle(UserRateThrottle):
    scope = 'uploads'

class JobActionThrottle(UserRateThrottle):
    scope = 'job_actions'

class ResumeUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [UploadRateThrottle]

    def post(self, request, format=None):
        file = request.data.get('file')

        # --- ADD THIS TO CAPTURE THE SIGNATURE ---
        digital_signature = request.data.get('digital_signature')

        if not file:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

        # File size and type validation
        if file.size > 5 * 1024 * 1024:
            return Response({"error": "File size exceeds 5MB limit."}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(file.name)[1].lower()
        if ext not in ['.pdf', '.docx']:
            return Response({"error": "Only PDF and DOCX files are allowed."}, status=status.HTTP_400_BAD_REQUEST)

        # --- UPDATE THIS TO SAVE THE SIGNATURE ---
        resume = Resume.objects.create(
            user=request.user,
            file=file,
            digital_signature=digital_signature
        )

        create_audit_log('RESUME_UPLOAD', request.user,
                         {'resume_id': resume.id})

        serializer = ResumeSerializer(resume)
        return Response(serializer.data)


class ResumeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, format=None):
        # return only resumes owned by the user
        qs = Resume.objects.filter(user=request.user)
        serializer = ResumeSerializer(qs, many=True)
        return Response(serializer.data)


class DownloadResumeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, format=None):
        try:
            resume = Resume.objects.get(pk=pk)
        except Resume.DoesNotExist:
            raise Http404("Resume not found")

        # security check: owner or explicitly authorized recruiter
        if request.user != resume.user and request.user not in resume.authorized_recruiters.all():
            return HttpResponseForbidden("You do not have permission to access this file.")

        basename = os.path.basename(resume.file.name)
        if basename.endswith('.enc'):
            basename = basename[:-4]

        content_type = 'application/pdf'
        if basename.lower().endswith('.docx'):
            content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

        if not resume.is_encrypted or not hasattr(resume, 'resume_key'):
            # Serve raw file directly
            try:
                resume.file.open('rb')
                file_data = resume.file.read()
            except Exception:
                return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)
            return FileResponse(ContentFile(file_data), filename=basename, content_type=content_type)

        # Encrypted — decrypt with Fernet
        try:
            resume.file.open('rb')
            encrypted = resume.file.read()
            from .models import get_master_fernet
            key_obj = resume.resume_key
            raw_key = get_master_fernet().decrypt(key_obj.key.encode())
            f = Fernet(raw_key)
            decrypted = f.decrypt(encrypted)
        except Exception:
            return Response({'detail': 'Unable to decrypt resume file. Key may be missing or corrupt.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return FileResponse(ContentFile(decrypted), filename=basename, content_type=content_type)


class DeleteResumeView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, format=None):
        try:
            resume = Resume.objects.get(pk=pk)
        except Resume.DoesNotExist:
            raise Http404("Resume not found")

        # security check: only owner can delete their canonical resume
        if request.user != resume.user:
            return HttpResponseForbidden("You do not have permission to delete this file.")

        # perform deletion inside a transaction
        with transaction.atomic():
            # delete stored file
            try:
                resume.file.delete(save=False)
            except Exception:
                pass

            # delete associated key if present
            try:
                if hasattr(resume, 'resume_key') and resume.resume_key:
                    resume.resume_key.delete()
            except Exception:
                pass

            # delete the resume record
            resume.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)



class CompanyEmployeeManageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        # Add a recruiter by username
        company = get_object_or_404(Company, id=company_id)
        if company.owner != request.user:
            raise PermissionDenied(
                "Only the company owner can add recruiters.")

        username = request.data.get('username')
        if not username:
            return Response({"error": "Username is required"}, status=400)

        User = get_user_model()
        try:
            employee = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        # CRITICAL FIX: Use transaction to ensure consistency
        # If notification fails, don't add employee
        with transaction.atomic():
            company.employees.add(employee)

            # Dispatch notification
            from accounts.models import Notification
            Notification.objects.create(
                recipient=employee,
                sender=request.user,
                notif_type='COMPANY_ASSIGNED',
                message=f"You have been added as a recruiter for {company.name}"
            )

            # Log the action for audit trail
            create_audit_log('COMPANY_EMPLOYEE_ADDED', request.user, {
                'company_id': company.id,
                'company_name': company.name,
                'added_user_id': employee.id,
                'added_username': employee.username
            })

        return Response({"message": f"{username} added to company"}, status=200)

    def delete(self, request, company_id):
        # Remove a recruiter
        company = get_object_or_404(Company, id=company_id)
        if company.owner != request.user:
            raise PermissionDenied(
                "Only the company owner can remove recruiters.")

        username = request.data.get('username')
        if not username:
            return Response({"error": "Username is required"}, status=400)
            
        User = get_user_model()
        try:
            employee = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        # CRITICAL FIX: Transaction safety + audit logging
        with transaction.atomic():
            company.employees.remove(employee)
            
            create_audit_log('COMPANY_EMPLOYEE_REMOVED', request.user, {
                'company_id': company.id,
                'company_name': company.name,
                'removed_user_id': employee.id,
                'removed_username': employee.username
            })
        
        return Response({"message": f"{username} removed from company"}, status=200)


class JobListCreateView(generics.ListCreateAPIView):
    serializer_class = JobSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [JobActionThrottle]

    def get_queryset(self):
        # Recruiter fix: only show jobs for the user's companies if my_jobs=true
        if self.request.query_params.get('my_jobs') == 'true':
            qs = Job.objects.filter(
                Q(company__owner=self.request.user) |
                Q(company__employees=self.request.user)
            ).distinct()
        else:
            qs = Job.objects.filter(is_active=True)

        q = self.request.query_params.get('q')
        job_type = self.request.query_params.get('job_type')
        location = self.request.query_params.get('location')
        if q:
            qs = qs.filter(
                Q(title__icontains=q) |
                Q(description__icontains=q) |
                Q(required_skills__icontains=q) |
                Q(company__name__icontains=q)
            )
        if job_type:
            qs = qs.filter(job_type=job_type)
        if location:
            qs = qs.filter(location__icontains=location)
        return qs

    def perform_create(self, serializer):
        from rest_framework.exceptions import PermissionDenied, ValidationError
        import datetime

        user = self.request.user

        if user.role != 'RECRUITER':
            raise PermissionDenied("Only recruiters can post jobs.")

        company = serializer.validated_data.get('company')
        if company and company.owner != user and user not in company.employees.all():
            raise PermissionDenied("You can only post jobs for your company.")

        s_min = serializer.validated_data.get('salary_min')
        s_max = serializer.validated_data.get('salary_max')
        deadline = serializer.validated_data.get('deadline')

        if s_min is not None and s_min < 0:
            raise ValidationError({"salary_min": "Salary cannot be negative."})
        if s_max is not None and s_max < 0:
            raise ValidationError({"salary_max": "Salary cannot be negative."})
        if s_min is not None and s_max is not None and s_max < s_min:
            raise ValidationError(
                {"salary_max": "Max salary cannot be less than Min salary."})
        if deadline and deadline < datetime.date.today():
            raise ValidationError(
                {"deadline": "Deadline cannot be in the past."})

        job = serializer.save()
        create_audit_log('JOB_POSTING_CREATED', self.request.user, {
            'job_id': job.id,
            'title': job.title,
            'company_id': job.company.id
        })


class JobDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = JobSerializer
    permission_classes = [IsAuthenticated]
    queryset = Job.objects.all()

    def get_object(self):
        obj = super().get_object()
        return obj

    def update(self, request, *args, **kwargs):
        from rest_framework.exceptions import ValidationError

        obj = self.get_object()
        if obj.company.owner != request.user and request.user not in obj.company.employees.all():
            raise PermissionDenied(
                "You can only update jobs for your company.")

        # Check if there are existing applications - prevent full edits, allow only is_active toggle
        has_applications = obj.applications.exists()

        # If applications exist, only allow editing is_active field
        if has_applications and len(request.data) > 0:
            allowed_fields = {'is_active'}
            requested_fields = set(request.data.keys())
            disallowed_fields = requested_fields - allowed_fields

            if disallowed_fields:
                raise ValidationError({
                    "detail": f"Cannot edit job post after applications have been received. "
                    f"You can only toggle the active status. Attempted to modify: {', '.join(disallowed_fields)}"
                })

        # Store old values for audit logging
        old_values = {
            'title': obj.title,
            'description': obj.description,
            'required_skills': obj.required_skills,
            'location': obj.location,
            'job_type': obj.job_type,
            'salary_min': obj.salary_min,
            'salary_max': obj.salary_max,
            'deadline': obj.deadline,
            'is_active': obj.is_active,
        }

        response = super().update(request, *args, **kwargs)

        # Calculate which fields changed
        new_values = {
            'title': obj.title,
            'description': obj.description,
            'required_skills': obj.required_skills,
            'location': obj.location,
            'job_type': obj.job_type,
            'salary_min': obj.salary_min,
            'salary_max': obj.salary_max,
            'deadline': obj.deadline,
            'is_active': obj.is_active,
        }

        changed_fields = {}
        for field, old_val in old_values.items():
            if old_val != new_values[field]:
                changed_fields[field] = {
                    'old': str(old_val),
                    'new': str(new_values[field])
                }

        create_audit_log('JOB_POSTING_UPDATED', request.user, {
            'job_id': obj.id,
            'title': obj.title,
            'company_id': obj.company.id,
            'changed_fields': changed_fields,
            'has_applications': has_applications
        })
        return response

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.company.owner != request.user and request.user not in obj.company.employees.all():
            raise PermissionDenied(
                "You can only delete jobs for your company.")

        create_audit_log('JOB_POSTING_DELETED', request.user, {
            'job_id': obj.id,
            'title': obj.title,
            'company_id': obj.company.id
        })
        return super().destroy(request, *args, **kwargs)


class ApplicationListCreateView(generics.ListCreateAPIView):
    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [JobActionThrottle]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'RECRUITER':
            return Application.objects.filter(Q(job__company__owner=user) | Q(job__company__employees=user)).distinct()
        return Application.objects.filter(applicant=user)

    def perform_create(self, serializer):
        resume = serializer.validated_data.get('resume')
        if resume and resume.user != self.request.user:
            raise PermissionDenied("You can only apply with your own resume.")

        application = serializer.save(applicant=self.request.user)
        create_audit_log('APPLICATION_SUBMITTED', self.request.user, {
            'application_id': application.id,
            'job_id': application.job.id,
            'job_title': application.job.title,
            'resume_id': application.resume.id if application.resume else None
        })

        # Notify the job owner
        from accounts.models import Notification
        job_owner = application.job.company.owner
        if job_owner != self.request.user:
            Notification.objects.create(
                recipient=job_owner,
                sender=self.request.user,
                notif_type='JOB_APPLICATION',
                message=f'{self.request.user.username} applied to your job: {application.job.title}',
            )

        # Notify recruiters (employees)
        for employee in application.job.company.employees.all():
            if employee != self.request.user:
                Notification.objects.create(
                    recipient=employee,
                    sender=self.request.user,
                    notif_type='JOB_APPLICATION',
                    message=f'{self.request.user.username} applied to your company job: {application.job.title}',
                )


class ApplicationDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'RECRUITER':
            return Application.objects.filter(Q(job__company__owner=user) | Q(job__company__employees=user)).distinct()
        return Application.objects.filter(applicant=user)

    def update(self, request, *args, **kwargs):
        application = self.get_object()

        # Only recruiters can update application status
        if request.user != application.job.company.owner and request.user not in application.job.company.employees.all():
            raise PermissionDenied(
                "You can only update applications for your jobs.")

        old_status = application.status
        response = super().update(request, *args, **kwargs)

        if old_status != application.status:
            create_audit_log('APPLICATION_STATUS_CHANGED', request.user, {
                'application_id': application.id,
                'job_id': application.job.id,
                'applicant_id': application.applicant.id,
                'old_status': old_status,
                'new_status': application.status
            })

        return response


class JobApplicationsListView(generics.ListAPIView):
    """
    Get all applications for a specific job.
    Only the recruiter (company owner) can see applications for their jobs.
    """
    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        job_id = self.kwargs.get('job_id')
        try:
            job = Job.objects.get(pk=job_id)
        except Job.DoesNotExist:
            return Application.objects.none()

        # Only company owner or delegated employee can see applications
        if job.company.owner != self.request.user and self.request.user not in job.company.employees.all():
            raise PermissionDenied(
                "You can only view applications for your jobs.")

        return Application.objects.filter(job=job).order_by('-applied_at')


class DownloadApplicationResumeView(APIView):
    """
    Recruiter can download the resume of an applicant.
    Only the recruiter (job company owner) can access the resume of applicants to their jobs.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, application_id, format=None):
        try:
            application = Application.objects.get(pk=application_id)
        except Application.DoesNotExist:
            raise Http404("Application not found")

        # Check that the requester owns the company that posted this job, or is an employee
        if application.job.company.owner != request.user and request.user not in application.job.company.employees.all():
            return HttpResponseForbidden("You can only download resumes from applicants to your jobs.")

        # Check that the application has a resume
        if not application.resume:
            return Response(
                {"detail": "This applicant did not submit a resume."},
                status=status.HTTP_400_BAD_REQUEST
            )

        resume = application.resume

        basename = os.path.basename(resume.file.name)

        # Determine content type
        content_type = 'application/pdf'
        if basename.lower().endswith('.docx'):
            content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

        # Log the resume download
        create_audit_log('RESUME_DOWNLOADED_BY_RECRUITER', request.user, {
            'application_id': application.id,
            'resume_id': resume.id,
            'applicant_id': application.applicant.id,
            'job_id': application.job.id
        })

        # If the file is not encrypted just serve it directly
        if not resume.is_encrypted or not hasattr(resume, 'resume_key'):
            try:
                resume.file.open('rb')
                file_data = resume.file.read()
            except Exception:
                return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)
            # Strip .enc suffix if present (shouldn't be, but defensively)
            if basename.endswith('.enc'):
                basename = basename[:-4]
            return FileResponse(ContentFile(file_data), filename=basename, content_type=content_type)

        # File is encrypted — attempt Fernet decryption
        try:
            resume.file.open('rb')
            encrypted = resume.file.read()
            from .models import get_master_fernet
            key_obj = resume.resume_key
            raw_key = get_master_fernet().decrypt(key_obj.key.encode())
            f = Fernet(raw_key)
            decrypted = f.decrypt(encrypted)
        except Exception as e:
            return Response({'detail': 'Unable to decrypt resume file. Encryption key may be missing or corrupt.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Strip .enc suffix
        if basename.endswith('.enc'):
            basename = basename[:-4]

        return FileResponse(ContentFile(decrypted), filename=basename, content_type=content_type)


class AdminAllResumesListView(generics.ListAPIView):
    """
    Admin-only endpoint to view all encrypted resumes from all users.
    Lists resume metadata including user information.
    """
    serializer_class = AdminResumeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Only admins can access this endpoint
        if self.request.user.role != 'ADMIN':
            raise PermissionDenied("Only admins can view all resumes.")

        # Return all resumes, ordered by upload date (newest first)
        return Resume.objects.all().select_related('user').order_by('-uploaded_at')


class AdminDownloadResumeView(APIView):
    """
    Admin-only endpoint to download any encrypted resume.
    Admins can decrypt and download resumes from any user for audit/compliance purposes.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, resume_id, format=None):
        # Only admins can access this endpoint
        if request.user.role != 'ADMIN':
            raise PermissionDenied("Only admins can download user resumes.")

        try:
            resume = Resume.objects.get(pk=resume_id)
        except Resume.DoesNotExist:
            raise Http404("Resume not found")

        basename = os.path.basename(resume.file.name)

        # Determine content type
        content_type = 'application/pdf'
        if basename.lower().endswith('.docx'):
            content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

        # Log the admin resume download for audit purposes
        create_audit_log('RESUME_DOWNLOADED_BY_ADMIN', request.user, {
            'resume_id': resume.id,
            'user_id': resume.user.id,
            'username': resume.user.username,
        })

        # If not encrypted, serve directly
        if not resume.is_encrypted or not hasattr(resume, 'resume_key'):
            try:
                resume.file.open('rb')
                file_data = resume.file.read()
            except Exception:
                return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)

            if basename.endswith('.enc'):
                basename = basename[:-4]
            return FileResponse(ContentFile(file_data), filename=basename, content_type=content_type)

        # Encrypted — decrypt with Fernet
        try:
            resume.file.open('rb')
            encrypted = resume.file.read()
            from .models import get_master_fernet
            key_obj = resume.resume_key
            raw_key = get_master_fernet().decrypt(key_obj.key.encode())
            f = Fernet(raw_key)
            decrypted = f.decrypt(encrypted)
        except Exception:
            return Response({'detail': 'Unable to decrypt resume file. Encryption key may be missing or corrupt.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Strip .enc suffix
        if basename.endswith('.enc'):
            basename = basename[:-4]

        return FileResponse(ContentFile(decrypted), filename=basename, content_type=content_type)


# =========================================================
# --- COMPANY FEATURE API VIEWS ---
# =========================================================

class CompanyDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated]
    queryset = Company.objects.all()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def update(self, request, *args, **kwargs):
        company = self.get_object()
        
        # Check permissions: owner or recruiter with FULL access
        if company.owner != request.user:
            access = CompanyAccess.objects.filter(company=company, recruiter=request.user).first()
            if not access or access.access_type != 'FULL':
                raise PermissionDenied("You don't have permission to edit this company.")
        
        response = super().update(request, *args, **kwargs)
        
        # Log the update for audit trail
        create_audit_log('COMPANY_UPDATED', request.user, {
            'company_id': company.id,
            'company_name': company.name
        })
        
        return response

    def destroy(self, request, *args, **kwargs):
        company = self.get_object()
        if company.owner != request.user:
            raise PermissionDenied("Only the company owner can delete the company.")
        
        create_audit_log('COMPANY_DELETED', request.user, {
            'company_id': company.id,
            'company_name': company.name
        })
        return super().destroy(request, *args, **kwargs)


class CompanyListCreateView(generics.ListCreateAPIView):
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'description', 'industry', 'location']
    ordering_fields = ['created_at', 'name']
    ordering = ['-created_at']

    def get_queryset(self):
        if self.request.query_params.get('my_companies') == 'true':
            return Company.objects.filter(
                Q(owner=self.request.user) | 
                Q(access_permissions__recruiter=self.request.user)
            ).distinct()
        
        # Filter by industry and location
        qs = Company.objects.all()
        industry = self.request.query_params.get('industry')
        location = self.request.query_params.get('location')
        
        if industry:
            qs = qs.filter(industry__icontains=industry)
        if location:
            qs = qs.filter(location__icontains=location)
        
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def perform_create(self, serializer):
        if self.request.user.role != 'RECRUITER':
            raise PermissionDenied("Only recruiters can create companies.")
        
        company = serializer.save(owner=self.request.user)
        create_audit_log('COMPANY_CREATED', self.request.user, {
            'company_id': company.id,
            'company_name': company.name
        })


class CompanyAccessGrantView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        
        if company.owner != request.user:
            raise PermissionDenied("Only the company owner can grant access.")
        
        recruiter_username = request.data.get('recruiter_username')
        access_type = request.data.get('access_type', 'POST_ONLY')
        
        if not recruiter_username:
            return Response({"error": "Recruiter username is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        User = get_user_model()
        try:
            recruiter = User.objects.get(username=recruiter_username, role='RECRUITER')
        except User.DoesNotExist:
            return Response({"error": "Recruiter not found"}, status=status.HTTP_404_NOT_FOUND)
        
        access, created = CompanyAccess.objects.update_or_create(
            company=company,
            recruiter=recruiter,
            defaults={'access_type': access_type, 'granted_by': request.user}
        )
        
        # Notify recruiter
        from accounts.models import Notification
        Notification.objects.create(
            recipient=recruiter,
            sender=request.user,
            notif_type='COMPANY_ASSIGNED',
            message=f"You have been granted {access_type} access to {company.name}"
        )
        
        serializer = CompanyAccessSerializer(access)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class CompanyAccessRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, company_id, recruiter_id):
        company = get_object_or_404(Company, id=company_id)
        
        if company.owner != request.user:
            raise PermissionDenied("Only the company owner can revoke access.")
        
        access = get_object_or_404(CompanyAccess, company=company, recruiter_id=recruiter_id)
        access.delete()
        
        return Response({"message": "Access revoked"}, status=status.HTTP_204_NO_CONTENT)


class CompanyPostListCreateView(generics.ListCreateAPIView):
    serializer_class = CompanyPostSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        company_id = self.kwargs.get('company_id')
        return CompanyPost.objects.filter(company_id=company_id).order_by('-created_at')

    def perform_create(self, serializer):
        company_id = self.kwargs.get('company_id')
        company = get_object_or_404(Company, id=company_id)
        
        # Check if user has permission to post
        if company.owner != self.request.user:
            access = CompanyAccess.objects.filter(company=company, recruiter=self.request.user).first()
            if not access or access.access_type not in ['FULL', 'POST_ONLY']:
                raise PermissionDenied("You don't have permission to post in this company.")
        
        serializer.save(author=self.request.user, company=company)


class CompanyPostDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CompanyPostSerializer
    permission_classes = [IsAuthenticated]
    queryset = CompanyPost.objects.all()

    def update(self, request, *args, **kwargs):
        post = self.get_object()
        if post.author != request.user:
            raise PermissionDenied("You can only edit your own posts.")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        post = self.get_object()
        if post.author != request.user and post.company.owner != request.user:
            raise PermissionDenied("You can only delete your own posts.")
        return super().destroy(request, *args, **kwargs)


class CompanySaveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        save, created = CompanySave.objects.get_or_create(company=company, user=request.user)
        
        if created:
            return Response({"message": "Company saved"}, status=status.HTTP_201_CREATED)
        return Response({"message": "Company already saved"}, status=status.HTTP_200_OK)

    def delete(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        CompanySave.objects.filter(company=company, user=request.user).delete()
        return Response({"message": "Company unsaved"}, status=status.HTTP_204_NO_CONTENT)


class SavedCompaniesListView(generics.ListAPIView):
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Company.objects.filter(saved_by__user=self.request.user).order_by('-saved_by__created_at')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
