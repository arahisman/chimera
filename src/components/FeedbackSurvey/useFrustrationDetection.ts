export function useFrustrationDetection(): {
  state: 'closed'
  handleTranscriptSelect: () => void
} {
  return {
    state: 'closed',
    handleTranscriptSelect: () => {},
  }
}
