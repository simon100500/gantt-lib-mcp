from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import psycopg
import streamlit as st
from dotenv import load_dotenv
from psycopg.rows import dict_row


ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT_DIR / ".env"

load_dotenv(ENV_PATH)


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(f"DATABASE_URL not found in {ENV_PATH}")
    return database_url


def run_query(query: str, params: tuple | None = None) -> list[dict]:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(query, params or ())
            return list(cur.fetchall())


@st.cache_data(ttl=30, show_spinner=False)
def load_overview() -> dict:
    rows = run_query(
        """
        WITH user_stats AS (
          SELECT
            u.id,
            COUNT(p.id)::int AS project_count
          FROM users u
          LEFT JOIN projects p ON p.user_id = u.id
          GROUP BY u.id
        )
        SELECT
          (SELECT COUNT(*)::int FROM users) AS total_users,
          (SELECT COUNT(*)::int FROM projects) AS total_projects,
          COUNT(*) FILTER (WHERE project_count > 0)::int AS users_with_projects,
          COALESCE(AVG(project_count), 0)::numeric(10, 2) AS avg_projects_per_user
        FROM user_stats
        """
    )
    return rows[0]


@st.cache_data(ttl=30, show_spinner=False)
def load_users() -> list[dict]:
    return run_query(
        """
        SELECT
          u.id,
          u.email,
          u.created_at,
          COUNT(p.id)::int AS project_count,
          MAX(p.created_at) AS last_project_at
        FROM users u
        LEFT JOIN projects p ON p.user_id = u.id
        GROUP BY u.id, u.email, u.created_at
        ORDER BY u.created_at DESC
        """
    )


@st.cache_data(ttl=30, show_spinner=False)
def load_projects() -> list[dict]:
    return run_query(
        """
        SELECT
          p.id,
          p.name,
          p.gantt_day_mode,
          p.created_at,
          u.email AS user_email,
          u.id AS user_id
        FROM projects p
        JOIN users u ON u.id = p.user_id
        ORDER BY p.created_at DESC
        """
    )


def main() -> None:
    st.set_page_config(
        page_title="Gantt Admin",
        page_icon=":bar_chart:",
        layout="wide",
    )

    st.title("Gantt Admin")
    st.caption("Пользователи и их проекты из текущей Postgres БД")

    with st.sidebar:
        st.header("Управление")
        if st.button("Обновить данные", use_container_width=True):
            st.cache_data.clear()
            st.rerun()
        st.caption(f"Источник: {ENV_PATH}")

    try:
        overview = load_overview()
        users = load_users()
        projects = load_projects()
    except Exception as exc:
        st.error("Не удалось подключиться к БД или выполнить запрос.")
        st.code(str(exc))
        return

    users_df = pd.DataFrame(users)
    projects_df = pd.DataFrame(projects)

    st.subheader("Сводка")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Всего пользователей", int(overview["total_users"]))
    col2.metric("Всего проектов", int(overview["total_projects"]))
    col3.metric("Пользователей с проектами", int(overview["users_with_projects"]))
    col4.metric("Среднее проектов на пользователя", overview["avg_projects_per_user"])

    st.subheader("Пользователи")
    search = st.text_input("Поиск по email", placeholder="например, user@example.com")
    if search:
        filtered_users = users_df[users_df["email"].str.contains(search, case=False, na=False)].copy()
    else:
        filtered_users = users_df.copy()

    display_users = filtered_users.rename(
        columns={
            "email": "Email",
            "created_at": "Зарегистрирован",
            "project_count": "Проектов",
            "last_project_at": "Последний проект",
            "id": "User ID",
        }
    )
    st.dataframe(display_users, use_container_width=True, hide_index=True)

    st.subheader("Проекты")
    user_options = [("Все пользователи", "")] + [
        (row["email"], row["id"]) for row in users
    ]
    selected_label = st.selectbox(
        "Показать проекты пользователя",
        options=[label for label, _ in user_options],
        index=0,
    )
    selected_user_id = next(value for label, value in user_options if label == selected_label)

    filtered_projects = projects_df.copy()
    if selected_user_id:
        filtered_projects = filtered_projects[filtered_projects["user_id"] == selected_user_id]

    display_projects = filtered_projects.rename(
        columns={
            "name": "Проект",
            "user_email": "Пользователь",
            "gantt_day_mode": "Режим дней",
            "created_at": "Создан",
            "id": "Project ID",
            "user_id": "User ID",
        }
    )

    if display_projects.empty:
        st.info("Для выбранного пользователя проектов нет.")
    else:
        st.dataframe(display_projects, use_container_width=True, hide_index=True)


if __name__ == "__main__":
    main()
