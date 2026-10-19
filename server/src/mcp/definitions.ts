export const toolDefinitions = [
  {
    "name": "search_verses",
    "description": "Search for verses by text query in a specific bible translation",
    "inputSchema": {
      "type": "object",
      "properties": {
        "bible": {
          "type": "string",
          "description": "Bible UUID"
        },
        "query": {
          "type": "string",
          "description": "Text to search for in verses"
        },
        "limit": {
          "type": "integer",
          "description": "Maximum number of results (default: 100)",
          "default": 100
        }
      },
      "required": [
        "bible",
        "query"
      ]
    }
  },
  {
    "name": "get_verse",
    "description": "Get a specific verse by reference (bible, book, chapter, verse)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "bible": {
          "type": "string",
          "description": "Bible UUID"
        },
        "book": {
          "type": "string",
          "description": "Book UUID"
        },
        "chapter": {
          "type": "integer",
          "description": "Chapter number"
        },
        "verse": {
          "type": "integer",
          "description": "Verse number (ordinal)"
        }
      },
      "required": [
        "bible",
        "book",
        "chapter",
        "verse"
      ]
    }
  },
  {
    "name": "get_chapter",
    "description": "Get all verses in a specific chapter",
    "inputSchema": {
      "type": "object",
      "properties": {
        "bible": {
          "type": "string",
          "description": "Bible UUID"
        },
        "book": {
          "type": "string",
          "description": "Book UUID"
        },
        "chapter": {
          "type": "integer",
          "description": "Chapter number"
        }
      },
      "required": [
        "bible",
        "book",
        "chapter"
      ]
    }
  },
  {
    "name": "list_books",
    "description": "List books in a bible translation",
    "inputSchema": {
      "type": "object",
      "properties": {
        "bible": {
          "type": "string",
          "description": "Bible UUID (optional - lists all books if omitted)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_bibles",
    "description": "List available bible translations",
    "inputSchema": {
      "type": "object",
      "properties": {
        "language": {
          "type": "string",
          "description": "Filter by language code (optional)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_book_info",
    "description": "Get information about a specific book in a bible",
    "inputSchema": {
      "type": "object",
      "properties": {
        "bible": {
          "type": "string",
          "description": "Bible UUID"
        },
        "book": {
          "type": "string",
          "description": "Book UUID"
        }
      },
      "required": [
        "bible",
        "book"
      ]
    }
  },
  {
    "name": "list_languages",
    "description": "List all distinct language codes and their human-readable names available in the bible database",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  }
] as const;
