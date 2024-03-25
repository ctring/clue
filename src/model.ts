import { randomUUID } from "crypto";
import * as vscode from "vscode";
import * as path from "path";

export type Entity = {
  selection?: Selection;
  name: string;
  operations: Operation[];
  note: string;
  isCustom: boolean;
};

export type Operation = {
  selection?: Selection;
  name: string;
  arguments: Argument[];
  type: "read" | "write" | "other" | "transaction";
  note: string;
  isCustom: boolean;
};

export type Argument = {
  selection?: Selection;
  name: string;
  note: string;
  isCustom: boolean;
};

export type Selection = {
  filePath: string;
  fromLine: number;
  fromColumn: number;
  toLine: number;
  toColumn: number;
};

export enum AnalyzeResultGroup {
  recognized = "Recognized",
  unknown = "Unknown",
}

type Repository = {
  url: string;
  hash: string;
};

export class AnalyzeResult {
  private static _instance: AnalyzeResult;

  private fileName: string = "analyze-result.json";
  private repository?: Repository;
  private group: Map<string, Map<string, Entity>>;
  private analyzedFiles: Set<String> = new Set();
  private refreshFn: () => void = () => {};

  public static getInstance(): AnalyzeResult {
    return this._instance || (this._instance = new this());
  }

  private constructor() {
    this.group = new Map([
      [AnalyzeResultGroup.recognized, new Map<string, Entity>()],
      [AnalyzeResultGroup.unknown, new Map<string, Entity>()],
    ]);
  }

  addAnalyzedFiles(files: string[]) {
    for (const file of files) {
      this.analyzedFiles.add(file);
    }
  }

  fileAnalyzed(file: string): boolean {
    return this.analyzedFiles.has(file);
  }

  getGroup(group: AnalyzeResultGroup): Map<string, Entity> {
    return this.group.get(group)!;
  }

  setRepository(repository?: Repository) {
    this.repository = repository;
  }

  getRepository(): Repository | undefined {
    return this.repository;
  }

  setFileName(fileName: string) {
    this.fileName = fileName;
  }

  clear() {
    for (const value of this.group.values()) {
      value.clear();
    }
  }

  async loadFromStorage(rootPath: string): Promise<boolean> {
    const resultPath = vscode.Uri.joinPath(
      vscode.Uri.file(rootPath),
      ".vscode",
      this.fileName
    );

    try {
      let data = await vscode.workspace.fs.readFile(resultPath);
      let newResult: AnalyzeResult = JSON.parse(data.toString(), reviver);
      Object.assign(this, newResult);
      this.refreshFn();
    } catch (e) {
      return false;
    }
    return true;
  }

  async saveToStorage(rootPath: string) {
    const vscodePath = vscode.Uri.joinPath(
      vscode.Uri.file(rootPath),
      ".vscode"
    );
    const resultPath = vscode.Uri.joinPath(vscodePath, this.fileName);

    await vscode.workspace.fs.createDirectory(vscodePath);
    await vscode.workspace.fs.writeFile(
      resultPath,
      Buffer.from(JSON.stringify(this, replacer))
    );

    this.refreshFn();
  }

  setRefreshFn(fn: () => void) {
    this.refreshFn = fn;
  }

  refreshViews() {
    this.refreshFn();
  }
}

function replacer(key: string, value: any) {
  if (value instanceof Map) {
    return {
      dataType: "Map",
      value: [...value],
    };
  } else if (value instanceof Set) {
    return {
      dataType: "Set",
      value: [...value],
    };
  } else {
    return value;
  }
}

function reviver(key: string, value: any) {
  if (typeof value === "object" && value !== null) {
    if (value.dataType === "Map") {
      return new Map(value.value);
    } else if (value.dataType === "Set") {
      return new Set(value.value);
    }
  }
  return value;
}

export function groupOperationTypes(
  operations: Operation[],
  result?: { [key: string]: Set<string> }
): { [key: string]: Set<string> } {
  // Result is a map from operation type to a set of ids of operations of that type.
  result = { ...result };

  let addId = (type: string, id?: string) => {
    if (result) {
      if (!id) {
        id = randomUUID();
      }
      if (type in result) {
        result[type].add(id);
      } else {
        result[type] = new Set([id]);
      }
    }
  };

  for (const operation of operations) {
    // Check if the pattern "!<operation.type>" exists in the note of the operation.
    if (!operation.note.match(new RegExp(`!${operation.type}`))) {
      addId(operation.type);
    }
    // Iterate over all tokens with the pattern "@<type>(<id>)" in the note of operations.
    // For each token, add <id> to the set of <type> in the result.
    const matches = operation.note.matchAll(/@(\w+)(\(\w+\))?/g);
    for (const match of matches) {
      let id = match[2]?.slice(1, -1);
      addId(match[1], id);
    }
  }

  return result;
}

const TAGS = [
  "cda-tran",
  "non-trivial",
  "non-eq",
  "full-scan",
  "join",
  "cor-subquery",
  "cda-dep",
  "1shot-easy",
  "1shot-hard",
  "mshot",
  "phantom",
];

export function countTags(entities: Entity[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const entity of entities) {
    for (const tag of TAGS) {
      if (entity.note.includes(tag)) {
        result.set(tag, (result.get(tag) || 0) + 1);
      }
    }

    for (const operation of entity.operations) {
      for (const tag of TAGS) {
        if (operation.note.includes(tag)) {
          result.set(tag, (result.get(tag) || 0) + 1);
        }
      }
    }
  }
  return result;
}

export function getCurrentSelection(rootPath: string): Selection | undefined {
  const activeTextEditor = vscode.window.activeTextEditor;
  let selection: Selection | undefined;
  if (activeTextEditor) {
    let filePath = path.relative(rootPath, activeTextEditor.document.uri.path);
    let editorSelection = activeTextEditor.selection;
    selection = {
      filePath,
      fromLine: editorSelection.start.line,
      fromColumn: editorSelection.start.character,
      toLine: editorSelection.end.line,
      toColumn: editorSelection.end.character,
    };
  }
  return selection;
}
