# 💦 Drips RetroPGF Service

This is the backend service for handling Retroactive Public Goods Funding (RPGF) related functionality for the Drips application. It is built with Deno, Oak, PostgreSQL, and uses SIWE for Ethereum-based authentication.

## Features

*   **Authentication:** Uses Sign-In with Ethereum (SIWE) for secure user authentication.
*   **User Management:** Manages user data and authentication status.
*   **Rounds Management:** Handles the creation, updating, and retrieval of RPGF rounds.
*   **Applications Management:** Allows users to submit and manage applications for RPGF rounds.
*   **Ballot Management:** Supports the creation and management of ballots for voting on applications.
*   **Results Calculation:** Calculates and provides the results of RPGF rounds.
*   **KYC Integration:** Manages KYC processes for users and applications.
*   **Audit Logging:** Logs all significant actions for transparency and security.
*   **Database:** Uses PostgreSQL with Drizzle ORM for data persistence.

## Prerequisites

*   [Deno](https://deno.land/)
*   [Docker](https://www.docker.com/)
*   [Docker Compose](https://docs.docker.com/compose/) (if running with `docker-compose`)

## Getting Started

### Set up environment variables

Copy the example environment file and update it with your configuration:

```bash
cp .env.example .env
```

You will need to configure at least the following:

*   `DATABASE_URL`: The connection string for your PostgreSQL database.
*   `JWT_SECRET`: A secret key for signing JWTs.

If you are using the provided `docker-compose.yml`, the `DATABASE_URL` will be:
`postgresql://rpgf_user:rpgf_password@localhost:5432/rpgf_db`

### Running locally with Deno

If you prefer to run the application directly with Deno:

#### Start the PostgreSQL database:

You can use the `docker-compose.yml` to start only the database:
```bash
docker-compose up -d db
```
Or, ensure you have a PostgreSQL instance running and accessible.

#### Run database migrations:

```bash
deno task db:migrate
```

#### Configure chain parameters

The application requires a connection to at least one EVM chain in order to run.
Chain connection data is stored in the DB's `chains` table.

To add a new chain, you'll need the following:

- `chainId`: The canonical chain ID as a number (from e.g. chainlist.org)
- `gqlName`: The name of the chain on the Drips GQL API (e.g. `SEPOLIA` for Ethereum Sepolia)
- `rpcUrl`: A read-only RPC, no archive access necessary.
- Optionally: EAS setup. If any of the following arguments are not provided, the server will NOT require attestation of applications on-chain.
    - `easAddress`: The address of the `EAS` contract on the given chain.
    - `applicationAttestationSchemaUID`: The EAS schema ID for Drips RPGF Application attestations.
    - `applicationReviewAttestationSchemaUID`: The EAS schema ID for Drips RPGF Application Review attestations.

To configure new chain data, you can use the `deno task configure-chain` command:

```bash
deno task configure-chain <chainId> <gqlName> <rpcUrl> <easAddress>? <applicationAttestationSchemaUID>? <applicationReviewAttestationSchemaUID>?
```

Alternatively, configure your chain manually directly in the DB using e.g. Drizzle Studio. The expected format of the `attestation_setup` jsonb column is (example values for Ethereum Sepolia):

```json
{
  "easAddress": "0xC2679fBD37d54388Ce493F1DB75320D236e1815e",
  "applicationAttestationSchemaUID": "0x25a8c6ffa87828916a104ebfa37aaced5c52122d6879d1edac2f883cbbb721bd",
  "applicationReviewAttestationSchemaUID": "0xabe47ff1d4447fadc354ef5b53f009274d619af17b518b7fbfdd7fb4f1705c74"
}
```

#### Start the application:

```bash
deno task start
```
For development with auto-reloading on file changes:
```bash
deno task dev
```

## API Endpoints

The application exposes the following main sets of API endpoints:

*   `/api/health`: Health check endpoint.
*   `/api/auth`: Authentication related endpoints (e.g., SIWE challenge, login, logout, refresh token).
*   `/api/users`: User-related endpoints (e.g., retrieving user data).
*   `/api/rounds`: Endpoints for managing RPGF rounds, including admins, voters, and applications.
*   `/api/kyc`: Endpoints for managing KYC processes.
*   `/api/audit-logs`: Endpoints for retrieving audit logs.

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
