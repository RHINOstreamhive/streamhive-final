# simple Node Dockerfile (adapt per service later)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=optional
COPY . .
CMD ["npm","run","start"]
