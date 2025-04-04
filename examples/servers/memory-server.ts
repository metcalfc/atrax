/**
 * A more complex MCP server that implements a simple knowledge graph with entity and relation storage.
 *
 * This is an example implementation to demonstrate more advanced MCP server functionality
 * and provides a more realistic use case for testing Atrax's proxy capabilities.
 *
 * Features:
 * - Persistent storage of entities and relations in a JSON file
 * - CRUD operations for entities, relations, and observations
 * - Search functionality across the knowledge graph
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define memory file path using environment variable with fallback
const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.json');

// If MEMORY_FILE_PATH is just a filename, put it in the same directory as the script
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
  ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
    ? process.env.MEMORY_FILE_PATH
    : path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.MEMORY_FILE_PATH)
  : defaultMemoryPath;

// We are storing our memory using entities, relations, and observations in a graph structure
interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
class KnowledgeGraphManager {
  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(MEMORY_FILE_PATH, 'utf-8');
      const lines = data.split('\n').filter(line => line.trim() !== '');
      return lines.reduce(
        (graph: KnowledgeGraph, line) => {
          const item = JSON.parse(line);
          if (item.type === 'entity') graph.entities.push(item as Entity);
          if (item.type === 'relation') graph.relations.push(item as Relation);
          return graph;
        },
        { entities: [], relations: [] }
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map(e => JSON.stringify({ type: 'entity', ...e })),
      ...graph.relations.map(r => JSON.stringify({ type: 'relation', ...r })),
    ];
    await fs.writeFile(MEMORY_FILE_PATH, lines.join('\n'));
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();

    // Check for duplicates but handle empty graph
    const newEntities = entities.filter(
      e => !graph.entities.some(existingEntity => existingEntity.name === e.name)
    );

    // Add new entities to the graph
    graph.entities.push(...newEntities);

    // Save the updated graph
    await this.saveGraph(graph);

    // Return entities that were created
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();

    // Filter out relations that already exist
    const newRelations = relations.filter(
      r =>
        !graph.relations.some(
          existingRelation =>
            existingRelation.from === r.from &&
            existingRelation.to === r.to &&
            existingRelation.relationType === r.relationType
        )
    );

    // Validate that source and target entities exist before adding the relation
    const validRelations = newRelations.filter(r => {
      const fromEntityExists = graph.entities.some(e => e.name === r.from);
      const toEntityExists = graph.entities.some(e => e.name === r.to);

      if (!fromEntityExists) {
        console.error(`Cannot create relation: Source entity '${r.from}' does not exist`);
        return false;
      }

      if (!toEntityExists) {
        console.error(`Cannot create relation: Target entity '${r.to}' does not exist`);
        return false;
      }

      return true;
    });

    // Add valid relations to the graph
    graph.relations.push(...validRelations);

    // Save the updated graph
    await this.saveGraph(graph);

    return validRelations;
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[]
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map(o => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(content => !entity.observations.includes(content));
      entity.observations.push(...newObservations);
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.saveGraph(graph);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    graph.relations = graph.relations.filter(
      r => !entityNames.includes(r.from) && !entityNames.includes(r.to)
    );
    await this.saveGraph(graph);
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[]
  ): Promise<void> {
    const graph = await this.loadGraph();
    deletions.forEach(d => {
      const entity = graph.entities.find(e => e.name === d.entityName);
      if (entity) {
        entity.observations = entity.observations.filter(o => !d.observations.includes(o));
      }
    });
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.relations = graph.relations.filter(
      r =>
        !relations.some(
          delRelation =>
            r.from === delRelation.from &&
            r.to === delRelation.to &&
            r.relationType === delRelation.relationType
        )
    );
    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  // Very basic search function
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();

    // Filter entities
    const filteredEntities = graph.entities.filter(
      e =>
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.entityType.toLowerCase().includes(query.toLowerCase()) ||
        e.observations.some(o => o.toLowerCase().includes(query.toLowerCase()))
    );

    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));

    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(
      r => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );

    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };

    return filteredGraph;
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();

    // Filter entities
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));

    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));

    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(
      r => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );

    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };

    return filteredGraph;
  }
}

const knowledgeGraphManager = new KnowledgeGraphManager();

// The server instance and tools exposed to Claude
const server = new Server(
  {
    name: 'memory-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_entity',
        description: 'Create multiple new entities in the knowledge graph',
        inputSchema: {
          type: 'object',
          properties: {
            entities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'The name of the entity' },
                  entityType: { type: 'string', description: 'The type of the entity' },
                  observations: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'An array of observation contents associated with the entity',
                  },
                },
                required: ['name', 'entityType', 'observations'],
              },
            },
          },
          required: ['entities'],
        },
      },
      {
        name: 'create_relation',
        description:
          'Create multiple new relations between entities in the knowledge graph. Relations should be in active voice',
        inputSchema: {
          type: 'object',
          properties: {
            relations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  from: {
                    type: 'string',
                    description: 'The name of the entity where the relation starts',
                  },
                  to: {
                    type: 'string',
                    description: 'The name of the entity where the relation ends',
                  },
                  relationType: { type: 'string', description: 'The type of the relation' },
                },
                required: ['from', 'to', 'relationType'],
              },
            },
          },
          required: ['relations'],
        },
      },
      {
        name: 'add_observations',
        description: 'Add new observations to existing entities in the knowledge graph',
        inputSchema: {
          type: 'object',
          properties: {
            observations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  entityName: {
                    type: 'string',
                    description: 'The name of the entity to add the observations to',
                  },
                  contents: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'An array of observation contents to add',
                  },
                },
                required: ['entityName', 'contents'],
              },
            },
          },
          required: ['observations'],
        },
      },
      {
        name: 'delete_entities',
        description:
          'Delete multiple entities and their associated relations from the knowledge graph',
        inputSchema: {
          type: 'object',
          properties: {
            entityNames: {
              type: 'array',
              items: { type: 'string' },
              description: 'An array of entity names to delete',
            },
          },
          required: ['entityNames'],
        },
      },
      {
        name: 'delete_observations',
        description: 'Delete specific observations from entities in the knowledge graph',
        inputSchema: {
          type: 'object',
          properties: {
            deletions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  entityName: {
                    type: 'string',
                    description: 'The name of the entity containing the observations',
                  },
                  observations: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'An array of observations to delete',
                  },
                },
                required: ['entityName', 'observations'],
              },
            },
          },
          required: ['deletions'],
        },
      },
      {
        name: 'delete_relations',
        description: 'Delete multiple relations from the knowledge graph',
        inputSchema: {
          type: 'object',
          properties: {
            relations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  from: {
                    type: 'string',
                    description: 'The name of the entity where the relation starts',
                  },
                  to: {
                    type: 'string',
                    description: 'The name of the entity where the relation ends',
                  },
                  relationType: { type: 'string', description: 'The type of the relation' },
                },
                required: ['from', 'to', 'relationType'],
              },
              description: 'An array of relations to delete',
            },
          },
          required: ['relations'],
        },
      },
      {
        name: 'read_graph',
        description: 'Read the entire knowledge graph',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'search_nodes',
        description: 'Search for nodes in the knowledge graph based on a query',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'The search query to match against entity names, types, and observation content',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'open_nodes',
        description: 'Open specific nodes in the knowledge graph by their names',
        inputSchema: {
          type: 'object',
          properties: {
            names: {
              type: 'array',
              items: { type: 'string' },
              description: 'An array of entity names to retrieve',
            },
          },
          required: ['names'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  try {
    switch (name) {
      case 'create_entity':
        // Create entities from the provided data
        if (!args.entities || !Array.isArray(args.entities)) {
          throw new Error("Missing or invalid 'entities' array");
        }
        const createdEntities = await knowledgeGraphManager.createEntities(
          args.entities as Entity[]
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(createdEntities, null, 2),
            },
          ],
        };

      case 'create_relation':
        // Create relations between entities
        if (!args.relations || !Array.isArray(args.relations)) {
          throw new Error("Missing or invalid 'relations' array");
        }
        const createdRelations = await knowledgeGraphManager.createRelations(
          args.relations as Relation[]
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(createdRelations, null, 2),
            },
          ],
        };

      case 'add_observations':
        if (!args.observations || !Array.isArray(args.observations)) {
          throw new Error("Missing or invalid 'observations' array");
        }
        const addedObservations = await knowledgeGraphManager.addObservations(
          args.observations as { entityName: string; contents: string[] }[]
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(addedObservations, null, 2),
            },
          ],
        };

      case 'delete_entities':
        if (!args.entityNames || !Array.isArray(args.entityNames)) {
          throw new Error("Missing or invalid 'entityNames' array");
        }
        await knowledgeGraphManager.deleteEntities(args.entityNames as string[]);
        return {
          content: [
            {
              type: 'text',
              text: 'Entities deleted successfully',
            },
          ],
        };

      case 'delete_observations':
        if (!args.deletions || !Array.isArray(args.deletions)) {
          throw new Error("Missing or invalid 'deletions' array");
        }
        await knowledgeGraphManager.deleteObservations(
          args.deletions as { entityName: string; observations: string[] }[]
        );
        return {
          content: [
            {
              type: 'text',
              text: 'Observations deleted successfully',
            },
          ],
        };

      case 'delete_relations':
        if (!args.relations || !Array.isArray(args.relations)) {
          throw new Error("Missing or invalid 'relations' array");
        }
        await knowledgeGraphManager.deleteRelations(args.relations as Relation[]);
        return {
          content: [
            {
              type: 'text',
              text: 'Relations deleted successfully',
            },
          ],
        };

      case 'read_graph':
        // Return the entire knowledge graph
        const graph = await knowledgeGraphManager.readGraph();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(graph, null, 2),
            },
          ],
        };

      case 'search_nodes':
        if (!args.query || typeof args.query !== 'string') {
          throw new Error("Missing or invalid 'query' parameter");
        }
        const searchResults = await knowledgeGraphManager.searchNodes(args.query as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(searchResults, null, 2),
            },
          ],
        };

      case 'open_nodes':
        if (!args.names || !Array.isArray(args.names)) {
          throw new Error("Missing or invalid 'names' array");
        }
        const openedNodes = await knowledgeGraphManager.openNodes(args.names as string[]);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(openedNodes, null, 2),
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
});

// Handler for listing resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'memory://knowledge-graph',
        name: 'Knowledge Graph',
        description: 'The complete knowledge graph stored in the memory server',
        mimeType: 'application/json',
      }
    ]
  };
});

// Handler for reading resources
server.setRequestHandler(ReadResourceRequestSchema, async request => {
  if (request.params.uri === 'memory://knowledge-graph') {
    try {
      // Get the current state of the knowledge graph
      const graph = await knowledgeGraphManager.readGraph();
      
      // Ensure we return a valid graph structure even if empty
      const safeGraph = {
        entities: graph.entities || [],
        relations: graph.relations || []
      };
      
      // Return contents according to the MCP schema (note: contents is an array)
      return {
        contents: [
          {
            uri: 'memory://knowledge-graph',
            mimeType: 'application/json',
            text: JSON.stringify(safeGraph, null, 2),
          }
        ]
      };
    } catch (error) {
      // If there's an error reading the graph, return an empty structure
      console.error('Error reading knowledge graph:', error);
      return {
        contents: [
          {
            uri: 'memory://knowledge-graph',
            mimeType: 'application/json',
            text: JSON.stringify({ entities: [], relations: [] }, null, 2),
          }
        ]
      };
    }
  }
  
  return {
    error: {
      code: 404,
      message: `Resource not found: ${request.params.uri}`
    }
  };
});

// Handler for listing prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        id: 'memory-tutorial',
        name: 'memory-tutorial', // Important: The ID must match the name for MCP Inspector
        description: 'A tutorial prompt explaining how to use the memory server',
      }
    ]
  };
});

// Handler for getting a specific prompt
server.setRequestHandler(GetPromptRequestSchema, async request => {
  // Check if name is missing
  if (!request.params.name) {
    // Return properly formatted error
    return {
      error: {
        message: "Prompt name is required",
        code: -32602 // InvalidParams error code per MCP protocol
      }
    };
  }
  
  // Handle specific prompt names
  if (request.params.name === 'memory-tutorial') {
    // Return format follows the MCP protocol for prompts/get
    return {
      description: 'A tutorial prompt explaining how to use the memory server',
      messages: [
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `# Memory Server Tutorial

The memory server provides a simple knowledge graph database that can store entities, relations between entities, and observations about entities.

## Main concepts:

- **Entities**: Nodes in the knowledge graph with a name, type, and observations
- **Relations**: Edges in the knowledge graph connecting two entities
- **Observations**: Text facts or notes attached to entities

## Available tools:

1. create_entity: Add new entities to the graph
2. create_relation: Create relationships between entities
3. add_observations: Add observations to existing entities
4. delete_entities: Remove entities and their relations
5. delete_observations: Remove specific observations from entities
6. delete_relations: Remove specific relations
7. read_graph: Get the complete knowledge graph
8. search_nodes: Search for entities by name, type, or observation content
9. open_nodes: Retrieve specific entities by name

Try using these tools to build and query a knowledge graph!`
          }
        }
      ]
    };
  }
  
  // Return properly formatted error for invalid prompt names
  return {
    error: {
      message: `Prompt not found: ${request.params.name}`,
      code: -32601 // MethodNotFound error code per MCP protocol
    }
  };
});

async function main() {
  // Only log to stderr, not stdout which is reserved for JSON-RPC messages
  console.error('Knowledge Graph MCP Server starting up...');
  
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Knowledge Graph MCP Server running on stdio');
  } catch (error) {
    console.error('Failed to start MCP transport:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
