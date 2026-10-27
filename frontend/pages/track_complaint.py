import streamlit as st

from api_client import delete, get, image_bytes, post, show_error


def render():
    st.markdown('<div class="eyebrow">Updates & resolution</div>', unsafe_allow_html=True)
    st.title("Track a complaint")
    try:
        complaints = get("/complaints", token=st.session_state.token).get("complaints", [])
        if not complaints:
            st.info("Submit a complaint first to see its tracking history.")
            return
        titles = {item["id"]: f"{item['id']} · {item['title']}" for item in complaints}
        selected_id = st.selectbox("Complaint", list(titles), format_func=lambda value: titles[value])
        complaint = get(f"/complaints/{selected_id}", token=st.session_state.token)["complaint"]
        st.subheader(complaint["title"])
        st.markdown(f'<span class="status">{complaint["status"]}</span>', unsafe_allow_html=True)
        st.write(complaint["description"])
        st.caption(f"{complaint['category']} · {complaint['address']} · {complaint['createdAt'][:10]}")
        confirm_key = f"confirm-delete-{selected_id}"
        if st.session_state.get(confirm_key):
            st.warning("Delete this complaint permanently? This also removes its notifications and feedback.")
            confirm_col, cancel_col = st.columns(2)
            if confirm_col.button("Confirm delete", type="primary", key=f"confirm-track-{selected_id}"):
                delete(f"/complaints/{selected_id}", token=st.session_state.token)
                st.session_state.pop(confirm_key, None)
                st.success("Complaint deleted.")
                st.rerun()
            if cancel_col.button("Cancel", key=f"cancel-track-{selected_id}"):
                st.session_state.pop(confirm_key, None)
                st.rerun()
        elif st.button("Delete complaint", key=f"delete-track-{selected_id}"):
            st.session_state[confirm_key] = True
            st.rerun()
        if complaint.get("rejectionReason"):
            st.warning(f"Reason: {complaint['rejectionReason']}")
        if complaint.get("imageUrl"):
            st.image(image_bytes(complaint["imageUrl"], st.session_state.token), caption="Submitted photo", width=450)
        st.subheader("Status history")
        for update in reversed(complaint.get("statusHistory", [])):
            st.markdown(f"**{update['status']}** · {update['at'][:16].replace('T', ' ')}")
            st.caption(f"{update['note']} · {update['actor']}")
        evidence = complaint.get("evidence", [])
        if evidence:
            st.subheader("Clean-up evidence")
            before, after = st.columns(2)
            for item in evidence:
                with (before if item["type"] == "before" else after):
                    st.image(image_bytes(item["imageUrl"], st.session_state.token), caption=f"{item['type'].title()} · {item['at'][:10]}", use_container_width=True)
        if complaint["status"] == "Resolved":
            previous_feedback = get("/feedback", token=st.session_state.token).get("feedback", [])
            if any(item["complaintId"] == selected_id for item in previous_feedback):
                st.success("Your feedback has been recorded for this complaint.")
            else:
                with st.form(f"feedback-{selected_id}"):
                    st.subheader("Rate the resolution")
                    rating = st.slider("Rating", 1, 5, 5)
                    comment = st.text_area("Comment", max_chars=1000)
                    if st.form_submit_button("Send feedback"):
                        post("/feedback", data={"complaintId": selected_id, "rating": rating, "comment": comment}, token=st.session_state.token)
                        st.success("Thank you. Your feedback has been recorded.")
    except Exception as error:
        show_error(error)