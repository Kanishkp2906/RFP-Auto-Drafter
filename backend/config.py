from dotenv import load_dotenv
import os

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
gemini_api_key = os.getenv("GEMINI_API_KEY")
groq_api_key = os.getenv("GROQ_API_KEY")
supabase_db_uri = os.getenv("SUPABASE_DIRECT_URI")
gemini_model = os.getenv("GEMINI_MODEL")
qdrant_url = os.getenv("QDRANT_URL")
qdrant_api_key = os.getenv("QDRANT_API_KEY")
redis_url = os.getenv("REDIS_URL")
groq_model = os.getenv("GROQ_MODEL")
groq_model2 = os.getenv("GROQ_MODEL2")
embedding_model = os.getenv("EMBEDDING_MODEL")
frontend_url = os.getenv("FRONTEND_URL")
