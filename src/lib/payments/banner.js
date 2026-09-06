export const BANNER_INTERVAL_MS = 2000
export const BANNER_MAX_TICKS = 6

export function nextBannerStatus({ paymentQuery, baselineBalance, currentBalance, ticks }) {
  if (paymentQuery !== 'pending') return 'hidden'
  if (Number(currentBalance) > Number(baselineBalance)) return 'credited'
  if (Number(ticks) >= BANNER_MAX_TICKS) return 'timeout'
  return 'pending'
}
