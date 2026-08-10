FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Use non-root user
USER node

# Expose port
EXPOSE 3004

# Start server
CMD ["node", "server.js"]