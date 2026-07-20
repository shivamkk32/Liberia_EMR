"""Authentication routes: login and current-user."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import auth, models, schemas, serializers
from ..database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(models.User.username == payload.username.strip().lower())
        .first()
    )
    if user is None or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled"
        )

    auth.audit(db, user, action="login", entity="user", entity_id=user.id)
    db.commit()

    token = auth.create_access_token(user)
    return schemas.Token(access_token=token, user=serializers.user_read(user))


@router.get("/me", response_model=schemas.UserRead)
def me(current: models.User = Depends(auth.get_current_user)):
    return serializers.user_read(current)
