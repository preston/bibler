# Bibler Server

A open source RESTful web service API with MCP AI support for multi-lingual translations of the Christian bible, built with Rails and PostgreSQL.

Included data import utilities load the entire the [Bible Databases](https://github.com/scrollmapper/bible_databases/) project, which you must clone locally.

# Developer Quick Start

```sh
# Set your database URL
export BIBLER_SERVER_DATABASE_URL="postgresql://bibler:password@localhost:5432/bibler_development"
# Set path to local clone of bible data project
export BIBLER_SERVER_BIBLE_DATABASES_PATH=../bible_databases

bundle install # Install ruby dependencies.
rake db:migrate # Create the database
rake bibler:import[../bible_databases] # Load bible data project. Will take a while.
rails s # Run the server.
```

The server will be running at http://localhost:3000

# Deployment

Bibler Server is a bible study API provided as a Rails application, and is pre-built and distributed via [Docker Hub](https://hub.docker.com/r/p3000/bibler-server).

See Bibler UI for the web frontend:
 * GitHub: https://github.com/preston/bibler-ui
 * Docker Build: https://hub.docker.com/r/p3000/bibler-ui


# Building

Custom Bibler Server distributions can be build with Docker or compatible build systems. To build,

```docker buildx build --platform linux/arm64,linux/amd64 -t p3000/bibler-server:latest . --push```

To run it:

```sh
docker run -it --rm -p 8080:3000 --name bibler-server \
-e "BIBLER_SERVER_DATABASE_URL=postgresql://bibler:password@192.168.1.191:5432/bibler_development" \
-e "BIBLER_SERVER_SECRET_KEY_BASE=super_secret" \
-e "BIBLER_SERVER_MIN_THREADS=4" \
p3000/bibler-server:latest
```

To load the database, clone the [Bible Databases](https://github.com/scrollmapper/bible_databases/) project locally and run:

```sh
rake bibler:import[/path/to/bible_databases]
```

# MCP (Model Context Protocol) Support

Bibler server supports Model Context Protocol (MCP), allowing AI agents to discover and use it as research tool.

## Testing with MCP Inspector

Use the official MCP Inspector tool to test and debug the MCP server:

1. Start the Bibler server:
   ```bash
   rails s
   ```

2. In a separate terminal, run the MCP Inspector with increased timeout:
   ```bash
   MCP_SERVER_REQUEST_TIMEOUT=30000 npx @modelcontextprotocol/inspector
   ```
   
   Or use the Inspector's direct connection mode:
   ```bash
   npx @modelcontextprotocol/inspector --url http://localhost:3000/mcp
   ```

3. The Inspector UI should open in your web browser.

4. If connecting manually in the UI:
   - **Transport**: Streamable HTTP (or HTTP Stream)
   - **URL**: `http://localhost:3000/mcp`
   - **Connection Type**: Direct
   - **No authentication required** - the server accepts requests without auth headers

5. Use the Inspector to:
   - View available tools in the Tools tab
   - Test tool calls with different parameters
   - Monitor server responses and notifications
   - Debug protocol-level issues

**Configuration Tips**:
- **IMPORTANT**: The Inspector may have a shorter default timeout than expected
- **Increase the timeout in the Inspector UI**: Click "Configuration" → "Request Timeout" → Set to at least 5000ms (5 seconds) or as appropriate for your context
- For direct connections, ensure CORS is properly configured (already set in this server)
- The Inspector will establish both a GET SSE connection (announcement channel) and POST requests (command channel)
- No authentication is required - the server accepts requests without auth headers

## Available MCP Tools

- `search_verses`: Search for verses by text query
- `get_verse`: Get a specific verse by reference
- `get_chapter`: Get all verses in a chapter
- `list_books`: List books in a bible
- `list_bibles`: List available bible translations
- `get_book_info`: Get information about a specific book
- `list_languages`: List all distinct language codes and their human-readable names

## MCP Endpoint

The MCP endpoint is available at: `POST /mcp`

For streaming responses: `GET /mcp` (SSE)

# Attribution

Author: Preston Lee
