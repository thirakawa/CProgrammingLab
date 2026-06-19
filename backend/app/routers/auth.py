import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import create_session, delete_session, get_current_user
from .. import models, schemas

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login")
def login(req: schemas.LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == req.username).first()
    if not user or not bcrypt.checkpw(req.password.encode(), user.hashed_password.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ユーザー名またはパスワードが違います")

    session_id = create_session(user.id)
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        samesite="lax",
    )
    return schemas.UserOut.model_validate(user)


@router.post("/logout")
def logout(response: Response, current_user: models.User = Depends(get_current_user)):
    response.delete_cookie("session_id")
    return {"message": "ログアウトしました"}


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/change_password")
def change_password(
    body: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not bcrypt.checkpw(body.current_password.encode(), current_user.hashed_password.encode()):
        raise HTTPException(status_code=400, detail="現在のパスワードが正しくありません")
    if len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="新しいパスワードは4文字以上にしてください")
    current_user.hashed_password = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    db.commit()
    return {"message": "パスワードを変更しました"}
