FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY build.mjs ./
COPY src/ ./src/
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /src/rescue-squad-3d.html /usr/share/nginx/html/index.html
EXPOSE 8080
