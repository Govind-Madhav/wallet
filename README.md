# DBT Project Wallet

**Intern ID:** CT-4008

A full-stack wallet application with modular authentication and wallet engines.

## Tech Stack
- Backend: Node.js, Express, MySQL
- Frontend: React + Vite
- Auth: JWT, refresh flow, email verification support

## Prerequisites
- Node.js 20+ (LTS recommended)
- npm
- MySQL 8+

## Environment Setup
1. Copy .env.example to .env
2. Update values in .env, especially:
- DATABASE_URL
- JWT_SECRET

Example DATABASE_URL format:

mysql://root:your_password@127.0.0.1:3306/WalletDB

## Install and Database Setup (One Command)
From the project root, run:

npm run setup

This command will:
- Install dependencies in all project package locations
- Create the database if it does not exist
- Initialize database schema

## Manual Setup (Optional)
If you prefer separate steps:

1. Install all dependencies:

npm run install:all

2. Create and initialize the database:

npm run db:setup

## Run the Project
Open two terminals from the project root.

1. Start backend:

npm run dev:backend

2. Start frontend:

npm run dev:frontend

## URLs
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Useful Scripts
- npm run setup
- npm run install:all
- npm run db:setup
- npm run test
- npm run test:sql

## Notes
- .env is ignored by git and should never be committed.
- .env.example is safe to share.
