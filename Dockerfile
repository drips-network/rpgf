# Use an official Deno image.
FROM denoland/deno:1.40.3

# Set the working directory in the container
WORKDIR /app

# Cache dependencies. Deno will use deno.json automatically.
# Copy deno.json first so this layer is cached if only source files change.
COPY deno.json .
RUN deno cache main.ts

# Bundle the application source (after caching, to leverage Docker layer caching)
COPY . .

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
# Deno uses deno.json automatically for import maps.
# Permissions are still needed.
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "main.ts"]
