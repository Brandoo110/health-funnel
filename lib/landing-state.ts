type FreshStartActionInput = {
  sessionWasRestored: boolean;
};

export function shouldShowFreshStartAction({ sessionWasRestored }: FreshStartActionInput) {
  return sessionWasRestored;
}
