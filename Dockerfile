FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY build.mjs ./
COPY src/ ./src/
COPY tools/ ./tools/
RUN npm test && npm run build:hosted

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /src/build/site/ /usr/share/nginx/html/
EXPOSE 8080
