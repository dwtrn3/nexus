FROM node:20-alpine

WORKDIR /app

# Install dependencies for Baileys (canvas, etc.)
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev jpeg-dev giflib-dev

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Sessions directory for WhatsApp personal
RUN mkdir -p sessions

EXPOSE 3001

CMD ["node", "src/index.js"]
