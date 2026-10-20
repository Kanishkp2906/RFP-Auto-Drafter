import shutil
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, status
from auth import get_current_user, get_user_db, get_user_storage
from schemas import DocumentResponse, UploadStatus, UploadResponse, FailedFiles
from typing import List, Tuple
from supabase import Client
from dependencies import get_datetime
from vector_script import document_vectorizer
from rq import Retry, Queue
from redis import Redis
from services.cache import get_cache, set_cache, delete_cache


sync_redis_client = Redis(host="localhost", port="6379", decode_responses=True)
queue = Queue(connection=sync_redis_client)


router = APIRouter(prefix="/api/documents", tags=["Documents"])

Base_dir = Path(__file__).resolve().parent.parent
Upload_dir = Base_dir / "uploaded_docs"
Upload_dir.mkdir(parents=True, exist_ok=True)

ALLOWED_FILE_TYPES = {"application/pdf"}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def vectorize_documents(
    document: UploadFile,
    destination_path: Path,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
) -> None:
    # try:
    queue.enqueue(
        document_vectorizer,
        str(destination_path),
        str(user_id),
        str(document_id),
        document.filename,
        retry=Retry(max=5, interval=[10, 30, 120, 900, 43200]),
    )


def check_existing_files(
    documents: List[UploadFile], user_id: uuid.UUID, db: Client
) -> Tuple[List[UploadFile], List[DocumentResponse], List[FailedFiles]]:

    existing_files, new_documents, failed_files = [], [], []

    for document in documents:
        existing_file = (
            db.table("documents")
            .select("*")
            .eq("user_id", user_id)
            .eq("filename", document.filename)
            .execute()
        )

        if existing_file.data:
            upload_status = existing_file.data[0]["upload_status"]

            if upload_status == UploadStatus.done.value:
                existing_files.append(existing_file.data[0])

            elif upload_status == UploadStatus.processing.value:
                existing_files.append(existing_file.data[0])

            elif upload_status == UploadStatus.failed.value:
                destination_path = Upload_dir / existing_file.data[0]["saved_filename"]
                document_id = existing_file.data[0]["id"]
                try:
                    db_response = (
                        db.table("documents")
                        .update({"upload_status": "queued"})
                        .eq("id", existing_file.data[0]["id"])
                        .execute()
                    )
                    vectorize_documents(
                        document, destination_path, user_id, document_id
                    )
                    existing_files.append(db_response.data[0])
                except Exception:
                    db.table("documents").update(
                        {"upload_status": UploadStatus.failed.value}
                    ).eq("id", document_id).execute()
                    failed_files.append(
                        {
                            "reason": "File queuing for vectorization failed.",
                            "filename": document.filename,
                        }
                    )
        else:
            new_documents.append(document)

    return new_documents, existing_files, failed_files


async def upload_files(
    documents: List[UploadFile], user_id: uuid.UUID, db: Client, storage_db: Client
) -> Tuple[List[DocumentResponse], List[FailedFiles]]:
    db_responses = []
    failed_files = []
    for document in documents:
        extension = Path(document.filename).suffix
        unique_filename = f"{uuid.uuid4()}{extension}"
        destination_path = Upload_dir / unique_filename
        storage_path = f"{user_id}/{unique_filename}"

        try:
            file_bytes = await document.read()

            storage_db.from_("rfp_document").upload(
                storage_path, file_bytes, {"content-type": "application/pdf"}
            )

            await document.seek(0)

            with destination_path.open("wb") as buffer:
                shutil.copyfileobj(document.file, buffer)

        except Exception as e:
            print(f"Error in uploading the file '{document.filename}': {str(e)}")
            failed_files.append(
                {"reason": "File upload failed.", "filename": document.filename}
            )
            continue

        finally:
            await document.close()

        db_file = {
            "filename": document.filename,
            "saved_filename": unique_filename,
            "user_id": user_id,
            "upload_status": UploadStatus.queued.value,
            "created_at": get_datetime(),
            "storage_path": storage_path,
        }

        try:
            db_response = db.table("documents").insert(db_file).execute()

        except Exception as error:
            # if not db_response.data:
            print(f"Error in inserting file: {str(error)}")
            failed_files.append(
                {"reason": "Database insert failed.", "filename": document.filename}
            )
            continue

        document_id = db_response.data[0]["id"]

        try:
            vectorize_documents(document, destination_path, user_id, document_id)
            db_responses.append(db_response.data[0])
        except Exception:
            db.table("documents").update(
                {"upload_status": UploadStatus.failed.value}
            ).eq("id", document_id).execute()
            failed_files.append(
                {
                    "reason": "File queuing for vectorization failed.",
                    "filename": document.filename,
                }
            )

    await delete_cache(f"documents:{user_id}")

    db_documents = db.table("documents").select("*").eq("user_id", user_id).execute()

    if db_documents.data:
        await set_cache(f"documents:{user_id}", db_documents.data, 600)

    return db_responses, failed_files


