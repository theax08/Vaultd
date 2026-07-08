FROM node:20-alpine

ARG CACHE_BUST=1

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps --include=dev \
	&& npm install vite@6.4.3 --no-save \
	&& node -e "import('vite').then(()=>console.log('vite available'))"

COPY prisma ./prisma
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/db" npx prisma generate

COPY . .
RUN echo "cache-bust=${CACHE_BUST}" \
	&& npm install vite@6.4.3 --no-save --legacy-peer-deps \
	&& node -e "import('vite').then(()=>console.log('vite available before build'))" \
	&& npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
