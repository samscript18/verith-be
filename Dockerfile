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
ARG VCS_REF=unknown
ENV NODE_ENV=production
WORKDIR /app
LABEL org.opencontainers.image.title="Verith Backend" \
  org.opencontainers.image.description="Verith NestJS API, worker, and scheduler runtime" \
  org.opencontainers.image.revision=$VCS_REF
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
STOPSIGNAL SIGTERM
CMD ["npm", "run", "start:prod"]
