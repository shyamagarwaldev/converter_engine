class JsonNode {
  name: string;
  edge: Map<string, JsonNode>;
  primitive: Set<string>;
  arrayRepresentative: JsonNode | null;
  seen: number;
  totalSeen: number;
  arrayItemCount: number;
  constructor(_name: string) {
    this.name = _name;
    this.edge = new Map();
    this.primitive = new Set();
    this.arrayRepresentative = null;
    this.seen = 0;
    this.totalSeen = 0;
    this.arrayItemCount = 0;
  }
}
function getInterfaceName(key: string, interfaceRegister: Map<string, number>) {
  const initialTransfomation = String(key[0]).toUpperCase() + key.slice(1);
  if (!interfaceRegister.has(initialTransfomation)) {
    interfaceRegister.set(initialTransfomation, 2);
    return initialTransfomation;
  }
  const version = interfaceRegister.get(initialTransfomation)!;
  interfaceRegister.set(initialTransfomation, version + 1);
  return initialTransfomation + version;
}

function JsonToTs(rootNode: JsonNode) {
  const generated: string[] = [];
  const interfaceRegister = new Map();
  const interfaceMap = new Set();
  function resolveType(node: JsonNode): string {
    const unionType: string[] = [];

    // primitive
    if (node.primitive.size > 0) unionType.push(...[...node.primitive].sort());

    // object type
    if (node.edge.size > 0) {
      const interfaceName = getInterfaceName(node.name, interfaceRegister);
      emitInterface(node, interfaceName);
      unionType.push(interfaceName);
    }
    // array type
    if (node.arrayRepresentative) {
      const innerType = resolveType(node.arrayRepresentative);
      let arrayType = innerType.includes(" | ")
        ? `(${innerType})[]`
        : `${innerType}[]`;
      if (node.arrayItemCount === 0) {
        arrayType = `unknown[]`;
      }
      unionType.push(arrayType);
    }

    return [...new Set(unionType)].sort().join(" | ");
  }
  function emitInterface(node: JsonNode, interfaceName: string) {
    if (interfaceMap.has(interfaceName)) return;
    interfaceMap.add(interfaceName);
    const fields = [];

    for (const [key, child] of node.edge.entries()) {
      const optional = child.seen < node.totalSeen ? "?" : "";
      const type = resolveType(child);
      fields.push(`${key}${optional}:  ${type};`);
    }
    generated.push(`interface ${interfaceName} {\n${fields.join("\n")}\n}`);
  }

  const rootName = getInterfaceName(rootNode.name, interfaceRegister);
  if (rootNode.arrayRepresentative) {
    emitInterface(rootNode.arrayRepresentative, rootName);
  }
  return generated.join("\n\n");
}

function processPrimitive(node: JsonNode, value: any) {
  if (value === null) node.primitive.add("null");
  else node.primitive.add(typeof value);
}

function processObject(node: JsonNode, obj: Record<string, any>) {
  node.totalSeen++;
  const sortedKeys = Object.keys(obj);
  for (const key of sortedKeys) {
    let child;
    if (!node.edge.has(key)) {
      child = new JsonNode(key);
      node.edge.set(key, child);
    }
    child = node.edge.get(key);
    if (!child) return;
    child.seen++;
    infer(child, obj[key]);
  }
}

function processArray(node: JsonNode, arr: Array<any>) {
  if (!node.arrayRepresentative) {
    node.arrayRepresentative = new JsonNode(`${node.name}Element`);
  }
  node.arrayItemCount += arr.length;
  for (const item of arr) {
    infer(node.arrayRepresentative, item);
  }
}

function infer(node: JsonNode, value: any) {
  if (Array.isArray(value)) {
    processArray(node, value);
  } else if (value !== null && typeof value === "object") {
    processObject(node, value);
  } else {
    processPrimitive(node, value);
  }
}

function rootPreProcess(rootName: string, arr: Array<any>) {
  const rootNode = new JsonNode(rootName);
  infer(rootNode, arr);
  return rootNode;
}

export function solve(rootName: string, jsonText: string) {
  const parsedArray = JSON.parse(jsonText);
  const rootNode = rootPreProcess(rootName, parsedArray);
  JsonToTs(rootNode);
}
