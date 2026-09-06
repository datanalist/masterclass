export function formatYookassaAmount(amountRub) {
  return `${Number(amountRub).toFixed(2)}`
}

export function amountsMatch(apiValue, amountRub) {
  return Number(apiValue) === Number(amountRub)
}
