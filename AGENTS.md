# Bibler UI — Agent Guidance

Bibler provides Christian service planning, sermon development, and interactive study group tools for faith and worship leaders using scripture-backed AI and your preferred bible translations, worship music library, and source content.

## Project Aims

Bibler aims to provide a comprehensive Christian web-based platform rooted in accurate translations to English from original materials mainly written in Greek, Hebrew, and Aramaic. The core database provides basic text search and comparison tools that ground the AI in scripture.

The ultimate goal is to provide reliable, bible-based resources firmly rooted in scripture for both individual study and guidance, as well as easy-to-use collaboration tools for bible study groups and leaders to create study plans around specific topics.

## Architecture & Source Code Projects

Bibler is composed of three tiers:

* Bibler UI (this project) - A frontend application to Bibler Server
* Bibler Server (in `../bibler-server`) - Rails backend application over a PostgreSQL database
* PostgreSQL - Relational database that stores indexed and searchable bible content
* Bible Content Databases (external project cloned in `../bible_databases`) - Externally-maintained git project of data files that is loaded into the Bibler Postgres database. Treat this project as read-only and NEVER change any files in that project directory

## Bibler AI Rules

Incorporation of AI into the Bibler application stack must STRICTLY follow these rules:

- NEVER MAKE UP SCRIPTURE, VERSES, BOOKS, CITATIONS, OR ANY FORM OF BIBLICAL CONTENT. Only content from the database should be used in creating biblical quotations, citations, and as input to LLM processes. Accuracy is CRITICAL.
- Always strongly adhere to biblical commandments. Avoid interpretations not firmly rooted in citable biblical text.
- Prioritize correctness over politeness. Tell the user how it is according to the bible. Do not worry about appeasing what the user wants you to say.
- NEVER change biblical truth to avoid offending anyone. Be polite, but NEVER compromise the integrity of biblical adherence for the sake of political correctness.
- If you don't know an answer, say so. It is ok to make your best educated interpretations so long as you (1) always state what you are doing, and (2) anchor all such interpretations in scripture from the database.

## Production Environment

The production environment is as follows:

- Bibler UI (what most users access) - https://bibler.prestonlee.com/reader
- Server API base (called from the browser by Bibler UI) - Base URL is https://bibler-server.prestonlee.com/

## Local Development and Testing

Developers typically run Bibler Server locally at http://127.0.0.1:3000 and Bibler UI at http://localhost:4200

---

# Angular & Bootstrap Best Practices

## Project Context

- **Frontend**: Angular with Bootstrap
- **Server**: Backend code located at `../bibler-server`
- **Goal**: Maintainable, simple, dependency-light codebase

## Angular Best Practices

- Use Angular CLI for all operations (generate, build, serve)
- Follow Angular style guide: components, services, models in separate directories
- Use TypeScript strict mode and proper typing
- For form inputs, prefer Bootstrap "floating" style for labels
- Prefer Angular services for data fetching over direct HTTP calls in components
- Use Angular routing for navigation
- Avoid jQuery when Angular alternatives exist (use Angular directives/event binding)
- Don't use browser alerts. Use Bootstrap modal dialogs instead.
- Don't duplicate large chunks of HTML code. Use Angular templates or reusable components instead.

## Bootstrap-First Approach

- **Always use Bootstrap classes** before writing custom CSS
- Leverage Bootstrap utilities: spacing (`mb-3`, `p-4`), display (`d-flex`, `d-none`), colors (`text-primary`, `bg-light`)
- Use Bootstrap components: `nav`, `card`, `btn`, `form-control`, `table`, etc.
- Only add custom CSS when Bootstrap cannot achieve the desired result
- Prefer Bootstrap Icons over custom icon solutions
- Use minimalistic design concepts and make sleek, simple visual design decisions.

## Minimal Custom CSS

- Keep `styles.scss` minimal - most styling should come from Bootstrap classes
- Custom CSS should be:
  - Utility classes that Bootstrap doesn't provide
  - Component-specific overrides only when necessary
  - Commented-out code should be removed, not left in place
- Avoid vendor prefixes - use standard CSS properties (Angular handles autoprefixing)

## Minimal Dependencies

- Avoid adding new npm packages unless absolutely necessary
- Prefer Angular built-ins and Bootstrap over third-party libraries
- Review existing dependencies before adding new ones
- Keep `package.json` lean and well-documented

## Maintenance Focus

- Write clear, readable code over clever solutions
- Use meaningful variable and function names
- Keep components small and focused
- Extract reusable logic into services
- Document non-obvious code decisions
- Remove dead/commented code regularly
