/**
 * Artifact utilities - Loading, parsing, and introspecting contract artifacts.
 */

import {
  loadContractArtifact,
  type ContractArtifact,
  type FunctionArtifact,
  type NoirCompiledContract,
} from "@aztec/aztec.js/abi";

/**
 * Information about a contract function extracted from the ABI.
 */
export interface FunctionInfo {
  name: string;
  functionType: "private" | "public" | "unconstrained";
  isInternal: boolean;
  parameters: ParameterInfo[];
  returnTypes: string[];
}

/**
 * Information about a function parameter.
 */
export interface ParameterInfo {
  name: string;
  type: string;
  visibility: "public" | "private" | "databus";
}

/**
 * Load a contract artifact from a JSON object.
 */
export function loadArtifactFromJson(json: unknown): ContractArtifact {
  return loadContractArtifact(json as NoirCompiledContract);
}

/**
 * Get the contract name from an artifact.
 */
export function getContractName(artifact: ContractArtifact): string {
  return artifact.name;
}

/**
 * Get all functions from a contract artifact.
 */
export function getArtifactFunctions(artifact: ContractArtifact): FunctionInfo[] {
  return artifact.functions.map(parseFunctionArtifact);
}

/**
 * Get only the callable (non-internal) functions.
 */
export function getCallableFunctions(artifact: ContractArtifact): FunctionInfo[] {
  return getArtifactFunctions(artifact).filter((f) => !f.isInternal);
}

/**
 * Get view functions (unconstrained, can be simulated without a transaction).
 */
export function getViewFunctions(artifact: ContractArtifact): FunctionInfo[] {
  return getCallableFunctions(artifact).filter(
    (f) => f.functionType === "unconstrained",
  );
}

/**
 * Get mutating functions (private or public, require a transaction).
 */
export function getMutatingFunctions(artifact: ContractArtifact): FunctionInfo[] {
  return getCallableFunctions(artifact).filter(
    (f) => f.functionType !== "unconstrained",
  );
}

/**
 * Get the constructor function info.
 */
export function getConstructorInfo(artifact: ContractArtifact): FunctionInfo | undefined {
  const constructorFn = artifact.functions.find(
    (f) => f.name === "constructor" || f.isInitializer,
  );
  return constructorFn ? parseFunctionArtifact(constructorFn) : undefined;
}

/**
 * Find a function by name.
 */
export function findFunction(
  artifact: ContractArtifact,
  name: string,
): FunctionInfo | undefined {
  const fn = artifact.functions.find((f) => f.name === name);
  return fn ? parseFunctionArtifact(fn) : undefined;
}

/**
 * Check if a function is a view function (unconstrained).
 */
export function isViewFunction(fn: FunctionInfo): boolean {
  return fn.functionType === "unconstrained";
}

/**
 * Parse a FunctionArtifact into a FunctionInfo.
 */
function parseFunctionArtifact(fn: FunctionArtifact): FunctionInfo {
  return {
    name: fn.name,
    functionType: fn.functionType as "private" | "public" | "unconstrained",
    isInternal: fn.isInternal || false,
    parameters: fn.parameters.map((p) => ({
      name: p.name,
      type: formatType(p.type),
      visibility: p.visibility as "public" | "private" | "databus",
    })),
    returnTypes: fn.returnTypes.map(formatType),
  };
}

/**
 * Format a type object into a readable string.
 */
function formatType(type: unknown): string {
  if (typeof type === "string") {
    return type;
  }
  if (typeof type === "object" && type !== null) {
    const t = type as Record<string, unknown>;
    if (t.kind === "struct" && t.path) {
      // Extract just the struct name from the path
      const path = String(t.path);
      const parts = path.split("::");
      return parts[parts.length - 1];
    }
    if (t.kind === "field") {
      return "Field";
    }
    if (t.kind === "integer") {
      const sign = t.sign === "signed" ? "i" : "u";
      return `${sign}${t.width}`;
    }
    if (t.kind === "boolean") {
      return "bool";
    }
    if (t.kind === "array" && t.type && t.length) {
      return `[${formatType(t.type)}; ${t.length}]`;
    }
  }
  return "unknown";
}

/**
 * Convert a parameter name to a CLI flag name (kebab-case).
 * Example: "ticket_price" -> "--ticket-price"
 */
export function parameterToFlag(name: string): string {
  return "--" + name.replace(/_/g, "-");
}

/**
 * Convert a CLI flag name back to a parameter name (snake_case).
 * Example: "--ticket-price" -> "ticket_price"
 */
export function flagToParameter(flag: string): string {
  return flag.replace(/^--/, "").replace(/-/g, "_");
}
