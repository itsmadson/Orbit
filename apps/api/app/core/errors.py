from fastapi import HTTPException, status


class OrbitError(HTTPException):
    code = "error"

    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(status_code=status_code, detail={"code": self.code, "message": detail})


class NotFound(OrbitError):
    code = "not_found"

    def __init__(self, what: str = "Resource"):
        super().__init__(f"{what} not found", status.HTTP_404_NOT_FOUND)


class Forbidden(OrbitError):
    code = "forbidden"

    def __init__(self, detail: str = "You do not have permission to perform this action"):
        super().__init__(detail, status.HTTP_403_FORBIDDEN)


class Unauthorized(OrbitError):
    code = "unauthorized"

    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(detail, status.HTTP_401_UNAUTHORIZED)


class Conflict(OrbitError):
    code = "conflict"

    def __init__(self, detail: str = "Conflicting state"):
        super().__init__(detail, status.HTTP_409_CONFLICT)


class BadRequest(OrbitError):
    code = "bad_request"
