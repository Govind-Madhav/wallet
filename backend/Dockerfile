FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY backend/src/auth-engine/package*.json ./backend/src/auth-engine/

RUN npm install
RUN npm --prefix backend install
RUN npm --prefix backend/src/auth-engine install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
