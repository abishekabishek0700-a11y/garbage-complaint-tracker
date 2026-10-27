import streamlit as st

from api_client import post, show_error
from config import CATEGORIES


def render():
    st.markdown('<div class="eyebrow">Report an issue</div>', unsafe_allow_html=True)
    st.title("Submit a complaint")
    st.write("Share enough detail for a local team to find and assess the issue.")
    with st.form("complaint-form"):
        title = st.text_input("Complaint title", max_chars=120)
        category = st.selectbox("Category", CATEGORIES)
        description = st.text_area("Description", max_chars=3000, height=130, placeholder="Describe the waste, how much there is, and any nearby landmarks.")
        address = st.text_input("Street address or area")
        location = st.text_input("Specific location or landmark")
        photo = st.file_uploader("Garbage photo (optional)", type=["jpg", "jpeg", "png", "webp"])
        submitted = st.form_submit_button("Submit complaint", type="primary")
    if submitted:
        if not title.strip() or not description.strip() or not address.strip():
            st.error("Title, description, and address are required.")
            return
        try:
            data = {"title": title, "category": category, "description": description, "address": address, "location": location or address}
            files = {"photo": (photo.name, photo.getvalue(), photo.type)} if photo else None
            complaint = post("/complaints", data=data, files=files, token=st.session_state.token)["complaint"]
            st.success(f"Complaint submitted. Your tracking ID is {complaint['id']}.")
        except Exception as error:
            show_error(error)