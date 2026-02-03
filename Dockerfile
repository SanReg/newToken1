FROM node:18-bullseye-slim

# Install Chromium and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates wget gnupg fonts-liberation libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libasound2 libatk1.0-0 libgtk-3-0 libnss3 libxss1 libpangocairo-1.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Tell Puppeteer to skip downloading Chromium and use system Chromium instead
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000
ENV PORT=3000

CMD ["npm", "start"]
