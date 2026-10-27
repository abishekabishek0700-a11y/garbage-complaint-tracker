import streamlit as st

from api_client import get, patch, post, show_error

st.set_page_config(page_title="Garbage Complaint Tracker", page_icon="♻", layout="wide")
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');
:root { --forest:#174d3a; --leaf:#35835e; --mint:#e7f2eb; --paper:#f5f8f4; --ink:#1d3028; --line:#dce7de; }
html, body, [class*="css"] { font-family:'DM Sans',sans-serif; color:var(--ink); }
.stApp { background:var(--paper); }
h1,h2,h3 { font-family:'Manrope',sans-serif; color:var(--forest); letter-spacing:0 !important; }
[data-testid="stSidebar"] { background:#e8f1e9; border-right:1px solid var(--line); }
[data-testid="stMetric"] { background:white; border:1px solid var(--line); padding:16px 18px; border-radius:6px; }
.brand { font-family:'Manrope',sans-serif; font-size:22px; font-weight:800; color:var(--forest); padding:8px 0 2px; }
.eyebrow { color:var(--leaf); font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
.stButton>button[kind="primary"] { background:var(--forest); border-color:var(--forest); }
.status { display:inline-block; padding:3px 8px; border-radius:4px; background:var(--mint); color:var(--forest); font-size:12px; font-weight:700; }
</style>
""", unsafe_allow_html=True)

for key, default in {"token": None, "user": None}.items():
    st.session_state.setdefault(key, default)


def login_page():
    st.markdown('<div class="eyebrow">Local service portal</div>', unsafe_allow_html=True)
    st.title("Garbage Complaint Tracker")
    if st.session_state.user:
        st.success(f"Signed in as {st.session_state.user['name']}.")
        st.page_link(home_pages[st.session_state.user["role"]], label="Open your dashboard", icon="🏠")
        return
    st.write("A clearer route from a reported waste issue to a completed clean-up.")
    left, right = st.columns([1.2, 1])
    with left:
        st.subheader("Sign in")
        with st.form("login"):
            email = st.text_input("Email", placeholder="name@example.com")
            password = st.text_input("Password", type="password")
            submitted = st.form_submit_button("Sign in", type="primary", use_container_width=True)
        if submitted:
            try:
                result = post("/auth/login", data={"email": email, "password": password})
                st.session_state.token, st.session_state.user = result["token"], result["user"]
                st.switch_page(home_pages[result["user"]["role"]])
            except Exception as error:
                show_error(error)
        st.info("Create a citizen account here. Administrator and worker accounts are managed by an administrator.")
    with right:
        st.subheader("Create a citizen account")
        with st.form("register"):
            name = st.text_input("Full name")
            register_email = st.text_input("Email address")
            address = st.text_input("Home address")
            new_password = st.text_input("Password", type="password", help="Use at least 10 characters.")
            submitted = st.form_submit_button("Register", use_container_width=True)
        if submitted:
            try:
                result = post("/auth/register", data={"name": name, "email": register_email, "address": address, "password": new_password})
                st.session_state.token, st.session_state.user = result["token"], result["user"]
                st.switch_page(home_pages[result["user"]["role"]])
            except Exception as error:
                show_error(error)


def citizen_dashboard_page():
    from pages.citizen_dashboard import render as render_citizen

    render_for_role("citizen", render_citizen)


def submit_complaint_page():
    from pages.submit_complaint import render as render_submit

    render_for_role("citizen", render_submit)


def track_complaint_page():
    from pages.track_complaint import render as render_track

    render_for_role("citizen", render_track)


def admin_overview_page():
    from pages.admin_dashboard import render as render_admin

    render_for_role("admin", lambda: render_admin("overview"))


def admin_complaints_page():
    from pages.admin_dashboard import render as render_admin

    render_for_role("admin", lambda: render_admin("complaints"))


def admin_workers_page():
    from pages.admin_dashboard import render as render_admin

    render_for_role("admin", lambda: render_admin("workers"))


def worker_dashboard_page():
    from pages.worker_dashboard import render as render_worker

    render_for_role("worker", render_worker)


login = st.Page(login_page, title="Sign in", icon="🔐", url_path="sign-in")
citizen_dashboard = st.Page(citizen_dashboard_page, title="Citizen dashboard", icon="🏠", url_path="citizen-dashboard")
submit_complaint = st.Page(submit_complaint_page, title="Submit a complaint", icon="➕", url_path="submit-complaint")
track_complaint = st.Page(track_complaint_page, title="Track a complaint", icon="🔎", url_path="track-complaint")
admin_overview = st.Page(admin_overview_page, title="Admin overview", icon="📊", url_path="admin-overview")
admin_complaints = st.Page(admin_complaints_page, title="Manage complaints", icon="📋", url_path="manage-complaints")
admin_workers = st.Page(admin_workers_page, title="Workers & feedback", icon="👷", url_path="workers-feedback")
worker_dashboard = st.Page(worker_dashboard_page, title="Worker dashboard", icon="🧹", url_path="worker-dashboard")

home_pages = {"citizen": citizen_dashboard, "admin": admin_overview, "worker": worker_dashboard}


def render_for_role(required_role, render_page):
    user = st.session_state.get("user")
    if not user:
        st.info("Sign in to open this page.")
        st.page_link(login, label="Go to sign in", icon="🔐")
        return
    if user.get("role") != required_role:
        st.error("This page is not available for your account role.")
        st.page_link(home_pages[user["role"]], label="Open your dashboard", icon="🏠")
        return
    render_page()


if st.session_state.token:
    try:
        st.session_state.user = get("/auth/me", token=st.session_state.token)["user"]
    except Exception:
        st.session_state.token = None
        st.session_state.user = None

navigation = st.navigation(
    {
        "Account": [login],
        "Citizen": [citizen_dashboard, submit_complaint, track_complaint],
        "Administration": [admin_overview, admin_complaints, admin_workers],
        "Field work": [worker_dashboard],
    },
    position="sidebar",
    expanded=True,
)

st.sidebar.markdown('<div class="brand">♻ Garbage Complaint Tracker</div>', unsafe_allow_html=True)
user = st.session_state.get("user")
if user:
    role_labels = {"citizen": "Citizen", "admin": "Administrator", "worker": "Field worker"}
    st.sidebar.caption(f"{user['name']} · {role_labels.get(user['role'], user['role'])}")
    st.sidebar.markdown("**Quick links**")
    for page in [citizen_dashboard, submit_complaint, track_complaint, admin_overview, admin_complaints, admin_workers, worker_dashboard]:
        st.sidebar.page_link(page, label=page.title, icon=page.icon)
    st.sidebar.divider()
    try:
        notifications = get("/notifications", token=st.session_state.token).get("notifications", [])
        unread = sum(not item["read"] for item in notifications)
        st.sidebar.caption(f"Notifications · {unread} unread")
        for notification in notifications[:4]:
            with st.sidebar.expander(notification["message"], expanded=False):
                st.caption(notification["createdAt"][:16].replace("T", " "))
                if not notification["read"] and st.button("Mark read", key=f"read-{notification['id']}"):
                    patch(f"/notifications/{notification['id']}/read", token=st.session_state.token)
                    st.rerun()
    except Exception as error:
        show_error(error)
    if st.sidebar.button("Sign out", use_container_width=True):
        st.session_state.token = None
        st.session_state.user = None
        st.switch_page(login)

navigation.run()