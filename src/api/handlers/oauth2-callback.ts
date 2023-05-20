import { Request, Response } from 'express'
import TagPlusClientService from '../../services/tagplus.client'

export const oauth2Callback = async (req: Request, res: Response) => {
  const { code } = req.query

  const tagplusService: TagPlusClientService = req.scope.resolve(TagPlusClientService.RESOLVE_KEY)

  await tagplusService.authorize(code as string)
  res.status(200).json({ ok: true })
}