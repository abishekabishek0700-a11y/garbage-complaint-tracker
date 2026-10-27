import os
import streamlit as st

try:
    streamlit_secret_api_url = st.secrets.get("GCT_API_URL", "")
except Exception:
    streamlit_secret_api_url = ""

API_BASE_URL = (os.getenv("GCT_API_URL") or streamlit_secret_api_url or "http://localhost:5000/api").rstrip("/")
CATEGORIES = ["Roadside garbage", "Overflowing dustbins", "Illegal dumping", "Plastic waste", "Drainage waste", "Other"]
STATUSES = ["Submitted", "Verified", "Assigned", "In Progress", "Resolved", "Rejected"]