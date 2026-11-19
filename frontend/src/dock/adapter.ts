import type { DockLegacy } from './state';

export type { DockLegacy, DockSide, DockState, DockStore } from './state';
export type DockKind = 'shell' | 'claude' | 'codex' | 'cursor' | 'chat';
export type DockProgram = 'claude' | 'codex' | 'cursor';
export type PtyKind = 'shell' | 'claude' | 'codex' | 'cursor' | 'agent';
export type ChatMode = 'ask' | 'auto-edits' | 'plan';

export interface DockTerminal { id: string; title: string; alive: boolean; kind: PtyKind; tip?: string }
export interface DockChannel {
  send(data: string): void;
  resize(cols: number, rows: number): void;
  onData(handler: (data: string | Uint8Array) => void): void;
  onExit(handler: () => void): void;
  onClose?(handler: () => void): void;
  close(): void;
}
export interface DockOpen { cols: number; rows: number; prompt?: string; resume?: string }
export interface DockProgramStatus { installed: boolean; version: string | null; install: string; signedIn: boolean | null }
export type DockAgentStatus = Partial<Record<DockProgram, DockProgramStatus>>;
export interface DockChatStatus {
  installed: boolean;
  version: string | null;
  signedIn: boolean | null;
  install: string;
  running: boolean;
  state: string;
  session: string | null;
  mode?: ChatMode;
  lead?: string;
  refused?: string;
}
export interface DockChatHandlers { open(): void; event(event: DockChatEvent): void; close(): void }
export interface DockChatEngine {
  status(): Promise<DockChatStatus | null>;
  send(text: string): Promise<void>;
  subscribe(handlers: DockChatHandlers): () => void;
  start?(mode: ChatMode | null, fresh: boolean): Promise<void>;
  stop?(): Promise<void>;
  answer?(id: string, allow: boolean): Promise<void>;
  modes?: ChatMode[];
  renderText?(node: HTMLElement, text: string): void;
}
export interface DockOwnChat { send?(text: string): void; focus?(): void }
export interface DockChatPane { pane(host: HTMLElement): DockOwnChat | void }
export type DockChatEvent =
  | { type: 'state'; running: boolean; state: string; session: string | null; mode?: ChatMode }
  | { type: 'user'; text: string; note?: string }
  | { type: 'reset' }
  | { type: 'meter'; text: string; high?: boolean }
  | { type: 'block'; id: string; kind: 'text' | 'thinking' }
  | { type: 'delta'; id: string; text: string }
  | { type: 'tool'; id: string; name: string; summary: string }
  | { type: 'tool_result'; id: string; text: string; error: boolean }
  | { type: 'permission'; id: string; tool: string; summary: string }
  | { type: 'permission_done'; id: string; allowed: boolean }
  | { type: 'result'; ok: boolean; text: string; meta?: string }
  | { type: 'notice'; text: string };

export interface DockSizes {
  minHeight: number;
  minWidth: number;
  defaultHeight: number;
  defaultWidth: number;
  maxHeightShare: number;
  maxWidthShare: number;
  keepHeight?: number;
  keepWidth?: number;
  maxHeight?(): number;
  maxWidth?(): number;
}
export interface DockStorage { key: string; legacy?: DockLegacy | string[] }
export type DockPlacement =
  | { mode: 'own'; storage: DockStorage; sizes: DockSizes; canDockRight?(): boolean }
  | { mode: 'hosted'; request(open: boolean): void };

export interface DockAdapter {
  app: { name: string; noun: string; start: string; examples: string };
  placement: DockPlacement;
  passKey?(event: KeyboardEvent): boolean;
  isDockChord?(event: KeyboardEvent): boolean;
  chordLabel?(): string;
  tabs: DockKind[];
  classes: { iconButton: string; button: string; primaryButton: string; input: string; select: string; note: string };
  t(key: string, english: string): string;
  onTheme(handler: () => void): void;
  keyHeaders(): Record<string, string>;
  errors: { message(err: unknown): string | null; missingRoute(err: unknown): boolean };
  terminal: {
    list(): Promise<DockTerminal[]>;
    open(kind: Exclude<PtyKind, 'agent'>, options: DockOpen): Promise<DockTerminal>;
    restart?(id: string): Promise<void>;
    close(id: string): Promise<void>;
    channel(id: string): DockChannel | Promise<DockChannel>;
    scrollback?: number;
  };
  agentStatus(): Promise<DockAgentStatus | null>;
  chat?: DockChatEngine | DockChatPane;
  consent?: {
    subscribe(add: (request: ConsentRequest) => void, withdraw: (id: string) => void): void;
    answer(id: string, choice: ConsentChoice): Promise<void>;
  };
  storedChoice?: {
    get(): Promise<StoredChoiceState>;
    set(value: StoredChoice): Promise<void>;
  };
  openSettings?(): void;
}

export type ConsentChoice = 'deny' | 'once' | 'always';
export type ConsentScope = 'agent' | 'all';
export type StoredChoice = 'ask' | 'allowed' | 'blocked';
export interface ConsentRequest {
  id: string;
  agent: string;
  what: string;
  offers: ConsentChoice[];
  always: ConsentScope;
  expires?: number;
  escape?: 'deny';
  notes?: string[];
}
export interface StoredChoiceState { value: StoredChoice; changedOutside: boolean }
export type ConsentHost = Pick<DockAdapter, 'app' | 't' | 'classes' | 'consent' | 'storedChoice'>;
