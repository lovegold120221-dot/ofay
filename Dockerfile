FROM node:22-alpine

WORKDIR /app

# Install native dependencies for some node modules (like puppeteer/canvas if needed)
RUN apk add --no-cache python3 make g++ chromium

# Environment variables for puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm install

COPY . .

# Expose Vite port (3000) and API port (if any, typically 3001)
EXPOSE 3000 3001

USER node

CMD ["npm", "run", "dev:full"]
