"""
Custom DRF exception handler that ensures all errors return JSON
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from django.core.exceptions import RequestDataTooBig
import logging

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    """
    Custom exception handler that:
    1. Converts all exceptions to JSON responses
    2. Never returns HTML error pages
    3. Logs all errors for debugging
    4. Handles file size errors gracefully
    """
    
    # Handle file size too large errors
    if isinstance(exc, RequestDataTooBig):
        logger.warning(f"File too large error in {context.get('view', 'unknown')}")
        return Response(
            {
                'error': 'File size exceeds 5MB limit.',
                'detail': 'Please upload a file smaller than 5MB'
            },
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        )
    
    # Get the standard DRF response
    response = exception_handler(exc, context)
    
    if response is None:
        # Unhandled exception - create JSON response
        logger.exception(f"Unhandled exception in {context.get('view', 'unknown')}: {exc}")
        return Response(
            {
                'error': 'Server error',
                'detail': str(exc)
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
    # Ensure response has proper JSON format
    if response.data is None:
        response.data = {'detail': 'An error occurred'}
    
    # Log all errors for debugging
    if response.status_code >= 400:
        logger.warning(
            f"API Error {response.status_code} in {context.get('view', 'unknown')}: {response.data}"
        )
    
    return response
