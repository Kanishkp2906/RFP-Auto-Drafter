![](https://github.com/[Kanishkp2906]/[RFP-Auto-Drafter]/blob/[main]/RFPAutoDrafter.png?raw=true)
RFP Auto Drafter is an AI-powered service for Request for Proposal (RFP) analysis. Users upload RFP documents and chat with an agent that answers questions while citing the exact document sections it draws on — turning static RFPs into queryable, source-grounded knowledge.

## Service

RFP document ingestion plus RAG-based Q&A chat with per-answer source citations, user account/session management, and threaded chat history.

## Backend

FastAPI (Python) REST API with LangGraph agent orchestration, PostgreSQL checkpoints via Supabase, RAG over uploaded RFP documents, Redis rate limiting, and background jobs via RQ.

Stack: FastAPI · LangGraph · Supabase (PostgreSQL + Auth) · Redis · RQ · SQLAlchemy · Pydantic

Routes: `/v1/users`, `/v1/files`, `/v1/sessions`, `/v1/rag`

## Frontend

React + Vite + TypeScript SPA with a theme-aware UI (light/dark), Radix UI primitives, MUI, Emotion, Tailwind CSS, Supabase JS client, and sonner toasts.

Stack: React · Vite · TypeScript · Radix UI · Supabase JS · Tailwind

## Features

- Source-cited answers — every response references the RFP sections it used
- Dual light/dark theme with design tokens throughout
- Multi-turn chats with session persistence and rename/pin/delete
- Rate-limited, auth-gated API; document upload with full-text PDF parsing

## System Design

![](https://github.com/[Kanishkp2906]/[RFP-Auto-Drafter]/blob/[main]/rfp_final.svg?raw=true)
