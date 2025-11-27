FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json yarn.lock* .npmrc* ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 80
CMD ["npm", "start"]
