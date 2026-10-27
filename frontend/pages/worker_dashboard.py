import streamlit as st

from api_client import get, image_bytes, patch, post, show_error


def render():
    st.markdown('<div class="eyebrow">Field operations</div>', unsafe_allow_html=True)
    st.title("My assigned work")
    try:
        complaints = get("/complaints", token=st.session_state.token).get("complaints", [])
        if not complaints:
            st.info("There are no complaints assigned to you yet.")
            return
        open_items = [item for item in complaints if item["status"] not in ("Resolved", "Rejected")]
        st.metric("Open tasks", len(open_items))
        titles = {item["id"]: f"{item['id']} · {item['title']} · {item['status']}" for item in complaints}
        selected_id = st.selectbox("Task", list(titles), format_func=lambda value: titles[value])
        item = get(f"/complaints/{selected_id}", token=st.session_state.token)["complaint"]
        st.subheader(item["title"])
        st.write(item["description"])
        st.caption(f"{item['category']} · {item['address']} · {item['location']}")
        if item.get("imageUrl"):
            st.image(image_bytes(item["imageUrl"], st.session_state.token), caption="Citizen photo", width=450)
        before, after = st.columns(2)
        for evidence in item.get("evidence", []):
            with (before if evidence["type"] == "before" else after):
                st.image(image_bytes(evidence["imageUrl"], st.session_state.token), caption=f"{evidence['type'].title()} photo", use_container_width=True)
        if item["status"] not in ("Resolved", "Rejected"):
            with st.form(f"evidence-{selected_id}"):
                evidence_type = st.selectbox("Photo type", ["before", "after"])
                photo = st.file_uploader("Upload cleaning evidence", type=["jpg", "jpeg", "png", "webp"])
                upload = st.form_submit_button("Upload photo")
            if upload:
                if not photo:
                    st.error("Choose an image first.")
                else:
                    post(f"/complaints/{selected_id}/evidence", data={"type": evidence_type}, files={"photo": (photo.name, photo.getvalue(), photo.type)}, token=st.session_state.token)
                    st.success("Evidence uploaded.")
                    st.rerun()
            with st.form(f"task-{selected_id}"):
                note = st.text_area("Work completion notes", max_chars=1000, value=item.get("workNotes", ""))
                task_status = st.selectbox("Task status", ["In Progress", "Resolved"])
                update = st.form_submit_button("Save task update", type="primary")
            if update:
                patch(f"/complaints/{selected_id}/task", data={"status": task_status, "note": note}, token=st.session_state.token)
                st.success("Task update saved.")
                st.rerun()
        else:
            st.success(f"This task is {item['status'].lower()}.")
    except Exception as error:
        show_error(error)