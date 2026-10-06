"""Custom task statuses, and the tables that bind tasks to remote issue trackers

Revision ID: 0006_statuses_integrations
Revises: 0005_support
Create Date: 2026-10-05 22:10:00.000000
"""
import uuid
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0006_statuses_integrations'
down_revision: str | None = '0005_support'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULTS = [
    ("backlog", "Backlog", "بک‌لاگ", "open", "#8b93a1"),
    ("todo", "To do", "برای انجام", "open", "#2d88e2"),
    ("in_progress", "In progress", "در حال انجام", "started", "#f5501b"),
    ("in_review", "In review", "در حال بازبینی", "started", "#d9a400"),
    ("done", "Done", "انجام‌شده", "done", "#61a746"),
    ("cancelled", "Cancelled", "لغوشده", "cancelled", "#6b7280"),
]


def _base_columns() -> list[sa.Column]:
    return [
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    ]


def upgrade() -> None:
    statuses = op.create_table(
        'task_statuses',
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('key', sa.String(length=24), nullable=False),
        sa.Column('name', sa.String(length=60), nullable=False),
        sa.Column('name_fa', sa.String(length=60), nullable=True),
        sa.Column('category', sa.String(length=16), nullable=False),
        sa.Column('color', sa.String(length=16), nullable=False),
        sa.Column('order_index', sa.Integer(), nullable=False),
        sa.Column('is_system', sa.Boolean(), nullable=False),
        *_base_columns(),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], name=op.f('fk_task_statuses_company_id_companies'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_task_statuses')),
        sa.UniqueConstraint('company_id', 'key', name='uq_task_status_key'),
    )
    op.create_index(op.f('ix_task_statuses_company_id'), 'task_statuses', ['company_id'], unique=False)

    # Every existing company keeps exactly the board it had.
    connection = op.get_bind()
    companies = [row[0] for row in connection.execute(sa.text("SELECT id FROM companies"))]
    rows = [
        {
            "id": uuid.uuid4(), "company_id": company_id, "key": key, "name": name,
            "name_fa": name_fa, "category": category, "color": color,
            "order_index": index, "is_system": True,
        }
        for company_id in companies
        for index, (key, name, name_fa, category, color) in enumerate(DEFAULTS)
    ]
    if rows:
        op.bulk_insert(statuses, rows)

    op.create_table(
        'integration_links',
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('provider', sa.String(length=40), nullable=False),
        sa.Column('remote_key', sa.String(length=200), nullable=False),
        sa.Column('remote_name', sa.String(length=200), nullable=True),
        sa.Column('remote_url', sa.String(length=600), nullable=True),
        sa.Column('auto_sync', sa.Boolean(), nullable=False),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.String(length=400), nullable=True),
        *_base_columns(),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], name=op.f('fk_integration_links_company_id_companies'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_integration_links_project_id_projects'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_integration_links')),
        sa.UniqueConstraint('project_id', 'provider', 'remote_key', name='uq_integration_link'),
    )
    op.create_index(op.f('ix_integration_links_company_id'), 'integration_links', ['company_id'], unique=False)
    op.create_index(op.f('ix_integration_links_project_id'), 'integration_links', ['project_id'], unique=False)

    op.create_table(
        'external_issues',
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('task_id', sa.UUID(), nullable=False),
        sa.Column('link_id', sa.UUID(), nullable=True),
        sa.Column('provider', sa.String(length=40), nullable=False),
        sa.Column('remote_key', sa.String(length=200), nullable=False),
        sa.Column('remote_id', sa.String(length=80), nullable=False),
        sa.Column('url', sa.String(length=600), nullable=True),
        sa.Column('remote_state', sa.String(length=80), nullable=True),
        sa.Column('remote_updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        *_base_columns(),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], name=op.f('fk_external_issues_company_id_companies'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], name=op.f('fk_external_issues_task_id_tasks'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['link_id'], ['integration_links.id'], name=op.f('fk_external_issues_link_id_integration_links'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_external_issues')),
        sa.UniqueConstraint('company_id', 'provider', 'remote_key', 'remote_id', name='uq_external_issue'),
    )
    op.create_index(op.f('ix_external_issues_company_id'), 'external_issues', ['company_id'], unique=False)
    op.create_index(op.f('ix_external_issues_task_id'), 'external_issues', ['task_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_external_issues_task_id'), table_name='external_issues')
    op.drop_index(op.f('ix_external_issues_company_id'), table_name='external_issues')
    op.drop_table('external_issues')
    op.drop_index(op.f('ix_integration_links_project_id'), table_name='integration_links')
    op.drop_index(op.f('ix_integration_links_company_id'), table_name='integration_links')
    op.drop_table('integration_links')
    op.drop_index(op.f('ix_task_statuses_company_id'), table_name='task_statuses')
    op.drop_table('task_statuses')
