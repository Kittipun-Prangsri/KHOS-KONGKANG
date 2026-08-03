FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose server port
EXPOSE 5189

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5189

# Start command
CMD ["npm", "start"]
