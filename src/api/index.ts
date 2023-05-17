import { wrapHandler } from "@medusajs/medusa";
import authenticate from "@medusajs/medusa/dist/api/middlewares/authenticate"
import cors from "cors";
import { Router } from "express";
import { getConfigFile } from "medusa-core-utils";
import { authorizeHandler } from "./handlers/authorize";
import { oauth2Callback } from "./handlers/oauth2-callback";
import { syncProducts } from "./handlers/sync-products";

export default (rootDirectory, options) => {
	// options contain the plugin configurations
	const router = Router();

	const { configModule } = getConfigFile(rootDirectory, "medusa-config") as {
		configModule: { projectConfig: { admin_cors: string } };
	};
	const { projectConfig } = configModule;

	const corsOptions = {
		origin: projectConfig.admin_cors.split(","),
		credentials: true,
	};

	// @ts-ignore
	router.get("/admin/tagplus/oauth2", wrapHandler(oauth2Callback));

	router.use("/admin/tagplus", cors(corsOptions), authenticate());
	router.get("/admin/tagplus", wrapHandler(authorizeHandler(options)));
	router.post("/admin/tagplus/sync-products", wrapHandler(syncProducts));

	return router;
};
