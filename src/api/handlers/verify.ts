import { Request, Response } from 'express'
import TagPlusClientService from "../../services/tagplus.client"

export const verifyAuthorization = async (req: Request, res: Response) => {
  const tagplusService: TagPlusClientService = req.scope.resolve(TagPlusClientService.RESOLVE_KEY)

  const data = await tagplusService.verifyAuthorization()

  res.status(200).json(data)
}