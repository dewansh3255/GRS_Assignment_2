# # Use Node alpine for lightweight image
# FROM node:22-alpine

# WORKDIR /app

# # Copy package.json files
# COPY package.json package-lock.json* ./

# # Install dependencies
# # We use 'npm ci' if lockfile exists, else 'npm install'
# RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# # Copy project files
# COPY . .

# EXPOSE 5173

# # Start the app
# CMD ["npm", "run", "dev", "--", "--host"]

# Use a standard Node image
FROM node:22-alpine

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of your frontend code
COPY . .

# 🔒 Build the production app (Outputs to /app/dist)
RUN npm run build

# Install a lightweight static server globally
RUN npm install -g serve

# Serve the built 'dist' folder on port 5173
CMD ["serve", "-s", "dist", "-l", "5173"]