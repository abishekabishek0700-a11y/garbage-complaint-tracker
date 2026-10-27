import pandas as pd
import streamlit as st

from api_client import delete, get, image_bytes, patch, post, report_csv, show_error
from config import CATEGORIES, STATUSES


def render(view="overview"):
    {"overview": _overview, "complaints": _complaints, "workers": _workers}[view]()


def _overview():
    st.markdown('<div class="eyebrow">Operations</div>', unsafe_allow_html=True)
    st.title("Service overview")
    try:
        stats = get("/admin/stats", token=st.session_state.token)
        columns = st.columns(5)
        for column, label, key in zip(columns, ["Total", "Pending", "In progress", "Resolved", "Rejected"], ["total", "pending", "inProgress", "resolved", "rejected"]):
            column.metric(label, stats[key])
        left, right = st.columns(2)
        with left:
            st.subheader("By status")
            st.bar_chart(pd.Series(stats["byStatus"], name="Complaints"))
        with right:
            st.subheader("By category")
            st.bar_chart(pd.Series(stats["byCategory"], name="Complaints"))
        if st.button("Refresh statistics"):
            st.rerun()
    except Exception as error:
        show_error(error)


def _complaints():
    st.markdown('<div class="eyebrow">Review & dispatch</div>', unsafe_allow_html=True)
    st.title("Manage complaints")
    try:
        filters = st.columns(5)
        search = filters[0].text_input("Search", placeholder="ID, name, address")
        status = filters[1].selectbox("Status", ["All"] + STATUSES)
        category = filters[2].selectbox("Category", ["All"] + CATEGORIES)
        date_from = filters[3].date_input("From date", value=None)
        date_to = filters[4].date_input("To date", value=None)
        params = {}
        if search: params["search"] = search
        if status != "All": params["status"] = status
        if category != "All": params["category"] = category
        if date_from: params["from"] = date_from.isoformat()
        if date_to: params["to"] = date_to.isoformat()
        complaints = get("/complaints", params=params, token=st.session_state.token).get("complaints", [])
        rows = [{"ID": c["id"], "Title": c["title"], "Category": c["category"], "Status": c["status"], "Citizen": c["citizenName"], "Address": c["address"], "Reported": c["createdAt"][:10]} for c in complaints]
        st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
        st.download_button("Download CSV report", report_csv(st.session_state.token), file_name="garbage-complaints.csv", mime="text/csv")
        if not complaints:
            return
        selected_id = st.selectbox("Complaint details", [c["id"] for c in complaints])
        item = get(f"/complaints/{selected_id}", token=st.session_state.token)["complaint"]
        st.subheader(item["title"])
        st.write(item["description"])
        st.caption(f"{item['category']} · {item['address']} · {item['location']} · {item['createdAt']}")
        if item.get("imageUrl"):
            st.image(image_bytes(item["imageUrl"], st.session_state.token), width=450)
        with st.expander("Status history"):
            for update in item["statusHistory"]:
                st.write(f"**{update['status']}** · {update['at'][:16].replace('T', ' ')} · {update['note']} · {update['actor']}")
        confirm_key = f"confirm-delete-admin-{selected_id}"
        if st.session_state.get(confirm_key):
            st.warning("Delete this complaint permanently? Its notifications, feedback, and uploaded evidence will also be removed.")
            confirm_col, cancel_col = st.columns(2)
            if confirm_col.button("Confirm delete", type="primary", key=f"confirm-admin-{selected_id}"):
                delete(f"/complaints/{selected_id}", token=st.session_state.token)
                st.session_state.pop(confirm_key, None)
                st.success("Complaint deleted.")
                st.rerun()
            if cancel_col.button("Cancel", key=f"cancel-admin-{selected_id}"):
                st.session_state.pop(confirm_key, None)
                st.rerun()
        elif st.button("Delete complaint", key=f"delete-admin-{selected_id}"):
            st.session_state[confirm_key] = True
            st.rerun()
        workers = get("/admin/workers", token=st.session_state.token).get("workers", [])
        active = [worker for worker in workers if worker["active"]]
        with st.form(f"update-{selected_id}"):
            new_status = st.selectbox("Set status", STATUSES, index=STATUSES.index(item["status"]))
            reason = st.text_input("Reason (required for rejection)")
            worker_id = st.selectbox("Assign worker", [""] + [worker["id"] for worker in active], format_func=lambda value: "No assignment" if not value else next(w["name"] for w in active if w["id"] == value))
            submit = st.form_submit_button("Save complaint update", type="primary")
        if submit:
            if new_status == "Rejected" and item["status"] != "Rejected" and not reason.strip():
                st.error("Enter a reason before rejecting a complaint.")
                return
            if worker_id and worker_id != item.get("workerId"):
                patch(f"/admin/complaints/{selected_id}/assign", data={"workerId": worker_id}, token=st.session_state.token)
            if new_status != item["status"]:
                patch(f"/admin/complaints/{selected_id}/status", data={"status": new_status, "reason": reason}, token=st.session_state.token)
            st.success("Complaint updated.")
            st.rerun()
    except Exception as error:
        show_error(error)


def _workers():
    st.markdown('<div class="eyebrow">Field team & resident voice</div>', unsafe_allow_html=True)
    st.title("Workers & feedback")
    try:
        with st.expander("Add a worker", expanded=False):
            with st.form("new-worker"):
                name = st.text_input("Worker name")
                email = st.text_input("Login email")
                password = st.text_input("Initial password", type="password", help="At least 10 characters. Share it securely with the worker.")
                phone = st.text_input("Phone")
                area = st.text_input("Service area")
                add = st.form_submit_button("Create worker account")
            if add:
                post("/admin/workers", data={"name": name, "email": email, "password": password, "phone": phone, "area": area}, token=st.session_state.token)
                st.success("Worker account created.")
                st.rerun()
        workers = get("/admin/workers", token=st.session_state.token).get("workers", [])
        if workers:
            st.subheader("Worker roster")
            st.dataframe(pd.DataFrame([{key: worker[key] for key in ["name", "email", "phone", "area", "active"]} for worker in workers]), hide_index=True, use_container_width=True)
            worker = st.selectbox("Manage worker", workers, format_func=lambda value: f"{value['name']} · {'Active' if value['active'] else 'Inactive'}")
            with st.form(f"edit-worker-{worker['id']}"):
                worker_name = st.text_input("Name", value=worker["name"])
                worker_phone = st.text_input("Phone", value=worker["phone"])
                worker_area = st.text_input("Service area", value=worker["area"])
                save_worker = st.form_submit_button("Save worker details")
            if save_worker:
                patch(f"/admin/workers/{worker['id']}", data={"name": worker_name, "phone": worker_phone, "area": worker_area}, token=st.session_state.token)
                st.success("Worker details updated.")
                st.rerun()
            if st.button("Deactivate worker" if worker["active"] else "Reactivate worker"):
                patch(f"/admin/workers/{worker['id']}", data={"active": not worker["active"]}, token=st.session_state.token)
                st.rerun()
        st.subheader("Citizen feedback")
        feedback = get("/admin/feedback", token=st.session_state.token).get("feedback", [])
        if feedback:
            rows = [{"Complaint": item["complaintId"], "Citizen": item["citizenName"], "Rating": item["rating"], "Comment": item["comment"], "Date": item["createdAt"][:10]} for item in feedback]
            st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
        else:
            st.info("No feedback received yet.")
    except Exception as error:
        show_error(error)