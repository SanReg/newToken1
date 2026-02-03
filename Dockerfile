FROM node:18-bullseye-slim

# Install dependencies needed by Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget gnupg fonts-liberation libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libasound2 libatk1.0-0 libgtk-3-0 libnss3 libxss1 libpangocairo-1.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Ensure Puppeteer cache is writable and Chromium will be installed
ENV PUPPETEER_CACHE_DIR=/tmp/puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

COPY package*.json ./
RUN npm ci --production

# Install Chromium used by Puppeteer at build time
RUN npx puppeteer browsers install chrome --with-ffmpeg || true

COPY . .

EXPOSE 3000
ENV PORT=3000

CMD ["npm", "start"]
