import os

API_BASE_URL = os.getenv("GCT_API_URL", "http://localhost:5000/api").rstrip("/")
CATEGORIES = ["Roadside garbage", "Overflowing dustbins", "Illegal dumping", "Plastic waste", "Drainage waste", "Other"]
STATUSES = ["Submitted", "Verified", "Assigned", "In Progress", "Resolved", "Rejected"]