@router.post(
    "/uploads", response_model=UploadResponse, status_code=status.HTTP_202_ACCEPTED
)
async def document_upload(
    documents: List[UploadFile],
    current_user=Depends(get_current_user),
    db: Client = Depends(get_user_db),
    storage_db: Client = Depends(get_user_storage),
):
    if len(documents) > 5:
        raise HTTPException(
            status_code=400, detail="Maximum 5 files allowed at a time."
        )

    valid_documents = []
    failed_files = []

    for document in documents:
        if document.content_type not in ALLOWED_FILE_TYPES:
            failed_files.append(
                {"reason": "Document is not a pdf.", "filename": document.filename}
            )
            continue

        document.file.seek(0, 2)
        document_size = document.file.tell()

        if document_size > MAX_FILE_SIZE:
            failed_files.append(
                {
                    "reason": "Document is bigger than 10MBs.",
                    "filename": document.filename,
                }
            )
            continue

        document.file.seek(0)
        valid_documents.append(document)

    new_documents, existing_files, existing_failed_files = check_existing_files(
        valid_documents, current_user.id, db
    )

    if new_documents:
        db_responses, new_failed_files = await upload_files(
            new_documents, current_user.id, db, storage_db
        )
    else:
        db_responses, new_failed_files = [], []

    if existing_failed_files:
        failed_files.extend(existing_failed_files)

    if new_failed_files:
        failed_files.extend(new_failed_files)

    upload_response = {
        "queued": db_responses,
        "already_exists": existing_files,
        "failed": failed_files if failed_files else [],
    }

    return upload_response


@router.delete("/delete", response_model=DocumentResponse)
async def delete_file(
    file_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: Client = Depends(get_user_db),
    storage_db: Client = Depends(get_user_storage),
):

    try:
        file = (
            db.table("documents")
            .select("*")
            .eq("id", file_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not file.data:
            raise HTTPException(status_code=404, detail="File does not exists.")

        db_response = (
            db.table("documents")
            .delete()
            .eq("id", file_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        await delete_cache(f"documents:{current_user.id}")

        db_documents = (
            db.table("documents").select("*").eq("user_id", current_user.id).execute()
        )

        if db_documents.data:
            await set_cache(f"documents:{current_user.id}", db_documents.data, 600)

        return db_response.data[0]

    except HTTPException:
        raise

    except Exception as error:
        print(f"Error occured in delete route: {str(error)}")
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/user_files", response_model=List[DocumentResponse])
async def user_files(
    current_user=Depends(get_current_user), db: Client = Depends(get_user_db)
):
    try:
        cached_documents = await get_cache(f"documents:{current_user.id}")

        if cached_documents is not None:
            return cached_documents

        db_response = (
            db.table("documents").select("*").eq("user_id", current_user.id).execute()
        )

        if db_response.data:
            await set_cache(f"documents:{current_user.id}", db_response.data, 600)

        return db_response.data

    except Exception as error:
        print(f"Error in getting the user files: {str(error)}")
        raise HTTPException(status_code=500, detail=str(error))
