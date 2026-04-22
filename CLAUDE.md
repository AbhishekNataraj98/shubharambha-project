# Shubharambha — Project Context

## What this app is
Construction project management platform for Indian market.
Replaces WhatsApp communication between contractors and customers.
Features: project tracking, daily photo updates, payment ledger,
contractor discovery, materials marketplace.

## Tech stack
- Next.js 15 App Router + TypeScript strict mode
- Supabase (Postgres + Auth + Realtime + Storage)
- Tailwind CSS + shadcn/ui components
- React Hook Form + Zod validation
- Cloudinary for photo storage
- Supabase phone auth for SMS OTP (test OTP: 123456)

## User roles
- customer — hires contractors, views updates, confirms payments
- contractor — posts updates, logs payments, manages projects
- worker — trade professional (mason, plumber, electrician etc.)
- supplier — lists building materials in marketplace

## Critical conventions
- Phone numbers always stored as +91XXXXXXXXXX (E.164 format)
- All money in Indian Rupees stored as numeric, display with ₹
- UUIDs for all primary keys — never integer IDs
- RLS enabled on every Supabase table — always check policies
- Zod validation on every API route before any DB operation
- Never expose phone numbers until enquiry is accepted
- Images compressed to under 500KB before Cloudinary upload
- Always use server client for API routes, browser client for components

## Supabase clients
- Browser/components: import { createClient } from '@/lib/supabase/client'
- Server/API routes: import { createClient } from '@/lib/supabase/server'

## Database tables
users, contractor_profiles, worker_profiles, projects,
project_members, milestones, daily_updates, messages,
payments, payment_confirmations, reviews, enquiries,
shops, products

## Folder structure
src/app/(auth)/     → login, role-select, profile-setup
src/app/(app)/      → all authenticated screens
src/app/api/        → all API routes
src/components/     → ui/, auth/, projects/, payments/, chat/
src/lib/supabase/   → client.ts + server.ts
src/types/          → supabase.ts (auto-generated) + database.ts
supabase/migrations/ → SQL migration files

## shadcn/ui components installed
Button, Input, Card, Tabs, Sheet, Dialog, Badge, Avatar, Progress, Toast

## Brand
Primary color: orange #E8590C  →  Tailwind: bg-orange-500
App name: Shubharambha
Tagline: Construction made transparent

## Build status
- [x] Project scaffold
- [x] Supabase schema deployed (14 tables)
- [x] TypeScript types generated
- [x] SMS OTP auth flow (login page + 2 API routes)
- [x] Middleware protecting routes
- [ ] Role selection screen
- [ ] Profile setup screen
- [ ] Project dashboard
- [ ] Daily updates feed
- [ ] Payment ledger
- [ ] Chat (Supabase Realtime)
- [ ] Contractor discovery + ratings
- [ ] Materials marketplace