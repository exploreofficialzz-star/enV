# Dedicated private worker for strictly bounded World Lab scientific jobs.
# No user upload execution, public listener, or exposed HTTP port.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
COPY tsconfig.json ./tsconfig.json
USER node
CMD ["npm", "run", "world-lab:worker"]
