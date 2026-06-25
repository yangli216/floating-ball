export interface ReceptionFlowGuard {
  begin: () => number;
  current: () => number;
  isCurrent: (token: number) => boolean;
}

export function createReceptionFlowGuard(): ReceptionFlowGuard {
  let version = 0;

  return {
    begin(): number {
      version += 1;
      return version;
    },
    current(): number {
      return version;
    },
    isCurrent(token: number): boolean {
      return token === version;
    },
  };
}
