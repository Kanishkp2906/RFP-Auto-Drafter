import logging
from pydantic import EmailStr
from fastapi import APIRouter, HTTPException, Depends
from dependencies import get_supabase, get_admin_db
from supabase import Client
from auth import get_current_user, get_user_db
from schemas import UserSignUp, UserSignIn, UserResponse, PasswordUpdate
from services.cache import set_cache, get_cache, delete_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/users", tags=["User"])


@router.post("/signup")
async def signup(payload: UserSignUp, db: Client = Depends(get_supabase)):
    try:
        auth_response = db.auth.sign_up(
            {
                "email": payload.email,
                "password": payload.password,
                "options": {"data": {"username": payload.username}},
            }
        )

        return {"message": "User created", "user_id": auth_response.user.id}

    except Exception as error:
        logger.exception(f"[-] Error in user sign up: {str(error)}")
        raise HTTPException(status_code=400, detail=str(error))


@router.post("/signin")
async def signin(payload: UserSignIn, db: Client = Depends(get_supabase)):

    try:
        response = db.auth.sign_in_with_password(
            {"email": payload.email, "password": payload.password}
        )

        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "user": response.user.model_dump(),
        }

    except Exception as error:
        logger.exception(f"[-] Error in user sign in: {str(error)}")
        raise HTTPException(status_code=401, detail=str(error))


@router.get("/profile", response_model=UserResponse)
async def user_profile(
    current_user=Depends(get_current_user), db: Client = Depends(get_user_db)
):
    try:
        cache_profile = await get_cache(f"profile:{current_user.id}")

        if cache_profile is not None:
            return cache_profile

        user_response = (
            db.table("users").select("*").eq("id", current_user.id).execute()
        )

        if not user_response.data:
            raise HTTPException(status_code=404, detail="User profile not found.")

        await set_cache(f"profile:{current_user.id}", user_response.data[0], 600)

        return user_response.data[0]

    except HTTPException:
        raise

    except Exception as error:
        logger.exception(f"[-] Error in retrieving profile: {str(error)}")
        raise HTTPException(status_code=503, detail=str(error))


@router.delete("/profile-delete", response_model=UserResponse)
async def profile_delete(
    current_user=Depends(get_current_user), admin_db: Client = Depends(get_admin_db)
):
    try:
        user_response = (
            admin_db.table("users").select("*").eq("id", current_user.id).execute()
        )

        if not user_response.data:
            raise HTTPException(status_code=404, detail="User not found.")

        await delete_cache(f"profile:{current_user.id}")

        admin_db.auth.admin.delete_user(current_user.id)

        return user_response.data[0]

    except Exception as error:
        logger.exception(f"[-] Error in deleting profile: {str(error)}")
        raise HTTPException(status_code=503, detail=str(error))


@router.patch("/update-username", response_model=UserResponse)
async def update_username(
    new_username: str,
    current_user=Depends(get_current_user),
    db: Client = Depends(get_user_db),
):

    try:
        user_response = (
            db.table("users").select("id").eq("id", current_user.id).execute()
        )

        if not user_response.data:
            raise HTTPException(status_code=404, detail="User not found.")

        update_response = (
            db.table("users")
            .update({"username": new_username})
            .eq("id", current_user.id)
            .execute()
        )

        await delete_cache(f"profile:{current_user.id}")
        await set_cache(f"profile:{current_user.id}", update_response.data[0], 600)

        return update_response.data[0]

    except Exception as error:
        logger.exception(f"[-] Error in updating username: {str(error)}")
        raise HTTPException(status_code=503, detail=str(error))


@router.patch("/update-email", response_model=UserResponse)
async def update_email(
    new_email: EmailStr,
    current_user=Depends(get_current_user),
    admin_db: Client = Depends(get_admin_db),
):
    try:
        user_response = (
            admin_db.table("users").select("*").eq("id", current_user.id).execute()
        )

        if not user_response.data:
            raise HTTPException(status_code=404, detail="User not found.")

        update_response = admin_db.auth.admin.update_user_by_id(
            current_user.id, {"email": new_email}
        )

        await delete_cache(f"profile:{current_user.id}")
        await set_cache(f"profile:{current_user.id}", update_response.data[0], 600)

        return user_response.data[0]

    except Exception as error:
        logger.exception(f"[-] Error in updating email: {str(error)}")
        raise HTTPException(status_code=503, detail=str(error))


@router.patch("/update-password")
async def update_password(
    new_password: PasswordUpdate,
    current_user=Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    try:
        db.auth.admin.update_user_by_id(
            current_user.id, {"password": new_password.password}
        )
        return {"status": 200, "detail": "Password updated successfully."}

    except Exception as error:
        logger.exception("[-] Error in updating the user password.")
        raise HTTPException(status_code=503, detail=str(error))
