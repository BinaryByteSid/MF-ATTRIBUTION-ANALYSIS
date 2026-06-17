FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
# Add a custom nginx config for the frontend if needed, but we can also use the one in infra/nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
