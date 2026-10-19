# Bibler — Agent Guidance

Bibler provides Christian service planning, sermon development, and interactive study group tools for faith and worship leaders using scripture-backed AI and preferred bible translations, worship music libraries, and source content.

## Project Aims

Provide accurate translations to English from original Greek, Hebrew, and Aramaic materials, with indexed scripture search and comparison. Build reliable, bible-based resources for individual study and guidance, and collaboration tools for groups and leaders planning studies around specific topics.

## Architecture and Commands

- `core/`: browser-safe shared TypeScript models, DTOs, permissions, and streaming contracts (`bibler-core`).
- `server/`: strict TypeScript ESM, Express, Prisma 7.10, PostgreSQL 18 (`bibler-server`).
- `ui/`: Angular 22 and Bootstrap (`bibler-ui`).
- Use Node 26, npm workspaces, and the root lockfile. Run installation only at the root. Build core before consumers.
- `npm ci`, `npm run build`, `npm run typecheck`, and `npm test` are the normal checks. Database integration checks use `npm run test:integration` against isolated PostgreSQL databases.
- `npm run docker:up` starts development infrastructure; `npm run start:server` and `npm run start:ui` run host processes on ports 3000 and 4200.
- Active builds, tests, images, and deployment operate only on the three npm workspaces. Keep unrelated archived files outside their contexts.
- The sibling `../bible_databases` checkout is externally maintained and strictly read-only. Never modify its files. Import content only through the explicit database import command.
- REST uses `/api`, camelCase JSON fields, kebab-case route segments, and UUID identifiers. Preserve enum values and the independent `/mcp` contract.
- Database startup verifies/adopts the supported version 4 application schema and applies migrations under a database advisory lock. Never add implicit seeding, account resets, or scripture imports to startup.
- Preserve physical database names, native types, constraints, indexes, UUID defaults, and timestamp precision through Prisma mappings and catalog verification.
- AI work is request-bound; imports are explicit CLI operations. Keep provider secrets and Prisma dependencies out of core and UI.

## Bibler AI Rules

Incorporation of AI into the Bibler application stack must STRICTLY follow these rules:

- NEVER MAKE UP SCRIPTURE, VERSES, BOOKS, CITATIONS, OR ANY FORM OF BIBLICAL CONTENT. Only content from the database should be used in creating biblical quotations, citations, and as input to LLM processes. Accuracy is CRITICAL.
- Always strongly adhere to biblical commandments. Avoid interpretations not firmly rooted in citable biblical text.
- Prioritize correctness over politeness. Tell the user how it is according to the bible. Do not worry about appeasing what the user wants you to say.
- NEVER change biblical truth to avoid offending anyone. Be polite, but NEVER compromise the integrity of biblical adherence for the sake of political correctness.
- If you don't know an answer, say so. It is ok to make your best educated interpretations so long as you (1) always state what you are doing, and (2) anchor all such interpretations in scripture from the database.


# Angular & Bootstrap Best Practices

## Project Context

- **Frontend**: Angular with Bootstrap
- **Server**: TypeScript/Express backend in `server/`
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
