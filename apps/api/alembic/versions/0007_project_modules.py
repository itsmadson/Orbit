"""Project sub-modules, and the developers assigned to each

Revision ID: 0007_project_modules
Revises: 0006_statuses_integrations
Create Date: 2026-11-07 12:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = '0007_project_modules'
down_revision: str | None = '0006_statuses_integrations'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _base_columns() -> list[sa.Column]:
    return [
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        'project_modules',
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=24), nullable=False),
        sa.Column('color', sa.String(length=16), nullable=False),
        sa.Column('order_index', sa.Integer(), nullable=False),
        *_base_columns(),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_project_modules_project_id_projects'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_project_modules')),
    )
    op.create_index(op.f('ix_project_modules_project_id'), 'project_modules', ['project_id'], unique=False)

    op.create_table(
        'module_members',
        sa.Column('module_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.String(length=40), nullable=False),
        *_base_columns(),
        sa.ForeignKeyConstraint(['module_id'], ['project_modules.id'], name=op.f('fk_module_members_module_id_project_modules'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_module_members_user_id_users'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_module_members')),
        sa.UniqueConstraint('module_id', 'user_id', name='uq_module_member'),
    )
    op.create_index(op.f('ix_module_members_module_id'), 'module_members', ['module_id'], unique=False)
    op.create_index(op.f('ix_module_members_user_id'), 'module_members', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_module_members_user_id'), table_name='module_members')
    op.drop_index(op.f('ix_module_members_module_id'), table_name='module_members')
    op.drop_table('module_members')
    op.drop_index(op.f('ix_project_modules_project_id'), table_name='project_modules')
    op.drop_table('project_modules')
