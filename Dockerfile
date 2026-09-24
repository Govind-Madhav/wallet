# Stage 1: Build the frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Setup the backend runtime
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY backend/src/auth-engine/package*.json ./backend/src/auth-engine/
RUN npm install --omit=dev
RUN npm --prefix backend install --omit=dev
RUN npm --prefix backend/src/auth-engine install --omit=dev
COPY backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "backend/src/server.js"]
