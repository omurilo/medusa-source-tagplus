import { Request, Response } from 'express'

import { PluginOptions } from "../../services/tagplus.client"

export const authorizeHandler = (options: PluginOptions) => async (req: Request, res: Response): Promise<void> => {
  res.redirect(`https://developers.tagplus.com.br/authorize?response_type=code&client_id=${options.clientId}&scope=${options.scopes}`)
}