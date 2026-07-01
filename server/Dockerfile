FROM node:lts-alpine AS web-builder

WORKDIR /web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM node:lts-alpine

WORKDIR /usr/src/server

COPY package*.json ./
RUN yarn install

COPY . .
COPY --from=web-builder /web/dist ./web/dist

RUN yarn build

EXPOSE 3001

CMD ["yarn", "start"]
