# 💦 Drips RetroPGF Service

Attention: This project is in active development and not yet production-ready.

This is the backend service for handling Retroactive Public Goods Funding (RPGF) related functionality for the Drips application. It is built with Deno, Oak, PostgreSQL, and uses SIWE for Ethereum-based authentication.

## Features

*   **Authentication:** Uses Sign-In with Ethereum (SIWE) for secure user authentication.
*   **Rounds Management:** Handles the creation, updating, and retrieval of RPGF rounds.
*   **Applications Management:** Allows users to submit and manage applications for RPGF rounds.
*   **Ballot Management:** Supports the creation and management of ballots for voting on applications.
*   **Results Calculation:** Calculates and provides the results of RPGF rounds.
*   **Database:** Uses PostgreSQL with Drizzle ORM for data persistence.

## Prerequisites

*   [Deno](https://deno.land/)
*   [Docker](https://www.docker.com/)
*   [Docker Compose](https://docs.docker.com/compose/) (if running with `docker-compose`)

## Getting Started

### 1. Set up environment variables

Copy the example environment file and update it with your configuration:

```bash
cp .env.example .env
```

You will need to configure at least the following:

*   `DATABASE_URL`: The connection string for your PostgreSQL database.
*   `JWT_SECRET`: A secret key for signing JWTs.

If you are using the provided `docker-compose.yml`, the `DATABASE_URL` will be:
`postgresql://rpgf_user:rpgf_password@localhost:5432/rpgf_db`

### 2. Running with Docker Compose (Recommended)

This is the easiest way to get the application and database running.

```bash
docker-compose up -d
```

This command will:
*   Build the Deno application Docker image (if not already built).
*   Start a PostgreSQL container.
*   Start the Deno application container.

The application will be accessible at `http://localhost:8000` (or the port specified in your `.env` file).

### 3. Running locally with Deno

If you prefer to run the application directly with Deno:

**a. Start the PostgreSQL database:**

You can use the `docker-compose.yml` to start only the database:
```bash
docker-compose up -d db
```
Or, ensure you have a PostgreSQL instance running and accessible.

**b. Run database migrations:**

```bash
deno task db:migrate
```

**c. Start the application:**

```bash
deno task start
```
For development with auto-reloading on file changes:
```bash
deno task dev
```

## API Endpoints

The application exposes the following main sets of API endpoints:

*   `/auth`: Authentication related endpoints (e.g., SIWE challenge, login).
*   `/rounds`: Endpoints for managing RPGF rounds.
*   `/applications`: Endpoints for managing applications to RPGF rounds.
*   `/ballots`: Endpoints for managing voting ballots.
*   `/results`: Endpoints for retrieving RPGF results.

Refer to the route definitions in `src/routes/` for detailed endpoint paths and functionalities.

## Database Management

The project uses Drizzle ORM for database interactions and migrations.

*   **Generate Migrations:** After making changes to the schema in `src/db/schema.ts`:
    ```bash
    deno task db:generate
    ```
*   **Apply Migrations:**
    ```bash
    deno task db:migrate
    ```
*   **Drizzle Studio (Database GUI):**
    ```bash
    deno task db:studio
    ```
    This will open a web interface to browse and manage your database.
