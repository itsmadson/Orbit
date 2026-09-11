"""File storage abstraction: local filesystem today, S3/MinIO in production."""

import os
import shutil
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO

from app.core.config import settings


class StorageBackend(ABC):
    @abstractmethod
    def save(self, key: str, stream: BinaryIO) -> int: ...

    @abstractmethod
    def open(self, key: str) -> BinaryIO: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...


class LocalStorage(StorageBackend):
    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not str(path).startswith(str(self.root.resolve())):
            raise ValueError("Invalid storage key")
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def save(self, key: str, stream: BinaryIO) -> int:
        path = self._path(key)
        with path.open("wb") as fh:
            shutil.copyfileobj(stream, fh)
        return os.path.getsize(path)

    def open(self, key: str) -> BinaryIO:
        return self._path(key).open("rb")

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()


class S3Storage(StorageBackend):
    """Enable by setting STORAGE_BACKEND=s3 and installing boto3."""

    def __init__(self):
        import boto3  # imported lazily so the default deployment stays dependency-free

        self.bucket = settings.S3_BUCKET
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT or None,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )

    def save(self, key: str, stream: BinaryIO) -> int:
        self.client.upload_fileobj(stream, self.bucket, key)
        return self.client.head_object(Bucket=self.bucket, Key=key)["ContentLength"]

    def open(self, key: str) -> BinaryIO:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"]

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False


_backend: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _backend
    if _backend is None:
        _backend = (
            S3Storage() if settings.STORAGE_BACKEND == "s3"
            else LocalStorage(settings.STORAGE_LOCAL_PATH)
        )
    return _backend


def build_key(company_id: uuid.UUID, entity_type: str, filename: str) -> str:
    safe = Path(filename).name.replace("/", "_")
    return f"{company_id}/{entity_type}/{uuid.uuid4().hex}-{safe}"
