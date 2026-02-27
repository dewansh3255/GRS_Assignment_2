import os

from cryptography.fernet import Fernet
from django.http import FileResponse, Http404, HttpResponseForbidden
from django.conf import settings
from django.core.files.base import ContentFile

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from .models import Resume
from .serializers import ResumeSerializer
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status
from django.db import transaction


class ResumeUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, format=None):
        file = request.data.get('file')
        if not file:
            return Response({"detail": "No file provided"}, status=400)
        resume = Resume.objects.create(user=request.user, file=file)
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

        # read encrypted file
        resume.file.open('rb')
        encrypted = resume.file.read()

        try:
            key_obj = resume.resume_key
            f = Fernet(key_obj.key.encode())
            decrypted = f.decrypt(encrypted)
        except Exception:
            return HttpResponseForbidden("Unable to decrypt file")

        basename = os.path.basename(resume.file.name)
        # strip .enc suffix if present
        if basename.endswith('.enc'):
            basename = basename[:-4]

        response = FileResponse(ContentFile(decrypted), filename=basename)
        return response


class DeleteResumeView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, format=None):
        try:
            resume = Resume.objects.get(pk=pk)
        except Resume.DoesNotExist:
            raise Http404("Resume not found")

        # security check: only owner or explicitly authorized recruiter can delete
        if request.user != resume.user and request.user not in resume.authorized_recruiters.all():
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
