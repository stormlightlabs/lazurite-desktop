export type AccountSummary = { did: string; handle: string; pdsUrl: string; active: boolean };

export type ActiveSession = { did: string; handle: string };

export type AppBootstrap = { activeSession: ActiveSession | null; accountList: AccountSummary[] };
