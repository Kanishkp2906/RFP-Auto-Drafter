import uuid
import re
from pathlib import Path
from schemas import UploadStatus
import pymupdf4llm
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from supabase import Client, create_client
from config import supabase_url, supabase_key


class DatabaseError(Exception):
    """Error for database connection or insert errors."""

    pass


def document_vectorizer(
    document_path: str, user_id: uuid.UUID, document_id: uuid.UUID, filename: str
):

    document_path = Path(document_path)

    try:
        db: Client = create_client(supabase_url, supabase_key)

        db_response = (
            db.table("documents")
            .update({"upload_status": UploadStatus.processing.value})
            .eq("id", document_id)
            .execute()
        )

        if not db_response.data:
            print("[+] Error in updating the file status to processing.")
            raise DatabaseError("Error in updating the file status to processing.")

        pdf_sections = get_pdf_sections(document_path)

        embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, chunk_overlap=100
        )

        chunks = []
        chunk_index = 0

        for heading, content in pdf_sections.items():
            if not content.strip():
                continue

            section_chunks = text_splitter.create_documents(
                [content], metadatas=[{"section": heading}]
            )

            for chunk in section_chunks:
                chunk.metadata["chunk_index"] = chunk_index
                chunks.append(chunk)
                chunk_index += 1

        texts = [chunk.page_content for chunk in chunks]
        vectors = embeddings.embed_documents(texts)

        print("[+] Vectors generated. Uploading to supabase...")

        upload_data = []
        for i, chunk in enumerate(chunks):
            upload_data.append(
                {
                    "user_id": user_id,
                    "document_id": document_id,
                    "content": chunk.page_content,
                    "filename": filename,
                    "metadata": chunk.metadata,
                    "embeddings": vectors[i],
                }
            )

        db_response = db.table("rfp_docs").insert(upload_data).execute()
        if not db_response.data:
            raise DatabaseError("Error in inserting vector data in database.")

        db_response = (
            db.table("documents")
            .update({"upload_status": UploadStatus.done.value})
            .eq("id", document_id)
            .execute()
        )
        document_path.unlink()
        print("[SUCCESS]: Document chunks uploaded to the database.")

    except Exception as error:
        print(f"[FAILURE]: Document vecotrization failed: {str(error)}")
        db_response = (
            db.table("documents")
            .update({"upload_status": UploadStatus.failed.value})
            .eq("id", document_id)
            .execute()
        )
        raise


class PDFProcessingError(Exception):
    """Raised when PDF conversion or markdown  parsing fails."""

    pass


def get_pdf_sections(document_path: str) -> dict:
    try:
        markdown_file = pymupdf4llm.to_markdown(document_path)

        regxheader = r"^#{1,6}\s+(.+)$"

        sections = {}
        current_heading = None

        for line in markdown_file.splitlines():
            match = re.match(regxheader, line)
            if match:
                current_heading = line.strip()
                sections[current_heading] = []
            elif current_heading is not None:
                sections[current_heading].append(line)

        for heading in sections:
            sections[heading] = "\n".join(sections[heading]).strip()

        return sections

    except Exception as e:
        print(f"[+] Error occured in finding sections of pdf: {str(e)}")
        raise PDFProcessingError("Error occured while converting the pdf to markdown.")
