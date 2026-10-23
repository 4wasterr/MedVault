FROM node:24-alpine AS frontend
WORKDIR /app/frontend/client
COPY frontend/client/package*.json ./
RUN npm ci
COPY frontend/client ./
COPY frontend/pages /app/frontend/pages
COPY frontend/shared /app/frontend/shared
RUN npm run build

FROM node:24-alpine AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app/frontend/server
COPY frontend/server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node frontend/server/src ./src
COPY --chown=node:node frontend/server/scripts ./scripts
COPY --chown=node:node frontend/shared /app/frontend/shared
COPY --from=frontend /app/frontend/client/dist /app/frontend/client/dist
RUN mkdir -p data && chown node:node data && chmod 700 data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health',{headers:{'X-Forwarded-Proto':'https'}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
