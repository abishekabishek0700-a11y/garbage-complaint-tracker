import pandas as pd
import streamlit as st

from api_client import delete, get, show_error


def render():
    st.markdown('<div class="eyebrow">Citizen workspace</div>', unsafe_allow_html=True)
    st.title("Your neighborhood, in progress")
    try:
        complaints = get("/complaints", token=st.session_state.token).get("complaints", [])
        cols = st.columns(3)
        cols[0].metric("Complaints submitted", len(complaints))
        cols[1].metric("Being addressed", sum(item["status"] not in ("Resolved", "Rejected") for item in complaints))
        cols[2].metric("Resolved", sum(item["status"] == "Resolved" for item in complaints))
        st.subheader("Recent reports")
        if complaints:
            table = [{"ID": item["id"], "Title": item["title"], "Category": item["category"], "Status": item["status"], "Reported": item["createdAt"][:10]} for item in complaints]
            st.dataframe(pd.DataFrame(table), hide_index=True, use_container_width=True)
            for item in complaints[:3]:
                with st.expander(f"{item['id']} · {item['title']} · {item['status']}"):
                    st.write(item["description"])
                    st.caption(f"{item['address']} · {item['location']}")
                    confirm_key = f"confirm-delete-{item['id']}"
                    if st.session_state.get(confirm_key):
                        st.warning("Delete this complaint permanently? This also removes its notifications and feedback.")
                        confirm_col, cancel_col = st.columns(2)
                        if confirm_col.button("Confirm delete", key=f"confirm-{item['id']}", type="primary"):
                            delete(f"/complaints/{item['id']}", token=st.session_state.token)
                            st.session_state.pop(confirm_key, None)
                            st.success("Complaint deleted.")
                            st.rerun()
                        if cancel_col.button("Cancel", key=f"cancel-{item['id']}"):
                            st.session_state.pop(confirm_key, None)
                            st.rerun()
                    elif st.button("Delete complaint", key=f"delete-{item['id']}"):
                        st.session_state[confirm_key] = True
                        st.rerun()
        else:
            st.info("No reports yet. Use ‘Submit a complaint’ to report a local waste issue.")
    except Exception as error:
        show_error(error)