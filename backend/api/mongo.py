import os
from pymongo import MongoClient

_client = None

def get_db():
    global _client
    if _client is None:
        mongo_uri = os.getenv("MONGODB_URI")
        if not mongo_uri:
            raise ValueError("MONGODB_URI is not set in environment.")
        _client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000)
    return _client[os.getenv("MONGODB_DATABASE", "recalldesk")]

