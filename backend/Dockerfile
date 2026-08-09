FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S verith && adduser -S verith -G verith
COPY --from=build --chown=verith:verith /app/node_modules ./node_modules
COPY --from=build --chown=verith:verith /app/dist ./dist
COPY --chown=verith:verith \
  scripts/create-application-indexes.mjs \
  scripts/create-catalog-indexes.mjs \
  scripts/seed-super-admin.mjs \
  scripts/seed-badges.mjs \
  scripts/seed-learning-content.mjs \
  ./scripts/
COPY --chown=verith:verith package.json ./
USER verith
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "run", "start:prod"]
