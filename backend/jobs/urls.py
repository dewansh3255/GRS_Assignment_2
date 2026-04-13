from django.urls import path
from .views import (
    DownloadResumeView, ResumeUploadView, ResumeListView, DeleteResumeView,
    AdminAllResumesListView, AdminDownloadResumeView,
    CompanyListCreateView, CompanyDetailView, CompanyEmployeeManageView,
    JobListCreateView, JobDetailView, JobApplicationsListView,
    ApplicationListCreateView, ApplicationDetailView, DownloadApplicationResumeView,
)

urlpatterns = [
    # Resume
    path('resume/upload/', ResumeUploadView.as_view(), name='upload_resume'),
    path('resume/', ResumeListView.as_view(), name='list_resumes'),
    path('resume/<int:pk>/download/', DownloadResumeView.as_view(), name='download_resume'),
    path('resume/<int:pk>/', DeleteResumeView.as_view(), name='delete_resume'),
    
    # Admin - All Resumes
    path('admin/resumes/', AdminAllResumesListView.as_view(), name='admin_all_resumes'),
    path('admin/resumes/<int:resume_id>/download/', AdminDownloadResumeView.as_view(), name='admin_download_resume'),

    # Companies
    path('companies/', CompanyListCreateView.as_view(), name='company_list'),
    path('companies/<int:pk>/', CompanyDetailView.as_view(), name='company_detail'),
    path('companies/<int:company_id>/employees/', CompanyEmployeeManageView.as_view(), name='company_employees'),

    # Jobs
    path('jobs/', JobListCreateView.as_view(), name='job_list'),
    path('jobs/<int:pk>/', JobDetailView.as_view(), name='job_detail'),
    path('jobs/<int:job_id>/applications/', JobApplicationsListView.as_view(), name='job_applications'),

    # Applications
    path('applications/', ApplicationListCreateView.as_view(), name='application_list'),
    path('applications/<int:pk>/', ApplicationDetailView.as_view(), name='application_detail'),
    path('applications/<int:application_id>/resume/', DownloadApplicationResumeView.as_view(), name='download_application_resume'),
]