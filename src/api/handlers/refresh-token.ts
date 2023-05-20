import { Request, Response } from 'express'
import TagPlusClientService from "../../services/tagplus.client"

export const refreshToken = async (req: Request, res: Response) => {
  const tagplusService: TagPlusClientService = req.scope.resolve(TagPlusClientService.RESOLVE_KEY)

  await tagplusService.refreshToken()
}