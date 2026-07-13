FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY prisma ./prisma
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/db" npx prisma generate

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "docker-start"]
