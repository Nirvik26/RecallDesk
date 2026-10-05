from django.urls import path
from .views import upload_document, list_documents, chat_stream

urlpatterns = [
    path('upload/', upload_document, name='upload_document'),
    path('documents/', list_documents, name='list_documents'),
    path('chat/', chat_stream, name='chat_stream'),
]
