import { OutputChannel } from "vscode";

export interface Analyzer {
  analyze: (onMessage: (msg: string) => void) => Promise<boolean>;
  cancel: () => void;
  getName: () => string;

  autoAnnotate: (tag: string) => void;
  supportedAutoAnnotateTags: () => string[];
}
