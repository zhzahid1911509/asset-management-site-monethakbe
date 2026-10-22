FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm cache clean --force
COPY src ./src
COPY scripts/scanner-gateway.ts ./scripts/scanner-gateway.ts
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "scripts/scanner-gateway.ts"]
