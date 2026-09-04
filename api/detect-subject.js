import { writeDetectNodeResponse } from '../server/generation/detectHttp.js'

export const config = {
  maxDuration: 20,
}

export default async function handler(req, res) {
  await writeDetectNodeResponse(req, res)
}
