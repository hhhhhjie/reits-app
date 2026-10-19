FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev
COPY . .
ENV EXPO_NO_TELEMETRY=1
RUN npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm", "run", "serve"]
