import { writeNodeResponse } from '../server/generation/http.js'

export const config = {
  maxDuration: 60,
}

export default async function handler(req, res) {
  await writeNodeResponse(req, res)
}
