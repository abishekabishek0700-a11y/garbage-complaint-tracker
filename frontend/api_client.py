import os

import requests
import streamlit as st

from config import API_BASE_URL


class APIError(Exception):
    def __init__(self, message, *, status=None, method=None, path=None):
        super().__init__(message)
        self.status = status
        self.method = method
        self.path = path


def request(method, path, *, params=None, data=None, files=None, token=None, raw=False):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    request_path = path.split("?", 1)[0]
    try:
        is_json = files is None and isinstance(data, dict)
        response = requests.request(method, f"{API_BASE_URL}{path}", headers=headers, params=params,
                        data=None if is_json else data, files=files, json=data if is_json else None,
                        timeout=30)
    except requests.RequestException as exc:
        raise APIError(
            f"Cannot reach the API at {API_BASE_URL}. Start the backend and check GCT_API_URL.",
            method=method.upper(), path=request_path
        ) from exc
    if not response.ok:
        try:
            message = response.json().get("error", "The request could not be completed.")
        except ValueError:
            message = f"The API returned HTTP {response.status_code} without a JSON error message."
        if response.status_code == 429 and "without a JSON" in message:
            message = "Too many requests. Wait a few minutes before trying again."
        raise APIError(message, status=response.status_code, method=method.upper(), path=request_path)
    return response if raw else response.json().get("data", {})


def get(path, *, params=None, token=None):
    return request("GET", path, params=params, token=token)


def post(path, *, data=None, files=None, token=None):
    return request("POST", path, data=data, files=files, token=token)


def patch(path, *, data=None, token=None):
    return request("PATCH", path, data=data, token=token)


def delete(path, *, token=None):
    return request("DELETE", path, token=token)


def image_bytes(image_url, token):
    if not image_url:
        return None
    return request("GET", image_url, token=token, raw=True).content


def report_csv(token):
    return request("GET", "/admin/report.csv", token=token, raw=True).content


def show_error(error):
    if isinstance(error, APIError):
        st.error(str(error))
        if os.getenv("GCT_DEBUG_API", "").strip().lower() in {"1", "true", "yes", "on"}:
            request_detail = f"{error.method} {error.path}" if error.method and error.path else "Request details unavailable"
            status_detail = f"HTTP {error.status}" if error.status is not None else "No HTTP response received"
            with st.expander("API diagnostics (safe)"):
                st.code(f"{request_detail}\n{status_detail}")
    else:
        st.error("Something went wrong. Please check the entered values and try again.")