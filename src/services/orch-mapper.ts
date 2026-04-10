import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface OrchFieldMapping {
  [toolField: string]: string;
}

interface OrchConfig {
  orchestrationName: string;
  _description?: string;
  inputMapping: OrchFieldMapping;
  outputMapping: OrchFieldMapping;
}

interface OrchConfigFile {
  _comment?: string;
  createPurchaseOrder: OrchConfig;
  updatePurchaseOrderLine: OrchConfig;
  addPurchaseOrderLines: OrchConfig;
  cancelPurchaseOrder: OrchConfig;
}

let config: OrchConfigFile | null = null;

// ──────────────────────────────────────────────────────────────
// Load
// ──────────────────────────────────────────────────────────────

async function loadConfig(): Promise<OrchConfigFile> {
  if (config) return config;
  const configPath = join(__dirname, "..", "data", "orchestrations.json");
  const raw = await readFile(configPath, "utf-8");
  config = JSON.parse(raw) as OrchConfigFile;
  return config;
}

// ──────────────────────────────────────────────────────────────
// Mapping helpers
// ──────────────────────────────────────────────────────────────

function mapInputs(
  toolInputs: Record<string, unknown>,
  mapping: OrchFieldMapping
): Record<string, unknown> {
  const orchInputs: Record<string, unknown> = {};

  const flatMappings: Array<[string, string]> = [];
  const arrayFieldMap = new Map<string, Map<string, string>>();
  let arrayOrchKey = "";

  for (const [toolField, orchField] of Object.entries(mapping)) {
    const arrayMatch = toolField.match(/^(\w+)\[\]\.(\w+)$/);
    if (arrayMatch) {
      const [, arrayName, subField] = arrayMatch;
      if (!arrayFieldMap.has(arrayName)) {
        arrayFieldMap.set(arrayName, new Map());
      }
      arrayFieldMap.get(arrayName)!.set(subField, orchField);
    } else {
      flatMappings.push([toolField, orchField]);
    }
  }

  for (const [toolField, orchField] of flatMappings) {
    const value = toolInputs[toolField];
    if (value !== undefined && value !== null) {
      if (arrayFieldMap.has(toolField)) {
        arrayOrchKey = orchField;
      } else {
        orchInputs[orchField] = value;
      }
    }
  }

  for (const [arrayName, subMappings] of arrayFieldMap.entries()) {
    const sourceArray = toolInputs[arrayName];
    if (!Array.isArray(sourceArray)) continue;

    const orchArrayKey = mapping[arrayName] ?? arrayName;

    const mappedArray = sourceArray.map((item: Record<string, unknown>) => {
      const mappedItem: Record<string, unknown> = {};
      for (const [subField, orchField] of subMappings.entries()) {
        if (item[subField] !== undefined && item[subField] !== null) {
          mappedItem[orchField] = item[subField];
        }
      }
      return mappedItem;
    });

    orchInputs[orchArrayKey] = mappedArray;
  }

  return orchInputs;
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

export type OrchOperation =
  | "createPurchaseOrder"
  | "updatePurchaseOrderLine"
  | "addPurchaseOrderLines"
  | "cancelPurchaseOrder";

export async function getOrchestrationName(
  operation: OrchOperation
): Promise<string> {
  const cfg = await loadConfig();
  return cfg[operation].orchestrationName;
}

export async function buildOrchestrationPayload(
  operation: OrchOperation,
  toolInputs: Record<string, unknown>
): Promise<{ orchestrationName: string; inputs: Record<string, unknown> }> {
  const cfg = await loadConfig();
  const orchCfg = cfg[operation];

  return {
    orchestrationName: orchCfg.orchestrationName,
    inputs: mapInputs(toolInputs, orchCfg.inputMapping),
  };
}
