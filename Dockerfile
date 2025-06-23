## WARNING: This Dockerfile is ONLY FOR DEPLOYMENT ON RAILWAY and WILL EMBED
## SECRET API TOKENS IN THE IMAGE.
## Don't use this for building public images

# Use an official Deno image.
FROM denoland/deno:2.3.5

# Embed env vars into image (required for Railway)
ARG DB_CONNECTION_STRING
ARG DRIPS_GQL_API_URL
ARG DRIPS_GQL_API_KEY

ARG JWT_SECRET
ARG JWT_EXPIRATION_MINUTES

# Set the working directory in the container
WORKDIR /app
COPY . .

# Cache dependencies. Deno will use deno.json automatically.
# Copy deno.json first so this layer is cached if only source files change.
RUN deno cache main.ts

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
# Deno uses deno.json automatically for import maps.
# Permissions are still needed.
CMD ["deno", "task", "start"]
