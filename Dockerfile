FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin ./bin
ENTRYPOINT ["node", "bin/3dassets-mcp.js"]
